// 模拟平台种子：清空 mock_ 表并写入 fixtures。Shopilot 的种子脚本先建自己的记录再调 seedMock。
import { sql } from "drizzle-orm";
import { mockDb } from "./db/client";
import { mockAfterSale, mockApp, mockBuyerThread, mockCoupon, mockMessage, mockOrder, mockShop, type MockOrderItem, type TiktokWebhookMap } from "./db/schema";
import {
  AUTH_TTL_SEC,
  MOCK_APPS,
  MOCK_BUYERS,
  MOCK_COUPONS,
  MOCK_PRODUCTS,
  MOCK_SHOPS,
  SHOPEE_ACCESS_TTL_SEC,
  SHOPEE_DEMO_PUSH_CODES,
  SHOPEE_REFRESH_TTL_SEC,
  SHOPEE_RETURN_DUE_SEC,
  TIKTOK_ACCESS_TTL_SEC,
  TIKTOK_DEMO_WEBHOOK_TYPES,
  TIKTOK_EVENT_TYPES,
  TIKTOK_SELLER_RESPOND_SEC,
  type FixtureBuyer,
  type FixtureMessage,
  type FixtureOrder,
  type FixtureShop,
} from "./fixtures";
import { shopeeMessageId, tiktokLineItemId, tiktokMessageId, tiktokSessionId } from "./ids";
import { orderTotals, replayToStatus } from "./orders";
import { sampleImageUrl } from "./uploads";

export type SeedMockOptions = {
  /** 模拟平台对外地址（拼图片 URL、TikTok redirect_url），如 http://127.0.0.1:3360 */
  baseUrl: string;
  /** 应用 key（Shopee partner_id / TikTok app_key）→ Shopilot 回调地址；有值的 Demo 应用预配推送 */
  callbacks: Record<string, string>;
};

export type SeedMockResult = {
  shops: Array<{ platform: string; shopId: string; appKey: string; accessToken: string; refreshToken: string; accessExpiresAt: Date; refreshExpiresAt: Date; authExpiresAt: Date }>;
  counts: { apps: number; shops: number; threads: number; messages: number; orders: number; afterSales: number; coupons: number };
};

const SHIPPING_FEE: Record<string, string> = { MYR: "4.90", SGD: "1.99", THB: "38.00", VND: "15000", PHP: "45.00" };
const PAYMENT: Record<string, string> = { shopee: "ShopeePay", tiktok: "Credit/Debit Card" };

function orderItems(shop: FixtureShop, items: FixtureOrder["items"]): MockOrderItem[] {
  const catalog = MOCK_PRODUCTS[`${shop.platform}:${shop.shopId}`] ?? [];
  return items.map(({ productIndex, qty }) => {
    const p = catalog[productIndex];
    return {
      itemId: p.itemId,
      skuId: p.skuId,
      name: p.name,
      skuName: p.skuName,
      qty,
      price: p.price,
      originalPrice: p.originalPrice,
      lineItemIds: shop.platform === "tiktok" ? Array.from({ length: qty }, () => tiktokLineItemId()) : [p.itemId],
    };
  });
}

function messageContent(shop: FixtureShop, m: FixtureMessage, statusOf: (orderId: string) => string): { type: string; content: Record<string, unknown> } {
  const catalog = MOCK_PRODUCTS[`${shop.platform}:${shop.shopId}`] ?? [];
  const kind = m.kind ?? "text";
  if (shop.platform === "shopee") {
    if (kind === "order") return { type: "order", content: { shop_id: Number(shop.shopId), order_sn: m.orderId, order_status: statusOf(m.orderId!) } };
    if (kind === "product") return { type: "item", content: { shop_id: Number(shop.shopId), item_id: Number(catalog[m.productIndex ?? 0].itemId) } };
    return { type: "text", content: { text: m.text ?? "" } };
  }
  if (kind === "order") return { type: "ORDER_CARD", content: { order_id: m.orderId } };
  if (kind === "product") return { type: "PRODUCT_CARD", content: { product_id: catalog[m.productIndex ?? 0].itemId } };
  return { type: "TEXT", content: { content: m.text ?? "" } };
}

