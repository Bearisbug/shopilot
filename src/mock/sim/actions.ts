// 模拟器动作（API-MOCK-004）：扮演买家与平台改模拟数据，并按平台格式签名推送到已配置的回调。
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { mockDb } from "../db/client";
import { mockAfterSale, mockBuyerThread, mockOrder, mockShop, type MockOrderItem, type MockPlatform } from "../db/schema";
import {
  MOCK_BUYERS,
  MOCK_PRODUCTS,
  SHOPEE_RETURN_DUE_SEC,
  SHOPEE_RETURN_SHIP_DUE_SEC,
  TIKTOK_SELLER_RESPOND_SEC,
} from "../fixtures";
import { nowSec, toSec } from "../http";
import { digits, shopeeBuyerId, shopeeConversationId, shopeeReturnSn, shopeeTrackingNo, shopeeOrderSn, tiktokLineItemId, tiktokOrderId, tiktokReturnId, tiktokTrackingNo } from "../ids";
import { applyOrderStatus, logisticsException, nextStatus, orderTotals, SHOPEE_PRE_SHIP, TIKTOK_PRE_SHIP } from "../orders";
import { resendPush, runPushes, type PendingPush } from "../push";
import { shopeePush, addShopeeBackendMessage, addShopeeFaqTransfer, addShopeeMessage, insertShopeeReturn, loadShopeeApp, shopeeMarkAsRepliedPush, updateShopeeOrder, updateShopeeReturn } from "../shopee/ops";
import { addTiktokMessage, completeRefund, insertTiktokAfterSale, record, tiktokWebhook, updateTiktokAfterSale, updateTiktokOrder } from "../tiktok/ops";
import { fileUrl, samplePng, saveUpload } from "../uploads";
import type { SimActionResult } from "./types";

export class SimError extends Error {}

const platform = z.enum(["shopee", "tiktok"]);
const SHIPPING_FEE: Record<string, string> = { MYR: "4.90", SGD: "1.99", THB: "38.00", VND: "15000", PHP: "45.00" };

type Shop = typeof mockShop.$inferSelect;
type Thread = typeof mockBuyerThread.$inferSelect;
type Order = typeof mockOrder.$inferSelect;
type AfterSale = typeof mockAfterSale.$inferSelect;

async function getShop(p: MockPlatform, shopId: string): Promise<Shop> {
  const [s] = await mockDb().select().from(mockShop).where(and(eq(mockShop.platform, p), eq(mockShop.shopId, shopId))).limit(1);
  if (!s) throw new SimError(`找不到店铺 ${shopId}`);
  return s;
}

async function getThread(conversationId: string): Promise<{ thread: Thread; shop: Shop }> {
  const [t] = await mockDb().select().from(mockBuyerThread).where(eq(mockBuyerThread.conversationId, conversationId)).limit(1);
  if (!t) throw new SimError(`找不到会话 ${conversationId}`);
  return { thread: t, shop: await getShop(t.platform, t.shopId) };
}

async function getOrder(orderId: string): Promise<{ order: Order; shop: Shop }> {
  const [o] = await mockDb().select().from(mockOrder).where(eq(mockOrder.orderId, orderId)).limit(1);
  if (!o) throw new SimError(`找不到订单 ${orderId}`);
  return { order: o, shop: await getShop(o.platform, o.shopId) };
}

async function getAfterSale(id: string): Promise<{ rs: AfterSale; shop: Shop; order: Order }> {
  const [r] = await mockDb().select().from(mockAfterSale).where(eq(mockAfterSale.id, id)).limit(1);
  if (!r) throw new SimError(`找不到售后单 ${id}`);
  const { order, shop } = await getOrder(r.orderId);
  return { rs: r, shop, order };
}

function catalog(shop: Shop) {
  return MOCK_PRODUCTS[`${shop.platform}:${shop.shopId}`] ?? [];
}

async function done(message: string, pushes: Array<PendingPush | null | undefined>): Promise<SimActionResult> {
  const results = await runPushes(pushes);
  return { ok: true, message, pushes: results.filter((r): r is NonNullable<typeof r> => !!r) };
}

// ── 买家消息 ──

async function buyerSay(thread: Thread, shop: Shop, shopeeType: string, shopee: Record<string, unknown>, tiktokType: string, tiktok: Record<string, unknown>) {
  return shop.platform === "shopee" ? addShopeeMessage(shop, thread, "buyer", shopeeType, shopee) : addTiktokMessage(shop, thread, "buyer", tiktokType, tiktok);
}

