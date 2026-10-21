// TikTok Shop Open API 子集（DESIGN §8.11 API-MOCK-002）。入口 handleTiktokApi 由 route.ts 在开关之后调用。
import { and, asc, desc, eq, inArray, lt, gt, sql } from "drizzle-orm";
import { mockDb } from "../db/client";
import { mockAfterSale, mockBuyerThread, mockCoupon, mockMessage, mockOrder, mockShop, type FaultCategory } from "../db/schema";
import { FAULT_TIMEOUT_MS, sleep, takeFault } from "../faults";
import { MOCK_PRODUCTS, mockStock, TIKTOK_EVENT_TYPES } from "../fixtures";
import { nowSec, originOf, toSec } from "../http";
import { tiktokReturnId } from "../ids";
import { mockProductImageUrl } from "../images";
import { applyOrderStatus, TIKTOK_PRE_SHIP } from "../orders";
import { runPushesLater, type PendingPush } from "../push";
import { fileUrl, MAX_UPLOAD_BYTES, saveUpload, uploadRow } from "../uploads";
import { errorResponse, ok, T, TiktokError, verifyTiktok, type TiktokApp, type TiktokShop } from "./core";
import { initUpload, UPLOAD_PATH, uploadChunk } from "./files";
import {
  addTiktokMessage,
  completeRefund,
  insertTiktokAfterSale,
  latestMessage,
  record,
  tiktokCancelFields,
  tiktokConversationFields,
  tiktokMessageFields,
  tiktokOrderFields,
  tiktokReturnFields,
  updateTiktokAfterSale,
  updateTiktokOrder,
  type AfterSale,
} from "./ops";

type Ctx = {
  req: Request;
  app: TiktokApp;
  shop: TiktokShop | null;
  tokenShops: TiktokShop[];
  query: URLSearchParams;
  body: Record<string, unknown>;
  form: FormData | null;
  params: string[];
  origin: string;
  pushes: PendingPush[];
};
type Handler = { method: string; pattern: RegExp; shopLevel: boolean; fault?: FaultCategory; run: (ctx: Ctx) => Promise<Response> };

const ID = "([^/]+)";
const route = (method: string, path: string, shopLevel: boolean, run: Handler["run"], fault?: FaultCategory): Handler => ({
  method,
  pattern: new RegExp(`^${path.replace(/\{[a-z_]+\}/g, ID)}$`),
  shopLevel,
  fault,
  run,
});

function shop(ctx: Ctx): TiktokShop {
  return ctx.shop!;
}

