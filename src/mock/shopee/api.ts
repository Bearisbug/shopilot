// Shopee Open Platform v2 接口子集（DESIGN §8.11 API-MOCK-001）。入口 handleShopeeApi 由 route.ts 在开关之后调用。
import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { mockDb } from "../db/client";
import { mockAfterSale, mockApp, mockAuthCode, mockBuyerThread, mockMessage, mockOrder, mockShop, type FaultCategory } from "../db/schema";
import { FAULT_TIMEOUT_MS, sleep, takeFault } from "../faults";
import { MOCK_PRODUCTS, SHOPEE_ACCESS_TTL_SEC, SHOPEE_EVIDENCE_DUE_SEC, SHOPEE_REFRESH_TTL_SEC } from "../fixtures";
import { nowSec, originOf, toSec } from "../http";
import { token } from "../ids";
import { mockProductImageUrl } from "../images";
import { applyOrderStatus, SHOPEE_PRE_SHIP, shopeeLogisticsStatus } from "../orders";
import { deliverPush, runPushesLater, type PendingPush } from "../push";
import { fileUrl, MAX_UPLOAD_BYTES, saveUpload } from "../uploads";
import { E, errorResponse, ok, okFlat, ShopeeError, SHOPEE_REGIONS, verifyShopee, type GatewayResult, type ShopeeShop } from "./core";
import {
  addShopeeMessage,
  latestMessage,
  shopeeConversationFields,
  shopeeMessageFields,
  shopeeOrderDetail,
  shopeeReturnFields,
  updateShopeeOrder,
  updateShopeeReturn,
  type Thread,
} from "./ops";

type Ctx = GatewayResult & { req: Request; query: URLSearchParams; body: Record<string, unknown>; form: FormData | null; origin: string; pushes: PendingPush[] };
type Handler = { method: "GET" | "POST"; level: "public" | "shop"; fault?: FaultCategory; run: (ctx: Ctx) => Promise<Response> };

const ALL_PUSH_CODES = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 38, 47, 48];

function shop(ctx: Ctx): ShopeeShop {
  return ctx.shop!;
}

function intParam(q: URLSearchParams, name: string, def?: number): number | undefined {
  const v = q.get(name);
  if (v === null || v === "") return def;
  if (!/^-?\d+$/.test(v)) throw E.param(`${name} should be an integer`);
  return Number(v);
}

function requireChat(ctx: Ctx) {
  if (!shop(ctx).capabilities.chat) throw E.noChatPermission();
}

async function findThread(shopId: string, conversationId: string): Promise<Thread> {
  const [t] = await mockDb()
    .select()
    .from(mockBuyerThread)
    .where(and(eq(mockBuyerThread.platform, "shopee"), eq(mockBuyerThread.shopId, shopId), eq(mockBuyerThread.conversationId, conversationId), eq(mockBuyerThread.started, true)))
    .limit(1);
  if (!t) throw E.param("conversation_id is invalid");
  return t;
}

async function findOrder(shopId: string, orderSn: string) {
  const [o] = await mockDb().select().from(mockOrder).where(and(eq(mockOrder.platform, "shopee"), eq(mockOrder.shopId, shopId), eq(mockOrder.orderId, orderSn))).limit(1);
  return o ?? null;
}

async function findReturn(shopId: string, returnSn: string) {
  const [r] = await mockDb()
    .select()
    .from(mockAfterSale)
    .where(and(eq(mockAfterSale.platform, "shopee"), eq(mockAfterSale.shopId, shopId), eq(mockAfterSale.id, returnSn), eq(mockAfterSale.kind, "return")))
    .limit(1);
  return r ?? null;
}

// ── 授权与 token ──

async function tokenGet(ctx: Ctx): Promise<Response> {
  const { code, partner_id, shop_id, main_account_id } = ctx.body as { code?: string; partner_id?: number; shop_id?: number; main_account_id?: number };
  if (!code) throw E.param("code is a required field");
  if (String(partner_id ?? "") !== ctx.partnerId) throw E.param("partner_id is invalid");
  if (!shop_id && !main_account_id) throw E.param("shop_id or main_account_id is required");
  const [row] = await mockDb().select().from(mockAuthCode).where(eq(mockAuthCode.code, code)).limit(1);
  if (!row || row.platform !== "shopee" || row.appKey !== ctx.partnerId || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    throw new ShopeeError("invalid_code", "The code is expired or used or invalid, please check the code.");
  }
  if (main_account_id && (!row.mainAccountId || String(main_account_id) !== row.mainAccountId)) {
    throw new ShopeeError("invalid_main_acount_id", "The code or main_accoount_id is wrong, please check the code or the main_account_id.");
  }
  if (shop_id && (row.mainAccountId || !row.shopIds.includes(String(shop_id)))) {
    throw new ShopeeError("invalid_shop_id", "The code or shop_id is wrong, please check the code or the shop_id.");
  }
  const access = token();
  const refresh = token();
  const now = Date.now();
  await mockDb().update(mockAuthCode).set({ usedAt: new Date() }).where(eq(mockAuthCode.code, code));
  await mockDb()
    .update(mockShop)
    .set({
      accessToken: access,
      accessExpiresAt: new Date(now + SHOPEE_ACCESS_TTL_SEC * 1000),
      refreshToken: refresh,
      refreshExpiresAt: new Date(now + SHOPEE_REFRESH_TTL_SEC * 1000),
      prevAccessToken: null,
      prevAccessExpiresAt: null,
    })
    .where(and(eq(mockShop.platform, "shopee"), inArray(mockShop.shopId, row.shopIds)));
  const fields: Record<string, unknown> = { access_token: access, refresh_token: refresh, expire_in: SHOPEE_ACCESS_TTL_SEC };
  if (main_account_id) {
    fields.shop_id_list = row.shopIds.map(Number);
    fields.merchant_id_list = [];
  }
  return okFlat(fields);
}

