// TikTok Shop Open API 适配器：签名请求、授权、客服、订单、取消与退货、webhook 登记。字段按官方文档（DESIGN §8.11 列的子集）。
import { env } from "@/server/env";
import { platformFetch } from "./http";
import { assertTiktokRead, ReadOnlyPlatformError } from "./readonly";
import { nowSec, tiktokSign } from "./signing";
import { PlatformError, type NormalizedAfterSale, type NormalizedMessage, type NormalizedOrder, type TokenGrant } from "./types";

/** readOnly：只读接入（凭证借用自其他系统），只放行读接口，见 readonly.ts */
export type TiktokApp = { appKey: string; appSecret: string; serviceId?: string | null; readOnly?: boolean };
export type TiktokShopAuth = { accessToken: string; cipher: string };

/** 店铺接入时登记的 webhook 事件（DESIGN §8.4） */
export const TIKTOK_WEBHOOK_EVENTS = [
  "ORDER_STATUS_CHANGE",
  "SELLER_DEAUTHORIZATION",
  "UPCOMING_AUTHORIZATION_EXPIRATION",
  "CANCELLATION_STATUS_CHANGE",
  "RETURN_STATUS_CHANGE",
  "NEW_CONVERSATION",
  "NEW_MESSAGE",
];

const AUTH_CODES = new Set([36009004, 106001, 105002, 36004004, 105001, 105003]);
const STATE_CODES = new Set([45109001, 25011011, 25011012, 25011013, 25020012, 25020009, 25001003, 25001051, 25001045, 25001011]);
const NOT_FOUND_CODES = new Set([45101003, 25007006, 21008111]);

function classify(code: number, httpStatus: number): PlatformError["kind"] {
  if (httpStatus === 401 || (AUTH_CODES.has(code) && httpStatus !== 200)) return "auth";
  if (code === 105002 || code === 106001) return "auth";
  if (STATE_CODES.has(code)) return "state";
  if (NOT_FOUND_CODES.has(code)) return "not_found";
  if (httpStatus === 403) return "forbidden";
  if (code === 36009003 || httpStatus >= 500) return "server";
  return "param";
}

type CallOpts = { shop?: TiktokShopAuth; accessToken?: string; query?: Record<string, string | number | boolean | undefined>; body?: unknown; form?: FormData };

async function call(app: TiktokApp, method: "GET" | "POST" | "PUT" | "DELETE", path: string, opts: CallOpts = {}): Promise<Record<string, unknown>> {
  if (app.readOnly) assertTiktokRead(method, path);
  const query: Record<string, string> = { app_key: app.appKey, timestamp: String(nowSec()) };
  if (opts.shop) query.shop_cipher = opts.shop.cipher;
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== "") query[k] = String(v);
  const bodyText = opts.form ? "" : method === "GET" ? "" : JSON.stringify(opts.body ?? {});
  query.sign = tiktokSign(app.appSecret, path, query, bodyText);
  const headers: Record<string, string> = { "x-tts-access-token": opts.shop?.accessToken ?? opts.accessToken ?? "" };
  const init: RequestInit = { method, headers };
  if (opts.form) init.body = opts.form;
  else if (method !== "GET") {
    init.body = bodyText;
    headers["content-type"] = "application/json";
  }
  const { status, json } = await platformFetch("tiktok", `${env().TIKTOK_API_HOST}${path}?${new URLSearchParams(query)}`, init);
  const code = Number(json.code ?? (status >= 400 ? status : 0));
  if (code !== 0 || status >= 400) throw new PlatformError("tiktok", String(code), String(json.message ?? ""), classify(code, status), status);
  return (json.data ?? {}) as Record<string, unknown>;
}

// ── 授权 ──

/** 授权页地址模板是否要 Service ID（生产的跨境店定制授权链接要，本机模拟授权页不要） */
export const tiktokAuthorizeNeedsServiceId = () => (env().TIKTOK_AUTHORIZE_URL ?? "").includes("{service_id}");

/** 卖家授权链接：跨境店每个站点授权一次；app_key 留在参数里，平台回跳不带 state 时据此找回本次授权 */
export function tiktokAuthUrl(app: TiktokApp, state: string, shopRegion: string): string {
  const template = env().TIKTOK_AUTHORIZE_URL ?? `${env().TIKTOK_AUTH_HOST}/open/authorize`;
  const url = new URL(template.replace("{service_id}", encodeURIComponent(app.serviceId ?? "")));
  url.searchParams.set("app_key", app.appKey);
  url.searchParams.set("state", state);
  url.searchParams.set("shop_region", shopRegion);
  return url.toString();
}