function pageSize(q: URLSearchParams, def: number | null, min: number, max: number): number {
  const raw = q.get("page_size");
  if (raw === null || raw === "") {
    if (def === null) throw T.param("page_size is required.");
    return def;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw T.param(`page_size must be between ${min} and ${max}.`);
  return n;
}

function offsetToken(q: URLSearchParams): number {
  const t = q.get("page_token");
  if (!t) return 0;
  const n = Number(Buffer.from(t, "base64url").toString());
  if (!Number.isInteger(n) || n < 0) throw T.param("page_token is invalid.");
  return n;
}

const nextToken = (offset: number) => Buffer.from(String(offset)).toString("base64url");

function strList(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.map(String) : undefined;
}

async function findThread(shopId: string, conversationId: string) {
  const [t] = await mockDb()
    .select()
    .from(mockBuyerThread)
    .where(and(eq(mockBuyerThread.platform, "tiktok"), eq(mockBuyerThread.shopId, shopId), eq(mockBuyerThread.conversationId, conversationId), eq(mockBuyerThread.started, true)))
    .limit(1);
  if (!t) throw new TiktokError(45101003, "Record not found. Please check the parameters.");
  return t;
}

async function findOrder(shopId: string, orderId: string) {
  const [o] = await mockDb().select().from(mockOrder).where(and(eq(mockOrder.platform, "tiktok"), eq(mockOrder.shopId, shopId), eq(mockOrder.orderId, orderId))).limit(1);
  return o ?? null;
}

async function findAfterSale(shopId: string, id: string, kind: "return" | "cancel") {
  const [r] = await mockDb()
    .select()
    .from(mockAfterSale)
    .where(and(eq(mockAfterSale.platform, "tiktok"), eq(mockAfterSale.shopId, shopId), eq(mockAfterSale.id, id), eq(mockAfterSale.kind, kind)))
    .limit(1);
  return r ?? null;
}

// ── 授权店铺 ──

async function authorizedShops(ctx: Ctx): Promise<Response> {
  return ok({
    shops: ctx.tokenShops.map((s) => ({ id: s.shopId, name: s.name, region: s.region, seller_type: "CROSS_BORDER", cipher: s.cipher, code: s.shopCode })),
  });
}

// ── 客服 ──

async function listConversations(ctx: Ctx): Promise<Response> {
  const size = pageSize(ctx.query, null, 1, 20);
  const offset = offsetToken(ctx.query);
  const session = ctx.query.get("need_session_id") === "true" || ctx.query.get("need_session_info") === "true";
  const rows = await mockDb()
    .select()
    .from(mockBuyerThread)
    .where(and(eq(mockBuyerThread.platform, "tiktok"), eq(mockBuyerThread.shopId, shop(ctx).shopId), eq(mockBuyerThread.started, true)))
    .orderBy(desc(mockBuyerThread.lastMessageAt), desc(mockBuyerThread.conversationId))
    .offset(offset)
    .limit(size + 1);
  const page = rows.slice(0, size);
  const conversations = [];
  for (const t of page) conversations.push(tiktokConversationFields(t, shop(ctx), await latestMessage(t.conversationId), { session }));
  return ok({ conversations, next_page_token: rows.length > size ? nextToken(offset + size) : "" });
}

async function listMessages(ctx: Ctx): Promise<Response> {
  const t = await findThread(shop(ctx).shopId, ctx.params[0]);
  const size = pageSize(ctx.query, null, 1, 10);
  const asc_ = ctx.query.get("sort_order") === "ASC";
  const cursor = ctx.query.get("page_token");
  const conds = [eq(mockMessage.conversationId, t.conversationId)];
  if (cursor) {
    if (!/^\d+$/.test(cursor)) throw T.param("page_token is invalid.");
    conds.push(asc_ ? gt(mockMessage.seq, Number(cursor)) : lt(mockMessage.seq, Number(cursor)));
  }
  const rows = await mockDb().select().from(mockMessage).where(and(...conds)).orderBy(asc_ ? asc(mockMessage.seq) : desc(mockMessage.seq)).limit(size + 1);
  const page = rows.slice(0, size);
  const plaintext = ctx.query.get("need_plaintext") === "true";
  return ok({
    messages: page.map((m) => tiktokMessageFields(m, t, shop(ctx), { plaintext })),
    next_page_token: rows.length > size ? String(page[page.length - 1].seq) : "",
    unsupported_msg_tips: "Please check this message in Seller Center.\n",
  });
}

const SENDABLE = ["TEXT", "IMAGE", "VIDEO", "PRODUCT_CARD", "ORDER_CARD", "RETURN_REFUND_CARD", "COUPON_CARD", "LOGISTICS_CARD"];

async function sendMessage(ctx: Ctx): Promise<Response> {
  const s = shop(ctx);
  const t = await findThread(s.shopId, ctx.params[0]);
  const type = String(ctx.body.type ?? "");
  if (!SENDABLE.includes(type)) throw T.param("type is invalid.");
  if (typeof ctx.body.content !== "string") throw T.param("content is required.");
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(ctx.body.content) as Record<string, unknown>;
  } catch {
    throw T.param("content must be a JSON string.");
  }
  if (!t.canSend) throw new TiktokError(45109001, "Unable to send messages due to conversation rules. For details, please refer to Customer Service API overview.");
  const role = ctx.body.sender_role ? String(ctx.body.sender_role) : "CUSTOMER_SERVICE";
  if (!["CUSTOMER_SERVICE", "SYSTEM", "ROBOT"].includes(role)) throw T.param("sender_role is invalid.");
  let content: Record<string, unknown>;
  const order = async () => {
    const o = c.order_id ? await findOrder(s.shopId, String(c.order_id)) : null;
    if (!o || o.buyerId !== t.buyerId) throw T.param("order_id is invalid.");
    return o;
  };
  switch (type) {
    case "TEXT": {
      const text = String(c.content ?? "");
      if (!text.trim()) throw T.param("content.content is required.");
      if (Array.from(text).length > 2000) throw T.param("The TEXT message must not exceed 2000 characters.");
      content = { content: text };
      break;
    }
    case "IMAGE":
      if (!c.url) throw T.param("content.url is required.");
      content = { url: String(c.url), width: Number(c.width ?? 0), height: Number(c.height ?? 0) };
      break;
    case "VIDEO": {
      if (!c.vid) throw T.param("content.vid is required.");
      // vid 只认本店经大文件上传得到的 resource_id；商品视频等其他来源的 ID 报 45101001（生产实测同一错误）
      const up = await uploadRow(String(c.vid));
      if (!up || up.platform !== "tiktok" || up.shopId !== s.shopId || !up.mime.startsWith("video/")) throw new TiktokError(45101001, "this video does not belong to this seller");
      content = { vid: up.id, url: fileUrl(ctx.origin, up.id), width: up.width, height: up.height, format: up.mime.split("/")[1], size: up.size };
      break;
    }
    case "PRODUCT_CARD": {
      const products = MOCK_PRODUCTS[`tiktok:${s.shopId}`] ?? [];
      if (!products.some((p) => p.itemId === String(c.product_id))) throw T.param("product_id is invalid.");
      content = { product_id: String(c.product_id) };
      break;
    }
    case "ORDER_CARD":
      content = { order_id: (await order()).orderId };
      break;
    case "LOGISTICS_CARD": {
      const o = await order();
      content = { order_id: o.orderId, ...(c.package_id ? { package_id: String(c.package_id) } : {}) };
      break;
    }
    case "RETURN_REFUND_CARD": {
      const o = c.order_id ? await findOrder(s.shopId, String(c.order_id)) : null;
      const eligible = o && o.buyerId === t.buyerId && ["IN_TRANSIT", "DELIVERED", "COMPLETED"].includes(o.status) && o.items.some((i) => i.skuId === String(c.sku_id));
      if (!eligible) throw new TiktokError(45101002, "Invalid params. The RETURN_REFUND_CARD must meet the conditions listed above.");
      content = { order_id: o.orderId, sku_id: String(c.sku_id) };
      break;
    }
    case "COUPON_CARD": {
      const [cp] = c.coupon_id ? await mockDb().select().from(mockCoupon).where(and(eq(mockCoupon.couponId, String(c.coupon_id)), eq(mockCoupon.shopId, s.shopId))).limit(1) : [];
      const d = cp?.detail as { display_type?: string; creation_source?: string; target_buyer_segment?: string } | undefined;
      const valid = cp && d && ["CHAT", "REGULAR"].includes(d.display_type ?? "") && cp.status === "ONGOING" && d.creation_source === "SELLER_CENTER" && d.target_buyer_segment !== "REPEAT_CUSTOMERS";
      if (!valid) throw new TiktokError(45111017, "Invalid params. The COUPON_CARD must meet the conditions listed above.");
      content = { coupon_id: cp.couponId };
      break;
    }
    default:
      throw T.param("type is invalid.");
  }
  const from = role === "SYSTEM" ? "system" : role === "ROBOT" ? "robot" : "seller";
  const { message, pushes } = await addTiktokMessage(s, t, from, type, content);
  ctx.pushes.push(...pushes);
  return ok({ message_id: message.messageId });
}

