// Shopee 数据变更与推送：消息、订单、退货。平台接口与模拟器共用。
import { and, desc, eq } from "drizzle-orm";
import { mockDb } from "../db/client";
import { mockAfterSale, mockApp, mockBuyerThread, mockMessage, mockOrder, mockShop } from "../db/schema";
import { newRequestId, nowSec, toSec } from "../http";
import { shopeeMessageId } from "../ids";
import { mockAvatarUrl, mockProductImageUrl } from "../images";
import { shopeeLogisticsStatus } from "../orders";
import { deliverPush, type PendingPush } from "../push";
import { shopUserId, shopUsername, type ShopeeApp, type ShopeeShop } from "./core";

export type Thread = typeof mockBuyerThread.$inferSelect;
export type Msg = typeof mockMessage.$inferSelect;
export type Order = typeof mockOrder.$inferSelect;
export type AfterSale = typeof mockAfterSale.$inferSelect;

export async function loadShopeeApp(appKey: string): Promise<ShopeeApp | null> {
  const [app] = await mockDb().select().from(mockApp).where(and(eq(mockApp.platform, "shopee"), eq(mockApp.appKey, appKey))).limit(1);
  return app ?? null;
}

export async function loadShopeeShop(shopId: string): Promise<ShopeeShop | null> {
  const [shop] = await mockDb().select().from(mockShop).where(and(eq(mockShop.platform, "shopee"), eq(mockShop.shopId, shopId))).limit(1);
  return shop ?? null;
}

/** 按应用推送配置决定是否发：回调已配置、code 已订阅、店铺未屏蔽。 */
export function shopeePush(app: ShopeeApp, shopId: string | null, code: number, data: Record<string, unknown>, summary: string, top: Record<string, unknown> = {}): PendingPush | null {
  if (!app.callbackUrl || !app.pushCodes.includes(code)) return null;
  const blocked = (app.pushConfig.blocked_shop_id as number[] | undefined) ?? [];
  if (shopId && blocked.includes(Number(shopId))) return null;
  const body: Record<string, unknown> = { code, ...(shopId ? { shop_id: Number(shopId) } : {}), timestamp: nowSec(), data, ...top };
  const url = app.callbackUrl;
  return () => deliverPush({ platform: "shopee", appKey: app.appKey, shopId, event: code, url, body, summary });
}

/** 消息字段：推送 code 10 的 data.content 与 get_message 的行同名同结构。 */
export function shopeeMessageFields(m: Msg, t: Thread, shop: ShopeeShop): Record<string, unknown> {
  const fromBuyer = m.sender === "buyer";
  const shopUser = shopUserId(shop.shopId);
  return {
    message_id: m.messageId,
    conversation_id: m.conversationId,
    shop_id: Number(shop.shopId),
    request_id: newRequestId(),
    from_id: fromBuyer ? Number(t.buyerId) : shopUser,
    to_id: fromBuyer ? shopUser : Number(t.buyerId),
    from_user_name: fromBuyer ? t.buyerName : shopUsername(shop.name),
    to_user_name: fromBuyer ? shopUsername(shop.name) : t.buyerName,
    from_shop_id: fromBuyer ? 0 : Number(shop.shopId),
    to_shop_id: fromBuyer ? Number(shop.shopId) : 0,
    message_type: m.type,
    content: m.content,
    source_content: m.sourceContent ?? {},
    created_timestamp: toSec(m.createdAt),
    region: shop.region,
    status: "normal",
    message_option: 0,
    is_in_chatbot_session: false,
    sub_account_id: 0,
    sub_account_name: "",
    quoted_msg: [],
    business_type: 0,
  };
}

function preview(m: Msg | null): Record<string, unknown> {
  if (!m) return {};
  if (m.type === "text") return { text: (m.content as { text?: string }).text ?? "" };
  return m.content;
}

/** 会话字段（get_conversation_list / get_one_conversation） */
export function shopeeConversationFields(t: Thread, shop: ShopeeShop, latest: Msg | null): Record<string, unknown> {
  return {
    conversation_id: t.conversationId,
    to_id: Number(t.buyerId),
    to_name: t.buyerName,
    to_avatar: t.buyerAvatar || mockAvatarUrl(t.buyerId),
    shop_id: Number(shop.shopId),
    unread_count: t.unreadCount,
    pinned: false,
    mute: false,
    last_read_message_id: "",
    latest_message_id: latest?.messageId ?? "",
    latest_message_type: latest?.type ?? "",
    latest_message_content: preview(latest),
    latest_message_from_id: latest ? (latest.sender === "buyer" ? Number(t.buyerId) : shopUserId(shop.shopId)) : 0,
    last_message_timestamp: t.lastMessageAt.getTime() * 1_000_000,
    last_message_option: 0,
    max_general_option_hide_time: "9223372036854775807",
  };
}

