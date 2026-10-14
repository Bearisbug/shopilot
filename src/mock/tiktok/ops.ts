// TikTok 数据变更、字段格式化与 webhook。平台接口与模拟器共用。
import { desc, eq } from "drizzle-orm";
import { mockDb } from "../db/client";
import { mockAfterSale, mockBuyerThread, mockMessage, mockOrder } from "../db/schema";
import { TIKTOK_EVENT_TYPES } from "../fixtures";
import { nowSec, toSec } from "../http";
import { tiktokMessageId, tiktokNotificationId, tiktokSessionId, tiktokShopImId } from "../ids";
import { deliverPush, type PendingPush } from "../push";
import type { TiktokShop } from "./core";

export type Thread = typeof mockBuyerThread.$inferSelect;
export type Msg = typeof mockMessage.$inferSelect;
export type Order = typeof mockOrder.$inferSelect;
export type AfterSale = typeof mockAfterSale.$inferSelect;

/** 店铺按事件类型登记了 webhook 地址才发。 */
export function tiktokWebhook(shop: TiktokShop, type: number, data: Record<string, unknown>, summary: string): PendingPush | null {
  if (shop.authStatus !== "authorized" && type !== 6) return null;
  const hook = shop.webhooks[TIKTOK_EVENT_TYPES[type]];
  if (!hook) return null;
  const body = { type, tts_notification_id: tiktokNotificationId(), shop_id: shop.shopId, timestamp: nowSec(), data };
  return () => deliverPush({ platform: "tiktok", appKey: shop.appKey, shopId: shop.shopId, event: type, url: hook.address, body, summary });
}

const ROLE: Record<string, string> = { buyer: "BUYER", seller: "CUSTOMER_SERVICE", system: "SYSTEM", robot: "ROBOT" };

export function messageIndex(seq: number): string {
  return String(BigInt("7494560000000000000") + BigInt(seq));
}

function sender(m: Msg, t: Thread, shop: TiktokShop) {
  return m.sender === "buyer"
    ? { im_user_id: t.buyerImId, role: "BUYER", nickname: t.buyerName, avatar: t.buyerAvatar ?? "" }
    : { im_user_id: tiktokShopImId(shop.shopId), role: ROLE[m.sender], nickname: shop.name, avatar: "" };
}

export function messagePlaintext(m: Msg): string {
  const c = m.content as Record<string, unknown>;
  return m.type === "TEXT" || m.type === "NOTIFICATION" ? String(c.content ?? "") : "";
}

export function tiktokMessageFields(m: Msg, t: Thread, shop: TiktokShop, opts: { plaintext?: boolean } = {}): Record<string, unknown> {
  return {
    id: m.messageId,
    type: m.type,
    content: JSON.stringify(m.content),
    create_time: toSec(m.createdAt),
    is_visible: m.isVisible,
    sender: sender(m, t, shop),
    index: messageIndex(m.seq),
    ...(opts.plaintext ? { plaintext: messagePlaintext(m) } : {}),
  };
}

export function tiktokConversationFields(t: Thread, shop: TiktokShop, latest: Msg | null, opts: { session?: boolean }): Record<string, unknown> {
  return {
    id: t.conversationId,
    participant_count: 2,
    can_send_message: t.canSend,
    unread_count: t.unreadCount,
    create_time: toSec(t.createdAt),
    participants: [
      { im_user_id: t.buyerImId, avatar: t.buyerAvatar ?? "", user_id: t.buyerId, role: "BUYER", nickname: t.buyerName, buyer_platform: "TIKTOK_SHOP" },
      { im_user_id: tiktokShopImId(shop.shopId), avatar: "", user_id: shop.shopId, role: "SHOP", nickname: shop.name },
    ],
    latest_message: latest ? tiktokMessageFields(latest, t, shop) : null,
    ...(opts.session && t.sessionId ? { cur_session_id: t.sessionId, cur_session: { id: t.sessionId, phase: t.sessionOpen ? "ASSIGNED" : "AUTO_REPLY" } } : {}),
  };
}

export async function latestMessage(conversationId: string): Promise<Msg | null> {
  const [m] = await mockDb().select().from(mockMessage).where(eq(mockMessage.conversationId, conversationId)).orderBy(desc(mockMessage.seq)).limit(1);
  return m ?? null;
}