async function uploadImage(ctx: Ctx): Promise<Response> {
  const file = ctx.form?.get("data");
  if (!file || typeof file === "string") throw T.param("data is required.");
  if (file.size > MAX_UPLOAD_BYTES) throw new TiktokError(36009021, "Invalid file size. The image must not exceed 10MB.");
  const stored = await saveUpload("tiktok", shop(ctx).shopId, file.name || "image", Buffer.from(await file.arrayBuffer()));
  if (!stored) throw T.param("data must be a jpg, gif, webp or png image.");
  return ok({ url: fileUrl(ctx.origin, stored.id), width: stored.width, height: stored.height });
}

async function endSession(ctx: Ctx): Promise<Response> {
  const t = await findThread(shop(ctx).shopId, ctx.params[0]);
  if (!t.sessionId || t.sessionId !== ctx.params[1] || !t.sessionOpen) throw new TiktokError(45101003, "Record not found. Please check the parameters.");
  await mockDb().update(mockBuyerThread).set({ sessionOpen: false }).where(eq(mockBuyerThread.conversationId, t.conversationId));
  return ok({});
}

async function getAgentSettings(ctx: Ctx): Promise<Response> {
  return ok({ can_accept_chat: shop(ctx).canAcceptChat });
}

async function putAgentSettings(ctx: Ctx): Promise<Response> {
  if (typeof ctx.body.can_accept_chat !== "boolean") throw T.param("can_accept_chat is required.");
  await mockDb().update(mockShop).set({ canAcceptChat: ctx.body.can_accept_chat }).where(and(eq(mockShop.platform, "tiktok"), eq(mockShop.shopId, shop(ctx).shopId)));
  return ok({});
}

async function performance(ctx: Ctx): Promise<Response> {
  const ge = ctx.query.get("support_date_ge");
  const lt_ = ctx.query.get("support_date_lt");
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!ge || !re.test(ge)) throw T.param("support_date_ge is required, format YYYY-MM-DD.");
  if (!lt_ || !re.test(lt_)) throw T.param("support_date_lt is required, format YYYY-MM-DD.");
  if (lt_ <= ge) throw T.param("support_date_lt must be later than support_date_ge.");
  const p = shop(ctx).performance;
  const [n] = await mockDb()
    .select({ c: sql<number>`count(*)::int` })
    .from(mockBuyerThread)
    .where(and(eq(mockBuyerThread.platform, "tiktok"), eq(mockBuyerThread.shopId, shop(ctx).shopId)));
  return ok({
    performance: {
      support_session_count: (n?.c ?? 0) * 3,
      response_percentage: String(p.response_percentage ?? 90),
      satisfaction_percentage: String(p.satisfaction_percentage ?? 92),
      response_time_mins: String(p.response_time_mins ?? 5),
      conversion_rate: "41.20",
      cs_guided_gmv: "1250",
      currency: shop(ctx).currency,
    },
  });
}

// ── 订单 ──

async function pendingCancelOrders(orderIds: string[]): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();
  const rows = await mockDb()
    .select({ orderId: mockAfterSale.orderId })
    .from(mockAfterSale)
    .where(and(eq(mockAfterSale.kind, "cancel"), eq(mockAfterSale.status, "CANCELLATION_REQUEST_PENDING"), inArray(mockAfterSale.orderId, orderIds)));
  return new Set(rows.map((r) => r.orderId));
}

async function searchOrders(ctx: Ctx): Promise<Response> {
  const size = pageSize(ctx.query, null, 1, 100);
  const offset = offsetToken(ctx.query);
  const sortField = ctx.query.get("sort_field") ?? "create_time";
  if (sortField !== "create_time" && sortField !== "update_time") throw T.param("sort_field is invalid.");
  const sortAsc = (ctx.query.get("sort_order") ?? "DESC") === "ASC";
  const b = ctx.body as Record<string, unknown>;
  const conds = [eq(mockOrder.platform, "tiktok"), eq(mockOrder.shopId, shop(ctx).shopId)];
  if (b.order_status) conds.push(eq(mockOrder.status, String(b.order_status)));
  if (b.buyer_user_id) conds.push(eq(mockOrder.buyerId, String(b.buyer_user_id)));
  for (const [key, col, op] of [
    ["create_time_ge", mockOrder.createTime, ">="],
    ["create_time_lt", mockOrder.createTime, "<"],
    ["update_time_ge", mockOrder.updateTime, ">="],
    ["update_time_lt", mockOrder.updateTime, "<"],
  ] as const) {
    if (b[key] !== undefined) conds.push(op === ">=" ? sql`${col} >= to_timestamp(${Number(b[key])})` : sql`${col} < to_timestamp(${Number(b[key])})`);
  }
  const col = sortField === "create_time" ? mockOrder.createTime : mockOrder.updateTime;
  let rows = await mockDb().select().from(mockOrder).where(and(...conds)).orderBy(sortAsc ? asc(col) : desc(col), asc(mockOrder.orderId));
  const pending = await pendingCancelOrders(rows.map((o) => o.orderId));
  if (typeof b.is_buyer_request_cancel === "boolean") rows = rows.filter((o) => pending.has(o.orderId) === b.is_buyer_request_cancel);
  const page = rows.slice(offset, offset + size);
  return ok({
    orders: page.map((o) => tiktokOrderFields(o, shop(ctx), pending.has(o.orderId))),
    total_count: rows.length,
    next_page_token: offset + size < rows.length ? nextToken(offset + size) : "",
  });
}