const MessageInput = z.object({ conversationId: z.string().min(1), text: z.string().trim().min(1, "消息不能为空").max(2000) });

async function buyerMessage(input: unknown): Promise<SimActionResult> {
  const { conversationId, text } = MessageInput.parse(input);
  const { thread, shop } = await getThread(conversationId);
  const { pushes } = await buyerSay(thread, shop, "text", { text }, "TEXT", { content: text });
  return done("买家消息已发出", pushes);
}

async function buyerImage(input: { conversationId: string; file: { name: string; data: Buffer } | null; origin: string }): Promise<SimActionResult> {
  const { thread, shop } = await getThread(input.conversationId);
  const data = input.file?.data ?? samplePng(`buyer-${Date.now()}`, 640, 480);
  const stored = await saveUpload(shop.platform, shop.shopId, input.file?.name ?? "sample.png", data);
  if (!stored) throw new SimError("文件不是可识别的图片（支持 PNG、JPEG、GIF、WebP）");
  const url = fileUrl(input.origin, stored.id);
  const scale = Math.min(1, 300 / Math.max(stored.width, stored.height));
  const { pushes } = await buyerSay(
    thread,
    shop,
    "image",
    { url, thumb_url: url, thumb_width: Math.round(stored.width * scale), thumb_height: Math.round(stored.height * scale) },
    "IMAGE",
    { url, width: stored.width, height: stored.height },
  );
  return done("买家图片已发出", pushes);
}

const BackendReplyInput = z.object({ conversationId: z.string().min(1), text: z.string().trim().max(2000).optional(), auto: z.boolean().optional() });

/** Shopee 卖家在卖家中心回复：消息只进平台会话、不推送；随后推一条 mark_as_replied 通知。不带 text 时只推通知（如本方经接口回复后平台发的那条） */
async function sellerBackendReply(input: unknown): Promise<SimActionResult> {
  const { conversationId, text, auto } = BackendReplyInput.parse(input);
  const { thread, shop } = await getThread(conversationId);
  if (shop.platform !== "shopee") throw new SimError("只有 Shopee 会话有卖家后台回复");
  if (text) await addShopeeBackendMessage(shop, thread, text, auto ?? false);
  const what = !text ? "已推送 mark_as_replied" : auto ? "店铺自动回复已写入，已推送 mark_as_replied" : "卖家后台回复已写入，已推送 mark_as_replied";
  return done(what, [await shopeeMarkAsRepliedPush(shop, thread)]);
}

const FaqTransferInput = z.object({ conversationId: z.string().min(1), question: z.string().trim().max(2000).optional() });

/** Shopee 买家先问商店 AI 助手、再转人工：推送 faq_liveagent 与 bundle_message（常见问题记录） */
async function buyerFaqTransfer(input: unknown): Promise<SimActionResult> {
  const { conversationId, question } = FaqTransferInput.parse(input);
  const { thread, shop } = await getThread(conversationId);
  if (shop.platform !== "shopee") throw new SimError("只有 Shopee 有商店 AI 助手的常见问题记录");
  const { pushes } = await addShopeeFaqTransfer(shop, thread, question || "Does this webcam work with my Mac?");
  return done("买家问过商店 AI 助手后转人工，已推送 faq_liveagent 与常见问题记录", pushes);
}

const OrderCardInput = z.object({ conversationId: z.string(), orderId: z.string() });

async function buyerOrderCard(input: unknown): Promise<SimActionResult> {
  const { conversationId, orderId } = OrderCardInput.parse(input);
  const { thread, shop } = await getThread(conversationId);
  const { order } = await getOrder(orderId);
  if (order.shopId !== shop.shopId || order.buyerId !== thread.buyerId) throw new SimError("这张订单不属于该买家");
  const { pushes } = await buyerSay(thread, shop, "order", { shop_id: Number(shop.shopId), order_sn: order.orderId, order_status: order.status }, "ORDER_CARD", { order_id: order.orderId });
  return done("买家订单卡已发出", pushes);
}

const ProductCardInput = z.object({ conversationId: z.string(), itemId: z.string() });

