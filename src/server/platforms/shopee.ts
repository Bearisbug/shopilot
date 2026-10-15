// Shopee Open Platform v2 适配器：签名请求、区域识别、授权、聊天、订单、退货。字段按官方文档（DESIGN §8.11 列的子集）。
import { shopeeHosts } from "@/server/env";
import { platformFetch } from "./http";
import { assertShopeeRead } from "./readonly";
import { nowSec, shopeeSign } from "./signing";
import { PlatformError, type NormalizedAfterSale, type NormalizedMessage, type NormalizedOrder, type ProductDetail, type TokenGrant } from "./types";

/** readOnly：只读接入（凭证借用自其他系统），只放行读接口，见 readonly.ts */
export type ShopeeApp = { partnerId: string; partnerKey: string; host: string; readOnly?: boolean };
export type ShopeeShopAuth = { shopId: string; accessToken: string };

/** REQ-SHOP-002：接入时订阅的推送 code */
export const SHOPEE_PUSH_CODES = [10, 3, 4, 29, 30, 1, 2, 12, 28];

const AUTH_ERRORS = new Set([
  "error_sign",
  "invalid_partner_id",
  "error_auth",
  "invalid_acceess_token",
  "invalid_access_token",
  "error_shop_refresh_token",
  "refresh_token_expired",
  "shop_access_expired",
  "shop_no_linked",
  "invalid_code",
  "invalid_main_acount_id",
  "invalid_shop_id",
]);
const STATE_ERRORS = new Set(["order.error_limit", "order.cancel_order_invalid_status", "error_return_status", "user_is_forbidden"]);
const NOT_FOUND_ERRORS = new Set(["error_not_found", "error_data", "logistics.invalid_error", "returnsn.illegal", "logistics.package_not_exist"]);

function classify(error: string, httpStatus: number): PlatformError["kind"] {
  if (AUTH_ERRORS.has(error)) return "auth";
  if (error === "error_permission") return "forbidden";
  if (STATE_ERRORS.has(error)) return "state";
  if (NOT_FOUND_ERRORS.has(error)) return "not_found";
  if (error === "error_server" || httpStatus >= 500) return "server";
  return "param";
}

type CallOpts = { shop?: ShopeeShopAuth; query?: Record<string, string | number | undefined>; body?: unknown; form?: FormData };

async function call(app: ShopeeApp, method: "GET" | "POST", apiPath: string, opts: CallOpts = {}): Promise<Record<string, unknown>> {
  if (app.readOnly) assertShopeeRead(method, apiPath);
  const path = `/api/v2/${apiPath}`;
  const ts = nowSec();
  const q = new URLSearchParams();
  q.set("partner_id", app.partnerId);
  q.set("timestamp", String(ts));
  if (opts.shop) {
    q.set("access_token", opts.shop.accessToken);
    q.set("shop_id", opts.shop.shopId);
    q.set("sign", shopeeSign(app.partnerKey, app.partnerId, path, ts, opts.shop.accessToken, opts.shop.shopId));
  } else {
    q.set("sign", shopeeSign(app.partnerKey, app.partnerId, path, ts));
  }
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== "") q.set(k, String(v));
  const init: RequestInit = { method };
  if (opts.form) init.body = opts.form;
  else if (method === "POST") {
    init.body = JSON.stringify(opts.body ?? {});
    init.headers = { "content-type": "application/json" };
  }
  const { status, json } = await platformFetch("shopee", `${app.host}${path}?${q}`, init);
  const error = typeof json.error === "string" ? json.error : "";
  if (error || status >= 400) {
    const code = error || `http_${status}`;
    throw new PlatformError("shopee", code, String(json.message ?? ""), classify(code, status), status);
  }
  return json;
}

const resp = (json: Record<string, unknown>) => (json.response ?? {}) as Record<string, unknown>;

// ── 区域识别与应用级接口 ──

export type ShopeeRegionAttempt = { region: string; result: "ok" | "invalid_partner" | "wrong_key" | "error"; message?: string };

/**
 * REQ-SHOP-002：依次用各区域主机签名调 get_shops_by_partner。
 * invalid_partner_id = 应用不在该区域；error_sign = 区域对但 Key 错。返回第一个成功的主机与全部尝试。
 */