/** 新增消息并发 webhook 14；买家在已结束的会话段后开口时先开新会话段并发 webhook 13。 */
export async function addTiktokMessage(shop: TiktokShop, t: Thread, from: "buyer" | "seller" | "system" | "robot", type: string, content: Record<string, unknown>): Promise<{ message: Msg; pushes: PendingPush[] }> {
  const now = new Date();
  const pushes: Array<PendingPush | null> = [];
  const newSession = from === "buyer" && (!t.sessionOpen || !t.sessionId);
  const [message] = await mockDb()
    .insert(mockMessage)
    .values({ messageId: tiktokMessageId(), conversationId: t.conversationId, platform: "tiktok", shopId: shop.shopId, sender: from, type, content, createdAt: now })
    .returning();
  const [thread] = await mockDb()
    .update(mockBuyerThread)
    .set({
      lastMessageAt: now,
      unreadCount: from === "buyer" ? t.unreadCount + 1 : 0,
      ...(newSession ? { sessionId: tiktokSessionId(), sessionOpen: true, started: true } : {}),
    })
    .where(eq(mockBuyerThread.conversationId, t.conversationId))
    .returning();
  if (newSession) pushes.push(tiktokWebhook(shop, 13, { conversation_id: thread.conversationId, create_time: toSec(now) }, `新会话段 ${thread.buyerName}`));
  const text = type === "TEXT" ? String(content.content ?? "") : `[${type}]`;
  pushes.push(
    tiktokWebhook(
      shop,
      14,
      {
        message_id: message.messageId,
        index: messageIndex(message.seq),
        conversation_id: thread.conversationId,
        type: message.type,
        content: JSON.stringify(message.content),
        create_time: toSec(message.createdAt),
        is_visible: message.isVisible,
        sender: { im_user_id: from === "buyer" ? thread.buyerImId : tiktokShopImId(shop.shopId), role: ROLE[from] },
      },
      `聊天 ${from === "buyer" ? "买家" : "卖家"}：${text}`,
    ),
  );
  return { message, pushes: pushes.filter((p): p is PendingPush => !!p) };
}

// ── 订单 ──

const COUNTRY: Record<string, string> = { MY: "Malaysia", TH: "Thailand", VN: "Vietnam", SG: "Singapore", PH: "Philippines" };

function money(v: number, currency: string): string {
  return currency === "VND" || currency === "IDR" ? String(Math.round(v)) : v.toFixed(2);
}

function maskName(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => {
      const c = Array.from(w);
      return c.length <= 1 ? `${c[0] ?? ""}*` : `${c[0]}${"*".repeat(Math.max(1, c.length - 2))}${c[c.length - 1]}`;
    })
    .join(" ");
}

function maskPhone(phone: string): string {
  return `(+${phone.slice(0, 2)})${phone.slice(2, 4)}*****${phone.slice(-2)}`;
}

function displayStatus(status: string): string {
  if (status === "ON_HOLD" || status === "PARTIALLY_SHIPPING") return "AWAITING_SHIPMENT";
  return status;
}

function packageStatus(status: string): string {
  switch (status) {
    case "AWAITING_COLLECTION":
      return "PROCESSING";
    case "IN_TRANSIT":
      return "FULFILLING";
    case "DELIVERED":
    case "COMPLETED":
      return "COMPLETED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "TO_FULFILL";
  }
}