async function buyerProductCard(input: unknown): Promise<SimActionResult> {
  const { conversationId, itemId } = ProductCardInput.parse(input);
  const { thread, shop } = await getThread(conversationId);
  if (!catalog(shop).some((p) => p.itemId === itemId)) throw new SimError("该商品不在本店目录里");
  const { pushes } = await buyerSay(thread, shop, "item", { shop_id: Number(shop.shopId), item_id: Number(itemId) }, "PRODUCT_CARD", { product_id: itemId });
  return done("买家商品卡已发出", pushes);
}

const CreateBuyerInput = z.object({ platform, shopId: z.string(), name: z.string().trim().min(1, "请填买家名字").max(60), language: z.string().trim().min(2).max(10) });

/** 新建买家：生成买家 ID 与会话；会话在买家发第一条消息后才出现在平台接口里。 */
async function createBuyer(input: unknown): Promise<SimActionResult & { conversationId?: string }> {
  const { platform: p, shopId, name, language } = CreateBuyerInput.parse(input);
  const shop = await getShop(p, shopId);
  const buyerId = p === "shopee" ? shopeeBuyerId() : `70214368104682${digits(5)}`;
  const conversationId = p === "shopee" ? shopeeConversationId() : `74945601097323${digits(5)}`;
  await mockDb().insert(mockBuyerThread).values({
    conversationId,
    platform: p,
    shopId: shop.shopId,
    buyerId,
    buyerImId: p === "shopee" ? buyerId : `74945601097323${digits(5)}`,
    buyerName: name,
    language,
    unreadCount: 0,
    sessionId: null,
    sessionOpen: false,
    started: false,
  });
  return { ok: true, message: `已新建买家 ${name}，发第一条消息后会话开始`, pushes: [], conversationId };
}

// ── 订单 ──

function recipientFor(thread: Thread, shop: Shop) {
  const fixture = MOCK_BUYERS.find((b) => b.conversationId === thread.conversationId);
  if (fixture) return { ...fixture.recipient, region: shop.region };
  const city: Record<string, string> = { MY: "Kuala Lumpur", SG: "Singapore", TH: "กรุงเทพมหานคร", VN: "TP. Hồ Chí Minh", PH: "Makati City" };
  const cc: Record<string, string> = { MY: "60", SG: "65", TH: "66", VN: "84", PH: "63" };
  return { name: thread.buyerName, phone: `${cc[shop.region] ?? "60"}${digits(9)}`, fullAddress: "18, Jalan Contoh 1, Taman Contoh", city: city[shop.region] ?? "", zipcode: "50000", region: shop.region };
}

const CreateOrderInput = z.object({
  conversationId: z.string(),
  items: z.array(z.object({ itemId: z.string(), qty: z.number().int().min(1).max(20) })).min(1, "至少选一件商品"),
  paid: z.boolean().default(true),
  buyerMessage: z.string().max(200).optional(),
});

async function createOrder(input: unknown): Promise<SimActionResult> {
  const { conversationId, items, paid, buyerMessage } = CreateOrderInput.parse(input);
  const { thread, shop } = await getThread(conversationId);
  const cat = catalog(shop);
  const lines: MockOrderItem[] = items.map(({ itemId, qty }) => {
    const p = cat.find((x) => x.itemId === itemId);
    if (!p) throw new SimError(`商品 ${itemId} 不在本店目录里`);
    return { itemId: p.itemId, skuId: p.skuId, name: p.name, skuName: p.skuName, qty, price: p.price, originalPrice: p.originalPrice, lineItemIds: shop.platform === "tiktok" ? Array.from({ length: qty }, () => tiktokLineItemId()) : [p.itemId] };
  });
  const fee = SHIPPING_FEE[shop.currency] ?? "0";
  const now = nowSec();
  const [order] = await mockDb()
    .insert(mockOrder)
    .values({
      orderId: shop.platform === "shopee" ? shopeeOrderSn() : tiktokOrderId(),
      platform: shop.platform,
      shopId: shop.shopId,
      buyerId: thread.buyerId,
      buyerName: thread.buyerName,
      status: "UNPAID",
      currency: shop.currency,
      totalAmount: orderTotals(lines, fee).total,
      shippingFee: fee,
      items: lines,
      recipient: recipientFor(thread, shop),
      buyerMessage: buyerMessage ?? "",
      paymentMethod: shop.platform === "shopee" ? "ShopeePay" : "Credit/Debit Card",
      deadlines: shop.platform === "tiktok" ? { cancel_order_sla_time: now + 86400 } : {},
    })
    .returning();
  const pushes: Array<PendingPush | null> = [];
  if (shop.platform === "shopee") {
    const app = await loadShopeeApp(shop.appKey);
    if (app && shop.authStatus === "authorized") pushes.push(shopeePush(app, shop.shopId, 3, { items: [], ordersn: order.orderId, status: "UNPAID", completed_scenario: "", update_time: now }, `订单 ${order.orderId} → UNPAID`));
  } else {
    pushes.push(tiktokWebhook(shop, 1, { order_id: order.orderId, order_status: "UNPAID", is_on_hold_order: false, update_time: now }, `订单 ${order.orderId} → UNPAID`));
  }
  if (paid) {
    const to = shop.platform === "shopee" ? "READY_TO_SHIP" : "AWAITING_SHIPMENT";
    const patch = applyOrderStatus(shop.platform, shop.region, order, to, now, now);
    const r = shop.platform === "shopee" ? await updateShopeeOrder(shop, order, { ...patch, payTime: new Date(now * 1000) }) : await updateTiktokOrder(shop, order, { ...patch, payTime: new Date(now * 1000) });
    pushes.push(...r.pushes);
  }
  return done(`已下单 ${order.orderId}`, pushes);
}