export async function shopeeDetectRegion(partnerId: string, partnerKey: string): Promise<{ app: (ShopeeApp & { region: string }) | null; attempts: ShopeeRegionAttempt[] }> {
  const attempts: ShopeeRegionAttempt[] = [];
  for (const { region, host } of shopeeHosts()) {
    const app = { partnerId, partnerKey, host };
    try {
      await call(app, "GET", "public/get_shops_by_partner", { query: { page_size: 1, page_no: 1 } });
      attempts.push({ region, result: "ok" });
      return { app: { ...app, region }, attempts };
    } catch (e) {
      if (!(e instanceof PlatformError)) throw e;
      if (e.code === "invalid_partner_id") attempts.push({ region, result: "invalid_partner" });
      else if (e.code === "error_sign") attempts.push({ region, result: "wrong_key" });
      else attempts.push({ region, result: "error", message: `${e.code} ${e.message}`.trim() });
    }
  }
  return { app: null, attempts };
}

export async function shopeeAuthedShops(app: ShopeeApp): Promise<Array<{ shopId: string; region: string; authTime: Date | null; expireTime: Date | null }>> {
  const out: Array<{ shopId: string; region: string; authTime: Date | null; expireTime: Date | null }> = [];
  for (let page = 1; page <= 20; page++) {
    const json = await call(app, "GET", "public/get_shops_by_partner", { query: { page_size: 100, page_no: page } });
    for (const s of (json.authed_shop_list as Array<Record<string, number | string>> | undefined) ?? []) {
      out.push({ shopId: String(s.shop_id), region: String(s.region), authTime: secDate(s.auth_time), expireTime: secDate(s.expire_time) });
    }
    if (!json.more) break;
  }
  return out;
}

export async function shopeeGetPushConfig(app: ShopeeApp): Promise<{ callbackUrl: string; on: number[] }> {
  const r = resp(await call(app, "GET", "push/get_app_push_config"));
  return { callbackUrl: String(r.callback_url ?? ""), on: ((r.push_config_on_list as number[] | undefined) ?? []).map(Number) };
}

/** 写回调地址并订阅推送；平台会先向新地址发一条测试推送，3 秒内拿不到 2xx 就拒绝 */
export async function shopeeSetPushConfig(app: ShopeeApp, callbackUrl: string, codes = SHOPEE_PUSH_CODES): Promise<void> {
  await call(app, "POST", "push/set_app_push_config", { body: { callback_url: callbackUrl, set_push_config_on: codes } });
}

/** 授权链接（主账号授权页）：sign 基串 = partner_id + /api/v2/shop/auth_partner + timestamp */
export function shopeeAuthUrl(app: ShopeeApp, redirect: string, kind: "auth_partner" | "cancel_auth_partner" = "auth_partner"): string {
  const path = `/api/v2/shop/${kind}`;
  const ts = nowSec();
  const q = new URLSearchParams({ partner_id: app.partnerId, timestamp: String(ts), sign: shopeeSign(app.partnerKey, app.partnerId, path, ts), redirect });
  return `${app.host}${path}?${q}`;
}

// ── 授权与 token ──

/** 用授权码换 token。主账号授权（main_account_id）换出的 token 对全部店铺共用，之后每家店按 shop_id 各自刷新。 */
export async function shopeeExchangeCode(app: ShopeeApp, code: string, by: { mainAccountId: string } | { shopId: string }): Promise<TokenGrant> {
  const body: Record<string, unknown> = { code, partner_id: Number(app.partnerId) };
  if ("mainAccountId" in by) body.main_account_id = Number(by.mainAccountId);
  else body.shop_id = Number(by.shopId);
  const json = await call(app, "POST", "auth/token/get", { body });
  const ids = "mainAccountId" in by ? ((json.shop_id_list as number[] | undefined) ?? []).map(String) : [by.shopId];
  const authed = new Map((await shopeeAuthedShops(app)).map((s) => [s.shopId, s]));
  return {
    shops: ids.map((id) => ({ externalShopId: id, market: authed.get(id)?.region, authExpiresAt: authed.get(id)?.expireTime ?? null, mainAccountId: "mainAccountId" in by ? by.mainAccountId : undefined })),
    accessToken: String(json.access_token),
    refreshToken: String(json.refresh_token),
    accessExpiresAt: new Date(Date.now() + Number(json.expire_in ?? 14400) * 1000),
    authExpiresAt: null,
  };
}