async function getOrders(ctx: Ctx): Promise<Response> {
  const ids = (ctx.query.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) throw T.param("ids is required.");
  if (ids.length > 50) throw T.param("ids must not exceed 50.");
  const rows = await mockDb().select().from(mockOrder).where(and(eq(mockOrder.platform, "tiktok"), eq(mockOrder.shopId, shop(ctx).shopId), inArray(mockOrder.orderId, ids)));
  if (rows.length === 0) throw new TiktokError(21008111, "The order or package does not belong to the current seller.");
  const pending = await pendingCancelOrders(rows.map((o) => o.orderId));
  const byId = new Map(rows.map((o) => [o.orderId, o]));
  return ok({ orders: ids.filter((id) => byId.has(id)).map((id) => tiktokOrderFields(byId.get(id)!, shop(ctx), pending.has(id))) });
}

const ACTION_CODE: Record<string, number> = { ORDER_CREATED: 10101, PICKED_UP: 20101, DELIVERY_PENDING: 20301, DELIVERED: 30901, FAILED_DELIVERED: 40101, FAILED_PICKED_UP: 40201, PICKUP_RETRY: 40301 };

async function tracking(ctx: Ctx): Promise<Response> {
  const o = await findOrder(shop(ctx).shopId, ctx.params[0]);
  if (!o) throw new TiktokError(21008111, "The order or package does not belong to the current seller.");
  return ok({ tracking: [...o.tracking].reverse().map((e) => ({ description: e.description, update_time_millis: e.time * 1000, action_code: ACTION_CODE[e.status] ?? 0 })) });
}

// ── 取消与退货 ──

const SELLER_CANCEL_REASONS = ["seller_cancel_reason_out_of_stock", "seller_cancel_reason_wrong_price", "seller_cancel_paid_reason_address_not_deliver", "seller_cancel_paid_reason_buyer_requested_cancellation"];

const REJECT_REASONS: Record<string, Array<{ name: string; text: string }>> = {
  cancel: [
    { name: "seller_reject_apply_product_has_been_packed", text: "Product has been packed" },
    { name: "ecom_reverse_reject_cancel_reason_product_packed", text: "Product has been packed and is ready to ship" },
    { name: "seller_reject_apply_you_have_reached_an_agreement_with_the_buyer", text: "You have reached an agreement with the buyer" },
  ],
  return: [
    { name: "seller_reject_apply_you_have_reached_an_agreement_with_the_buyer", text: "You have reached an agreement with the buyer" },
    { name: "seller_reject_apply_product_used_or_damaged_by_buyer", text: "Product was used or damaged by the buyer" },
    { name: "seller_reject_apply_return_window_expired", text: "Return window has expired" },
  ],
  receive: [
    { name: "seller_reject_receive_wrong_item_returned", text: "Returned item does not match the order" },
    { name: "seller_reject_receive_item_damaged", text: "Returned item is damaged or incomplete" },
  ],
};

function reasonsFor(rs: AfterSale): Array<{ name: string; text: string }> {
  if (rs.kind === "cancel") return REJECT_REASONS.cancel;
  return rs.status === "BUYER_SHIPPED_ITEM" ? REJECT_REASONS.receive : REJECT_REASONS.return;
}

async function sellerCancel(ctx: Ctx): Promise<Response> {
  const s = shop(ctx);
  const b = ctx.body as { order_id?: string; cancel_reason?: string };
  if (!b.order_id || !b.cancel_reason) throw new TiktokError(25001001, "An invalid request parameter was passed. Please check that you have the correct parameter type(s) and format.");
  if (!SELLER_CANCEL_REASONS.includes(b.cancel_reason)) throw new TiktokError(25001014, "Unknown return reason. Please ensure you are passing a valid return reason.");
  const o = await findOrder(s.shopId, b.order_id);
  if (!o) throw new TiktokError(25007006, "Order not found.");
  if (o.status === "COMPLETED" || o.status === "CANCELLED") throw new TiktokError(25001051, "Not allowed to return or cancel since order is completed or cancelled");
  if (!TIKTOK_PRE_SHIP.includes(o.status)) throw new TiktokError(25001045, "The order has already been shipped and we are unable to cancel shipment with the courier.");
  const pending = await mockDb().select().from(mockAfterSale).where(and(eq(mockAfterSale.orderId, o.orderId), eq(mockAfterSale.kind, "cancel"), eq(mockAfterSale.status, "CANCELLATION_REQUEST_PENDING"))).limit(1);
  if (pending.length > 0) throw new TiktokError(25001011, "A return request is already in process, or the order has already been cancelled.");
  const text = b.cancel_reason.replace(/^seller_cancel_(paid_)?reason_/, "").replace(/_/g, " ");
  const { rs, pushes } = await insertTiktokAfterSale(s, {
    id: tiktokReturnId(), platform: "tiktok", shopId: s.shopId, orderId: o.orderId, kind: "cancel", status: "CANCELLATION_REQUEST_SUCCESS", subtype: "CANCEL",
    reason: b.cancel_reason, reasonText: text.charAt(0).toUpperCase() + text.slice(1), currency: o.currency, refundAmount: o.totalAmount, items: o.items, role: "SELLER",
    records: [record("SELLER_CANCEL", "Seller cancelled the order", "SELLER")],
  });
  const res = await updateTiktokOrder(s, o, { ...applyOrderStatus("tiktok", s.region, o, "CANCELLED", nowSec(), toSec(o.createTime)), cancelBy: "seller", cancelReason: rs.reasonText });
  ctx.pushes.push(...pushes, ...res.pushes);
  return ok({ cancel_id: rs.id, cancel_status: rs.status });
}