const AdvanceInput = z.object({ orderId: z.string(), to: z.string().optional(), logisticsException: z.boolean().optional() });

async function advanceOrder(input: unknown): Promise<SimActionResult> {
  const { orderId, to, logisticsException: exception } = AdvanceInput.parse(input);
  const { order, shop } = await getOrder(orderId);
  const now = nowSec();
  if (exception) {
    const ex = logisticsException(order, now);
    if (shop.platform === "shopee") {
      const r = await updateShopeeOrder(shop, order, { tracking: ex.tracking, logisticsStatus: ex.logisticsStatus }, ex.fulfillmentStatus);
      return done(`物流异常：${ex.fulfillmentStatus}`, r.pushes);
    }
    const r = await updateTiktokOrder(shop, order, { tracking: ex.tracking });
    return done("物流异常已写入轨迹（TikTok 无对应推送，Shopilot 靠轨迹扫描发现）", r.pushes);
  }
  const target = to ?? nextStatus(shop.platform, order.status);
  if (!target) throw new SimError(`订单状态 ${order.status} 没有下一步`);
  const allowed = target === nextStatus(shop.platform, order.status) || (shop.platform === "shopee" && target === "RETRY_SHIP" && order.status === "PROCESSED");
  if (!allowed) throw new SimError(`不能从 ${order.status} 推进到 ${target}`);
  const patch = applyOrderStatus(shop.platform, shop.region, order, target, now, toSec(order.createTime));
  const r = shop.platform === "shopee" ? await updateShopeeOrder(shop, order, patch) : await updateTiktokOrder(shop, order, patch);
  return done(`订单 ${order.orderId}：${order.status} → ${target}`, r.pushes);
}

const RequestCancelInput = z.object({ orderId: z.string(), reason: z.string().max(200).optional() });