export async function seedMock(opts: SeedMockOptions): Promise<SeedMockResult> {
  const db = mockDb();
  const base = opts.baseUrl.replace(/\/$/, "");
  const now = Date.now();
  const nowS = Math.floor(now / 1000);
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000);

  await db.execute(sql`TRUNCATE mock_app, mock_shop, mock_auth_code, mock_buyer_thread, mock_message, mock_order, mock_after_sale, mock_coupon, mock_push_log, mock_upload, mock_fault RESTART IDENTITY`);

  // 应用
  for (const a of MOCK_APPS) {
    const cb = a.demo ? opts.callbacks[a.appKey] : undefined;
    await db.insert(mockApp).values({
      platform: a.platform,
      appKey: a.appKey,
      name: a.name,
      secret: a.secret,
      pushKey: a.pushKey ?? null,
      region: a.region,
      mainAccountId: a.mainAccountId ?? null,
      redirectUrl: a.redirectPath ? `${base}${a.redirectPath}` : null,
      callbackUrl: a.platform === "shopee" ? (cb ?? a.callbackUrl ?? null) : null,
      pushCodes: a.platform === "shopee" ? (cb ? SHOPEE_DEMO_PUSH_CODES : a.callbackUrl ? [3, 4] : []) : [],
      pushConfig: { blocked_shop_id: [] },
    });
  }

  // 店铺
  const result: SeedMockResult["shops"] = [];
  for (const s of MOCK_SHOPS) {
    const authExpiresAt = new Date(now + AUTH_TTL_SEC * 1000);
    const accessExpiresAt = new Date(now + (s.platform === "shopee" ? SHOPEE_ACCESS_TTL_SEC : TIKTOK_ACCESS_TTL_SEC) * 1000);
    const refreshExpiresAt = s.platform === "shopee" ? new Date(now + SHOPEE_REFRESH_TTL_SEC * 1000) : authExpiresAt;
    const cb = opts.callbacks[s.appKey];
    const webhooks: TiktokWebhookMap = {};
    if (s.platform === "tiktok" && s.authorized && cb) {
      for (const t of TIKTOK_DEMO_WEBHOOK_TYPES) webhooks[TIKTOK_EVENT_TYPES[t]] = { address: cb, create_time: nowS, update_time: nowS };
    }
    await db.insert(mockShop).values({
      platform: s.platform,
      shopId: s.shopId,
      appKey: s.appKey,
      name: s.name,
      region: s.region,
      currency: s.currency,
      cipher: s.cipher ?? null,
      shopCode: s.shopCode ?? null,
      mainAccountId: s.mainAccountId ?? null,
      sellerOpenId: s.sellerOpenId ?? null,
      sellerName: s.sellerName ?? null,
      authStatus: s.authorized ? "authorized" : "unauthorized",
      authTime: s.authorized ? new Date(now - 30 * 86400_000) : null,
      authExpiresAt: s.authorized ? authExpiresAt : null,
      accessToken: s.authorized ? s.accessToken! : null,
      accessExpiresAt: s.authorized ? accessExpiresAt : null,
      refreshToken: s.authorized ? s.refreshToken! : null,
      refreshExpiresAt: s.authorized ? refreshExpiresAt : null,
      capabilities: { chat: s.chat },
      webhooks,
      performance: s.performance,
    });
    if (s.authorized) result.push({ platform: s.platform, shopId: s.shopId, appKey: s.appKey, accessToken: s.accessToken!, refreshToken: s.refreshToken!, accessExpiresAt, refreshExpiresAt, authExpiresAt });
  }

  // 买家、订单、售后、消息
  const shopsById = new Map(MOCK_SHOPS.map((s) => [`${s.platform}:${s.shopId}`, s]));
  let messages = 0;
  let orders = 0;
  let afterSales = 0;
  for (const b of MOCK_BUYERS) {
    const shop = shopsById.get(`${b.platform}:${b.shopId}`)!;
    const statuses = new Map<string, string>();
    for (const o of b.orders) {
      statuses.set(o.orderId, await seedOrder(shop, b, o, now, base));
      orders++;
      if (o.afterSale) afterSales++;
    }
    const sorted = [...b.messages].sort((x, y) => y.minutesAgo - x.minutesAgo);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    await db.insert(mockBuyerThread).values({
      conversationId: b.conversationId,
      platform: b.platform,
      shopId: b.shopId,
      buyerId: b.buyerId,
      buyerImId: b.buyerImId,
      buyerName: b.name,
      buyerAvatar: sampleImageUrl(base, `avatar-${b.buyerId}`),
      language: b.language,
      unreadCount: b.unread,
      sessionId: b.platform === "tiktok" ? tiktokSessionId() : null,
      sessionOpen: true,
      started: true,
      lastMessageAt: at(last.minutesAgo),
      createdAt: at(first.minutesAgo),
    });
    for (const m of sorted) {
      const { type, content } = messageContent(shop, m, (id) => statuses.get(id) ?? "");
      await db.insert(mockMessage).values({
        messageId: b.platform === "shopee" ? shopeeMessageId() : tiktokMessageId(),
        conversationId: b.conversationId,
        platform: b.platform,
        shopId: b.shopId,
        sender: m.from,
        type,
        content,
        createdAt: at(m.minutesAgo),
      });
      messages++;
    }
  }

  // 优惠券
  for (const c of MOCK_COUPONS) {
    const shop = shopsById.get(`tiktok:${c.shopId}`)!;
    const start = nowS + c.startDays * 86400;
    const end = start + c.durationDays * 86400;
    const discount =
      c.discount.type === "AMOUNT_OFF"
        ? { type: "AMOUNT_OFF", reduction_amount: { amount: c.discount.amount, currency: shop.currency } }
        : { type: "PERCENT_OFF", percentage: c.discount.percentage, max_discount: { amount: c.discount.maxDiscount, currency: shop.currency } };
    await db.insert(mockCoupon).values({
      couponId: c.couponId,
      platform: "tiktok",
      shopId: c.shopId,
      title: c.title,
      status: c.status,
      startTime: new Date(start * 1000),
      endTime: new Date(end * 1000),
      detail: {
        display_type: c.displayType,
        create_time: (start - 86400) * 1000,
        update_time: (start - 86400) * 1000,
        claim_duration: { start_time: start, end_time: end },
        redemption_duration: { type: "ABSOLUTE", start_time: start, end_time: end + 7 * 86400, relative_time: 0 },
        promo_code: "",
        target_buyer_segment: "ALL",
        usage_limits: { single_buyer_claim_limit: 1, total_claim_limit: 500, redemption_limit: 500 },
        discount,
        threshold: c.minSpend ? { type: "MIN_SPEND", min_spend: { amount: c.minSpend, currency: shop.currency } } : { type: "NONE" },
        product_scope: "FULL_SHOP",
        creation_source: "SELLER_CENTER",
      },
    });
  }

  return {
    shops: result,
    counts: { apps: MOCK_APPS.length, shops: MOCK_SHOPS.length, threads: MOCK_BUYERS.length, messages, orders, afterSales, coupons: MOCK_COUPONS.length },
  };
}