function inList(v: unknown, field: string) {
  const list = strList(v);
  return list && list.length ? inArray(field === "id" ? mockAfterSale.id : field === "order" ? mockAfterSale.orderId : field === "type" ? mockAfterSale.subtype : mockAfterSale.status, list) : undefined;
}

async function searchAfterSales(ctx: Ctx, kind: "return" | "cancel"): Promise<Response> {
  const q = ctx.query;
  const size = kind === "return" ? pageSize(q, 10, 10, 50) : pageSize(q, 10, 1, 50);
  const offset = offsetToken(q);
  const sortField = q.get("sort_field") ?? "create_time";
  if (sortField !== "create_time" && sortField !== "update_time") throw new TiktokError(25001001, "An invalid request parameter was passed. Please check that you have the correct parameter type(s) and format.");
  const sortAsc = (q.get("sort_order") ?? "ASC") !== "DESC";
  const b = ctx.body;
  const conds = [eq(mockAfterSale.platform, "tiktok"), eq(mockAfterSale.shopId, shop(ctx).shopId), eq(mockAfterSale.kind, kind)];
  const idField = kind === "return" ? b.return_ids : b.cancel_ids;
  const typeField = kind === "return" ? b.return_types : b.cancel_types;
  const statusList = strList(kind === "return" ? b.return_status : b.cancel_status)?.map((s) => (s === "CANCELLATION_REQUEST_CANCEL" ? "CANCELLATION_REQUEST_CANCELLED" : s));
  for (const c of [inList(idField, "id"), inList(b.order_ids, "order"), inList(typeField, "type"), statusList?.length ? inArray(mockAfterSale.status, statusList) : undefined]) if (c) conds.push(c);
  const arb = strList(b.arbitration_status);
  if (kind === "return" && arb?.length) conds.push(inArray(mockAfterSale.arbitrationStatus, arb));
  for (const [key, col, op] of [
    ["create_time_ge", mockAfterSale.createTime, ">="],
    ["create_time_lt", mockAfterSale.createTime, "<"],
    ["update_time_ge", mockAfterSale.updateTime, ">="],
    ["update_time_lt", mockAfterSale.updateTime, "<"],
  ] as const) {
    if (b[key] !== undefined) conds.push(op === ">=" ? sql`${col} >= to_timestamp(${Number(b[key])})` : sql`${col} < to_timestamp(${Number(b[key])})`);
  }
  let rows = await mockDb()
    .select()
    .from(mockAfterSale)
    .where(and(...conds))
    .orderBy(sortAsc ? asc(sortField === "create_time" ? mockAfterSale.createTime : mockAfterSale.updateTime) : desc(sortField === "create_time" ? mockAfterSale.createTime : mockAfterSale.updateTime));
  const buyers = strList(b.buyer_user_ids);
  if (buyers?.length) {
    const orders = await mockDb().select({ orderId: mockOrder.orderId, buyerId: mockOrder.buyerId }).from(mockOrder).where(inArray(mockOrder.orderId, rows.map((r) => r.orderId).concat("-")));
    const ok_ = new Set(orders.filter((o) => buyers.includes(o.buyerId)).map((o) => o.orderId));
    rows = rows.filter((r) => ok_.has(r.orderId));
  }
  const page = rows.slice(offset, offset + size);
  const next = offset + size < rows.length ? nextToken(offset + size) : "";
  return kind === "return"
    ? ok({ return_orders: page.map(tiktokReturnFields), total_count: rows.length, next_page_token: next })
    : ok({ cancellations: page.map(tiktokCancelFields), total_count: rows.length, next_page_token: next });
}

async function approveCancellation(ctx: Ctx): Promise<Response> {
  const s = shop(ctx);
  const rs = await findAfterSale(s.shopId, ctx.params[0], "cancel");
  if (!rs) throw new TiktokError(25007006, "Order not found.");
  if (rs.status === "CANCELLATION_REQUEST_CANCELLED") throw new TiktokError(25020009, "reverse already cancelled");
  if (rs.status !== "CANCELLATION_REQUEST_PENDING") throw new TiktokError(25011012, "reverse status cannot approve application");
  const o = await findOrder(s.shopId, rs.orderId);
  if (!o) throw new TiktokError(25007006, "Order not found.");
  const a = await updateTiktokAfterSale(s, rs, { status: "CANCELLATION_REQUEST_SUCCESS", nextActions: [], records: [...rs.records, record("SELLER_APPROVE", "Seller approved the cancellation request", "SELLER")] });
  const b = await updateTiktokOrder(s, o, { ...applyOrderStatus("tiktok", s.region, o, "CANCELLED", nowSec(), toSec(o.createTime)), cancelBy: "buyer", cancelReason: rs.reasonText });
  ctx.pushes.push(...a.pushes, ...b.pushes);
  return ok({});
}