async function requestCancel(input: unknown): Promise<SimActionResult> {
  const { orderId, reason } = RequestCancelInput.parse(input);
  const { order, shop } = await getOrder(orderId);
  const now = nowSec();
  if (shop.platform === "shopee") {
    if (!SHOPEE_PRE_SHIP.includes(order.status)) throw new SimError(`Shopee 订单 ${order.status} 状态不能申请取消（只限发货前）`);
    if (order.status === "UNPAID") {
      const r = await updateShopeeOrder(shop, order, { ...applyOrderStatus("shopee", shop.region, order, "CANCELLED", now, toSec(order.createTime)), cancelBy: "buyer", cancelReason: "Buyer Request to Cancel", buyerCancelReason: reason ?? "Don't Want to Buy Anymore" });
      return done("未付款订单由买家直接取消", r.pushes);
    }
    const r = await updateShopeeOrder(shop, order, { status: "IN_CANCEL", prevStatus: order.status, buyerCancelReason: reason ?? "Need to Change Delivery Address", times: { ...order.times, request_cancel: now } });
    return done("订单进入 IN_CANCEL，等待卖家处理", r.pushes);
  }
  if (!TIKTOK_PRE_SHIP.includes(order.status)) throw new SimError(`TikTok 订单 ${order.status} 状态不能申请取消（只限发货前）`);
  const open = await mockDb().select().from(mockAfterSale).where(and(eq(mockAfterSale.orderId, order.orderId), eq(mockAfterSale.kind, "cancel"), eq(mockAfterSale.status, "CANCELLATION_REQUEST_PENDING"))).limit(1);
  if (open.length) throw new SimError("这张订单已有待处理的取消申请");
  if (order.status === "UNPAID") {
    const r = await updateTiktokOrder(shop, order, { ...applyOrderStatus("tiktok", shop.region, order, "CANCELLED", now, toSec(order.createTime)), cancelBy: "buyer", cancelReason: reason ?? "No longer needed" });
    return done("未付款订单由买家直接取消", r.pushes);
  }
  const a = await insertTiktokAfterSale(shop, {
    id: tiktokReturnId(),
    platform: "tiktok",
    shopId: shop.shopId,
    orderId: order.orderId,
    kind: "cancel",
    status: "CANCELLATION_REQUEST_PENDING",
    subtype: "BUYER_CANCEL",
    reason: "ecom_order_to_ship_canceled_reason_created_by_mistakes",
    reasonText: reason ?? "Order created by mistake",
    currency: order.currency,
    refundAmount: order.totalAmount,
    items: order.items,
    role: "BUYER",
    nextActions: [{ action: "SELLER_RESPOND_CANCEL", deadline: now + TIKTOK_SELLER_RESPOND_SEC }],
    records: [record("ORDER_CANCEL", "Customer submitted a cancellation request", "BUYER", { reason_text: reason ?? "Order created by mistake" })],
  });
  const o = await updateTiktokOrder(shop, order, { times: { ...order.times, request_cancel: now } });
  return done("已提交取消申请，卖家 48 小时内处理", [...a.pushes, ...o.pushes]);
}

const RequestReturnInput = z.object({ orderId: z.string(), type: z.enum(["RETURN_AND_REFUND", "REFUND"]).default("RETURN_AND_REFUND"), reason: z.string().max(200).optional() });

async function requestReturn(input: unknown): Promise<SimActionResult> {
  const { orderId, type, reason } = RequestReturnInput.parse(input);
  const { order, shop } = await getOrder(orderId);
  const now = nowSec();
  const open = await mockDb().select().from(mockAfterSale).where(and(eq(mockAfterSale.orderId, order.orderId), eq(mockAfterSale.kind, "return"))).limit(5);
  const closed = shop.platform === "shopee" ? ["ACCEPTED", "CANCELLED", "CLOSED"] : ["REFUND_OR_RETURN_REQUEST_REJECT", "RETURN_OR_REFUND_REQUEST_CANCEL", "RETURN_OR_REFUND_REQUEST_COMPLETE", "RETURN_OR_REFUND_REQUEST_SUCCESS"];
  if (open.some((r) => !closed.includes(r.status))) throw new SimError("这张订单已有进行中的退货退款");
  const refund = orderTotals(order.items, "0").total;
  if (shop.platform === "shopee") {
    if (!["SHIPPED", "TO_CONFIRM_RECEIVE", "COMPLETED", "TO_RETURN"].includes(order.status)) throw new SimError(`Shopee 订单 ${order.status} 状态不能申请退货`);
    const a = await insertShopeeReturn(shop, {
      id: shopeeReturnSn(),
      platform: "shopee",
      shopId: shop.shopId,
      orderId: order.orderId,
      kind: "return",
      status: "REQUESTED",
      subtype: type === "REFUND" ? "1" : "0",
      reason: type === "REFUND" ? "NOT_RECEIPT" : "ITEM_DAMAGED",
      reasonText: reason ?? (type === "REFUND" ? "Parcel not received." : "Item arrived damaged."),
      currency: order.currency,
      refundAmount: refund,
      items: order.items,
      deadlines: { due_date: now + SHOPEE_RETURN_DUE_SEC },
      extra: { negotiation_status: "PENDING_RESPOND", seller_proof: { seller_proof_status: "NOT_NEEDED", seller_evidence_deadline: 0 }, logistics_status: "LOGISTICS_NOT_STARTED", images: [] },
    });
    const o = order.status === "TO_RETURN" ? { pushes: [] } : await updateShopeeOrder(shop, order, { status: "TO_RETURN" });
    return done(`退货申请 ${a.rs.id} 已提交（REQUESTED）`, [...a.pushes, ...o.pushes]);
  }
  const okStatus = type === "REFUND" ? ["IN_TRANSIT", "DELIVERED", "COMPLETED"] : ["DELIVERED", "COMPLETED"];
  if (!okStatus.includes(order.status)) throw new SimError(`TikTok 订单 ${order.status} 状态不能申请${type === "REFUND" ? "仅退款" : "退货退款"}`);
  const reasonCode = type === "REFUND" ? "ecom_order_delivered_refund_reason_missing_product" : "ecom_order_delivered_refund_and_return_reason_wrong_product";
  const reasonText = reason ?? (type === "REFUND" ? "Missing product" : "Wrong product was sent");
  const a = await insertTiktokAfterSale(shop, {
    id: tiktokReturnId(),
    platform: "tiktok",
    shopId: shop.shopId,
    orderId: order.orderId,
    kind: "return",
    status: "RETURN_OR_REFUND_REQUEST_PENDING",
    subtype: type,
    reason: reasonCode,
    reasonText,
    currency: order.currency,
    refundAmount: refund,
    items: order.items,
    role: "BUYER",
    nextActions: [{ action: type === "REFUND" ? "SELLER_RESPOND_REFUND" : "SELLER_RESPOND_RETURN", deadline: now + TIKTOK_SELLER_RESPOND_SEC }],
    records: [record("ORDER_RETURN", "Customer submitted a return request", "BUYER", { reason_text: reasonText })],
  });
  return done(`退货申请 ${a.rs.id} 已提交，卖家 48 小时内处理`, a.pushes);
}