export async function latestMessage(conversationId: string): Promise<Msg | null> {
  const [m] = await mockDb().select().from(mockMessage).where(eq(mockMessage.conversationId, conversationId)).orderBy(desc(mockMessage.seq)).limit(1);
  return m ?? null;
}

/** 新增一条消息并推送 code 10（买家消息与卖家经接口发出的消息都推送，后者 from_shop_id = 本店）。 */
export async function addShopeeMessage(
  shop: ShopeeShop,
  t: Thread,
  sender: "buyer" | "seller",
  type: string,
  content: Record<string, unknown>,
  sourceContent: Record<string, unknown> | null = null,
): Promise<{ message: Msg; pushes: PendingPush[] }> {
  const now = new Date();
  const [message] = await mockDb()
    .insert(mockMessage)
    .values({ messageId: shopeeMessageId(), conversationId: t.conversationId, platform: "shopee", shopId: shop.shopId, sender, type, content, sourceContent, createdAt: now })
    .returning();
  const [thread] = await mockDb()
    .update(mockBuyerThread)
    .set({ lastMessageAt: now, unreadCount: sender === "buyer" ? t.unreadCount + 1 : 0, ...(sender === "buyer" ? { started: true } : {}) })
    .where(eq(mockBuyerThread.conversationId, t.conversationId))
    .returning();
  const app = await loadShopeeApp(shop.appKey);
  const pushes: PendingPush[] = [];
  if (app && shop.authStatus === "authorized" && shop.capabilities.chat) {
    const text = type === "text" ? String((content as { text?: string }).text ?? "") : `[${type}]`;
    const fields = shopeeMessageFields(message, thread, shop);
    // 推送里的买家文字带 Shopee 机翻（push.md「content.translation」）；模拟器不真翻译，只标出这是平台译文
    if (sender === "buyer" && type === "text") {
      fields.content = { ...(fields.content as Record<string, unknown>), translation: { text: `[Shopee 机翻] ${text}`, source: "shopee_mt", source_language: "auto", target_language: "zh-Hans" } };
    }
    const p = shopeePush(app, shop.shopId, 10, { type: "message", region: shop.region, content: fields }, `聊天 ${sender === "buyer" ? "买家" : "卖家"}：${text}`);
    if (p) pushes.push(p);
  }
  return { message, pushes };
}

/**
 * 卖家在 Shopee 卖家中心回复：消息进会话（get_message 读得到），但不推送 code 10 消息——真实 Shopee 不推送卖家侧消息。
 * auto = 店铺自动回复：发送时刻取该会话最近一条买家消息的时刻（线上实测自动回复与买家消息同一秒）。
 */
export async function addShopeeBackendMessage(shop: ShopeeShop, t: Thread, text: string, auto: boolean): Promise<Msg> {
  let createdAt = new Date();
  if (auto) {
    const [b] = await mockDb()
      .select({ createdAt: mockMessage.createdAt })
      .from(mockMessage)
      .where(and(eq(mockMessage.conversationId, t.conversationId), eq(mockMessage.sender, "buyer")))
      .orderBy(desc(mockMessage.seq))
      .limit(1);
    if (b) createdAt = b.createdAt;
  }
  const [message] = await mockDb()
    .insert(mockMessage)
    .values({ messageId: shopeeMessageId(), conversationId: t.conversationId, platform: "shopee", shopId: shop.shopId, sender: "seller", type: "text", content: { text }, createdAt })
    .returning();
  await mockDb().update(mockBuyerThread).set({ lastMessageAt: new Date(), unreadCount: 0 }).where(eq(mockBuyerThread.conversationId, t.conversationId));
  return message;
}

/** 推送 code 10 的会话通知 mark_as_replied（会话从「未回复」变为「已回复」时），字段按线上实收的推送 */
export async function shopeeMarkAsRepliedPush(shop: ShopeeShop, t: Thread): Promise<PendingPush | null> {
  const app = await loadShopeeApp(shop.appKey);
  if (!app || shop.authStatus !== "authorized" || !shop.capabilities.chat) return null;
  const content = {
    type: "mark_as_replied",
    msg_id: 0,
    content: { conversation_id: t.conversationId, conversation_tag: "", conversation_filter_type: "unreplied", unreplied_sub_filter_type: "" },
    from_id: 0,
    user_id: shopUserId(shop.shopId),
    timestamp: nowSec(),
    business_type: 0,
    conversation_id: t.conversationId,
  };
  return shopeePush(app, shop.shopId, 10, { type: "notification", region: shop.region, content }, "会话通知：mark_as_replied", { msg_id: newRequestId() });
}

