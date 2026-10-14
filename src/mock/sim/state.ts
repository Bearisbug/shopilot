// 模拟器读数（API-MOCK-005）：店铺、买家会话（含卖家发出的消息与卡片）、订单与售后、推送日志、故障注入。
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { mockDb } from "../db/client";
import { mockAfterSale, mockApp, mockBuyerThread, mockCoupon, mockMessage, mockOrder, mockShop } from "../db/schema";
import { listFaults } from "../faults";
import { MOCK_PRODUCTS, TIKTOK_EVENT_TYPES } from "../fixtures";
import { nextStatus, SHOPEE_PRE_SHIP, TIKTOK_PRE_SHIP } from "../orders";
import { recentPushLogs } from "../push";
import type { SimAfterSale, SimMessage, SimMessageKind, SimOrder, SimShop, SimState, SimThread } from "./types";

type Row = typeof mockAfterSale.$inferSelect;
const RETURN_CLOSED = ["ACCEPTED", "CANCELLED", "CLOSED", "REFUND_OR_RETURN_REQUEST_REJECT", "RETURN_OR_REFUND_REQUEST_CANCEL", "RETURN_OR_REFUND_REQUEST_COMPLETE", "RETURN_OR_REFUND_REQUEST_SUCCESS"];

/** 与 sim/actions.ts 的校验同一套条件：只列此刻能成功的动作。 */
function orderActions(platform: string, status: string, sales: Row[]): SimOrder["actions"] {
  const a: SimOrder["actions"] = [];
  const openReturn = sales.some((r) => r.kind === "return" && !RETURN_CLOSED.includes(r.status));
  const pendingCancel = sales.some((r) => r.kind === "cancel" && r.status === "CANCELLATION_REQUEST_PENDING");
  if (nextStatus(platform as "shopee" | "tiktok", status)) a.push("advance");
  if (platform === "shopee") {
    if (status === "PROCESSED") a.push("retry_ship");
    if (["PROCESSED", "RETRY_SHIP", "SHIPPED"].includes(status)) a.push("logistics_exception");
    if (SHOPEE_PRE_SHIP.includes(status)) a.push("request_cancel");
    if (["SHIPPED", "TO_CONFIRM_RECEIVE", "COMPLETED", "TO_RETURN"].includes(status) && !openReturn) a.push("request_return", "request_refund");
  } else {
    if (["AWAITING_COLLECTION", "IN_TRANSIT"].includes(status)) a.push("logistics_exception");
    if (TIKTOK_PRE_SHIP.includes(status) && !pendingCancel) a.push("request_cancel");
    if (["DELIVERED", "COMPLETED"].includes(status) && !openReturn) a.push("request_return");
    if (["IN_TRANSIT", "DELIVERED", "COMPLETED"].includes(status) && !openReturn) a.push("request_refund");
  }
  return a;
}