async function authCall(path: string, query: Record<string, string>): Promise<Record<string, unknown>> {
  const { status, json } = await platformFetch("tiktok", `${env().TIKTOK_AUTH_HOST}${path}?${new URLSearchParams(query)}`, { method: "GET" });
  const code = Number(json.code ?? (status >= 400 ? status : 0));
  if (code !== 0 || status >= 400) throw new PlatformError("tiktok", String(code), String(json.message ?? ""), "auth", status);
  return (json.data ?? {}) as Record<string, unknown>;
}

function grantFrom(d: Record<string, unknown>): Omit<TokenGrant, "shops"> {
  return {
    accessToken: String(d.access_token),
    refreshToken: String(d.refresh_token),
    accessExpiresAt: new Date(Number(d.access_token_expire_in) * 1000),
    authExpiresAt: new Date(Number(d.refresh_token_expire_in) * 1000),
    grantedScopes: (d.granted_scopes as string[] | undefined) ?? [],
    sellerName: d.seller_name ? String(d.seller_name) : undefined,
  };
}

/** 换 token 后取已授权店铺与 cipher（REQ-SHOP-004）；app_secret 错在这一步暴露（REQ-SHOP-003） */
export async function tiktokExchangeCode(app: TiktokApp, code: string): Promise<TokenGrant> {
  if (app.readOnly) throw new ReadOnlyPlatformError("tiktok", "GET /api/v2/token/get");
  const d = await authCall("/api/v2/token/get", { app_key: app.appKey, app_secret: app.appSecret, auth_code: code, grant_type: "authorized_code" });
  const grant = grantFrom(d);
  const shops = await tiktokAuthorizedShops(app, grant.accessToken);
  return { ...grant, shops: shops.map((s) => ({ externalShopId: s.id, name: s.name, market: s.region, cipher: s.cipher, authExpiresAt: grant.authExpiresAt })) };
}

export async function tiktokRefresh(app: TiktokApp, refreshToken: string): Promise<Omit<TokenGrant, "shops">> {
  if (app.readOnly) throw new ReadOnlyPlatformError("tiktok", "GET /api/v2/token/refresh");
  return grantFrom(await authCall("/api/v2/token/refresh", { app_key: app.appKey, app_secret: app.appSecret, refresh_token: refreshToken, grant_type: "refresh_token" }));
}

export async function tiktokAuthorizedShops(app: TiktokApp, accessToken: string): Promise<Array<{ id: string; name: string; region: string; cipher: string }>> {
  const d = await call(app, "GET", "/authorization/202309/shops", { accessToken });
  return ((d.shops as Array<Record<string, string>> | undefined) ?? []).map((s) => ({ id: String(s.id), name: s.name, region: s.region, cipher: s.cipher }));
}

// ── 客服 ──

export type TiktokConversation = { conversationId: string; buyerUserId: string | null; buyerImId: string | null; buyerName: string; canSend: boolean; sessionId: string | null; affiliate: boolean; lastMessageAt: Date | null };

function normalizeConversation(c: Record<string, unknown>): TiktokConversation {
  const parts = (c.participants as Array<Record<string, string>> | undefined) ?? [];
  const buyer = parts.find((p) => p.role === "BUYER");
  const latest = c.latest_message as Record<string, unknown> | null;
  return {
    conversationId: String(c.id),
    buyerUserId: buyer?.user_id ?? null,
    buyerImId: buyer?.im_user_id ?? null,
    buyerName: buyer?.nickname ?? "",
    canSend: c.can_send_message !== false,
    sessionId: c.cur_session_id ? String(c.cur_session_id) : null,
    affiliate: !buyer || parts.some((p) => p.role === "CREATOR" || p.role === "AFFILIATE"),
    lastMessageAt: latest?.create_time ? new Date(Number(latest.create_time) * 1000) : null,
  };
}