export function tiktokOrderFields(o: Order, shop: TiktokShop, hasPendingCancel: boolean): Record<string, unknown> {
  const sub = o.items.reduce((s, i) => s + Number(i.price) * i.qty, 0);
  const orig = o.items.reduce((s, i) => s + Number(i.originalPrice) * i.qty, 0);
  const fee = Number(o.shippingFee);
  const cur = o.currency;
  const rc = o.recipient;
  const providerId = o.carrier ? "6617675021119438849" : "";
  const lineItems = o.items.flatMap((i) =>
    i.lineItemIds.map((lid) => ({
      id: lid,
      sku_id: i.skuId,
      product_id: i.itemId,
      product_name: i.name,
      sku_name: i.skuName,
      sku_image: "",
      seller_sku: "",
      sale_price: money(Number(i.price), cur),
      original_price: money(Number(i.originalPrice), cur),
      platform_discount: "0",
      seller_discount: money(Number(i.originalPrice) - Number(i.price), cur),
      currency: cur,
      display_status: displayStatus(o.status),
      package_status: packageStatus(o.status),
      package_id: o.packageNumber ?? "",
      tracking_number: o.trackingNumber ?? "",
      shipping_provider_name: o.carrier ?? "",
      shipping_provider_id: providerId,
      cancel_reason: o.status === "CANCELLED" ? o.cancelReason ?? "" : "",
      cancel_user: o.status === "CANCELLED" ? (o.cancelBy ?? "").toUpperCase() : "",
      rts_time: o.times.rts ?? 0,
      is_gift: false,
    })),
  );
  const r: Record<string, unknown> = {
    id: o.orderId,
    status: o.status,
    user_id: o.buyerId,
    buyer_email: `${o.buyerId.slice(-6)}@chat.seller.tiktok.com`,
    buyer_message: o.buyerMessage,
    seller_note: "",
    order_type: "NORMAL",
    commerce_platform: "TIKTOK_SHOP",
    is_cod: false,
    is_on_hold_order: o.status === "ON_HOLD",
    is_sample_order: false,
    is_replacement_order: false,
    is_buyer_request_cancel: hasPendingCancel,
    create_time: toSec(o.createTime),
    update_time: toSec(o.updateTime),
    paid_time: o.times.paid ?? 0,
    rts_time: o.times.rts ?? 0,
    collection_time: o.times.collection ?? 0,
    delivery_time: o.times.delivery ?? 0,
    cancel_time: o.times.cancel ?? 0,
    request_cancel_time: o.times.request_cancel ?? 0,
    rts_sla_time: o.deadlines.rts_sla_time ?? 0,
    tts_sla_time: o.deadlines.tts_sla_time ?? 0,
    shipping_due_time: o.deadlines.shipping_due_time ?? 0,
    collection_due_time: o.deadlines.collection_due_time ?? 0,
    delivery_due_time: o.deadlines.delivery_due_time ?? 0,
    delivery_sla_time: o.deadlines.delivery_sla_time ?? 0,
    cancel_order_sla_time: o.deadlines.cancel_order_sla_time ?? 0,
    cancel_reason: o.status === "CANCELLED" ? o.cancelReason ?? "" : "",
    cancellation_initiator: o.status === "CANCELLED" ? (o.cancelBy ?? "").toUpperCase() : "",
    tracking_number: o.trackingNumber ?? "",
    shipping_provider: o.carrier ?? "",
    shipping_provider_id: providerId,
    shipping_type: "TIKTOK",
    delivery_type: "HOME_DELIVERY",
    delivery_option_name: "Standard shipping",
    fulfillment_type: "FULFILLMENT_BY_SELLER",
    split_or_combine_tag: "",
    has_updated_recipient_address: false,
    warehouse_id: `${shop.shopId}0001`,
    packages: o.packageNumber ? [{ id: o.packageNumber }] : [],
    payment_method_name: o.paymentMethod,
    payment: {
      currency: cur,
      sub_total: money(sub, cur),
      shipping_fee: money(fee, cur),
      seller_discount: money(orig - sub, cur),
      platform_discount: "0",
      total_amount: money(Number(o.totalAmount), cur),
      original_total_product_price: money(orig, cur),
      original_shipping_fee: money(fee, cur),
      shipping_fee_seller_discount: "0",
      shipping_fee_platform_discount: "0",
      tax: "0",
      product_tax: "0",
      shipping_fee_tax: "0",
    },
    line_items: lineItems,
  };
  if (o.status !== "UNPAID" && o.status !== "ON_HOLD") {
    r.recipient_address = {
      name: maskName(rc.name),
      phone_number: maskPhone(rc.phone),
      full_address: `${rc.fullAddress}, ${rc.city}, ${rc.zipcode}`,
      address_detail: rc.fullAddress,
      address_line1: rc.fullAddress,
      address_line2: "",
      postal_code: rc.zipcode,
      region_code: shop.region,
      district_info: [
        { address_level_name: "Country", address_name: COUNTRY[shop.region] ?? shop.region, address_level: "L0", iso_code: shop.region },
        { address_level_name: "City", address_name: rc.city, address_level: "L2", iso_code: "" },
      ],
    };
  }
  return r;
}

/** TikTok webhook 1 的 order_status 取值里取消写作 CANCEL（webhooks.md 原文）。 */
function webhookOrderStatus(status: string): string {
  return status === "CANCELLED" ? "CANCEL" : status;
}

export async function updateTiktokOrder(shop: TiktokShop, before: Order, patch: Partial<Order>): Promise<{ order: Order; pushes: PendingPush[] }> {
  const [order] = await mockDb().update(mockOrder).set({ ...patch, updateTime: new Date() }).where(eq(mockOrder.orderId, before.orderId)).returning();
  const pushes: PendingPush[] = [];
  if (order.status !== before.status) {
    const p = tiktokWebhook(shop, 1, { order_id: order.orderId, order_status: webhookOrderStatus(order.status), is_on_hold_order: order.status === "ON_HOLD", update_time: toSec(order.updateTime) }, `订单 ${order.orderId} → ${order.status}`);
    if (p) pushes.push(p);
  }
  return { order, pushes };
}

// ── 售后 ──

function refundAmount(rs: AfterSale): Record<string, string> {
  const cur = rs.currency;
  const v = money(Number(rs.refundAmount), cur);
  return { currency: cur, refund_total: v, refund_subtotal: v, refund_shipping_fee: "0", refund_tax: "0", retail_delivery_fee: "0", buyer_service_fee: "0" };
}