async function accessTokenGet(ctx: Ctx): Promise<Response> {
  const { refresh_token, partner_id, shop_id, merchant_id } = ctx.body as { refresh_token?: string; partner_id?: number; shop_id?: number; merchant_id?: number };
  if (!refresh_token) throw E.param("refresh_token is a required field");
  if (String(partner_id ?? "") !== ctx.partnerId) throw E.param("partner_id is invalid");
  if (merchant_id && !shop_id) throw new ShopeeError("merchant_no_linked", "Partner and merchant has no linked.");
  if (!shop_id) throw E.param("shop_id is a required field");
  const [s] = await mockDb()
    .select()
    .from(mockShop)
    .where(and(eq(mockShop.platform, "shopee"), eq(mockShop.shopId, String(shop_id)), eq(mockShop.appKey, ctx.partnerId)))
    .limit(1);
  if (!s || s.authStatus !== "authorized") throw new ShopeeError("shop_no_linked", "Partner and shop has no linked.");
  const now = Date.now();
  if (s.authExpiresAt && s.authExpiresAt.getTime() < now) throw new ShopeeError("shop_access_expired", "Your access to shop has expired.");
  if (s.refreshToken !== refresh_token) throw new ShopeeError("error_shop_refresh_token", "Your refresh token is error ,please check refresh token or shopid.");
  if (s.refreshExpiresAt && s.refreshExpiresAt.getTime() < now) throw new ShopeeError("refresh_token_expired", "Your refresh_token expired.");
  const access = token();
  const refresh = token();
  await mockDb()
    .update(mockShop)
    .set({
      prevAccessToken: s.accessToken,
      prevAccessExpiresAt: new Date(now + 5 * 60 * 1000),
      accessToken: access,
      accessExpiresAt: new Date(now + SHOPEE_ACCESS_TTL_SEC * 1000),
      refreshToken: refresh,
      refreshExpiresAt: new Date(now + SHOPEE_REFRESH_TTL_SEC * 1000),
    })
    .where(and(eq(mockShop.platform, "shopee"), eq(mockShop.shopId, s.shopId)));
  return okFlat({ partner_id: Number(ctx.partnerId), shop_id: Number(s.shopId), access_token: access, refresh_token: refresh, expire_in: SHOPEE_ACCESS_TTL_SEC });
}

async function getShopsByPartner(ctx: Ctx): Promise<Response> {
  const pageSize = Math.min(Math.max(intParam(ctx.query, "page_size", 100)!, 1), 100);
  const pageNo = Math.max(intParam(ctx.query, "page_no", 1)!, 1);
  const shops = await mockDb()
    .select()
    .from(mockShop)
    .where(and(eq(mockShop.platform, "shopee"), eq(mockShop.appKey, ctx.app.appKey), eq(mockShop.authStatus, "authorized")))
    .orderBy(asc(mockShop.shopId));
  const page = shops.slice((pageNo - 1) * pageSize, pageNo * pageSize);
  return okFlat({
    authed_shop_list: page.map((s) => ({ region: s.region, shop_id: Number(s.shopId), auth_time: toSec(s.authTime), expire_time: toSec(s.authExpiresAt), sip_affi_shops: [] })),
    more: pageNo * pageSize < shops.length,
  });
}

// ── 推送配置 ──

async function getPushConfig(ctx: Ctx): Promise<Response> {
  const on = ctx.app.pushCodes;
  return ok({
    callback_url: ctx.app.callbackUrl ?? "",
    live_push_status: "Normal",
    blocked_shop_id: (ctx.app.pushConfig.blocked_shop_id as number[] | undefined) ?? [],
    push_config_on_list: on,
    push_config_off_list: ALL_PUSH_CODES.filter((c) => !on.includes(c)),
  });
}

