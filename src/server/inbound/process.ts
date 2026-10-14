// inbound.process 与 inbound.sweep（DESIGN §11.3）：认领事件 → 按类型落会话、订单、售后、工单 → done / ignored / failed。
import { and, eq, lt, sql } from "drizzle-orm";
import type { Actor } from "@/server/core/audit";
import { admins, notify } from "@/server/core/notify";
import { ingestMessage, runFollowUp, type FollowUp } from "@/server/conversations/ingest";
import { db, schema, type Tx } from "@/server/db/client";
import { syncAfterSale, syncOrders, syncTiktokTracking, syncTracking, upsertAfterSale, type OrderRow } from "@/server/orders/mirror";
import { markAuthExpired, ShopUnavailableError, withShop, type ShopRow } from "@/server/platforms/clients";
import { normalizeShopeeMessage } from "@/server/platforms/shopee";
import { normalizeTiktokMessage, tiktokFindConversation } from "@/server/platforms/tiktok";
import { logisticsTicket, syncAfterSaleTicket } from "@/server/tickets/platform";
import { enqueueInbound } from "./accept";

type EventRow = typeof schema.inboundEvent.$inferSelect;
type Outcome = { status: "done" | "ignored"; reason?: string; followUp?: FollowUp };

const LEASE_MS = 60_000;
const SHOPEE_LOGISTICS_FAIL = new Set(["LOGISTICS_PICKUP_FAILED", "LOGISTICS_DELIVERY_FAILED", "LOGISTICS_LOST"]);

export async function processInbound(data: Record<string, unknown>): Promise<void> {
  const eventId = String(data.eventId ?? "");
  const [ev] = await db()
    .update(schema.inboundEvent)
    .set({ status: "processing", leaseUntil: new Date(Date.now() + LEASE_MS) })
    .where(and(eq(schema.inboundEvent.id, eventId), eq(schema.inboundEvent.status, "queued")))
    .returning();
  if (!ev) return;
  try {
    const out = await dispatch(ev);
    await db()
      .update(schema.inboundEvent)
      .set({ status: out.status, error: out.reason ?? null, processedAt: new Date(), leaseUntil: null })
      .where(eq(schema.inboundEvent.id, ev.id));
    if (ev.shopId) await db().update(schema.shop).set({ lastInboundAt: new Date() }).where(eq(schema.shop.id, ev.shopId));
    await runFollowUp(out.followUp);
  } catch (e) {
    // 不向队列抛出：key_strict_fifo 下失败的任务会挡住同店后续事件，重试交给 inbound.sweep
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error(JSON.stringify({ t: new Date().toISOString(), level: "error", msg: "inbound failed", eventId: ev.id, type: ev.eventType, err: e instanceof Error ? e.stack : msg }));
    await db()
      .update(schema.inboundEvent)
      .set({ status: "failed", attempts: ev.attempts + 1, error: msg.slice(0, 500), leaseUntil: null })
      .where(eq(schema.inboundEvent.id, ev.id));
  }
}

/** 每分钟：租约过期的转 failed；attempts < 3 的 failed 按 10 秒 × 2^attempts 退避后重新排队 */
export async function sweepInbound(): Promise<void> {
  const now = new Date();
  await db()
    .update(schema.inboundEvent)
    .set({ status: "failed", attempts: sql`${schema.inboundEvent.attempts} + 1`, error: "处理中断", leaseUntil: null })
    .where(and(eq(schema.inboundEvent.status, "processing"), lt(schema.inboundEvent.leaseUntil, now)));
  const failed = await db()
    .select()
    .from(schema.inboundEvent)
    .where(and(eq(schema.inboundEvent.status, "failed"), lt(schema.inboundEvent.attempts, 3)))
    .limit(200);
  for (const ev of failed) {
    const waitMs = 10_000 * 2 ** ev.attempts;
    if (now.getTime() - ev.receivedAt.getTime() < waitMs) continue;
    const [requeued] = await db()
      .update(schema.inboundEvent)
      .set({ status: "queued" })
      .where(and(eq(schema.inboundEvent.id, ev.id), eq(schema.inboundEvent.status, "failed")))
      .returning();
    if (requeued) await enqueueInbound(ev.id, ev.platformAppId, shopKey(ev));
  }
  // 漏排的 queued（如投递任务时进程退出）：收到超过 1 分钟仍是 queued 的重新排一次
  const stale = await db()
    .select()
    .from(schema.inboundEvent)
    .where(and(eq(schema.inboundEvent.status, "queued"), lt(schema.inboundEvent.receivedAt, new Date(now.getTime() - 60_000))))
    .limit(200);
  for (const ev of stale) await enqueueInbound(ev.id, ev.platformAppId, shopKey(ev));
}