export async function tiktokConversations(app: TiktokApp, shop: TiktokShopAuth, pageToken: string | null, pageSize = 20): Promise<{ items: TiktokConversation[]; nextPageToken: string | null }> {
  const d = await call(app, "GET", "/customer_service/202309/conversations", { shop, query: { page_size: pageSize, page_token: pageToken ?? undefined, need_session_id: true } });
  return { items: ((d.conversations as Array<Record<string, unknown>> | undefined) ?? []).map(normalizeConversation), nextPageToken: String(d.next_page_token ?? "") || null };
}

/** TikTok 没有按 ID 取单个会话的接口：按最近活跃翻前几页找 */
export async function tiktokFindConversation(app: TiktokApp, shop: TiktokShopAuth, conversationId: string, maxPages = 5): Promise<TiktokConversation | null> {
  let token: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const page = await tiktokConversations(app, shop, token);
    const hit = page.items.find((c) => c.conversationId === conversationId);
    if (hit) return hit;
    if (!page.nextPageToken) return null;
    token = page.nextPageToken;
  }
  return null;
}

/** 一页消息（新 → 旧，每页 ≤ 10） */
export async function tiktokMessages(app: TiktokApp, shop: TiktokShopAuth, conversationId: string, pageToken: string | null): Promise<{ items: NormalizedMessage[]; nextPageToken: string | null }> {
  const d = await call(app, "GET", `/customer_service/202309/conversations/${encodeURIComponent(conversationId)}/messages`, { shop, query: { page_size: 10, page_token: pageToken ?? undefined, sort_order: "DESC" } });
  return {
    items: ((d.messages as Array<Record<string, unknown>> | undefined) ?? []).map((m) => normalizeTiktokMessage({ ...m, conversation_id: conversationId })),
    nextPageToken: String(d.next_page_token ?? "") || null,
  };
}

const ROLE: Record<string, NormalizedMessage["senderRole"]> = { BUYER: "buyer", CUSTOMER_SERVICE: "agent", SHOP: "agent", SYSTEM: "system", ROBOT: "platform_bot" };
/** 平台系统消息（通知、分配客服、进店提示、会话关闭等）：不管发送方是谁都按系统事件处理，不算买家发言或人工回复（DESIGN §9 发送方） */
const TIKTOK_SYSTEM_TYPES = new Set(["NOTIFICATION", "OTHER", "ALLOCATED_SERVICE", "BUYER_ENTER_FROM_TRANSFER", "USER_ENTER_FROM_TRANSFER", "USER_ENTER_FROM_GOODS", "USER_ENTER_FROM_ORDER", "GOODS_CARD", "SESSION_CLOSE"]);

/** webhook 14 的 data 与 Get Conversation Messages 的行同字段（content 为 JSON 串） */
export function normalizeTiktokMessage(m: Record<string, unknown>): NormalizedMessage {
  let c: Record<string, unknown> = {};
  try {
    c = typeof m.content === "string" ? (JSON.parse(m.content) as Record<string, unknown>) : ((m.content ?? {}) as Record<string, unknown>);
  } catch {
    c = { content: String(m.content ?? "") };
  }
  const sender = (m.sender ?? {}) as Record<string, string>;
  const t = String(m.type ?? "");
  const role = TIKTOK_SYSTEM_TYPES.has(t) ? "system" : (ROLE[sender.role] ?? "system");
  let type: NormalizedMessage["type"] = "other";
  let text: string | null = null;
  const payload: Record<string, unknown> = {};
  switch (t) {
    case "TEXT":
      type = "text";
      text = String(c.content ?? "");
      break;
    case "IMAGE":
      type = "image";
      Object.assign(payload, { url: c.url, width: c.width, height: c.height });
      break;
    case "VIDEO":
      type = "video";
      payload.url = c.url ?? c.vid;
      break;
    case "PRODUCT_CARD":
      type = "product_card";
      payload.productId = String(c.product_id ?? "");
      break;
    case "ORDER_CARD":
      type = "order_card";
      payload.orderId = String(c.order_id ?? "");
      break;
    case "LOGISTICS_CARD":
      type = "logistics_card";
      Object.assign(payload, { orderId: String(c.order_id ?? ""), packageId: c.package_id ? String(c.package_id) : undefined });
      break;
    case "RETURN_REFUND_CARD":
      type = "return_card";
      Object.assign(payload, { orderId: String(c.order_id ?? ""), skuId: String(c.sku_id ?? "") });
      break;
    case "COUPON_CARD":
      type = "coupon_card";
      payload.couponId = String(c.coupon_id ?? "");
      break;
    case "EMOTICONS":
      type = "sticker";
      break;
    case "NOTIFICATION":
      text = String(c.content ?? "");
      break;
    default:
      text = typeof c.content === "string" ? c.content : null;
  }
  if (TIKTOK_SYSTEM_TYPES.has(t)) payload.platformType = t;
  return {
    externalMessageId: String(m.id ?? m.message_id),
    externalConversationId: String(m.conversation_id ?? ""),
    buyerExternalId: role === "buyer" ? sender.im_user_id ?? null : null,
    buyerName: role === "buyer" ? sender.nickname ?? null : null,
    fromBuyer: role === "buyer",
    senderRole: role,
    type,
    text,
    translation: null,
    payload,
    sentAt: new Date(Number(m.create_time ?? nowSec()) * 1000),
    affiliate: false,
    raw: m,
  };
}