export async function shopeeRefresh(app: ShopeeApp, shopId: string, refreshToken: string): Promise<{ accessToken: string; refreshToken: string; accessExpiresAt: Date }> {
  const json = await call(app, "POST", "auth/access_token/get", { body: { refresh_token: refreshToken, partner_id: Number(app.partnerId), shop_id: Number(shopId) } });
  return { accessToken: String(json.access_token), refreshToken: String(json.refresh_token), accessExpiresAt: new Date(Date.now() + Number(json.expire_in ?? 14400) * 1000) };
}

export async function shopeeShopInfo(app: ShopeeApp, shop: ShopeeShopAuth): Promise<{ name: string; region: string; authExpiresAt: Date | null }> {
  const json = await call(app, "GET", "shop/get_shop_info", { shop });
  return { name: String(json.shop_name ?? ""), region: String(json.region ?? ""), authExpiresAt: secDate(json.expire_time) };
}

export async function shopeePerformance(app: ShopeeApp, shop: ShopeeShopAuth): Promise<Record<string, unknown>> {
  const r = resp(await call(app, "GET", "account_health/get_shop_performance", { shop }));
  const metrics = (r.metric_list as Array<Record<string, unknown>> | undefined) ?? [];
  const pick = (name: string) => metrics.find((m) => m.metric_name === name);
  const rate = pick("response_rate");
  const time = pick("response_time");
  return {
    platformLabel: "Shopee 聊天回复率",
    responseRate: rate?.current_period ?? null,
    target: (rate?.target as { value?: number } | undefined)?.value ?? 70,
    responseTimeDays: time?.current_period ?? null,
    nonResponded: pick("no_of_non_responded_chats")?.current_period ?? null,
    rating: (r.overall_performance as { rating?: number } | undefined)?.rating ?? null,
  };
}

// ── 聊天 ──

export async function shopeeConversations(app: ShopeeApp, shop: ShopeeShopAuth, cursor: string | null, pageSize = 100): Promise<{ items: Array<{ conversationId: string; buyerId: string; buyerName: string; buyerAvatar: string | null; lastMessageAt: Date }>; nextCursor: string | null }> {
  const r = resp(await call(app, "GET", "sellerchat/get_conversation_list", { shop, query: { direction: "older", type: "all", page_size: pageSize, next_timestamp_nano: cursor ?? undefined } }));
  const list = (r.conversations as Array<Record<string, unknown>> | undefined) ?? [];
  const page = r.page_result as { more?: boolean; next_cursor?: { next_message_time_nano?: string } } | undefined;
  return {
    items: list.map((c) => ({
      conversationId: String(c.conversation_id),
      buyerId: String(c.to_id),
      buyerName: String(c.to_name ?? ""),
      buyerAvatar: typeof c.to_avatar === "string" && c.to_avatar ? c.to_avatar : null,
      lastMessageAt: new Date(Number(BigInt(String(c.last_message_timestamp ?? 0)) / BigInt(1_000_000))),
    })),
    nextCursor: page?.more ? String(page.next_cursor?.next_message_time_nano ?? "") || null : null,
  };
}

/** 商品卡片用：标题、主图、现价；有多规格时 get_item_base_info 不给价格，再取各规格现价的最低与最高。商品不存在返回 null */
export async function shopeeProduct(app: ShopeeApp, shop: ShopeeShopAuth, itemId: string): Promise<ProductDetail | null> {
  const r = resp(await call(app, "GET", "product/get_item_base_info", { shop, query: { item_id_list: itemId } }));
  const item = ((r.item_list as Array<Record<string, unknown>> | undefined) ?? [])[0];
  if (!item) return null;
  let prices = (item.price_info as Array<Record<string, unknown>> | undefined) ?? [];
  if (!prices.length && item.has_model) {
    const m = resp(await call(app, "GET", "product/get_model_list", { shop, query: { item_id: itemId } }));
    prices = ((m.model as Array<Record<string, unknown>> | undefined) ?? []).flatMap((x) => (x.price_info as Array<Record<string, unknown>> | undefined) ?? []);
  }
  const nums = prices.map((p) => Number(p.current_price)).filter((n) => Number.isFinite(n));
  return {
    name: String(item.item_name ?? ""),
    imageUrl: ((item.image as { image_url_list?: string[] } | undefined)?.image_url_list ?? [])[0] ?? null,
    priceMin: nums.length ? String(Math.min(...nums)) : null,
    priceMax: nums.length ? String(Math.max(...nums)) : null,
    currency: prices[0]?.currency ? String(prices[0].currency) : null,
  };
}