/** 写入一张种子订单（含售后），返回订单当前状态。 */
async function seedOrder(shop: FixtureShop, b: FixtureBuyer, o: FixtureOrder, now: number, base: string): Promise<string> {
  const db = mockDb();
  const created = Math.floor(now / 1000) - o.minutesAgo * 60;
  const nowS = Math.floor(now / 1000);
  const items = orderItems(shop, o.items);
  const fee = SHIPPING_FEE[shop.currency] ?? "0";
  const { total } = orderTotals(items, fee);
  // 非链上状态先回放到前置状态：IN_CANCEL → prevStatus，TO_RETURN → COMPLETED
  const chainTarget = o.status === "IN_CANCEL" ? o.prevStatus ?? "READY_TO_SHIP" : o.status === "TO_RETURN" ? "COMPLETED" : o.status;
  const asEnd = o.afterSale ? Math.min(nowS, created + (o.minutesAgo - o.afterSale.minutesAgo) * 60) : nowS;
  const replay = replayToStatus(shop.platform, shop.region, chainTarget, created, o.status === "IN_CANCEL" ? nowS - 60 * 60 : asEnd);
  const times = { ...replay.times };
  if (o.status === "IN_CANCEL") times.request_cancel = nowS - 60 * 60;
  if (o.afterSale?.kind === "cancel") times.request_cancel = nowS - o.afterSale.minutesAgo * 60;
  const lastEvent = Math.max(created, ...(replay.tracking ?? []).map((e) => e.time), ...Object.values(times));
  await db.insert(mockOrder).values({
    orderId: o.orderId,
    platform: shop.platform,
    shopId: shop.shopId,
    buyerId: b.buyerId,
    buyerName: b.name,
    status: o.status,
    prevStatus: o.status === "IN_CANCEL" ? chainTarget : null,
    currency: shop.currency,
    totalAmount: total,
    shippingFee: fee,
    items,
    recipient: { ...b.recipient, region: shop.region },
    carrier: replay.carrier ?? null,
    trackingNumber: replay.trackingNumber ?? null,
    packageNumber: replay.packageNumber ?? null,
    tracking: replay.tracking ?? [],
    deadlines: replay.deadlines ?? {},
    times,
    buyerMessage: o.buyerMessage ?? "",
    paymentMethod: PAYMENT[shop.platform],
    buyerCancelReason: o.buyerCancelReason ?? null,
    createTime: new Date(created * 1000),
    payTime: times.paid ? new Date(times.paid * 1000) : null,
    updateTime: new Date(Math.min(lastEvent, nowS) * 1000),
  });
  const as = o.afterSale;
  if (as) {
    const asCreated = nowS - as.minutesAgo * 60;
    const refund = orderTotals(items, "0").total;
    const common = {
      id: as.id,
      platform: shop.platform,
      shopId: shop.shopId,
      orderId: o.orderId,
      kind: as.kind,
      status: as.status,
      subtype: as.subtype,
      reason: as.reason,
      reasonText: as.reasonText,
      currency: shop.currency,
      refundAmount: refund,
      items,
      role: "BUYER",
      createTime: new Date(asCreated * 1000),
      updateTime: new Date(asCreated * 1000),
    };
    if (shop.platform === "shopee") {
      await db.insert(mockAfterSale).values({
        ...common,
        deadlines: { due_date: asCreated + SHOPEE_RETURN_DUE_SEC },
        extra: {
          negotiation_status: "PENDING_RESPOND",
          seller_proof: { seller_proof_status: "NOT_NEEDED", seller_evidence_deadline: 0 },
          logistics_status: "LOGISTICS_NOT_STARTED",
          images: [sampleImageUrl(base, `return-${as.id}`)],
        },
      });
    } else {
      const action = as.kind === "cancel" ? "SELLER_RESPOND_CANCEL" : as.subtype === "REFUND" ? "SELLER_RESPOND_REFUND" : "SELLER_RESPOND_RETURN";
      await db.insert(mockAfterSale).values({
        ...common,
        nextActions: [{ action, deadline: asCreated + TIKTOK_SELLER_RESPOND_SEC }],
        records: [{ event: as.kind === "cancel" ? "ORDER_CANCEL" : "ORDER_RETURN", description: as.kind === "cancel" ? "Customer submitted a cancellation request" : "Customer submitted a return request", role: "BUYER", create_time: asCreated, reason_text: as.reasonText }],
      });
    }
  }
  return o.status;
}