function shopKey(ev: EventRow): string | null {
  const p = ev.payload as Record<string, unknown>;
  return p.shop_id !== undefined && p.shop_id !== null ? String(p.shop_id) : null;
}

/** 开发者重放（pnpm inbound:replay <id>）：任意状态改回 queued 并排队 */
export async function replayInbound(eventId: string): Promise<boolean> {
  const [ev] = await db().update(schema.inboundEvent).set({ status: "queued", attempts: 0, error: null }).where(eq(schema.inboundEvent.id, eventId)).returning();
  if (!ev) return false;
  await enqueueInbound(ev.id, ev.platformAppId, shopKey(ev));
  return true;
}

async function loadShop(ev: EventRow, externalShopId?: string | null): Promise<ShopRow | null> {
  if (ev.shopId && !externalShopId) {
    const [s] = await db().select().from(schema.shop).where(eq(schema.shop.id, ev.shopId)).limit(1);
    return s ?? null;
  }
  const ext = externalShopId ?? shopKey(ev);
  if (!ext) return null;
  const [s] = await db()
    .select()
    .from(schema.shop)
    .where(and(eq(schema.shop.platformAppId, ev.platformAppId), eq(schema.shop.externalShopId, ext)))
    .limit(1);
  return s ?? null;
}

const webhookActor = (merchantId: string | null): Actor => ({ kind: "webhook", merchantId });