/** 一页消息（新 → 旧），offset 为上一页返回的 next_offset */
export async function shopeeMessages(app: ShopeeApp, shop: ShopeeShopAuth, conversationId: string, offset: string | null, pageSize = 60): Promise<{ items: NormalizedMessage[]; nextOffset: string | null }> {
  const r = resp(await call(app, "GET", "sellerchat/get_message", { shop, query: { conversation_id: conversationId, page_size: pageSize, offset: offset ?? undefined } }));
  const list = (r.messages as Array<Record<string, unknown>> | undefined) ?? [];
  const next = String((r.page_result as { next_offset?: string } | undefined)?.next_offset ?? "0");
  return { items: list.map((m) => normalizeShopeeMessage(m, shop.shopId)), nextOffset: next && next !== "0" ? next : null };
}

/** 推送 code 10 的 data.content 与 get_message 的行同结构 */
/** 平台系统消息：通知、打包的机器人消息、转人工提示。不算买家发言，也不算卖家人工回复（DESIGN §9 发送方） */
const SHOPEE_SYSTEM_TYPES = new Set(["notification", "bundle_message", "chatbot_msg", "live_agent_transfer"]);

/** 聊天内容里的 thumb_url 是图片 ID，拼上图片 CDN 才是地址；已是完整地址的原样返回 */
const SHOPEE_IMAGE_CDN = "https://down-my.img.susercontent.com/file/";
function shopeeImageUrl(v: unknown): string | undefined {
  if (typeof v !== "string" || !v) return undefined;
  return /^https?:\/\//i.test(v) ? v : SHOPEE_IMAGE_CDN + v;
}

export function normalizeShopeeMessage(m: Record<string, unknown>, shopId: string): NormalizedMessage {
  const fromShop = String(m.from_shop_id ?? "0") === String(shopId);
  const c = (m.content ?? {}) as Record<string, unknown>;
  const t = String(m.message_type ?? "");
  const system = SHOPEE_SYSTEM_TYPES.has(t);
  let type: NormalizedMessage["type"] = "other";
  let text: string | null = null;
  let translation: string | null = null;
  const payload: Record<string, unknown> = {};
  switch (t) {
    case "text":
    case "faq_liveagent": {
      // faq_liveagent：买家点了店铺 FAQ 的问题，正文在 text
      type = "text";
      text = String(c.text ?? "");
      // 推送与拉取的文字消息都可能带平台译文（content.translation.text）
      const tr = (c.translation ?? null) as { text?: unknown } | null;
      translation = typeof tr?.text === "string" && tr.text.trim() && tr.text !== text ? tr.text : null;
      break;
    }
    case "image":
    case "image_with_text":
      type = "image";
      payload.url = c.url ?? c.image_url;
      payload.width = c.thumb_width;
      payload.height = c.thumb_height;
      if (t === "image_with_text") text = typeof c.text === "string" ? c.text : typeof c.caption === "string" ? c.caption : null;
      break;
    case "item":
    case "product":
    case "variation_card":
    case "item_list":
    case "bundle_deal":
    case "add_on_deal":
      type = "product_card";
      payload.productId = String(c.item_id ?? c.product_id ?? (c.item_id_list as unknown[] | undefined)?.[0] ?? "");
      break;
    case "order":
      type = "order_card";
      payload.orderId = String(c.order_sn ?? "");
      break;
    case "voucher":
      type = "coupon_card";
      payload.couponId = String(c.voucher_id ?? c.voucher_code ?? "");
      break;
    case "logistics_card":
      type = "logistics_card";
      break;
    case "return_refund_card":
      type = "return_card";
      break;
    case "sticker":
      type = "sticker";
      Object.assign(payload, { url: (typeof c.url === "string" && c.url) || shopeeImageUrl(c.thumb_url), width: c.thumb_width ?? c.width, height: c.thumb_height ?? c.height });
      break;
    case "video":
      type = "video";
      Object.assign(payload, { url: c.video_url, cover: shopeeImageUrl(c.thumb_url), width: c.thumb_width, height: c.thumb_height, duration: c.duration_seconds });
      break;
    default:
      text = typeof c.text === "string" ? c.text : null;
  }
  if (system) payload.platformType = t;
  return {
    externalMessageId: String(m.message_id),
    externalConversationId: String(m.conversation_id),
    buyerExternalId: String(fromShop ? m.to_id : m.from_id),
    buyerName: String((fromShop ? m.to_user_name : m.from_user_name) ?? "") || null,
    fromBuyer: !fromShop && !system,
    senderRole: system ? "system" : fromShop ? "agent" : "buyer",
    type,
    text,
    translation,
    payload,
    sentAt: secDate(m.created_timestamp) ?? new Date(),
    affiliate: false,
    raw: m,
  };
}