async function send(app: TiktokApp, shop: TiktokShopAuth, conversationId: string, type: string, content: Record<string, unknown>): Promise<{ messageId: string; sentAt: Date }> {
  const d = await call(app, "POST", `/customer_service/202606/conversations/${encodeURIComponent(conversationId)}/messages`, { shop, body: { type, content: JSON.stringify(content) } });
  return { messageId: String(d.message_id), sentAt: new Date() };
}

export const tiktokSendText = (app: TiktokApp, shop: TiktokShopAuth, conversationId: string, text: string) => send(app, shop, conversationId, "TEXT", { content: text });
export const tiktokSendOrderCard = (app: TiktokApp, shop: TiktokShopAuth, conversationId: string, orderId: string) => send(app, shop, conversationId, "ORDER_CARD", { order_id: orderId });
export const tiktokSendLogisticsCard = (app: TiktokApp, shop: TiktokShopAuth, conversationId: string, orderId: string, packageId?: string) =>
  send(app, shop, conversationId, "LOGISTICS_CARD", { order_id: orderId, ...(packageId ? { package_id: packageId } : {}) });
export const tiktokSendReturnCard = (app: TiktokApp, shop: TiktokShopAuth, conversationId: string, orderId: string, skuId: string) => send(app, shop, conversationId, "RETURN_REFUND_CARD", { order_id: orderId, sku_id: skuId });
export const tiktokSendCouponCard = (app: TiktokApp, shop: TiktokShopAuth, conversationId: string, couponId: string) => send(app, shop, conversationId, "COUPON_CARD", { coupon_id: couponId });

export async function tiktokSendImage(app: TiktokApp, shop: TiktokShopAuth, conversationId: string, image: { bytes: Buffer; filename: string; mime: string }): Promise<{ messageId: string; sentAt: Date; url: string }> {
  const form = new FormData();
  form.set("data", new Blob([new Uint8Array(image.bytes)], { type: image.mime }), image.filename);
  const up = await call(app, "POST", "/customer_service/202309/images/upload", { shop, form });
  const sent = await send(app, shop, conversationId, "IMAGE", { url: up.url, width: up.width, height: up.height });
  return { ...sent, url: String(up.url) };
}

export async function tiktokEndSession(app: TiktokApp, shop: TiktokShopAuth, conversationId: string, sessionId: string): Promise<void> {
  await call(app, "POST", `/customer_service/202605/conversations/${encodeURIComponent(conversationId)}/sessions/${encodeURIComponent(sessionId)}/end`, { shop });
}

export async function tiktokGetAcceptChat(app: TiktokApp, shop: TiktokShopAuth): Promise<boolean> {
  const d = await call(app, "GET", "/customer_service/202309/agents/settings", { shop });
  return Boolean(d.can_accept_chat);
}

export async function tiktokSetAcceptChat(app: TiktokApp, shop: TiktokShopAuth, accept: boolean): Promise<void> {
  await call(app, "PUT", "/customer_service/202309/agents/settings", { shop, body: { can_accept_chat: accept } });
}