async function rejectCancellation(ctx: Ctx): Promise<Response> {
  const s = shop(ctx);
  const rs = await findAfterSale(s.shopId, ctx.params[0], "cancel");
  if (!rs) throw new TiktokError(25007006, "Order not found.");
  const reason = String(ctx.body.reject_reason ?? "");
  if (!reason) throw new TiktokError(25001001, "An invalid request parameter was passed. Please check that you have the correct parameter type(s) and format.");
  if (!REJECT_REASONS.cancel.some((r) => r.name === reason)) throw new TiktokError(25001014, "Unknown return reason. Please ensure you are passing a valid return reason.");
  if (rs.status !== "CANCELLATION_REQUEST_PENDING") throw new TiktokError(25011011, "reverse status cannot reject application");
  const a = await updateTiktokAfterSale(s, rs, {
    status: "CANCELLATION_REQUEST_CANCELLED",
    nextActions: [],
    records: [...rs.records, record("SELLER_REJECT", "Seller rejected the cancellation request", "SELLER", { reason_text: reason, note: String(ctx.body.comment ?? "") })],
  });
  ctx.pushes.push(...a.pushes);
  return ok({});
}

async function approveReturn(ctx: Ctx): Promise<Response> {
  const s = shop(ctx);
  const rs = await findAfterSale(s.shopId, ctx.params[0], "return");
  if (!rs) throw new TiktokError(25007006, "Order not found.");
  const decision = String(ctx.body.decision ?? "");
  if (rs.status === "RETURN_OR_REFUND_REQUEST_CANCEL") throw new TiktokError(25020009, "reverse already cancelled");
  let patch: Partial<AfterSale>;
  const rec = (d: string) => [...rs.records, record("SELLER_APPROVE", d, "SELLER")];
  if (decision === "APPROVE_RETURN") {
    if (rs.subtype !== "RETURN_AND_REFUND") throw new TiktokError(25020004, "decision not match reverse type");
    if (rs.status !== "RETURN_OR_REFUND_REQUEST_PENDING") throw new TiktokError(25011012, "reverse status cannot approve application");
    patch = ctx.body.buyer_keep_item === true
      ? { status: "RETURN_OR_REFUND_REQUEST_SUCCESS", nextActions: [], extra: { ...rs.extra, buyer_keep_item: true }, records: rec("Seller approved a refund without return") }
      : { status: "AWAITING_BUYER_SHIP", nextActions: [], records: rec("Seller approved the return request") };
  } else if (decision === "APPROVE_REFUND") {
    if (rs.subtype !== "REFUND") throw new TiktokError(25020004, "decision not match reverse type");
    if (rs.status !== "RETURN_OR_REFUND_REQUEST_PENDING") throw new TiktokError(25011012, "reverse status cannot approve application");
    patch = { status: "RETURN_OR_REFUND_REQUEST_SUCCESS", nextActions: [], records: rec("Seller approved the refund request") };
  } else if (decision === "APPROVE_RECEIVED_PACKAGE") {
    if (rs.status !== "BUYER_SHIPPED_ITEM") throw new TiktokError(25011013, "reverse status cannot approve receive");
    patch = { status: "RETURN_OR_REFUND_REQUEST_SUCCESS", nextActions: [], records: rec("Seller confirmed receipt of the returned package") };
  } else if (["APPROVE_REPLACEMENT", "ISSUE_REPLACEMENT_REFUND", "OFFER_PARTIAL_REFUND", "DIRECT_REFUND"].includes(decision)) {
    throw new TiktokError(25020004, "decision not match reverse type");
  } else {
    throw new TiktokError(11050001, "invalid param");
  }
  const a = await updateTiktokAfterSale(s, rs, patch);
  ctx.pushes.push(...a.pushes, ...(await completeRefund(s, a.rs)));
  return ok({});
}

async function rejectReturn(ctx: Ctx): Promise<Response> {
  const s = shop(ctx);
  const rs = await findAfterSale(s.shopId, ctx.params[0], "return");
  if (!rs) throw new TiktokError(25007006, "Order not found.");
  const decision = String(ctx.body.decision ?? "");
  const reason = String(ctx.body.reject_reason ?? "");
  if (!decision || !reason) throw new TiktokError(25001001, "An invalid request parameter was passed. Please check that you have the correct parameter type(s) and format.");
  if (!reasonsFor(rs).some((r) => r.name === reason)) throw new TiktokError(25001014, "Unknown return reason. Please ensure you are passing a valid return reason.");
  const rec = (d: string) => [...rs.records, record("SELLER_REJECT", d, "SELLER", { reason_text: reasonsFor(rs).find((r) => r.name === reason)?.text, note: String(ctx.body.comment ?? "") })];
  let patch: Partial<AfterSale>;
  if (decision === "REJECT_RETURN" || decision === "REJECT_REFUND") {
    if ((decision === "REJECT_RETURN") !== (rs.subtype === "RETURN_AND_REFUND")) throw new TiktokError(25020004, "decision not match reverse type");
    if (rs.status !== "RETURN_OR_REFUND_REQUEST_PENDING") throw new TiktokError(25001003, "Invalid order status.");
    patch = { status: "REFUND_OR_RETURN_REQUEST_REJECT", nextActions: [], records: rec("Seller rejected the request") };
  } else if (decision === "REJECT_RECEIVED_PACKAGE") {
    if (rs.status !== "BUYER_SHIPPED_ITEM") throw new TiktokError(25020012, "status can't reject receive");
    patch = { status: "REJECT_RECEIVE_PACKAGE", arbitrationStatus: "IN_PROGRESS", nextActions: [], records: rec("Seller rejected the returned package; the case is under platform review") };
  } else if (["REJECT_REPLACEMENT", "OFFER_PARTIAL_REFUND_AFTER_RECEIVING_PKG"].includes(decision)) {
    throw new TiktokError(25020004, "decision not match reverse type");
  } else {
    throw new TiktokError(11050001, "invalid param");
  }
  const a = await updateTiktokAfterSale(s, rs, patch);
  ctx.pushes.push(...a.pushes);
  return ok({});
}