export async function shopeeSendText(app: ShopeeApp, shop: ShopeeShopAuth, buyerId: string, text: string): Promise<{ messageId: string; sentAt: Date }> {
  return send(app, shop, buyerId, "text", { text });
}

export async function shopeeSendImage(app: ShopeeApp, shop: ShopeeShopAuth, buyerId: string, image: { bytes: Buffer; filename: string; mime: string }): Promise<{ messageId: string; sentAt: Date; url: string }> {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(image.bytes)], { type: image.mime }), image.filename);
  const up = resp(await call(app, "POST", "sellerchat/upload_image", { shop, form }));
  const url = String(up.url);
  const sent = await send(app, shop, buyerId, "image", { image_url: url, thumb_width: up.thumb_width, thumb_height: up.thumb_height });
  return { ...sent, url };
}

export async function shopeeSendOrderCard(app: ShopeeApp, shop: ShopeeShopAuth, buyerId: string, orderSn: string) {
  return send(app, shop, buyerId, "order", { order_sn: orderSn });
}

async function send(app: ShopeeApp, shop: ShopeeShopAuth, buyerId: string, messageType: string, content: Record<string, unknown>): Promise<{ messageId: string; sentAt: Date }> {
  const r = resp(await call(app, "POST", "sellerchat/send_message", { shop, body: { to_id: Number(buyerId), message_type: messageType, content } }));
  return { messageId: String(r.message_id), sentAt: secDate(r.created_timestamp) ?? new Date() };
}

// ── 订单 ──

const ORDER_FIELDS = [
  "buyer_user_id",
  "buyer_username",
  "total_amount",
  "item_list",
  "recipient_address",
  "shipping_carrier",
  "package_list",
  "pay_time",
  "payment_method",
  "cancel_by",
  "cancel_reason",
  "buyer_cancel_reason",
  "return_request_due_date",
].join(",");

/** 按更新时间分 15 天窗口列订单号（平台限制单次 ≤ 15 天） */
export async function shopeeOrderSns(app: ShopeeApp, shop: ShopeeShopAuth, from: Date, to: Date, field: "create_time" | "update_time" = "update_time"): Promise<string[]> {
  const sns: string[] = [];
  const window = 15 * 86400;
  let start = Math.floor(from.getTime() / 1000);
  const end = Math.floor(to.getTime() / 1000);
  while (start < end) {
    const stop = Math.min(start + window, end);
    let cursor = "";
    for (let i = 0; i < 100; i++) {
      const r = resp(await call(app, "GET", "order/get_order_list", { shop, query: { time_range_field: field, time_from: start, time_to: stop, page_size: 100, cursor } }));
      for (const o of (r.order_list as Array<{ order_sn: string }> | undefined) ?? []) sns.push(o.order_sn);
      if (!r.more) break;
      cursor = String(r.next_cursor ?? "");
    }
    start = stop;
  }
  return [...new Set(sns)];
}