export async function tiktokPerformance(app: TiktokApp, shop: TiktokShopAuth, from: string, to: string): Promise<Record<string, unknown>> {
  const d = await call(app, "GET", "/customer_service/202407/performance", { shop, query: { support_date_ge: from, support_date_lt: to } });
  const p = (d.performance ?? {}) as Record<string, string | number>;
  return {
    platformLabel: "TikTok 客服回复率",
    responseRate: p.response_percentage !== undefined ? Number(p.response_percentage) : null,
    responseTimeMins: p.response_time_mins !== undefined ? Number(p.response_time_mins) : null,
    satisfaction: p.satisfaction_percentage !== undefined ? Number(p.satisfaction_percentage) : null,
    sessions: p.support_session_count ?? null,
  };
}

// ── 订单 ──

export async function tiktokSearchOrders(
  app: TiktokApp,
  shop: TiktokShopAuth,
  filter: { buyerUserId?: string; updateTimeGe?: Date; updateTimeLt?: Date; createTimeGe?: Date },
  pageToken: string | null,
): Promise<{ items: NormalizedOrder[]; nextPageToken: string | null }> {
  const body: Record<string, unknown> = {};
  if (filter.buyerUserId) body.buyer_user_id = filter.buyerUserId;
  if (filter.updateTimeGe) body.update_time_ge = Math.floor(filter.updateTimeGe.getTime() / 1000);
  if (filter.updateTimeLt) body.update_time_lt = Math.floor(filter.updateTimeLt.getTime() / 1000);
  if (filter.createTimeGe) body.create_time_ge = Math.floor(filter.createTimeGe.getTime() / 1000);
  const d = await call(app, "POST", "/order/202309/orders/search", { shop, query: { page_size: 100, page_token: pageToken ?? undefined, sort_field: "update_time", sort_order: "DESC" }, body });
  return { items: ((d.orders as Array<Record<string, unknown>> | undefined) ?? []).map(normalizeTiktokOrder), nextPageToken: String(d.next_page_token ?? "") || null };
}

export async function tiktokGetOrders(app: TiktokApp, shop: TiktokShopAuth, ids: string[]): Promise<NormalizedOrder[]> {
  const out: NormalizedOrder[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const d = await call(app, "GET", "/order/202507/orders", { shop, query: { ids: ids.slice(i, i + 50).join(",") } });
    for (const o of (d.orders as Array<Record<string, unknown>> | undefined) ?? []) out.push(normalizeTiktokOrder(o));
  }
  return out;
}

const TIKTOK_DEADLINES = ["rts_sla_time", "shipping_due_time", "collection_due_time", "delivery_due_time", "delivery_sla_time", "cancel_order_sla_time"];

export function normalizeTiktokOrder(o: Record<string, unknown>): NormalizedOrder {
  const payment = (o.payment ?? {}) as Record<string, string>;
  const lines = (o.line_items as Array<Record<string, string>> | undefined) ?? [];
  const bySku = new Map<string, NormalizedOrder["items"][number]>();
  for (const l of lines) {
    const prev = bySku.get(l.sku_id);
    if (prev) prev.qty += 1;
    else bySku.set(l.sku_id, { name: l.product_name, sku: l.sku_name || undefined, productId: l.product_id, skuId: l.sku_id, qty: 1, unitPrice: Number(l.sale_price ?? 0).toFixed(2) });
  }
  const ra = o.recipient_address as Record<string, string> | undefined;
  const deadlines: Record<string, string> = {};
  for (const k of TIKTOK_DEADLINES) {
    const v = Number(o[k] ?? 0);
    if (v > 0) deadlines[k] = new Date(v * 1000).toISOString();
  }
  const pkg = ((o.packages as Array<{ id: string }> | undefined) ?? [])[0];
  const rts = Number(o.rts_sla_time ?? 0);
  return {
    externalOrderId: String(o.id),
    buyerExternalId: o.user_id ? String(o.user_id) : null,
    buyerName: ra?.name ?? null,
    platformStatus: String(o.status),
    totalAmount: Number(payment.total_amount ?? 0).toFixed(2),
    currency: String(payment.currency ?? ""),
    items: [...bySku.values()],
    shipByAt: rts > 0 ? new Date(rts * 1000) : null,
    recipient: ra ? { name: ra.name, phone: ra.phone_number, address: ra.full_address, masked: /\*/.test(`${ra.name}${ra.phone_number}`) } : null,
    tracking: o.tracking_number || pkg ? { trackingNo: String(o.tracking_number ?? "") || undefined, carrier: String(o.shipping_provider ?? "") || undefined, packageId: pkg?.id, events: [] } : null,
    deadlines: Object.keys(deadlines).length ? deadlines : null,
    createdAt: new Date(Number(o.create_time ?? 0) * 1000),
    updatedAt: o.update_time ? new Date(Number(o.update_time) * 1000) : null,
    buyerRequestedCancel: Boolean(o.is_buyer_request_cancel),
  };
}