async function returnRecords(ctx: Ctx): Promise<Response> {
  const rs = await findAfterSale(shop(ctx).shopId, ctx.params[0], "return");
  if (!rs) throw new TiktokError(25007006, "Order not found.");
  return ok({ records: rs.records.map((r) => ({ event: r.event, role: r.role, description: r.description, reason_text: r.reason_text ?? "", note: r.note ?? "", images: [], videos: [], create_time: r.create_time })) });
}

async function rejectReasons(ctx: Ctx): Promise<Response> {
  const id = ctx.query.get("return_or_cancel_id");
  if (!id) throw T.param("return_or_cancel_id is required.");
  const [rs] = await mockDb().select().from(mockAfterSale).where(and(eq(mockAfterSale.platform, "tiktok"), eq(mockAfterSale.shopId, shop(ctx).shopId), eq(mockAfterSale.id, id))).limit(1);
  if (!rs) throw new TiktokError(25007006, "Order not found.");
  return ok({ reasons: reasonsFor(rs) });
}

// ── 优惠券 ──

async function searchCoupons(ctx: Ctx): Promise<Response> {
  const size = pageSize(ctx.query, 50, 1, 100);
  const offset = offsetToken(ctx.query);
  const b = ctx.body;
  const status = strList(b.status);
  const display = strList(b.display_type);
  const keyword = typeof b.title_keyword === "string" ? b.title_keyword : null;
  let rows = await mockDb().select().from(mockCoupon).where(and(eq(mockCoupon.platform, "tiktok"), eq(mockCoupon.shopId, shop(ctx).shopId))).orderBy(desc(mockCoupon.startTime));
  rows = rows.filter((c) => (!status?.length || status.includes(c.status)) && (!display?.length || display.includes(String(c.detail.display_type))) && (!keyword || c.title === keyword));
  const page = rows.slice(offset, offset + size);
  return ok({
    total_count: rows.length,
    next_page_token: offset + size < rows.length ? nextToken(offset + size) : "",
    coupons: page.map((c) => ({ id: c.couponId, title: c.title, status: c.status, ...c.detail })),
  });
}

// ── webhook 配置 ──

const EVENT_NAMES = new Set([...Object.values(TIKTOK_EVENT_TYPES), "PRODUCT_INFORMATION_CHANGE", "PRODUCT_CREATION", "PRODUCT_CATEGORY_CHANGE", "NEW_MESSAGE_LISTENER", "INVOICE_STATUS_CHANGE", "PRODUCT_AUDIT_STATUS_CHANGE", "REVERSE_STATUS_UPDATE"]);

/** 商品搜索（工作台商品目录用）：只支持按 status 过滤；搜索结果不带主图，与真实接口一致 */
async function searchProducts(ctx: Ctx): Promise<Response> {
  const size = pageSize(ctx.query, 20, 1, 100);
  const offset = offsetToken(ctx.query);
  const s = shop(ctx);
  const status = typeof ctx.body.status === "string" ? ctx.body.status : "ALL";
  const all = status === "ALL" || status === "ACTIVATE" ? (MOCK_PRODUCTS[`tiktok:${s.shopId}`] ?? []) : [];
  const page = all.slice(offset, offset + size);
  return ok({
    total_count: all.length,
    next_page_token: offset + size < all.length ? nextToken(offset + size) : "",
    products: page.map((p) => ({
      id: p.itemId,
      title: p.name,
      status: "ACTIVATE",
      skus: [{ id: p.skuId, seller_sku: p.skuId, price: { currency: s.currency, sale_price: p.price, tax_exclusive_price: p.price }, inventory: [{ warehouse_id: `wh-${s.shopId}`, quantity: mockStock(p) }] }],
    })),
  });
}

/** 商品详情（商品卡片取标题、主图、价格用；模拟商品都是单 SKU） */
async function getProduct(ctx: Ctx): Promise<Response> {
  const s = shop(ctx);
  const p = (MOCK_PRODUCTS[`tiktok:${s.shopId}`] ?? []).find((x) => x.itemId === ctx.params[0]);
  if (!p) throw T.param("The product does not exist.");
  const url = mockProductImageUrl(p.itemId);
  return ok({
    id: p.itemId,
    title: p.name,
    status: "ACTIVATE",
    main_images: [{ height: 600, width: 600, uri: `mock/${p.itemId}`, urls: [url], thumb_urls: [url] }],
    skus: [{ id: p.skuId, seller_sku: p.skuId, price: { currency: s.currency, sale_price: p.price, tax_exclusive_price: p.price } }],
  });
}

async function getWebhooks(ctx: Ctx): Promise<Response> {
  const hooks = Object.entries(shop(ctx).webhooks).map(([event_type, h]) => ({ event_type, address: h.address, create_time: h.create_time, update_time: h.update_time }));
  return ok({ webhooks: hooks, total_count: hooks.length });
}

async function putWebhook(ctx: Ctx): Promise<Response> {
  const address = String(ctx.body.address ?? "");
  const eventType = String(ctx.body.event_type ?? "");
  if (!EVENT_NAMES.has(eventType)) throw T.param("event_type is invalid.");
  if (!address || address.length > 255) throw T.param("address is required and must not exceed 255 characters.");
  try {
    new URL(address);
  } catch {
    throw T.param("address is invalid.");
  }
  const s = shop(ctx);
  const now = nowSec();
  const prev = s.webhooks[eventType];
  await mockDb()
    .update(mockShop)
    .set({ webhooks: { ...s.webhooks, [eventType]: { address, create_time: prev?.create_time ?? now, update_time: now } } })
    .where(and(eq(mockShop.platform, "tiktok"), eq(mockShop.shopId, s.shopId)));
  return ok({});
}