function lines(rs: AfterSale, prefix: "return" | "cancel") {
  return rs.items.flatMap((i, n) =>
    i.lineItemIds.slice(0, i.qty).map((lid, k) => ({
      [`${prefix}_line_item_id`]: `${rs.id.slice(0, 12)}${String(n * 10 + k).padStart(7, "0")}`,
      order_line_item_id: lid,
      sku_id: i.skuId,
      sku_name: i.skuName,
      product_name: i.name,
      seller_sku: "",
      product_image: { url: "", width: 200, height: 200 },
      refund_amount: { currency: rs.currency, refund_total: money(Number(i.price), rs.currency), refund_subtotal: money(Number(i.price), rs.currency), refund_shipping_fee: "0", refund_tax: "0" },
      [`${prefix}_sub_line_items`]: [],
    })),
  );
}

export function tiktokReturnFields(rs: AfterSale): Record<string, unknown> {
  return {
    return_id: rs.id,
    order_id: rs.orderId,
    return_type: rs.subtype,
    return_status: rs.status,
    arbitration_status: rs.arbitrationStatus ?? "",
    role: rs.role,
    return_reason: rs.reason,
    return_reason_text: rs.reasonText,
    create_time: toSec(rs.createTime),
    update_time: toSec(rs.updateTime),
    seller_next_action_response: rs.nextActions,
    shipment_type: "PLATFORM",
    handover_method: "DROP_OFF",
    return_method: "PLATFORM_SHIPPED",
    return_tracking_number: rs.returnTrackingNumber ?? "",
    return_provider_name: rs.returnCarrier ?? "",
    return_provider_id: rs.returnCarrier ? "6617675021119438849" : "",
    can_buyer_keep_item: Boolean((rs.extra as Record<string, unknown>).buyer_keep_item),
    is_combined_return: false,
    combined_return_id: "",
    is_quick_refund: false,
    refund_amount: refundAmount(rs),
    discount_amount: [],
    shipping_fee_amount: [],
    return_line_items: lines(rs, "return"),
  };
}

export function tiktokCancelFields(rs: AfterSale): Record<string, unknown> {
  return {
    cancel_id: rs.id,
    order_id: rs.orderId,
    cancel_type: rs.subtype,
    cancel_status: rs.status,
    role: rs.role,
    cancel_reason: rs.reason,
    cancel_reason_text: rs.reasonText,
    create_time: toSec(rs.createTime),
    update_time: toSec(rs.updateTime),
    seller_next_action_response: rs.nextActions,
    refund_amount: refundAmount(rs),
    cancel_line_items: lines(rs, "cancel"),
    should_replenish_stock: false,
  };
}

function afterSalePush(shop: TiktokShop, rs: AfterSale): PendingPush | null {
  if (rs.kind === "cancel") {
    return tiktokWebhook(shop, 11, { order_id: rs.orderId, cancellations_role: rs.role, cancel_status: rs.status, cancel_id: rs.id, create_time: toSec(rs.createTime) }, `取消 ${rs.id} → ${rs.status}`);
  }
  return tiktokWebhook(
    shop,
    12,
    { order_id: rs.orderId, return_role: rs.role, return_type: rs.subtype, return_status: rs.status, return_id: rs.id, create_time: toSec(rs.createTime), update_time: toSec(rs.updateTime) },
    `退货 ${rs.id} → ${rs.status}`,
  );
}

export async function insertTiktokAfterSale(shop: TiktokShop, values: typeof mockAfterSale.$inferInsert): Promise<{ rs: AfterSale; pushes: PendingPush[] }> {
  const [rs] = await mockDb().insert(mockAfterSale).values(values).returning();
  const p = afterSalePush(shop, rs);
  return { rs, pushes: p ? [p] : [] };
}

export async function updateTiktokAfterSale(shop: TiktokShop, before: AfterSale, patch: Partial<AfterSale>): Promise<{ rs: AfterSale; pushes: PendingPush[] }> {
  const [rs] = await mockDb().update(mockAfterSale).set({ ...patch, updateTime: new Date() }).where(eq(mockAfterSale.id, before.id)).returning();
  const p = rs.status !== before.status || rs.arbitrationStatus !== before.arbitrationStatus ? afterSalePush(shop, rs) : null;
  return { rs, pushes: p ? [p] : [] };
}

/** 平台打款：退款申请到 SUCCESS 后平台完成退款，转 COMPLETE（模拟器里紧跟着发生，两次推送） */
export async function completeRefund(shop: TiktokShop, rs: AfterSale): Promise<PendingPush[]> {
  if (rs.status !== "RETURN_OR_REFUND_REQUEST_SUCCESS") return [];
  const b = await updateTiktokAfterSale(shop, rs, { status: "RETURN_OR_REFUND_REQUEST_COMPLETE", records: [...rs.records, record("REFUND_SUCCESS", "Refund completed", "SYSTEM")] });
  return b.pushes;
}

export function record(event: string, description: string, role: string, extra: { note?: string; reason_text?: string } = {}) {
  return { event, description, role, create_time: nowSec(), ...extra };
}