async function dispatch(ev: EventRow): Promise<Outcome> {
  const p = ev.payload as Record<string, unknown>;
  const d = (p.data ?? {}) as Record<string, unknown>;
  const [platform, codeStr] = ev.eventType.split(":");
  const code = Number(codeStr);

  // 应用级事件（不带 shop_id 或针对多店）
  if (platform === "shopee" && code === 1) return { status: "done", reason: "授权由 OAuth 回调处理" };
  if (platform === "shopee" && code === 2) {
    const ids = [d.shop_id, ...((d.shop_id_list as unknown[] | undefined) ?? [])].filter((x) => x !== undefined && x !== null).map(String);
    let n = 0;
    for (const id of ids) {
      const s = await loadShop(ev, id);
      if (s) {
        await markAuthExpired(s, "deauthorized", "卖家在 Shopee 取消了授权");
        n++;
      }
    }
    return n ? { status: "done" } : { status: "ignored", reason: "店铺不属于该应用" };
  }
  if (platform === "shopee" && code === 12) {
    const ids = ((d.shop_expire_soon as unknown[] | undefined) ?? []).map(String);
    const expireBefore = Number(d.expire_before ?? 0);
    for (const id of ids) {
      const s = await loadShop(ev, id);
      if (s) await authExpiringNotice(s, expireBefore > 0 ? new Date(expireBefore * 1000) : null);
    }
    return { status: "done" };
  }

  const shop = await loadShop(ev);
  if (!shop) return { status: "ignored", reason: "店铺不属于该应用" };
  if (shop.status === "disconnected") return { status: "ignored", reason: "店铺已断开" };
  const actor = webhookActor(shop.merchantId);

  if (platform === "tiktok" && code === 6) {
    await markAuthExpired(shop, "deauthorized", "卖家在 TikTok 取消了授权");
    return { status: "done" };
  }
  if (platform === "tiktok" && code === 7) {
    const exp = Number(d.expiration_time ?? 0);
    await authExpiringNotice(shop, exp > 0 ? new Date(exp * 1000) : null);
    return { status: "done" };
  }
  if (platform === "shopee" && code === 28) {
    await db().insert(schema.shopEvent).values({ merchantId: shop.merchantId, shopId: shop.id, kind: "penalty", text: `Shopee 店铺处罚通知：${JSON.stringify(d).slice(0, 300)}` });
    return { status: "done" };
  }

  // 聊天
  if (platform === "shopee" && code === 10) {
    const content = (d.content ?? {}) as Record<string, unknown>;
    const m = normalizeShopeeMessage(content, shop.externalShopId);
    const affiliate = Number(content.business_type ?? 0) === 11;
    const res = await db().transaction((tx) => ingestMessage(tx, shop, m, m.fromBuyer ? { externalId: m.buyerExternalId ?? "", name: m.buyerName, affiliate } : null));
    return res;
  }
  if (platform === "tiktok" && code === 14) {
    const m = normalizeTiktokMessage({ ...d, id: d.message_id });
    let buyer: { externalId: string; name: string | null; affiliate: boolean } | null = null;
    if (m.fromBuyer) {
      const [existing] = await db()
        .select({ buyerExternalId: schema.conversation.buyerExternalId, buyerName: schema.conversation.buyerName, buyerKind: schema.conversation.buyerKind })
        .from(schema.conversation)
        .where(and(eq(schema.conversation.shopId, shop.id), eq(schema.conversation.externalConversationId, m.externalConversationId)))
        .limit(1);
      if (existing) buyer = { externalId: existing.buyerExternalId, name: existing.buyerName, affiliate: existing.buyerKind === "affiliate" };
      else {
        const conv = await withShop(shop.id, (c) => (c.platform === "tiktok" ? tiktokFindConversation(c.app, c.auth, m.externalConversationId) : Promise.resolve(null))).catch((e) => {
          if (e instanceof ShopUnavailableError) return null;
          throw e;
        });
        buyer = { externalId: conv?.buyerUserId ?? m.buyerExternalId ?? "", name: conv?.buyerName ?? null, affiliate: conv?.affiliate ?? false };
      }
    }
    return db().transaction((tx) => ingestMessage(tx, shop, m, buyer));
  }
  if (platform === "tiktok" && code === 13) return { status: "done", reason: "新会话段，等首条消息" };

  // 订单与售后：需要调平台回读
  if (shop.status !== "connected") return { status: "ignored", reason: "店铺授权失效，暂不回读" };
  return withShop(shop.id, async (c) => {
    if (platform === "shopee" && (code === 3 || code === 4 || code === 30)) {
      const sn = String(d.ordersn ?? d.order_sn ?? "");
      if (!sn) return { status: "ignored", reason: "缺订单号" };
      let [order] = await syncOrders(c, [sn]);
      if (!order) return { status: "ignored", reason: "平台查不到订单" };
      // code 4 带运单号、code 30 是包裹履约变化：都回读一次轨迹
      if (code === 4 || code === 30) order = await syncTracking(c, order, db(), d.tracking_no ? String(d.tracking_no) : undefined);
      await db().transaction(async (tx) => {
        if (code === 3) await syncShopeeCancelRequest(tx, shop, order, actor);
        if (code === 3 && order.platformStatus === "RETRY_SHIP") await logisticsTicket(tx, shop, order, "订单重新发货（RETRY_SHIP）", actor, futureOrNull(order.shipByAt));
        if (code === 30 && SHOPEE_LOGISTICS_FAIL.has(String(d.fulfillment_status))) await logisticsTicket(tx, shop, order, `包裹 ${String(d.package_number ?? "")} ${String(d.fulfillment_status)}`, actor, futureOrNull(order.shipByAt));
      });
      return { status: "done" };
    }
    if (platform === "shopee" && code === 29) {
      const orderSn = String(d.order_sn ?? "");
      const returnSn = String(d.return_sn ?? "");
      const [order] = orderSn ? await syncOrders(c, [orderSn]) : [];
      const a = await syncAfterSale(c, "return", returnSn);
      if (!a) return { status: "ignored", reason: "平台查不到退货单" };
      await db().transaction((tx) => syncAfterSaleTicket(tx, shop, a, order ?? null, actor));
      return { status: "done" };
    }
    if (platform === "tiktok" && code === 1) {
      const id = String(d.order_id ?? "");
      const [order] = await syncOrders(c, [id]);
      if (!order) return { status: "ignored", reason: "平台查不到订单" };
      await syncTiktokTracking(c, order);
      return { status: "done" };
    }
    if (platform === "tiktok" && (code === 11 || code === 12)) {
      const kind = code === 11 ? "cancel" : "return";
      const id = String((code === 11 ? d.cancel_id : d.return_id) ?? "");
      const [order] = await syncOrders(c, [String(d.order_id ?? "")]).catch(() => [] as OrderRow[]);
      const a = await syncAfterSale(c, kind, id);
      if (!a) return { status: "ignored", reason: "平台查不到售后单" };
      await db().transaction((tx) => syncAfterSaleTicket(tx, shop, a, order ?? null, actor));
      return { status: "done" };
    }
    return { status: "ignored", reason: "事件类型不在处理清单" };
  });
}