export async function shopeeOrderDetails(app: ShopeeApp, shop: ShopeeShopAuth, sns: string[]): Promise<NormalizedOrder[]> {
  const out: NormalizedOrder[] = [];
  for (let i = 0; i < sns.length; i += 50) {
    const r = resp(await call(app, "GET", "order/get_order_detail", { shop, query: { order_sn_list: sns.slice(i, i + 50).join(","), response_optional_fields: ORDER_FIELDS } }));
    for (const o of (r.order_list as Array<Record<string, unknown>> | undefined) ?? []) out.push(normalizeShopeeOrder(o));
  }
  return out;
}

export function normalizeShopeeOrder(o: Record<string, unknown>): NormalizedOrder {
  const items = ((o.item_list as Array<Record<string, unknown>> | undefined) ?? []).map((i) => ({
    name: String(i.item_name ?? ""),
    sku: String(i.model_name ?? i.model_sku ?? "") || undefined,
    productId: String(i.item_id ?? ""),
    skuId: String(i.model_id ?? ""),
    qty: Number(i.model_quantity_purchased ?? 1),
    unitPrice: money(i.model_discounted_price),
    image: (i.image_info as { image_url?: string } | undefined)?.image_url || undefined,
  }));
  const ra = o.recipient_address as Record<string, string> | undefined;
  const pkg = ((o.package_list as Array<Record<string, unknown>> | undefined) ?? [])[0];
  const deadlines: Record<string, string> = {};
  const shipBy = secDate(o.ship_by_date);
  if (shipBy) deadlines.ship_by_date = shipBy.toISOString();
  const returnDue = secDate(o.return_request_due_date);
  if (returnDue) deadlines.return_request_due_date = returnDue.toISOString();
  const paidAt = secDate(o.pay_time);
  return {
    externalOrderId: String(o.order_sn),
    buyerExternalId: o.buyer_user_id !== undefined ? String(o.buyer_user_id) : null,
    buyerName: o.buyer_username ? String(o.buyer_username) : null,
    platformStatus: String(o.order_status),
    totalAmount: money(o.total_amount),
    currency: String(o.currency ?? ""),
    items,
    shipByAt: shipBy,
    recipient: ra ? { name: ra.name, phone: ra.phone, address: ra.full_address, masked: /\*/.test(`${ra.name}${ra.phone}${ra.full_address}`) } : null,
    tracking: pkg ? { carrier: String(pkg.shipping_carrier ?? o.shipping_carrier ?? "") || undefined, packageId: String(pkg.package_number ?? "") || undefined, events: [] } : null,
    deadlines: Object.keys(deadlines).length ? deadlines : null,
    // 订单详情不给买家付的运费（只有预估与实际物流成本）
    payment: { ...(o.payment_method ? { method: String(o.payment_method) } : {}), ...(paidAt ? { paidAt: paidAt.toISOString() } : {}) },
    createdAt: secDate(o.create_time) ?? new Date(),
    updatedAt: secDate(o.update_time),
    buyerRequestedCancel: o.order_status === "IN_CANCEL",
  };
}

export async function shopeeTracking(app: ShopeeApp, shop: ShopeeShopAuth, orderSn: string): Promise<{ trackingNo?: string; logisticsStatus: string; events: Array<{ at: string; text: string }> }> {
  const r = resp(await call(app, "GET", "logistics/get_tracking_info", { shop, query: { order_sn: orderSn } }));
  const events = ((r.tracking_info as Array<{ update_time: number; description: string }> | undefined) ?? []).map((e) => ({ at: new Date(e.update_time * 1000).toISOString(), text: e.description }));
  return { logisticsStatus: String(r.logistics_status ?? ""), events };
}

export const SHOPEE_CANCEL_REASONS = ["OUT_OF_STOCK", "CUSTOMER_REQUEST", "UNDELIVERABLE_AREA", "COD_NOT_SUPPORTED"] as const;

export async function shopeeCancelOrder(app: ShopeeApp, shop: ShopeeShopAuth, orderSn: string, reason: string, itemList?: Array<{ item_id: number; model_id: number }>): Promise<void> {
  await call(app, "POST", "order/cancel_order", { shop, body: { order_sn: orderSn, cancel_reason: reason, ...(itemList ? { item_list: itemList } : {}) } });
}