/** 订单详情（get_order_detail）。默认字段 + response_optional_fields 请求的字段。 */
export function shopeeOrderDetail(o: Order, shop: ShopeeShop, optional: Set<string>): Record<string, unknown> {
  const r: Record<string, unknown> = {
    order_sn: o.orderId,
    region: shop.region,
    currency: o.currency,
    cod: false,
    order_status: o.status,
    message_to_seller: o.buyerMessage,
    create_time: toSec(o.createTime),
    update_time: toSec(o.updateTime),
    days_to_ship: o.deadlines.days_to_ship ?? 2,
    ship_by_date: o.deadlines.ship_by_date ?? 0,
    booking_sn: "",
  };
  const want = (f: string) => optional.has(f);
  if (want("buyer_user_id")) r.buyer_user_id = Number(o.buyerId);
  if (want("buyer_username")) r.buyer_username = o.buyerName;
  if (want("total_amount")) r.total_amount = Number(o.totalAmount);
  if (want("pay_time")) r.pay_time = o.times.paid ?? 0;
  if (want("shipping_carrier")) r.shipping_carrier = o.carrier ?? "";
  if (want("payment_method")) r.payment_method = o.paymentMethod;
  if (want("estimated_shipping_fee")) r.estimated_shipping_fee = Number(o.shippingFee);
  if (want("actual_shipping_fee")) r.actual_shipping_fee = Number(o.shippingFee);
  if (want("actual_shipping_fee_confirmed")) r.actual_shipping_fee_confirmed = !!o.times.collection;
  if (want("note")) r.note = "";
  if (want("note_update_time")) r.note_update_time = 0;
  if (want("pickup_done_time")) r.pickup_done_time = o.times.collection ?? 0;
  if (want("split_up")) r.split_up = false;
  if (want("buyer_cancel_reason")) r.buyer_cancel_reason = o.buyerCancelReason ?? "";
  if (want("cancel_by")) r.cancel_by = o.cancelBy ?? "";
  if (want("cancel_reason")) r.cancel_reason = o.cancelReason ?? "";
  if (want("fulfillment_flag")) r.fulfillment_flag = "fulfilled_by_cb_seller";
  if (want("goods_to_declare")) r.goods_to_declare = false;
  if (want("dropshipper")) r.dropshipper = "";
  if (want("dropshipper_phone")) r.dropshipper_phone = "";
  if (want("return_request_due_date")) r.return_request_due_date = o.times.delivery ? o.times.delivery + 15 * 86400 : 0;
  if (want("recipient_address")) {
    const rc = o.recipient;
    r.recipient_address = {
      name: maskName(rc.name),
      phone: `******${rc.phone.slice(-2)}`,
      town: "",
      district: "",
      city: rc.city,
      state: rc.region,
      region: shop.region,
      zipcode: rc.zipcode,
      full_address: `${rc.fullAddress.slice(0, 2)}******`,
    };
  }
  if (want("item_list")) {
    r.item_list = o.items.map((i) => ({
      item_id: Number(i.itemId),
      item_name: i.name,
      item_sku: "",
      model_id: Number(i.skuId),
      model_name: i.skuName,
      model_sku: "",
      model_quantity_purchased: i.qty,
      model_original_price: Number(i.originalPrice),
      model_discounted_price: Number(i.price),
      wholesale: false,
      weight: 0.5,
      add_on_deal: false,
      main_item: false,
      add_on_deal_id: 0,
      promotion_type: "",
      promotion_id: 0,
      order_item_id: Number(i.itemId),
      promotion_group_id: 0,
      image_info: { image_url: mockProductImageUrl(i.itemId) },
      product_location_id: [],
      is_b2c_owned_item: false,
    }));
  }
  if (want("package_list")) {
    r.package_list = o.packageNumber
      ? [{
          package_number: o.packageNumber,
          logistics_status: shopeeLogisticsStatus(o.status, o.logisticsStatus, o.prevStatus),
          logistics_channel_id: 28016,
          shipping_carrier: o.carrier ?? "",
          allow_self_design_awb: false,
          item_list: o.items.map((i) => ({ item_id: Number(i.itemId), model_id: Number(i.skuId), model_quantity: i.qty, order_item_id: Number(i.itemId), promotion_group_id: 0, product_location_id: "" })),
          parcel_chargeable_weight_gram: 500,
          group_shipment_id: 0,
        }]
      : [];
  }
  return r;
}