const AfterSaleInput = z.object({ afterSaleId: z.string() });

async function buyerShipReturn(input: unknown): Promise<SimActionResult> {
  const { afterSaleId } = AfterSaleInput.parse(input);
  const { rs, shop } = await getAfterSale(afterSaleId);
  const now = nowSec();
  if (shop.platform === "shopee") {
    if (rs.status !== "PROCESSING") throw new SimError(`Shopee 退货 ${rs.status} 状态不能寄回（须先由平台同意退货进入 PROCESSING）`);
    if (rs.returnTrackingNumber) throw new SimError("买家已寄回");
    const a = await updateShopeeReturn(shop, rs, {
      returnTrackingNumber: shopeeTrackingNo(shop.region),
      returnCarrier: "SPX Express",
      deadlines: { ...rs.deadlines, return_seller_due_date: now + SHOPEE_RETURN_SHIP_DUE_SEC },
      extra: { ...rs.extra, logistics_status: "LOGISTICS_PICKUP_DONE" },
    });
    return done("买家已寄回，卖家须在 return_seller_due_date 前处理", a.pushes);
  }
  if (rs.status !== "AWAITING_BUYER_SHIP") throw new SimError(`TikTok 退货 ${rs.status} 状态不能寄回（须为 AWAITING_BUYER_SHIP）`);
  const a = await updateTiktokAfterSale(shop, rs, {
    status: "BUYER_SHIPPED_ITEM",
    returnTrackingNumber: tiktokTrackingNo(),
    returnCarrier: shop.region === "TH" ? "Flash Express" : "J&T Express",
    nextActions: [{ action: "SELLER_RESPOND_RECEIVE_PACKAGE", deadline: now + TIKTOK_SELLER_RESPOND_SEC }],
    records: [...rs.records, record("BUYER_SHIPPED", "Customer shipped the returned item", "BUYER")],
  });
  return done("买家已寄回（BUYER_SHIPPED_ITEM），卖家 48 小时内确认收货", a.pushes);
}

const ArbitrateInput = z.object({ afterSaleId: z.string(), decision: z.enum(["approve_return", "buyer_wins", "seller_wins"]) });