const futureOrNull = (d: Date | null) => (d && d.getTime() > Date.now() ? d : null);

/** Shopee 取消申请：订单进入 IN_CANCEL 建售后镜像（单号 = 订单号）与工单；离开 IN_CANCEL 时推进为已解决 */
export async function syncShopeeCancelRequest(tx: Tx, shop: ShopRow, order: OrderRow, actor: Actor) {
  const [prev] = await tx
    .select()
    .from(schema.afterSale)
    .where(and(eq(schema.afterSale.shopId, shop.id), eq(schema.afterSale.kind, "cancel"), eq(schema.afterSale.externalId, order.externalOrderId)))
    .limit(1);
  if (order.platformStatus !== "IN_CANCEL" && (!prev || prev.platformStatus !== "IN_CANCEL")) return;
  const a = await upsertAfterSale(
    tx,
    shop,
    {
      kind: "cancel",
      externalId: order.externalOrderId,
      externalOrderId: order.externalOrderId,
      buyerExternalId: order.buyerExternalId,
      platformStatus: order.platformStatus,
      nextAction: order.platformStatus === "IN_CANCEL" ? "respond_cancel" : null,
      sellerDueAt: null,
      dueField: order.platformStatus === "IN_CANCEL" ? "merchant_24h" : null,
      reason: null,
      amount: order.totalAmount,
      currency: order.currency,
      updatedAt: order.platformUpdatedAt,
      raw: {},
    },
    order.buyerExternalId,
  );
  await syncAfterSaleTicket(tx, shop, a, order, actor);
}

/** 平台推送的授权即将到期（Shopee 12、TikTok 7）：更新到期时间并通知管理员，不改状态 */
async function authExpiringNotice(shop: ShopRow, expiresAt: Date | null) {
  if (expiresAt) await db().update(schema.shop).set({ authExpiresAt: expiresAt }).where(eq(schema.shop.id, shop.id));
  await notify({
    merchantId: shop.merchantId,
    membershipIds: await admins(shop.merchantId),
    event: "auth_expiring",
    title: `${shop.name} 授权即将到期`,
    body: expiresAt ? `平台通知授权将于 ${expiresAt.toISOString().slice(0, 10)} 到期，请尽快续期。` : "平台通知授权即将到期，请尽快续期。",
    link: `/shops?shop=${shop.id}&dialog=reauth`,
    dedupeKey: `auth_expiring_push:${shop.id}`,
  });
}