export async function tiktokTracking(app: TiktokApp, shop: TiktokShopAuth, orderId: string): Promise<Array<{ at: string; text: string }>> {
  const d = await call(app, "GET", `/fulfillment/202309/orders/${encodeURIComponent(orderId)}/tracking`, { shop });
  return ((d.tracking as Array<{ description: string; update_time_millis: number }> | undefined) ?? []).map((e) => ({ at: new Date(Number(e.update_time_millis)).toISOString(), text: e.description }));
}

// ── 取消与退货 ──

export const TIKTOK_SELLER_CANCEL_REASONS = [
  "seller_cancel_reason_out_of_stock",
  "seller_cancel_reason_wrong_price",
  "seller_cancel_paid_reason_address_not_deliver",
  "seller_cancel_paid_reason_buyer_requested_cancellation",
] as const;

export async function tiktokSellerCancel(app: TiktokApp, shop: TiktokShopAuth, orderId: string, reason: string): Promise<{ cancelId: string }> {
  const d = await call(app, "POST", "/return_refund/202602/cancellations", { shop, body: { order_id: orderId, cancel_reason: reason } });
  return { cancelId: String(d.cancel_id) };
}

export async function tiktokSearchAfterSales(
  app: TiktokApp,
  shop: TiktokShopAuth,
  kind: "return" | "cancel",
  filter: { ids?: string[]; orderIds?: string[]; updateTimeGe?: Date },
  pageToken: string | null,
): Promise<{ items: NormalizedAfterSale[]; nextPageToken: string | null }> {
  const body: Record<string, unknown> = {};
  if (filter.ids?.length) body[kind === "return" ? "return_ids" : "cancel_ids"] = filter.ids;
  if (filter.orderIds?.length) body.order_ids = filter.orderIds;
  if (filter.updateTimeGe) body.update_time_ge = Math.floor(filter.updateTimeGe.getTime() / 1000);
  const path = kind === "return" ? "/return_refund/202602/returns/search" : "/return_refund/202602/cancellations/search";
  const d = await call(app, "POST", path, { shop, query: { page_size: 50, page_token: pageToken ?? undefined, sort_field: "update_time", sort_order: "DESC" }, body });
  const rows = (kind === "return" ? d.return_orders : d.cancellations) as Array<Record<string, unknown>> | undefined;
  return { items: (rows ?? []).map((r) => normalizeTiktokAfterSale(r, kind)), nextPageToken: String(d.next_page_token ?? "") || null };
}

export async function tiktokAfterSale(app: TiktokApp, shop: TiktokShopAuth, kind: "return" | "cancel", id: string): Promise<NormalizedAfterSale | null> {
  const page = await tiktokSearchAfterSales(app, shop, kind, { ids: [id] }, null);
  return page.items[0] ?? null;
}

export function normalizeTiktokAfterSale(r: Record<string, unknown>, kind: "return" | "cancel"): NormalizedAfterSale {
  const next = ((r.seller_next_action_response as Array<{ action: string; deadline: number }> | undefined) ?? [])[0];
  const amount = r.refund_amount as { refund_total?: string; currency?: string } | undefined;
  const reasonText = String((kind === "return" ? r.return_reason_text : r.cancel_reason_text) ?? "") || null;
  return {
    kind,
    externalId: String(kind === "return" ? r.return_id : r.cancel_id),
    externalOrderId: String(r.order_id),
    platformStatus: String(kind === "return" ? r.return_status : r.cancel_status),
    nextAction: next?.action ?? null,
    sellerDueAt: next?.deadline ? new Date(Number(next.deadline) * 1000) : null,
    dueField: next?.deadline ? "seller_next_action_response.deadline" : null,
    reason: reasonText,
    amount: amount?.refund_total !== undefined ? Number(amount.refund_total).toFixed(2) : null,
    currency: amount?.currency ?? null,
    arbitrationStatus: kind === "return" ? String(r.arbitration_status ?? "") || null : null,
    returnType: kind === "return" ? String(r.return_type ?? "") || null : String(r.cancel_type ?? "") || null,
    updatedAt: r.update_time ? new Date(Number(r.update_time) * 1000) : null,
    raw: r,
  };
}