function afterSaleActions(platform: string, r: Row): SimAfterSale["actions"] {
  const a: SimAfterSale["actions"] = [];
  if (r.kind !== "return") return a;
  if (platform === "shopee") {
    if (r.status === "REQUESTED" && r.subtype === "0") a.push("approve_return");
    if (r.status === "PROCESSING" && !r.returnTrackingNumber) a.push("buyer_ship_return");
    if (["JUDGING", "SELLER_DISPUTE"].includes(r.status)) a.push("buyer_wins", "seller_wins");
  } else {
    if (r.status === "RETURN_OR_REFUND_REQUEST_PENDING") a.push("approve_return");
    if (r.status === "AWAITING_BUYER_SHIP") a.push("buyer_ship_return");
    if (["REJECT_RECEIVE_PACKAGE", "REFUND_OR_RETURN_REQUEST_REJECT"].includes(r.status) || r.arbitrationStatus === "IN_PROGRESS") a.push("buyer_wins", "seller_wins");
  }
  return a;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const fromSec = (s: number | undefined) => (s ? new Date(s * 1000).toISOString() : null);

function kindOf(type: string): SimMessageKind {
  switch (type) {
    case "text":
    case "TEXT":
    case "faq_liveagent":
    case "NOTIFICATION":
      return "text";
    case "image":
    case "IMAGE":
    case "EMOTICONS":
    case "sticker":
      return "image";
    case "order":
    case "ORDER_CARD":
    case "BUYER_ENTER_FROM_ORDER":
      return "order";
    case "item":
    case "product":
    case "PRODUCT_CARD":
    case "BUYER_ENTER_FROM_PRODUCT":
      return "product";
    case "voucher":
    case "COUPON_CARD":
      return "coupon";
    case "RETURN_REFUND_CARD":
      return "return";
    case "LOGISTICS_CARD":
      return "logistics";
    default:
      return "other";
  }
}

function previewOf(m: typeof mockMessage.$inferSelect | undefined): string {
  if (!m) return "";
  const c = m.content as Record<string, unknown>;
  const k = kindOf(m.type);
  if (k === "text") return String(c.text ?? c.content ?? "");
  return { image: "[图片]", order: "[订单卡]", product: "[商品卡]", coupon: "[优惠券]", return: "[退货退款卡]", logistics: "[物流卡]", other: `[${m.type}]` }[k];
}

export async function getSimState(sel: { shopKey?: string | null; conversationId?: string | null }): Promise<SimState> {
  const db = mockDb();
  const [apps, shops] = await Promise.all([db.select().from(mockApp), db.select().from(mockShop).orderBy(asc(mockShop.platform), asc(mockShop.shopId))]);
  const appByKey = new Map(apps.map((a) => [`${a.platform}:${a.appKey}`, a]));
  const simShops: SimShop[] = shops.map((s) => {
    const app = appByKey.get(`${s.platform}:${s.appKey}`);
    const subscribed =
      s.platform === "shopee"
        ? (app?.pushCodes ?? []).map((c) => `code ${c}`)
        : Object.keys(s.webhooks).map((name) => {
            const type = Object.entries(TIKTOK_EVENT_TYPES).find(([, n]) => n === name)?.[0];
            return type ? `type ${type}` : name;
          });
    return {
      platform: s.platform,
      shopId: s.shopId,
      name: s.name,
      region: s.region,
      currency: s.currency,
      appKey: s.appKey,
      appName: app?.name ?? s.appKey,
      authStatus: s.authStatus,
      authExpiresAt: iso(s.authExpiresAt),
      authExpired: s.authStatus === "authorized" && !!s.authExpiresAt && s.authExpiresAt.getTime() < Date.now(),
      accessExpiresAt: iso(s.accessExpiresAt),
      chat: s.capabilities.chat,
      canAcceptChat: s.platform === "tiktok" ? s.canAcceptChat : null,
      callbackUrl: s.platform === "shopee" ? app?.callbackUrl ?? null : (Object.values(s.webhooks)[0]?.address ?? null),
      subscribed,
    };
  });

  const selShop = sel.shopKey ? shops.find((s) => `${s.platform}:${s.shopId}` === sel.shopKey) : undefined;
  let threads: SimThread[] = [];
  let messages: SimMessage[] = [];
  let orders: SimOrder[] = [];
  let products: SimState["products"] = [];

  if (selShop) {
    const rows = await db
      .select()
      .from(mockBuyerThread)
      .where(and(eq(mockBuyerThread.platform, selShop.platform), eq(mockBuyerThread.shopId, selShop.shopId)))
      .orderBy(desc(mockBuyerThread.lastMessageAt));
    const latest = rows.length
      ? await db
          .select()
          .from(mockMessage)
          .where(inArray(mockMessage.seq, db.select({ s: sql<number>`max(${mockMessage.seq})` }).from(mockMessage).where(inArray(mockMessage.conversationId, rows.map((r) => r.conversationId))).groupBy(mockMessage.conversationId)))
      : [];
    const latestBy = new Map(latest.map((m) => [m.conversationId, m]));
    threads = rows.map((t) => ({
      conversationId: t.conversationId,
      platform: t.platform,
      shopId: t.shopId,
      buyerId: t.buyerId,
      buyerName: t.buyerName,
      language: t.language,
      unread: t.unreadCount,
      started: t.started,
      lastMessageAt: t.lastMessageAt.toISOString(),
      preview: previewOf(latestBy.get(t.conversationId)),
      sessionId: t.sessionId,
      sessionOpen: t.sessionOpen,
    }));
    const cat = MOCK_PRODUCTS[`${selShop.platform}:${selShop.shopId}`] ?? [];
    products = cat.map((p) => ({ itemId: p.itemId, name: p.name, skuName: p.skuName, price: p.price }));

    const thread = sel.conversationId ? rows.find((t) => t.conversationId === sel.conversationId) : undefined;
    if (thread) {
      const [msgRows, coupons, orderRows] = await Promise.all([
        db.select().from(mockMessage).where(eq(mockMessage.conversationId, thread.conversationId)).orderBy(asc(mockMessage.seq)),
        db.select().from(mockCoupon).where(eq(mockCoupon.shopId, selShop.shopId)),
        db
          .select()
          .from(mockOrder)
          .where(and(eq(mockOrder.platform, selShop.platform), eq(mockOrder.shopId, selShop.shopId), eq(mockOrder.buyerId, thread.buyerId)))
          .orderBy(desc(mockOrder.createTime)),
      ]);
      const couponTitle = new Map(coupons.map((c) => [c.couponId, c.title]));
      const productName = new Map(cat.map((p) => [p.itemId, p.name]));
      messages = msgRows.map((m) => {
        const c = m.content as Record<string, unknown>;
        const kind = kindOf(m.type);
        const productId = String(c.item_id ?? c.product_id ?? "");
        return {
          id: m.messageId,
          sender: m.sender,
          kind,
          rawType: m.type,
          text: kind === "text" ? String(c.text ?? c.content ?? "") : null,
          imageUrl: kind === "image" ? String(c.url ?? "") : null,
          orderId: c.order_sn ? String(c.order_sn) : c.order_id ? String(c.order_id) : null,
          productName: kind === "product" ? productName.get(productId) ?? `商品 ${productId}` : null,
          couponTitle: kind === "coupon" ? couponTitle.get(String(c.coupon_id ?? "")) ?? `优惠券 ${String(c.coupon_id ?? "")}` : null,
          createdAt: m.createdAt.toISOString(),
        };
      });
      const sales = orderRows.length ? await db.select().from(mockAfterSale).where(inArray(mockAfterSale.orderId, orderRows.map((o) => o.orderId))).orderBy(asc(mockAfterSale.createTime)) : [];
      orders = orderRows.map((o) => ({
        orderId: o.orderId,
        status: o.status,
        currency: o.currency,
        total: o.totalAmount,
        items: o.items.map((i) => ({ name: i.name, skuName: i.skuName, qty: i.qty, price: i.price })),
        trackingNumber: o.trackingNumber,
        carrier: o.carrier,
        shipByAt: fromSec(o.deadlines.ship_by_date ?? o.deadlines.rts_sla_time),
        createdAt: o.createTime.toISOString(),
        next: nextStatus(o.platform, o.status),
        actions: orderActions(o.platform, o.status, sales.filter((r) => r.orderId === o.orderId)),
        afterSales: sales
          .filter((r) => r.orderId === o.orderId)
          .map((r): SimAfterSale => {
            const action = r.nextActions[0];
            const dl = r.deadlines;
            const [dueField, due] = action
              ? ["seller_next_action_response.deadline", action.deadline]
              : dl.seller_evidence_deadline && r.status === "JUDGING"
                ? ["seller_evidence_deadline", dl.seller_evidence_deadline]
                : dl.return_seller_due_date
                  ? ["return_seller_due_date", dl.return_seller_due_date]
                  : dl.return_ship_due_date && r.status === "PROCESSING"
                    ? ["return_ship_due_date", dl.return_ship_due_date]
                    : dl.due_date && r.status === "REQUESTED"
                      ? ["due_date", dl.due_date]
                      : [null, undefined];
            return {
              id: r.id,
              orderId: r.orderId,
              kind: r.kind,
              status: r.status,
              subtype: r.subtype,
              reasonText: r.reasonText,
              arbitrationStatus: r.arbitrationStatus,
              dueAt: fromSec(due),
              dueField,
              returnTrackingNumber: r.returnTrackingNumber,
              createdAt: r.createTime.toISOString(),
              actions: afterSaleActions(o.platform, r),
            };
          }),
      }));
    }
  }

  const [logs, faults] = await Promise.all([recentPushLogs(40), listFaults()]);
  return {
    shops: simShops,
    threads,
    messages,
    orders,
    products,
    pushLogs: logs.map((l) => ({
      id: l.id,
      platform: l.platform,
      shopId: l.shopId,
      event: l.event,
      targetUrl: l.targetUrl,
      httpStatus: l.httpStatus,
      error: l.error,
      summary: l.summary,
      durationMs: l.durationMs,
      resendOf: l.resendOf,
      createdAt: l.createdAt.toISOString(),
    })),
    faults: faults.map((f) => ({ platform: f.platform, shopId: f.shopId, category: f.category, kind: f.kind, mode: f.mode, hits: f.hits })),
    serverTime: new Date().toISOString(),
  };
}