async function platformArbitrate(input: unknown): Promise<SimActionResult> {
  const { afterSaleId, decision } = ArbitrateInput.parse(input);
  const { rs, shop } = await getAfterSale(afterSaleId);
  const now = nowSec();
  if (shop.platform === "shopee") {
    if (decision === "approve_return") {
      if (rs.status !== "REQUESTED" || rs.subtype !== "0") throw new SimError("只有 REQUESTED 的退货退款能由平台同意退货");
      const a = await updateShopeeReturn(shop, rs, { status: "PROCESSING", deadlines: { ...rs.deadlines, return_ship_due_date: now + SHOPEE_RETURN_SHIP_DUE_SEC }, extra: { ...rs.extra, logistics_status: "LOGISTICS_PENDING_ARRANGE", negotiation_status: "TERMINATED" } });
      return done("平台同意退货：PROCESSING，等买家寄回", a.pushes);
    }
    if (!["JUDGING", "SELLER_DISPUTE"].includes(rs.status)) throw new SimError(`Shopee 退货 ${rs.status} 不在平台判定中（卖家发起争议后才进入 JUDGING）`);
    const proof = (rs.extra as Record<string, unknown>).seller_proof as Record<string, unknown> | undefined;
    const a = await updateShopeeReturn(shop, rs, { status: decision === "buyer_wins" ? "ACCEPTED" : "CLOSED", extra: { ...rs.extra, seller_proof: proof?.seller_proof_status === "PENDING" ? { ...proof, seller_proof_status: "UPLOADED" } : proof } });
    return done(decision === "buyer_wins" ? "平台判买家胜：ACCEPTED（退款）" : "平台判卖家胜：CLOSED", a.pushes);
  }
  if (rs.kind !== "return") throw new SimError("TikTok 取消申请没有平台仲裁");
  if (decision === "approve_return") {
    if (rs.status !== "RETURN_OR_REFUND_REQUEST_PENDING") throw new SimError("只有待审核的退货能由平台同意");
    const patch = rs.subtype === "REFUND" ? { status: "RETURN_OR_REFUND_REQUEST_SUCCESS" } : { status: "AWAITING_BUYER_SHIP" };
    const a = await updateTiktokAfterSale(shop, rs, { ...patch, nextActions: [], role: "SYSTEM", records: [...rs.records, record("PLATFORM_APPROVE", "Platform approved the request because the seller did not respond in time", "SYSTEM")] });
    return done(`平台同意：${patch.status}`, [...a.pushes, ...(await completeRefund(shop, a.rs))]);
  }
  if (!["REJECT_RECEIVE_PACKAGE", "REFUND_OR_RETURN_REQUEST_REJECT"].includes(rs.status) && rs.arbitrationStatus !== "IN_PROGRESS") {
    throw new SimError("只有卖家拒收或拒绝后的退货能进入平台仲裁");
  }
  const buyerWins = decision === "buyer_wins";
  const a = await updateTiktokAfterSale(shop, rs, {
    status: buyerWins ? "RETURN_OR_REFUND_REQUEST_SUCCESS" : "REFUND_OR_RETURN_REQUEST_REJECT",
    arbitrationStatus: buyerWins ? "SUPPORT_BUYER" : "SUPPORT_SELLER",
    nextActions: [],
    role: "OPERATOR",
    records: [...rs.records, record("ARBITRATION", buyerWins ? "Platform ruled in favour of the buyer" : "Platform ruled in favour of the seller", "OPERATOR")],
  });
  return done(buyerWins ? "仲裁：支持买家，退款完成" : "仲裁：支持卖家，申请关闭", [...a.pushes, ...(await completeRefund(shop, a.rs))]);
}

// ── 授权 ──

const ShopInput = z.object({ platform, shopId: z.string() });
const ExpireInput = ShopInput.extend({ mode: z.enum(["soon", "now"]).default("now") });

async function expireAuth(input: unknown): Promise<SimActionResult> {
  const { platform: p, shopId, mode } = ExpireInput.parse(input);
  const shop = await getShop(p, shopId);
  if (shop.authStatus !== "authorized") throw new SimError("店铺当前未授权");
  const now = Date.now();
  if (mode === "soon") {
    const expires = new Date(now + 6 * 86400_000);
    await mockDb().update(mockShop).set({ authExpiresAt: expires }).where(and(eq(mockShop.platform, p), eq(mockShop.shopId, shopId)));
    const exp = Math.floor(expires.getTime() / 1000);
    if (p === "shopee") {
      const app = await loadShopeeApp(shop.appKey);
      return done("授权将在 6 天后到期（已发 code 12）", [app && shopeePush(app, null, 12, { merchant_expire_soon: [], shop_expire_soon: [Number(shopId)], user_expire_soon: [], expire_before: exp, page_no: 1, total_page: 1 }, `授权即将到期 ${shop.name}`)]);
    }
    const s = { ...shop, authExpiresAt: expires };
    return done("授权将在 6 天后到期（已发 webhook 7）", [tiktokWebhook(s, 7, { message: `Authorization of shop_id ${shopId} is expiring in 6 days. Please direct the merchant to re-authorize.`, expiration_time: String(exp) }, `授权即将到期 ${shop.name}`)]);
  }
  await mockDb()
    .update(mockShop)
    .set({ authExpiresAt: new Date(now - 60_000), accessExpiresAt: new Date(now - 60_000), prevAccessToken: null, prevAccessExpiresAt: null })
    .where(and(eq(mockShop.platform, p), eq(mockShop.shopId, shopId)));
  return done("授权已过期：接口返回 token 失效，刷新也失败（平台不推送）", []);
}