export async function tiktokApproveCancellation(app: TiktokApp, shop: TiktokShopAuth, cancelId: string): Promise<void> {
  await call(app, "POST", `/return_refund/202309/cancellations/${encodeURIComponent(cancelId)}/approve`, { shop, body: {} });
}

export async function tiktokRejectCancellation(app: TiktokApp, shop: TiktokShopAuth, cancelId: string, reason: string, comment?: string): Promise<void> {
  await call(app, "POST", `/return_refund/202309/cancellations/${encodeURIComponent(cancelId)}/reject`, { shop, body: { reject_reason: reason, comment: comment ?? "" } });
}

export async function tiktokApproveReturn(app: TiktokApp, shop: TiktokShopAuth, returnId: string, decision: "APPROVE_RETURN" | "APPROVE_REFUND" | "APPROVE_RECEIVED_PACKAGE"): Promise<void> {
  await call(app, "POST", `/return_refund/202309/returns/${encodeURIComponent(returnId)}/approve`, { shop, body: { decision } });
}

export async function tiktokRejectReturn(
  app: TiktokApp,
  shop: TiktokShopAuth,
  returnId: string,
  decision: "REJECT_RETURN" | "REJECT_REFUND" | "REJECT_RECEIVED_PACKAGE",
  reason: string,
  comment?: string,
): Promise<void> {
  await call(app, "POST", `/return_refund/202606/returns/${encodeURIComponent(returnId)}/reject`, { shop, body: { decision, reject_reason: reason, comment: comment ?? "" } });
}

export async function tiktokRejectReasons(app: TiktokApp, shop: TiktokShopAuth, id: string): Promise<Array<{ name: string; text: string }>> {
  const d = await call(app, "GET", "/return_refund/202309/reject_reasons", { shop, query: { return_or_cancel_id: id } });
  return (d.reasons as Array<{ name: string; text: string }> | undefined) ?? [];
}

// ── 优惠券、webhook ──

/** 只返回可在聊天发送的券：进行中、展示渠道为 CHAT 或 REGULAR（与发送接口的校验一致） */
export async function tiktokChatCoupons(app: TiktokApp, shop: TiktokShopAuth): Promise<Array<{ couponId: string; title: string; discount: string; endsAt: string | null }>> {
  const d = await call(app, "POST", "/promotion/202406/coupons/search", { shop, query: { page_size: 100 }, body: { status: ["ONGOING"], display_type: ["CHAT", "REGULAR"] } });
  return ((d.coupons as Array<Record<string, unknown>> | undefined) ?? [])
    .filter((c) => c.creation_source === undefined || c.creation_source === "SELLER_CENTER")
    .filter((c) => c.target_buyer_segment !== "REPEAT_CUSTOMERS")
    .map((c) => {
      const disc = (c.discount ?? {}) as { type?: string; reduction_amount?: { amount?: string; currency?: string }; percentage?: string };
      const end = (c.claim_duration as { end_time?: number } | undefined)?.end_time;
      return {
        couponId: String(c.id),
        title: String(c.title ?? ""),
        discount: disc.type === "AMOUNT_OFF" ? `${disc.reduction_amount?.currency ?? ""} ${disc.reduction_amount?.amount ?? ""}`.trim() : disc.percentage ? `${disc.percentage}%` : "",
        endsAt: end ? new Date(end * 1000).toISOString() : null,
      };
    });
}

export async function tiktokRegisterWebhooks(app: TiktokApp, shop: TiktokShopAuth, address: string): Promise<void> {
  for (const event_type of TIKTOK_WEBHOOK_EVENTS) await call(app, "PUT", "/event/202309/webhooks", { shop, body: { address, event_type } });
}

export async function tiktokWebhooks(app: TiktokApp, shop: TiktokShopAuth): Promise<Array<{ eventType: string; address: string }>> {
  const d = await call(app, "GET", "/event/202309/webhooks", { shop });
  return ((d.webhooks as Array<Record<string, string>> | undefined) ?? []).map((w) => ({ eventType: w.event_type, address: w.address }));
}