export function maskName(name: string): string {
  const chars = Array.from(name);
  if (chars.length <= 2) return `${chars[0] ?? ""}*`;
  return `${chars[0]}****${chars[chars.length - 1]}`;
}

/** 写回订单并按变化推送：状态变 → code 3；新出运单号 → code 4；包裹履约状态变 → code 30。 */
export async function updateShopeeOrder(shop: ShopeeShop, before: Order, patch: Partial<Order>, fulfillmentStatus?: string): Promise<{ order: Order; pushes: PendingPush[] }> {
  const [order] = await mockDb().update(mockOrder).set({ ...patch, updateTime: new Date() }).where(eq(mockOrder.orderId, before.orderId)).returning();
  const app = await loadShopeeApp(shop.appKey);
  const pushes: PendingPush[] = [];
  if (!app || shop.authStatus !== "authorized") return { order, pushes };
  if (order.status !== before.status) {
    pushes.push(
      shopeePush(app, shop.shopId, 3, { items: [], ordersn: order.orderId, status: order.status, completed_scenario: "", update_time: toSec(order.updateTime) }, `订单 ${order.orderId} → ${order.status}`)!,
    );
  }
  if (order.trackingNumber && order.trackingNumber !== before.trackingNumber) {
    pushes.push(
      shopeePush(app, shop.shopId, 4, { ordersn: order.orderId, forder_id: `${order.packageNumber ?? ""}`.replace(/\D/g, "").slice(0, 19), package_number: order.packageNumber ?? "", tracking_no: order.trackingNumber }, `运单号 ${order.trackingNumber}`)!,
    );
  }
  const fs = fulfillmentStatus ?? (order.status !== before.status ? fulfillmentFor(order.status) : null);
  if (fs && order.packageNumber) {
    pushes.push(shopeePush(app, shop.shopId, 30, { ordersn: order.orderId, package_number: order.packageNumber, fulfillment_status: fs, update_time: toSec(order.updateTime) }, `包裹 ${order.packageNumber} ${fs}`)!);
  }
  return { order, pushes: pushes.filter(Boolean) };
}

function fulfillmentFor(status: string): string | null {
  switch (status) {
    case "PROCESSED":
      return "LOGISTICS_REQUEST_CREATED";
    case "SHIPPED":
      return "LOGISTICS_PICKUP_DONE";
    case "TO_CONFIRM_RECEIVE":
      return "LOGISTICS_DELIVERY_DONE";
    case "RETRY_SHIP":
      return "LOGISTICS_PICKUP_RETRY";
    case "CANCELLED":
      return "LOGISTICS_REQUEST_CANCELED";
    default:
      return null;
  }
}