export async function shopeeHandleBuyerCancellation(app: ShopeeApp, shop: ShopeeShopAuth, orderSn: string, accept: boolean): Promise<void> {
  await call(app, "POST", "order/handle_buyer_cancellation", { shop, body: { order_sn: orderSn, operation: accept ? "ACCEPT" : "REJECT" } });
}

// ── 退货 ──

export async function shopeeReturnSns(app: ShopeeApp, shop: ShopeeShopAuth, from: Date, to: Date): Promise<string[]> {
  const sns: string[] = [];
  const window = 15 * 86400;
  let start = Math.floor(from.getTime() / 1000);
  const end = Math.floor(to.getTime() / 1000);
  while (start < end) {
    const stop = Math.min(start + window, end);
    for (let page = 0; page < 50; page++) {
      const r = resp(await call(app, "GET", "returns/get_return_list", { shop, query: { page_no: page, page_size: 100, update_time_from: start, update_time_to: stop } }));
      for (const x of (r.return as Array<{ return_sn: string }> | undefined) ?? []) sns.push(x.return_sn);
      if (!r.more) break;
    }
    start = stop;
  }
  return [...new Set(sns)];
}

export async function shopeeReturnDetail(app: ShopeeApp, shop: ShopeeShopAuth, returnSn: string): Promise<NormalizedAfterSale> {
  const r = resp(await call(app, "GET", "returns/get_return_detail", { shop, query: { return_sn: returnSn } }));
  return normalizeShopeeReturn(r);
}

/** 截止字段按 DESIGN §11.4 平台售后映射：REQUESTED → due_date；PROCESSING → return_seller_due_date；JUDGING / SELLER_DISPUTE 且举证 PENDING → seller_evidence_deadline */
export function normalizeShopeeReturn(r: Record<string, unknown>): NormalizedAfterSale {
  const status = String(r.status);
  const proof = r.seller_proof as { seller_proof_status?: string; seller_evidence_deadline?: number } | undefined;
  let due: Date | null = null;
  let dueField: string | null = null;
  let next: string | null = null;
  if (status === "REQUESTED") {
    due = secDate(r.due_date);
    dueField = "due_date";
    next = "respond";
  } else if (status === "PROCESSING") {
    due = secDate(r.return_seller_due_date);
    dueField = due ? "return_seller_due_date" : null;
    next = "await_buyer_return";
  } else if ((status === "JUDGING" || status === "SELLER_DISPUTE") && proof?.seller_proof_status === "PENDING") {
    due = secDate(proof.seller_evidence_deadline);
    dueField = "seller_evidence_deadline";
    next = "upload_evidence";
  }
  return {
    kind: "return",
    externalId: String(r.return_sn),
    externalOrderId: String(r.order_sn),
    platformStatus: status,
    nextAction: next,
    sellerDueAt: due,
    dueField,
    reason: [r.reason, r.text_reason].filter(Boolean).join(" · ") || null,
    amount: r.refund_amount !== undefined ? money(r.refund_amount) : null,
    currency: r.currency ? String(r.currency) : null,
    returnType: Number(r.return_solution) === 1 ? "REFUND" : "RETURN_AND_REFUND",
    updatedAt: secDate(r.update_time),
    raw: r,
  };
}

export async function shopeeConfirmReturn(app: ShopeeApp, shop: ShopeeShopAuth, returnSn: string): Promise<void> {
  await call(app, "POST", "returns/confirm", { shop, body: { return_sn: returnSn } });
}

export async function shopeeDisputeReturn(app: ShopeeApp, shop: ShopeeShopAuth, input: { returnSn: string; email: string; reasonId: number; text?: string }): Promise<void> {
  await call(app, "POST", "returns/dispute", { shop, body: { return_sn: input.returnSn, email: input.email, dispute_reason_id: input.reasonId, dispute_text_reason: input.text ?? "", image_list: [] } });
}

// ── 工具 ──

function secDate(v: unknown): Date | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
}

function money(v: unknown): string {
  const n = Number(v ?? 0);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}