async function deauthorize(input: unknown): Promise<SimActionResult> {
  const { platform: p, shopId } = ShopInput.parse(input);
  const shop = await getShop(p, shopId);
  if (shop.authStatus !== "authorized") throw new SimError("店铺当前未授权");
  const [updated] = await mockDb()
    .update(mockShop)
    .set({ authStatus: "deauthorized", accessToken: null, refreshToken: null, prevAccessToken: null, prevAccessExpiresAt: null })
    .where(and(eq(mockShop.platform, p), eq(mockShop.shopId, shopId)))
    .returning();
  if (p === "shopee") {
    const app = await loadShopeeApp(shop.appKey);
    return done("卖家已取消授权（code 2）", [
      app && shopeePush(app, null, 2, { authorize_type: "user cancel shop authorization", success: 1, extra: `shop id ${shopId} (${shop.region}) has been cancelled its authorization`, shop_id: Number(shopId) }, `取消授权 ${shop.name}`, { partner_id: Number(app.appKey) }),
    ]);
  }
  return done("卖家已取消授权（webhook 6）", [tiktokWebhook(updated, 6, { message: `Shop_id ${shopId} is deauthorized from your APP by merchant.` }, `取消授权 ${shop.name}`)]);
}

const ResendInput = z.object({ logId: z.string().uuid() });

async function resend(input: unknown): Promise<SimActionResult> {
  const { logId } = ResendInput.parse(input);
  const r = await resendPush(logId);
  if (!r) throw new SimError("找不到这条推送记录");
  return { ok: true, message: r.httpStatus ? `已重发，HTTP ${r.httpStatus}` : `已重发，${r.error}`, pushes: [r] };
}

export const SIM_ACTIONS = [
  "buyer_message",
  "buyer_image",
  "buyer_order_card",
  "buyer_product_card",
  "create_buyer",
  "create_order",
  "advance_order",
  "request_cancel",
  "request_return",
  "buyer_ship_return",
  "platform_arbitrate",
  "expire_auth",
  "deauthorize",
  "resend_push",
  "seller_backend_reply",
  "buyer_faq_transfer",
] as const;
export type SimAction = (typeof SIM_ACTIONS)[number];

/** JSON 动作入口；buyer_image 走 runBuyerImage（multipart）。 */
export async function runSimAction(action: SimAction, input: unknown): Promise<SimActionResult> {
  try {
    switch (action) {
      case "buyer_message":
        return await buyerMessage(input);
      case "buyer_order_card":
        return await buyerOrderCard(input);
      case "buyer_product_card":
        return await buyerProductCard(input);
      case "create_buyer":
        return await createBuyer(input);
      case "create_order":
        return await createOrder(input);
      case "advance_order":
        return await advanceOrder(input);
      case "request_cancel":
        return await requestCancel(input);
      case "request_return":
        return await requestReturn(input);
      case "buyer_ship_return":
        return await buyerShipReturn(input);
      case "platform_arbitrate":
        return await platformArbitrate(input);
      case "expire_auth":
        return await expireAuth(input);
      case "deauthorize":
        return await deauthorize(input);
      case "resend_push":
        return await resend(input);
      case "seller_backend_reply":
        return await sellerBackendReply(input);
      case "buyer_faq_transfer":
        return await buyerFaqTransfer(input);
      case "buyer_image":
        return { ok: false, error: "buyer_image 需要 multipart 请求" };
    }
  } catch (e) {
    return simError(e);
  }
}

export async function runBuyerImage(input: { conversationId: string; file: { name: string; data: Buffer } | null; origin: string }): Promise<SimActionResult> {
  try {
    return await buyerImage(input);
  } catch (e) {
    return simError(e);
  }
}

function simError(e: unknown): SimActionResult {
  if (e instanceof SimError) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => `${i.path.join(".") || "参数"}：${i.message}`).join("；") };
  throw e;
}