/** 退货单字段（get_return_list 的一行；detail 为 true 时按 get_return_detail 结构补齐嵌套对象）。 */
export function shopeeReturnFields(rs: AfterSale, shop: ShopeeShop, buyerName: string, detail: boolean): Record<string, unknown> {
  const ex = rs.extra as Record<string, unknown>;
  const proof = (ex.seller_proof as { seller_proof_status: string; seller_evidence_deadline: number } | undefined) ?? { seller_proof_status: "NOT_NEEDED", seller_evidence_deadline: 0 };
  const negotiationStatus = (ex.negotiation_status as string | undefined) ?? "TERMINATED";
  const r: Record<string, unknown> = {
    image: (ex.images as string[] | undefined) ?? [],
    reason: rs.reason,
    text_reason: rs.reasonText,
    return_sn: rs.id,
    refund_amount: Number(rs.refundAmount),
    currency: rs.currency,
    create_time: toSec(rs.createTime),
    update_time: toSec(rs.updateTime),
    status: rs.status,
    due_date: rs.deadlines.due_date ?? 0,
    tracking_number: rs.returnTrackingNumber ?? "",
    dispute_reason: (ex.dispute_reason as number[] | undefined) ?? [],
    dispute_text_reason: (ex.dispute_text_reason as string[] | undefined) ?? [],
    needs_logistics: rs.subtype === "0",
    amount_before_discount: Number(rs.refundAmount),
    user: { username: buyerName, email: "", portrait: "" },
    item: rs.items.map((i) => ({
      model_id: Number(i.skuId),
      name: i.name,
      images: [],
      amount: i.qty,
      item_price: Number(i.price),
      is_add_on_deal: false,
      is_main_item: false,
      add_on_deal_id: 0,
      item_id: Number(i.itemId),
      item_sku: "",
      variation_sku: i.skuName,
      ...(detail ? { refund_amount: Number(i.price) * i.qty } : {}),
    })),
    order_sn: rs.orderId,
    return_ship_due_date: rs.deadlines.return_ship_due_date ?? 0,
    return_seller_due_date: rs.deadlines.return_seller_due_date ?? 0,
    return_refund_type: "RRBOC",
    return_solution: Number(rs.subtype),
    return_refund_request_type: 0,
    validation_type: "seller_validation",
    is_seller_arrange: false,
    is_shipping_proof_mandatory: false,
    follow_up_action_list: [],
  };
  if (detail) {
    r.buyer_videos = [];
    r.activity = [];
    r.seller_proof = proof;
    r.seller_compensation = { seller_compensation_status: "COMPENSATION_NOT_APPLICABLE", seller_compensation_due_date: 0, compensation_amount: 0 };
    r.negotiation = { negotiation_status: negotiationStatus, latest_solution: rs.subtype === "0" ? "RETURN_REFUND" : "REFUND", latest_offer_amount: Number(rs.refundAmount), latest_offer_creator: buyerName, counter_limit: 0, offer_due_date: rs.deadlines.due_date ?? 0 };
    r.logistics_status = (ex.logistics_status as string | undefined) ?? "LOGISTICS_NOT_STARTED";
    r.return_pickup_address = { address: "", name: "", phone: "", town: "", district: "", city: "", state: "", region: shop.region, zipcode: "" };
    r.return_address = { whs_id: "" };
    r.has_uploaded_shipping_proof = !!rs.returnTrackingNumber;
  } else {
    r.negotiation_status = negotiationStatus;
    r.seller_proof_status = proof.seller_proof_status;
    r.seller_compensation_status = "COMPENSATION_NOT_APPLICABLE";
  }
  return r;
}

/** 写回退货单并推送 code 29（updated_values 列出变化的字段）。 */
export async function updateShopeeReturn(shop: ShopeeShop, before: AfterSale, patch: Partial<AfterSale>): Promise<{ rs: AfterSale; pushes: PendingPush[] }> {
  const [rs] = await mockDb().update(mockAfterSale).set({ ...patch, updateTime: new Date() }).where(eq(mockAfterSale.id, before.id)).returning();
  return { rs, pushes: returnPush(shop, before, rs) };
}

function returnPush(shop: ShopeeShop, before: AfterSale | null, rs: AfterSale): PendingPush[] {
  const t = toSec(rs.updateTime);
  const changes: Array<{ update_field: string; old_value: string; new_value: string; update_time: number }> = [];
  if (!before || before.status !== rs.status) changes.push({ update_field: "return_status", old_value: before?.status ?? "", new_value: rs.status, update_time: t });
  const oldLs = (before?.extra as Record<string, unknown> | undefined)?.logistics_status as string | undefined;
  const newLs = (rs.extra as Record<string, unknown>).logistics_status as string | undefined;
  if (newLs && oldLs !== newLs) changes.push({ update_field: "logistics_status", old_value: oldLs ?? "", new_value: newLs, update_time: t });
  const oldProof = ((before?.extra as Record<string, unknown> | undefined)?.seller_proof as { seller_proof_status?: string } | undefined)?.seller_proof_status;
  const newProof = ((rs.extra as Record<string, unknown>).seller_proof as { seller_proof_status?: string } | undefined)?.seller_proof_status;
  if (newProof && oldProof !== newProof) changes.push({ update_field: "seller_proof_status", old_value: oldProof ?? "", new_value: newProof, update_time: t });
  if (changes.length === 0) return [];
  const pending: PendingPush = async () => {
    const app = await loadShopeeApp(shop.appKey);
    if (!app || shop.authStatus !== "authorized") return null;
    const p = shopeePush(app, shop.shopId, 29, { order_sn: rs.orderId, return_sn: rs.id, updated_values: changes }, `退货 ${rs.id} → ${rs.status}`);
    return p ? p() : null;
  };
  return [pending];
}

export async function insertShopeeReturn(shop: ShopeeShop, values: typeof mockAfterSale.$inferInsert): Promise<{ rs: AfterSale; pushes: PendingPush[] }> {
  const [rs] = await mockDb().insert(mockAfterSale).values(values).returning();
  return { rs, pushes: returnPush(shop, null, rs) };
}