async function deleteWebhook(ctx: Ctx): Promise<Response> {
  const eventType = String(ctx.body.event_type ?? "");
  if (!EVENT_NAMES.has(eventType)) throw T.param("event_type is invalid.");
  const s = shop(ctx);
  const rest = { ...s.webhooks };
  delete rest[eventType];
  await mockDb().update(mockShop).set({ webhooks: rest }).where(and(eq(mockShop.platform, "tiktok"), eq(mockShop.shopId, s.shopId)));
  return ok({});
}

const HANDLERS: Handler[] = [
  route("GET", "/authorization/202309/shops", false, authorizedShops),
  route("GET", "/customer_service/202309/conversations", true, listConversations),
  route("GET", "/customer_service/202309/conversations/{id}/messages", true, listMessages),
  route("POST", "/customer_service/202606/conversations/{id}/messages", true, sendMessage, "send_message"),
  route("POST", "/customer_service/202309/conversations/{id}/messages", true, sendMessage, "send_message"),
  route("POST", "/open/202512/file/init", false, (ctx) => initUpload(ctx.app, ctx.tokenShops, ctx.body, ctx.origin)),
  route("POST", "/customer_service/202309/images/upload", true, uploadImage),
  route("POST", "/customer_service/202605/conversations/{id}/sessions/{sid}/end", true, endSession),
  route("GET", "/customer_service/202309/agents/settings", true, getAgentSettings),
  route("PUT", "/customer_service/202309/agents/settings", true, putAgentSettings),
  route("GET", "/customer_service/202407/performance", true, performance),
  route("POST", "/order/202309/orders/search", true, searchOrders, "order_read"),
  route("GET", "/order/202507/orders", true, getOrders, "order_read"),
  route("GET", "/fulfillment/202309/orders/{id}/tracking", true, tracking),
  route("POST", "/return_refund/202602/cancellations", true, sellerCancel, "after_sale_write"),
  route("POST", "/return_refund/202602/cancellations/search", true, (ctx) => searchAfterSales(ctx, "cancel")),
  route("POST", "/return_refund/202309/cancellations/{id}/approve", true, approveCancellation, "after_sale_write"),
  route("POST", "/return_refund/202309/cancellations/{id}/reject", true, rejectCancellation, "after_sale_write"),
  route("POST", "/return_refund/202602/returns/search", true, (ctx) => searchAfterSales(ctx, "return")),
  route("POST", "/return_refund/202309/returns/{id}/approve", true, approveReturn, "after_sale_write"),
  route("POST", "/return_refund/202606/returns/{id}/reject", true, rejectReturn, "after_sale_write"),
  route("GET", "/return_refund/202309/returns/{id}/records", true, returnRecords),
  route("GET", "/return_refund/202309/reject_reasons", true, rejectReasons),
  route("POST", "/promotion/202406/coupons/search", true, searchCoupons),
  route("GET", "/product/202309/products/{id}", true, getProduct),
  route("POST", "/product/202502/products/search", true, searchProducts),
  route("GET", "/event/202309/webhooks", true, getWebhooks),
  route("PUT", "/event/202309/webhooks", true, putWebhook),
  route("DELETE", "/event/202309/webhooks", true, deleteWebhook),
];

/** 入口：apiPath 为去掉 /mock/tiktok/open-api 前缀后的路径，如 /order/202309/orders/search。 */
export async function handleTiktokApi(req: Request, apiPath: string): Promise<Response> {
  try {
    // 分块上传不签名，单独校验（upload_token、x-tts-access-token、shop_cipher）
    if (apiPath === UPLOAD_PATH) {
      if (req.method !== "PUT") throw T.method();
      return await uploadChunk(req, new URL(req.url).searchParams);
    }
    const matches = HANDLERS.map((h) => ({ h, m: apiPath.match(h.pattern) })).filter((x) => x.m);
    if (matches.length === 0) throw T.path();
    const hit = matches.find((x) => x.h.method === req.method);
    if (!hit) throw T.method();
    const query = new URL(req.url).searchParams;
    const ct = req.headers.get("content-type") ?? "";
    let raw = "";
    let form: FormData | null = null;
    if (ct.includes("multipart/form-data")) form = await req.formData();
    else if (req.method !== "GET") raw = await req.text();
    const gw = await verifyTiktok(apiPath, query, req.headers, raw, hit.h.shopLevel);
    const fault = hit.h.fault && gw.shop ? await takeFault("tiktok", gw.shop.shopId, hit.h.fault) : null;
    if (fault === "error") throw T.internal();
    if (fault === "timeout") await sleep(FAULT_TIMEOUT_MS);
    let body: Record<string, unknown> = {};
    if (raw.trim()) {
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        throw new TiktokError(36009022, "body must be json or multipart");
      }
    }
    const ctx: Ctx = { req, ...gw, query, body, form, params: hit.m!.slice(1).map(decodeURIComponent), origin: originOf(req), pushes: [] };
    const res = await hit.h.run(ctx);
    runPushesLater(ctx.pushes);
    return res;
  } catch (e) {
    if (e instanceof TiktokError) return errorResponse(e);
    console.error("[mock tiktok]", apiPath, e);
    return errorResponse(T.internal());
  }
}