async function setPushConfig(ctx: Ctx): Promise<Response> {
  const b = ctx.body as { callback_url?: string; set_push_config_on?: number[]; set_push_config_off?: number[]; blocked_shop_id_list?: number[] };
  const app = ctx.app;
  let callback = app.callbackUrl;
  if (b.callback_url !== undefined && b.callback_url !== callback) {
    let url: URL;
    try {
      url = new URL(b.callback_url);
    } catch {
      throw new ShopeeError("error_param", "this callback_url is invalid, please check your callback_url.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new ShopeeError("error_param", "this callback_url is invalid, please check your callback_url.");
    // 真实平台保存前会向新地址发一条测试推送，3 秒内拿不到 2xx 就拒绝保存。
    const test = await deliverPush({ platform: "shopee", appKey: app.appKey, shopId: null, event: 0, url: b.callback_url, body: { code: 0, timestamp: nowSec(), data: {} }, summary: "回调地址测试推送" });
    if (!test || test.httpStatus === null) {
      throw new ShopeeError("error_param", "Shopee have sent a test push to this call back url, but we didn't get any response in 3 seconds with 2xx code, please check your service. ");
    }
    if (test.httpStatus < 200 || test.httpStatus >= 300) {
      throw new ShopeeError("error_param", "Shopee have sent a test push to this call back url, the response code we get from this callback_url is not 2xx code, please check your service. ");
    }
    callback = b.callback_url;
  }
  const on = new Set(app.pushCodes);
  for (const c of b.set_push_config_on ?? []) on.add(Number(c));
  for (const c of b.set_push_config_off ?? []) on.delete(Number(c));
  if (on.size > 0 && !callback) throw new ShopeeError("error_param", "Your app's callback_url is empty, please input a callback_url before you turn on push config.");
  const blocked = b.blocked_shop_id_list ?? (app.pushConfig.blocked_shop_id as number[] | undefined) ?? [];
  if (blocked.length > 500) throw E.param("blocked_shop_id_list length should be less than or equal to 500");
  await mockDb()
    .update(mockApp)
    .set({ callbackUrl: callback, pushCodes: [...on].sort((a, b2) => a - b2), pushConfig: { ...app.pushConfig, blocked_shop_id: blocked } })
    .where(and(eq(mockApp.platform, "shopee"), eq(mockApp.appKey, app.appKey)));
  return ok({ result: "success" });
}

// ── 店铺 ──

// ── 商品（商品卡片取标题、主图、价格用；模拟商品都是单规格） ──

function catalogItem(s: ShopeeShop, itemId: string) {
  return (MOCK_PRODUCTS[`shopee:${s.shopId}`] ?? []).find((p) => p.itemId === itemId);
}

async function getItemBaseInfo(ctx: Ctx): Promise<Response> {
  const s = shop(ctx);
  const ids = (ctx.query.get("item_id_list") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!ids.length || ids.length > 50) throw E.param("item_id_list should contain 1 to 50 item ids");
  const item_list = ids.flatMap((id) => {
    const p = catalogItem(s, id);
    if (!p) return [];
    return [{ item_id: Number(p.itemId), item_name: p.name, item_status: "NORMAL", has_model: false, image: { image_url_list: [mockProductImageUrl(p.itemId)], image_id_list: [p.itemId] }, price_info: [{ currency: s.currency, original_price: Number(p.originalPrice), current_price: Number(p.price) }] }];
  });
  return ok({ item_list });
}

async function getModelList(ctx: Ctx): Promise<Response> {
  const p = catalogItem(shop(ctx), ctx.query.get("item_id") ?? "");
  if (!p) throw E.notFound("item_id not found");
  return ok({ tier_variation: [], model: [] });
}

async function getShopInfo(ctx: Ctx): Promise<Response> {
  const s = shop(ctx);
  return okFlat({
    shop_name: s.name,
    region: s.region,
    status: "NORMAL",
    shop_fulfillment_flag: "Pure - 3PF Shop",
    is_cb: true,
    is_upgraded_cbsc: false,
    merchant_id: null,
    is_sip: false,
    sip_affi_shops: [],
    auth_time: toSec(s.authTime),
    expire_time: toSec(s.authExpiresAt),
    is_main_shop: false,
    is_direct_shop: false,
    linked_main_shop_id: 0,
    linked_direct_shop_list: [],
    is_one_awb: false,
    is_mart_shop: false,
    is_outlet_shop: false,
  });
}

async function getShopPerformance(ctx: Ctx): Promise<Response> {
  const p = shop(ctx).performance;
  const rate = p.response_rate ?? 90;
  const time = p.response_time ?? 0.5;
  const metric = (metric_type: number, metric_id: number, metric_name: string, current: number | null, last: number | null, unit: number, value: number, comparator: string) => ({
    metric_type, metric_id, parent_metric_id: 0, metric_name, current_period: current, last_period: last, unit, target: { value, comparator },
  });
  const csFailed = (rate < 70 ? 1 : 0) + (time >= 1 ? 1 : 0);
  return ok({
    overall_performance: { rating: csFailed ? 2 : 3, fulfillment_failed: 0, listing_failed: 0, custom_service_failed: csFailed },
    metric_list: [
      metric(1, 1, "late_shipment_rate", 1.2, 0.8, 2, 10, "<"),
      metric(1, 3, "non_fulfillment_rate", 0.5, 0.4, 2, 10, "<"),
      metric(1, 4, "preparation_time", 1.1, 1.3, 4, 2, "<"),
      metric(3, 11, "response_rate", rate, Math.max(0, rate - 3), 2, 70, ">="),
      metric(3, 21, "response_time", time, time + 0.1, 4, 1, "<"),
      metric(3, 22, "shop_rating", 4.8, 4.8, 1, 4.5, ">="),
      metric(3, 23, "no_of_non_responded_chats", rate < 70 ? 12 : 2, 3, 1, 10, "<"),
    ],
  });
}

// ── 聊天 ──

async function getConversationList(ctx: Ctx): Promise<Response> {
  requireChat(ctx);
  const s = shop(ctx);
  const direction = ctx.query.get("direction") ?? "latest";
  if (direction !== "latest" && direction !== "older") throw E.param("direction should be latest or older");
  const type = ctx.query.get("type") ?? "all";
  if (!["all", "pinned", "unread"].includes(type)) throw E.param("type should be all, pinned or unread");
  const pageSize = intParam(ctx.query, "page_size", 25)!;
  if (pageSize < 1 || pageSize > 100) throw E.param("page_size should be between 1 and 100");
  const cursorRaw = ctx.query.get("next_timestamp_nano");
  // 纳秒游标按毫秒比较：客户端 JSON 解析大整数会有尾数误差
  const cursorMs = cursorRaw && /^\d+$/.test(cursorRaw) ? Number(BigInt(cursorRaw) / BigInt(1_000_000)) : null;
  const conds = [eq(mockBuyerThread.platform, "shopee"), eq(mockBuyerThread.shopId, s.shopId), eq(mockBuyerThread.started, true)];
  if (type === "unread") conds.push(gt(mockBuyerThread.unreadCount, 0));
  if (type === "pinned") conds.push(sql`false`);
  if (cursorMs !== null) {
    const edge = new Date(cursorMs);
    conds.push(direction === "latest" ? gt(mockBuyerThread.lastMessageAt, edge) : lt(mockBuyerThread.lastMessageAt, edge));
  }
  const rows = await mockDb()
    .select()
    .from(mockBuyerThread)
    .where(and(...conds))
    .orderBy(direction === "latest" ? asc(mockBuyerThread.lastMessageAt) : desc(mockBuyerThread.lastMessageAt))
    .limit(pageSize + 1);
  const more = rows.length > pageSize;
  const page = rows.slice(0, pageSize);
  const conversations = [];
  for (const t of page) conversations.push(shopeeConversationFields(t, s, await latestMessage(t.conversationId)));
  const last = page[page.length - 1];
  return ok({
    conversations,
    page_result: {
      page_size: pageSize,
      more,
      next_cursor: { next_message_time_nano: last ? String(BigInt(last.lastMessageAt.getTime()) * BigInt(1_000_000)) : "", conversation_id: last?.conversationId ?? "" },
    },
  });
}

async function getOneConversation(ctx: Ctx): Promise<Response> {
  requireChat(ctx);
  const id = ctx.query.get("conversation_id");
  if (!id) throw E.param("conversation_id is a required field");
  const t = await findThread(shop(ctx).shopId, id);
  return ok(shopeeConversationFields(t, shop(ctx), await latestMessage(t.conversationId)));
}

async function getMessage(ctx: Ctx): Promise<Response> {
  requireChat(ctx);
  const id = ctx.query.get("conversation_id");
  if (!id) throw E.param("conversation_id is a required field");
  const pageSize = intParam(ctx.query, "page_size", 25)!;
  if (pageSize < 1 || pageSize > 60) throw E.param("page_size should be between 1 and 60");
  const t = await findThread(shop(ctx).shopId, id);
  // 按 ID 拉（常见问题记录的成员）：线上只认不带引号的数字数组，带引号、逗号串、单个 ID 都报 param_error（2026-10-20 实测）
  const idList = ctx.query.get("message_id_list");
  if (idList !== null) {
    if (!/^\[\d+(,\d+)*\]$/.test(idList)) throw new ShopeeError("param_error", "Error or loss in request parameter.", 491);
    const ids = idList.slice(1, -1).split(",");
    const rows = await mockDb()
      .select()
      .from(mockMessage)
      .where(and(eq(mockMessage.conversationId, t.conversationId), inArray(mockMessage.messageId, ids)))
      .orderBy(desc(mockMessage.seq))
      .limit(pageSize);
    return ok({ messages: rows.map((m) => shopeeMessageFields(m, t, shop(ctx))), page_result: { page_size: pageSize, next_offset: "0" } });
  }
  const offset = ctx.query.get("offset");
  // 不可见的是常见问题记录的成员：会话分页读不到，只能按 ID 拉
  const conds = [eq(mockMessage.conversationId, t.conversationId), eq(mockMessage.isVisible, true)];
  if (offset && /^\d+$/.test(offset) && offset !== "0") conds.push(lt(mockMessage.seq, Number(offset)));
  const rows = await mockDb().select().from(mockMessage).where(and(...conds)).orderBy(desc(mockMessage.seq)).limit(pageSize + 1);
  const more = rows.length > pageSize;
  const page = rows.slice(0, pageSize);
  return ok({
    messages: page.map((m) => shopeeMessageFields(m, t, shop(ctx))),
    page_result: { page_size: pageSize, next_offset: more ? String(page[page.length - 1].seq) : "0" },
  });
}

async function getUnreadCount(ctx: Ctx): Promise<Response> {
  requireChat(ctx);
  const [r] = await mockDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(mockBuyerThread)
    .where(and(eq(mockBuyerThread.platform, "shopee"), eq(mockBuyerThread.shopId, shop(ctx).shopId), gt(mockBuyerThread.unreadCount, 0)));
  return ok({ total_unread_count: r?.n ?? 0 });
}

async function sendMessage(ctx: Ctx): Promise<Response> {
  requireChat(ctx);
  const s = shop(ctx);
  const b = ctx.body as { to_id?: number | string; message_type?: string; content?: Record<string, unknown> };
  if (b.to_id === undefined || b.to_id === null || b.to_id === "") throw E.param("to_id is a required field");
  if (!b.message_type) throw E.param("message_type is a required field");
  if (!b.content || typeof b.content !== "object") throw E.param("content is a required field");
  const [t] = await mockDb()
    .select()
    .from(mockBuyerThread)
    .where(and(eq(mockBuyerThread.platform, "shopee"), eq(mockBuyerThread.shopId, s.shopId), eq(mockBuyerThread.buyerId, String(b.to_id)), eq(mockBuyerThread.started, true)))
    .orderBy(desc(mockBuyerThread.lastMessageAt))
    .limit(1);
  if (!t) throw E.param("to_id is invalid");
  if (!t.canSend) throw new ShopeeError("user_is_forbidden", "The user is forbidden to receive message from shop.");
  let content: Record<string, unknown>;
  switch (b.message_type) {
    case "text": {
      const text = String(b.content.text ?? "");
      if (!text.trim()) throw E.param("content.text is a required field");
      content = { text };
      break;
    }
    case "image": {
      const url = String(b.content.image_url ?? "");
      if (!url) throw E.param("content.image_url is a required field");
      content = { url, thumb_url: url, thumb_width: Number(b.content.thumb_width ?? 0) || 300, thumb_height: Number(b.content.thumb_height ?? 0) || 300 };
      break;
    }
    case "item": {
      if (!b.content.item_id) throw E.param("content.item_id is a required field");
      content = { shop_id: Number(s.shopId), item_id: Number(b.content.item_id) };
      break;
    }
    case "order": {
      const sn = String(b.content.order_sn ?? "");
      const o = sn ? await findOrder(s.shopId, sn) : null;
      if (!o) throw E.param("content.order_sn is invalid");
      content = { shop_id: Number(s.shopId), order_sn: sn, order_status: o.status };
      break;
    }
    default:
      throw E.param(`message_type ${b.message_type} is not supported`);
  }
  const { message, pushes } = await addShopeeMessage(s, t, "seller", b.message_type, content);
  ctx.pushes.push(...pushes);
  return ok({
    to_id: Number(t.buyerId),
    message_id: message.messageId,
    message_type: message.type,
    content: message.content,
    conversation_id: t.conversationId,
    created_timestamp: toSec(message.createdAt),
    message_option: 0,
  });
}

async function uploadImage(ctx: Ctx): Promise<Response> {
  requireChat(ctx);
  const file = ctx.form?.get("file");
  if (!file || typeof file === "string") throw E.param("file is a required field");
  if (file.size > MAX_UPLOAD_BYTES) throw E.param("file size should be less than 10MB");
  const stored = await saveUpload("shopee", shop(ctx).shopId, file.name || "image", Buffer.from(await file.arrayBuffer()));
  if (!stored) throw E.param("file is not a valid image");
  const url = fileUrl(ctx.origin, stored.id);
  const scale = Math.min(1, 300 / Math.max(stored.width, stored.height));
  return ok({ url, thumbnail: url, thumb_width: Math.round(stored.width * scale), thumb_height: Math.round(stored.height * scale) });
}

// ── 订单与物流 ──

const ORDER_LIST_STATUSES = ["UNPAID", "READY_TO_SHIP", "PROCESSED", "SHIPPED", "COMPLETED", "IN_CANCEL", "CANCELLED", "INVOICE_PENDING"];

async function getOrderList(ctx: Ctx): Promise<Response> {
  const q = ctx.query;
  const field = q.get("time_range_field");
  if (!field) throw E.param("time_range_field is a required field");
  if (field !== "create_time" && field !== "update_time") throw E.param("time_range_field should be create_time or update_time");
  const from = intParam(q, "time_from");
  const to = intParam(q, "time_to");
  if (from === undefined) throw E.param("time_from is a required field");
  if (to === undefined) throw E.param("time_to is a required field");
  if (from >= to || to - from > 15 * 86400) throw new ShopeeError("order.order_list_invalid_time", "Start time must be earlier than end time and diff in 15days.");
  const pageSize = intParam(q, "page_size");
  if (pageSize === undefined) throw E.param("page_size is a required field");
  if (pageSize < 1 || pageSize > 100) throw E.param("page_size should be between 1 and 100");
  const status = q.get("order_status");
  if (status && !ORDER_LIST_STATUSES.includes(status)) throw E.param("order_status is invalid");
  const offset = Number(q.get("cursor") || "0") || 0;
  const col = field === "create_time" ? mockOrder.createTime : mockOrder.updateTime;
  const conds = [eq(mockOrder.platform, "shopee"), eq(mockOrder.shopId, shop(ctx).shopId), sql`${col} >= to_timestamp(${from})`, sql`${col} <= to_timestamp(${to})`];
  if (status) conds.push(eq(mockOrder.status, status));
  const rows = await mockDb().select().from(mockOrder).where(and(...conds)).orderBy(desc(col), desc(mockOrder.orderId)).offset(offset).limit(pageSize + 1);
  const more = rows.length > pageSize;
  const withStatus = (q.get("response_optional_fields") ?? "").split(",").map((s) => s.trim()).includes("order_status");
  return ok({
    more,
    next_cursor: more ? String(offset + pageSize) : "",
    order_list: rows.slice(0, pageSize).map((o) => ({ order_sn: o.orderId, ...(withStatus ? { order_status: o.status } : {}), booking_sn: "" })),
  });
}

async function getOrderDetail(ctx: Ctx): Promise<Response> {
  const list = (ctx.query.get("order_sn_list") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) throw E.param("order_sn_list is a required field");
  if (list.length > 50) throw E.param("order_sn_list length should be less than or equal to 50");
  const optional = new Set((ctx.query.get("response_optional_fields") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const rows = await mockDb().select().from(mockOrder).where(and(eq(mockOrder.platform, "shopee"), eq(mockOrder.shopId, shop(ctx).shopId), inArray(mockOrder.orderId, list)));
  if (rows.length === 0) throw E.notFound("the order is not found");
  const byId = new Map(rows.map((o) => [o.orderId, o]));
  return ok({ order_list: list.filter((sn) => byId.has(sn)).map((sn) => shopeeOrderDetail(byId.get(sn)!, shop(ctx), optional)) });
}

const SELLER_CANCEL_REASONS: Record<string, string> = {
  OUT_OF_STOCK: "Out of Stock",
  CUSTOMER_REQUEST: "Buyer Request to Cancel",
  UNDELIVERABLE_AREA: "Undeliverable Area",
  COD_NOT_SUPPORTED: "COD Unsupported",
};

async function cancelOrder(ctx: Ctx): Promise<Response> {
  const s = shop(ctx);
  const b = ctx.body as { order_sn?: string; cancel_reason?: string; item_list?: Array<{ item_id: number; model_id: number }> };
  if (!b.order_sn) throw E.param("order_sn is a required field");
  if (!b.cancel_reason) throw E.param("cancel_reason is a required field");
  if (!SELLER_CANCEL_REASONS[b.cancel_reason]) throw E.param("cancel_reason is invalid");
  if (b.cancel_reason === "UNDELIVERABLE_AREA" && !["TW", "MY"].includes(s.region)) throw E.param("cancel_reason UNDELIVERABLE_AREA is only available in TW and MY");
  if (b.cancel_reason === "OUT_OF_STOCK" && !(b.item_list && b.item_list.length > 0)) throw E.param("item_list is required when cancel_reason is OUT_OF_STOCK");
  const o = await findOrder(s.shopId, b.order_sn);
  if (!o) throw E.notFound("the order is not found");
  if (!SHOPEE_PRE_SHIP.includes(o.status)) throw new ShopeeError("order.error_limit", `Can not cancel this order:order status is ${o.status}`);
  const at = nowSec();
  const patch = applyOrderStatus("shopee", s.region, o, "CANCELLED", at, toSec(o.createTime));
  const { order, pushes } = await updateShopeeOrder(s, o, { ...patch, cancelBy: "seller", cancelReason: SELLER_CANCEL_REASONS[b.cancel_reason] });
  ctx.pushes.push(...pushes);
  return ok({ update_time: toSec(order.updateTime) });
}

async function handleBuyerCancellation(ctx: Ctx): Promise<Response> {
  const s = shop(ctx);
  const b = ctx.body as { order_sn?: string; operation?: string };
  if (!b.order_sn) throw E.param("order_sn is a required field");
  if (b.operation !== "ACCEPT" && b.operation !== "REJECT") throw E.param("operation should be ACCEPT or REJECT");
  const o = await findOrder(s.shopId, b.order_sn);
  if (!o) throw E.notFound("the order is not found");
  if (o.status !== "IN_CANCEL") throw new ShopeeError("order.cancel_order_invalid_status", "Invalid order_status.The order status should be IN_CANCEL.");
  const at = nowSec();
  const result =
    b.operation === "ACCEPT"
      ? await updateShopeeOrder(s, o, { ...applyOrderStatus("shopee", s.region, o, "CANCELLED", at, toSec(o.createTime)), cancelBy: "buyer", cancelReason: "Buyer Request to Cancel" })
      : await updateShopeeOrder(s, o, { status: o.prevStatus ?? "READY_TO_SHIP", prevStatus: null });
  ctx.pushes.push(...result.pushes);
  return ok({ update_time: toSec(result.order.updateTime) });
}

async function getTrackingInfo(ctx: Ctx): Promise<Response> {
  const sn = ctx.query.get("order_sn");
  if (!sn) throw E.param("order_sn is a required field");
  const o = await findOrder(shop(ctx).shopId, sn);
  if (!o) throw new ShopeeError("logistics.invalid_error", "The order is not exist.");
  const pkg = ctx.query.get("package_number");
  if (pkg !== null && pkg !== (o.packageNumber ?? "")) throw new ShopeeError("logistics.package_not_exist", "The package is not exist.");
  return ok({
    order_sn: o.orderId,
    package_number: o.packageNumber ?? "",
    logistics_status: shopeeLogisticsStatus(o.status, o.logisticsStatus, o.prevStatus),
    tracking_info: [...o.tracking].reverse().map((e) => ({ update_time: e.time, description: e.description, logistics_status: e.status })),
  });
}

// ── 退货 ──

const RETURN_STATUSES = ["REQUESTED", "ACCEPTED", "CANCELLED", "JUDGING", "CLOSED", "PROCESSING", "SELLER_DISPUTE"];

async function getReturnList(ctx: Ctx): Promise<Response> {
  const q = ctx.query;
  const pageNo = intParam(q, "page_no");
  const pageSize = intParam(q, "page_size");
  if (pageNo === undefined) throw E.param("page_no is a required field");
  if (pageSize === undefined) throw E.param("page_size is a required field");
  if (pageSize < 1 || pageSize > 100) throw E.param("page_size should be between 1 and 100");
  const conds = [eq(mockAfterSale.platform, "shopee"), eq(mockAfterSale.shopId, shop(ctx).shopId), eq(mockAfterSale.kind, "return")];
  for (const [fromKey, toKey, col] of [["create_time_from", "create_time_to", mockAfterSale.createTime], ["update_time_from", "update_time_to", mockAfterSale.updateTime]] as const) {
    const f = intParam(q, fromKey);
    const t = intParam(q, toKey);
    if (f !== undefined && t !== undefined) {
      if (t < f) throw E.param(`The ${toKey} should be later than ${fromKey}.`);
      if (t - f > 15 * 86400) throw E.param(`The period between ${fromKey} and ${toKey} must not more than 15 days.`);
    }
    if (f !== undefined) conds.push(sql`${col} >= to_timestamp(${f})`);
    if (t !== undefined) conds.push(sql`${col} <= to_timestamp(${t})`);
  }
  const status = q.get("status");
  if (status) {
    if (!RETURN_STATUSES.includes(status)) throw E.param("status is invalid");
    conds.push(eq(mockAfterSale.status, status));
  }
  const rows = await mockDb().select().from(mockAfterSale).where(and(...conds)).orderBy(desc(mockAfterSale.createTime)).offset(pageNo * pageSize).limit(pageSize + 1);
  const orders = rows.length ? await mockDb().select().from(mockOrder).where(inArray(mockOrder.orderId, rows.map((r) => r.orderId))) : [];
  const names = new Map(orders.map((o) => [o.orderId, o.buyerName]));
  return ok({ more: rows.length > pageSize, return: rows.slice(0, pageSize).map((r) => shopeeReturnFields(r, shop(ctx), names.get(r.orderId) ?? "", false)) });
}

async function getReturnDetail(ctx: Ctx): Promise<Response> {
  const sn = ctx.query.get("return_sn");
  if (!sn) throw E.param("return_sn is a required field");
  const r = await findReturn(shop(ctx).shopId, sn);
  if (!r) throw new ShopeeError("error_data", "The return you queried doesn't exist.");
  const o = await findOrder(shop(ctx).shopId, r.orderId);
  return ok(shopeeReturnFields(r, shop(ctx), o?.buyerName ?? "", true));
}

async function confirmReturn(ctx: Ctx): Promise<Response> {
  const s = shop(ctx);
  const sn = (ctx.body as { return_sn?: string }).return_sn;
  if (!sn) throw E.param("return_sn is a required field");
  const r = await findReturn(s.shopId, sn);
  if (!r) throw new ShopeeError("error_data", "The return you queried doesn't exist.");
  if (r.status === "JUDGING" || r.status === "SELLER_DISPUTE") throw new ShopeeError("error_data", "Shopee is reviewing the case and will get back to you.");
  if (r.status !== "REQUESTED" && r.status !== "PROCESSING") throw new ShopeeError("error_data", `Invalid return status: ${r.status}`);
  const { pushes } = await updateShopeeReturn(s, r, { status: "ACCEPTED", extra: { ...r.extra, negotiation_status: "TERMINATED" } });
  ctx.pushes.push(...pushes);
  return ok({ return_sn: r.id });
}

const DISPUTE_REASON_IDS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 53, 54, 55, 56, 81, 82, 83, 84, 85, 86, 87, 88, 89]);

async function disputeReturn(ctx: Ctx): Promise<Response> {
  const s = shop(ctx);
  const b = ctx.body as { return_sn?: string; email?: string; dispute_reason_id?: number; dispute_text_reason?: string; image_list?: unknown[] };
  if (!b.return_sn) throw new ShopeeError("dispute.request.param.error", "return_sn is a required parameter");
  if (!b.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) throw new ShopeeError("dispute.request.param.error", `Input invalid email=[${b.email ?? ""}]`);
  if (b.dispute_reason_id === undefined) throw new ShopeeError("dispute.request.param.error", "Can't raise dispute because the dispute reason is empty");
  if (!DISPUTE_REASON_IDS.has(Number(b.dispute_reason_id))) throw new ShopeeError("dispute.request.param.error", "Can't raise dispute because the return_sn and dispute_reason_id does not match.");
  const r = await findReturn(s.shopId, b.return_sn);
  if (!r) throw new ShopeeError("returnsn.illegal", "return sn is illegal");
  if (!["REQUESTED", "PROCESSING", "ACCEPTED"].includes(r.status)) {
    throw new ShopeeError("error_return_status", "Cannot raise dispute because return SN is not in REQUESTED, RETURN_PROCESSING, or RETURN_ACCEPTED");
  }
  const deadline = nowSec() + SHOPEE_EVIDENCE_DUE_SEC;
  const extra = {
    ...r.extra,
    dispute_reason: [Number(b.dispute_reason_id)],
    dispute_text_reason: b.dispute_text_reason ? [b.dispute_text_reason] : [],
    seller_proof: { seller_proof_status: "PENDING", seller_evidence_deadline: deadline },
    dispute_email: b.email,
  };
  const { pushes } = await updateShopeeReturn(s, r, { status: "JUDGING", extra, deadlines: { ...r.deadlines, seller_evidence_deadline: deadline } });
  ctx.pushes.push(...pushes);
  return ok({ return_sn: r.id, msg: "dispute return success" });
}

const HANDLERS: Record<string, Handler> = {
  "public/get_shops_by_partner": { method: "GET", level: "public", run: getShopsByPartner },
  "auth/token/get": { method: "POST", level: "public", run: tokenGet },
  "auth/access_token/get": { method: "POST", level: "public", run: accessTokenGet },
  "push/get_app_push_config": { method: "GET", level: "public", run: getPushConfig },
  "push/set_app_push_config": { method: "POST", level: "public", run: setPushConfig },
  "shop/get_shop_info": { method: "GET", level: "shop", run: getShopInfo },
  "product/get_item_base_info": { method: "GET", level: "shop", run: getItemBaseInfo },
  "product/get_model_list": { method: "GET", level: "shop", run: getModelList },
  "sellerchat/get_conversation_list": { method: "GET", level: "shop", run: getConversationList },
  "sellerchat/get_one_conversation": { method: "GET", level: "shop", run: getOneConversation },
  "sellerchat/get_message": { method: "GET", level: "shop", run: getMessage },
  "sellerchat/get_unread_conversation_count": { method: "GET", level: "shop", run: getUnreadCount },
  "sellerchat/send_message": { method: "POST", level: "shop", fault: "send_message", run: sendMessage },
  "sellerchat/upload_image": { method: "POST", level: "shop", run: uploadImage },
  "order/get_order_list": { method: "GET", level: "shop", fault: "order_read", run: getOrderList },
  "order/get_order_detail": { method: "GET", level: "shop", fault: "order_read", run: getOrderDetail },
  "order/cancel_order": { method: "POST", level: "shop", fault: "after_sale_write", run: cancelOrder },
  "order/handle_buyer_cancellation": { method: "POST", level: "shop", fault: "after_sale_write", run: handleBuyerCancellation },
  "logistics/get_tracking_info": { method: "GET", level: "shop", run: getTrackingInfo },
  "returns/get_return_list": { method: "GET", level: "shop", run: getReturnList },
  "returns/get_return_detail": { method: "GET", level: "shop", run: getReturnDetail },
  "returns/confirm": { method: "POST", level: "shop", fault: "after_sale_write", run: confirmReturn },
  "returns/dispute": { method: "POST", level: "shop", fault: "after_sale_write", run: disputeReturn },
  "account_health/get_shop_performance": { method: "GET", level: "shop", run: getShopPerformance },
};

/** 入口：region 为主机区域，segments 为 /api/v2/ 之后的路径段。 */
export async function handleShopeeApi(req: Request, region: string, segments: string[]): Promise<Response> {
  if (!(SHOPEE_REGIONS as readonly string[]).includes(region)) return new Response("Not Found", { status: 404 });
  const key = segments.join("/");
  const apiPath = `/api/v2/${key}`;
  const handler = HANDLERS[key];
  try {
    if (!handler || handler.method !== req.method) throw E.pathNotFound();
    const query = new URL(req.url).searchParams;
    const gw = await verifyShopee(region, apiPath, query, handler.level);
    const fault = handler.fault && gw.shop ? await takeFault("shopee", gw.shop.shopId, handler.fault) : null;
    if (fault === "error") throw new ShopeeError("error_server", "Something wrong. Please try later.", 500);
    if (fault === "timeout") await sleep(FAULT_TIMEOUT_MS);
    let body: Record<string, unknown> = {};
    let form: FormData | null = null;
    if (req.method === "POST") {
      const ct = req.headers.get("content-type") ?? "";
      if (ct.includes("multipart/form-data")) {
        form = await req.formData();
      } else {
        const text = await req.text();
        if (text.trim()) {
          try {
            body = JSON.parse(text) as Record<string, unknown>;
          } catch {
            throw E.param("request body is not a valid json");
          }
        }
      }
    }
    const ctx: Ctx = { ...gw, req, query, body, form, origin: originOf(req), pushes: [] };
    const res = await handler.run(ctx);
    runPushesLater(ctx.pushes);
    return res;
  } catch (e) {
    if (e instanceof ShopeeError) return errorResponse(e);
    console.error("[mock shopee]", apiPath, e);
    return errorResponse(new ShopeeError("error_server", "Something wrong. Please try later.", 500));
  }
}
