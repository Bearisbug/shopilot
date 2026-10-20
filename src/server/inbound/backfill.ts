// shop.backfill（REQ-SHOP-013）：接入后按店回补会话约 90 天、订单 180 天；order.sync 增量同步；logistics.scan 物流异常扫描。
import { and, eq, inArray } from "drizzle-orm";
import { systemActor } from "@/server/core/audit";
import { enqueuePendingBundles } from "@/server/conversations/bundle";
import { backfillConversation } from "@/server/conversations/ingest";
import { db, schema } from "@/server/db/client";
import { syncTiktokTracking, syncTracking, upsertAfterSale, upsertOrder } from "@/server/orders/mirror";
import { shopClient, ShopUnavailableError, withShop, type ShopClient } from "@/server/platforms/clients";
import { shopeeConversations, shopeeMessages, shopeeOrderDetails, shopeeOrderSns, shopeeReturnDetail, shopeeReturnSns } from "@/server/platforms/shopee";
import { tiktokConversations, tiktokMessages, tiktokSearchAfterSales, tiktokSearchOrders } from "@/server/platforms/tiktok";
import { PlatformError, type NormalizedMessage } from "@/server/platforms/types";
import { logisticsTicket, syncAfterSaleTicket } from "@/server/tickets/platform";

const DAY = 86400_000;

export async function backfillShop(data: Record<string, unknown>): Promise<void> {
  const shopId = String(data.shopId ?? "");
  const [shop] = await db().select().from(schema.shop).where(eq(schema.shop.id, shopId)).limit(1);
  if (!shop || shop.status !== "connected") return;
  await db().update(schema.shop).set({ backfill: { state: "running", conversations: 0, orders: 0 } }).where(eq(schema.shop.id, shopId));
  try {
    const c = await shopClient(shopId);
    const orders = await backfillOrders(c, new Date(Date.now() - 180 * DAY));
    // 先补订单：回补期间进来的新消息要按订单镜像判阶段
    await db().update(schema.shop).set({ backfill: { state: "running", conversations: 0, orders } }).where(eq(schema.shop.id, shopId));
    // 店铺没有聊天权限（如 Shopee PH）时只跳过会话，订单照常回补
    const conversations = c.shop.capabilities.chat
      ? await backfillConversations(c, new Date(Date.now() - 90 * DAY)).catch((e) => {
          if (e instanceof PlatformError && e.kind === "forbidden") return 0;
          throw e;
        })
      : 0;
    await db().update(schema.shop).set({ backfill: { state: "done", conversations, orders } }).where(eq(schema.shop.id, shopId));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db().update(schema.shop).set({ backfill: { state: "failed", conversations: 0, orders: 0, error: error.slice(0, 300) } }).where(eq(schema.shop.id, shopId));
    if (!(e instanceof ShopUnavailableError)) throw e;
  }
}

async function backfillConversations(c: ShopClient, since: Date): Promise<number> {
  let count = 0;
  if (c.platform === "shopee") {
    let cursor: string | null = null;
    for (let page = 0; page < 50; page++) {
      const res = await shopeeConversations(c.app, c.auth, cursor);
      for (const conv of res.items) {
        if (conv.lastMessageAt < since) return count;
        const messages = await collect(async (offset) => {
          const r = await shopeeMessages(c.app, c.auth, conv.conversationId, offset);
          return { items: r.items, next: r.nextOffset };
        }, since);
        const n = await db().transaction((tx) => backfillConversation(tx, c.shop, { externalConversationId: conv.conversationId, buyerExternalId: conv.buyerId, buyerName: conv.buyerName, affiliate: false, avatarUrl: conv.buyerAvatar }, messages));
        if (n > 0) count++;
        if (messages.some((m) => m.payload.platformType === "bundle_message")) await enqueuePendingBundles(c.shop.id, conv.conversationId);
      }
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
    }
    return count;
  }
  let token: string | null = null;
  for (let page = 0; page < 100; page++) {
    const res = await tiktokConversations(c.app, c.auth, token);
    for (const conv of res.items) {
      if (conv.lastMessageAt && conv.lastMessageAt < since) return count;
      const messages = await collect(async (t) => {
        const r = await tiktokMessages(c.app, c.auth, conv.conversationId, t);
        return { items: r.items, next: r.nextPageToken };
      }, since);
      const n = await db().transaction((tx) =>
        backfillConversation(tx, c.shop, { externalConversationId: conv.conversationId, buyerExternalId: conv.buyerUserId ?? conv.buyerImId ?? "", buyerName: conv.buyerName, affiliate: conv.affiliate, avatarUrl: conv.buyerAvatar }, messages),
      );
      if (n > 0) count++;
    }
    if (!res.nextPageToken) break;
    token = res.nextPageToken;
  }
  return count;
}

/** 翻页取消息（新 → 旧）直到早于 since */
export async function collect(fetchPage: (cursor: string | null) => Promise<{ items: NormalizedMessage[]; next: string | null }>, since: Date): Promise<NormalizedMessage[]> {
  const out: NormalizedMessage[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 30; i++) {
    const page = await fetchPage(cursor);
    for (const m of page.items) {
      if (m.sentAt < since) return out;
      out.push(m);
    }
    if (!page.next) break;
    cursor = page.next;
  }
  return out;
}

async function backfillOrders(c: ShopClient, since: Date): Promise<number> {
  const actor = systemActor(c.shop.merchantId);
  let count = 0;
  if (c.platform === "shopee") {
    const sns = await shopeeOrderSns(c.app, c.auth, since, new Date(), "create_time");
    for (let i = 0; i < sns.length; i += 50) {
      for (const o of await shopeeOrderDetails(c.app, c.auth, sns.slice(i, i + 50))) {
        await upsertOrder(db(), c.shop, o);
        count++;
      }
    }
    for (const sn of await shopeeReturnSns(c.app, c.auth, since, new Date())) {
      const a = await upsertAfterSale(db(), c.shop, await shopeeReturnDetail(c.app, c.auth, sn));
      const [order] = await db().select().from(schema.order).where(and(eq(schema.order.shopId, c.shop.id), eq(schema.order.externalOrderId, a.externalOrderId))).limit(1);
      await db().transaction((tx) => syncAfterSaleTicket(tx, c.shop, a, order ?? null, actor));
    }
    return count;
  }
  let token: string | null = null;
  for (let page = 0; page < 100; page++) {
    const res = await tiktokSearchOrders(c.app, c.auth, { createTimeGe: since }, token);
    for (const o of res.items) {
      await upsertOrder(db(), c.shop, o);
      count++;
    }
    if (!res.nextPageToken) break;
    token = res.nextPageToken;
  }
  await syncTiktokAfterSales(c, since);
  return count;
}

async function syncTiktokAfterSales(c: ShopClient, since: Date) {
  if (c.platform !== "tiktok") return;
  const actor = systemActor(c.shop.merchantId);
  for (const kind of ["return", "cancel"] as const) {
    let token: string | null = null;
    for (let page = 0; page < 50; page++) {
      const res = await tiktokSearchAfterSales(c.app, c.auth, kind, { updateTimeGe: since }, token);
      for (const item of res.items) {
        const a = await upsertAfterSale(db(), c.shop, item);
        const [order] = await db().select().from(schema.order).where(and(eq(schema.order.shopId, c.shop.id), eq(schema.order.externalOrderId, a.externalOrderId))).limit(1);
        await db().transaction((tx) => syncAfterSaleTicket(tx, c.shop, a, order ?? null, actor));
      }
      if (!res.nextPageToken) break;
      token = res.nextPageToken;
    }
  }
}

/**
 * order.sync：定时（每小时）对全部已连接店铺补拉最近 2 小时更新的订单与售后，兜住漏推送；
 * 带 shopId 时为「立即同步」，补拉最近 24 小时。
 * 平台出错时任务失败，由 pg-boss 按队列配置重试（§17）；全量任务先跑完所有店，再在末尾汇总抛出。
 * 授权失效的店（ShopUnavailableError）重试也不会好，只记日志。
 */
export async function syncRecentOrders(data: Record<string, unknown>): Promise<void> {
  const shops = data.shopId
    ? await db().select().from(schema.shop).where(and(eq(schema.shop.id, String(data.shopId)), eq(schema.shop.status, "connected")))
    : await db().select().from(schema.shop).where(eq(schema.shop.status, "connected"));
  const since = new Date(Date.now() - (data.shopId ? 24 : 2) * 3600_000);
  const failed: string[] = [];
  for (const shop of shops) {
    try {
      await withShop(shop.id, async (c) => {
        if (c.platform === "shopee") {
          const sns = await shopeeOrderSns(c.app, c.auth, since, new Date(), "update_time");
          for (let i = 0; i < sns.length; i += 50) for (const o of await shopeeOrderDetails(c.app, c.auth, sns.slice(i, i + 50))) await upsertOrder(db(), c.shop, o);
          const actor = systemActor(c.shop.merchantId);
          for (const sn of await shopeeReturnSns(c.app, c.auth, since, new Date())) {
            const a = await upsertAfterSale(db(), c.shop, await shopeeReturnDetail(c.app, c.auth, sn));
            const [order] = await db().select().from(schema.order).where(and(eq(schema.order.shopId, c.shop.id), eq(schema.order.externalOrderId, a.externalOrderId))).limit(1);
            await db().transaction((tx) => syncAfterSaleTicket(tx, c.shop, a, order ?? null, actor));
          }
        } else {
          let token: string | null = null;
          for (let page = 0; page < 20; page++) {
            const res = await tiktokSearchOrders(c.app, c.auth, { updateTimeGe: since }, token);
            for (const o of res.items) await syncTiktokTracking(c, await upsertOrder(db(), c.shop, o));
            if (!res.nextPageToken) break;
            token = res.nextPageToken;
          }
          await syncTiktokAfterSales(c, since);
        }
      });
    } catch (e) {
      console.error(JSON.stringify({ t: new Date().toISOString(), level: "warn", msg: "order.sync shop failed", shopId: shop.id, err: e instanceof Error ? e.message : String(e) }));
      if (!(e instanceof ShopUnavailableError)) failed.push(shop.id);
    }
  }
  if (failed.length) throw new Error(`order.sync 有 ${failed.length} 家店同步失败：${failed.join(", ")}`);
}

/**
 * logistics.scan（每小时，TikTok 店）：运输中的单超过 delivery_sla_time 仍未送达，或 72 小时无新轨迹 → 物流异常工单。
 * 时限取 shipping_due_time / collection_due_time / delivery_due_time 中尚未过去的，无则按类型配置。
 */
export async function scanLogistics(): Promise<void> {
  const rows = await db()
    .select({ order: schema.order, shop: schema.shop })
    .from(schema.order)
    .innerJoin(schema.shop, eq(schema.shop.id, schema.order.shopId))
    .where(and(eq(schema.shop.platform, "tiktok"), eq(schema.shop.status, "connected"), inArray(schema.order.platformStatus, ["AWAITING_COLLECTION", "IN_TRANSIT"])));
  const now = Date.now();
  for (const { order, shop } of rows) {
    const d = order.deadlines ?? {};
    const sla = d.delivery_sla_time ? new Date(d.delivery_sla_time).getTime() : null;
    let why: string | null = sla && sla < now ? "超过平台送达时限仍未送达" : null;
    if (!why) {
      try {
        const fresh = await withShop(shop.id, (c) => syncTracking(c, order));
        const last = (fresh.tracking?.events ?? []).map((e) => new Date(e.at).getTime()).sort((a, b) => b - a)[0];
        if (last && now - last > 72 * 3600_000) why = "72 小时没有新的物流轨迹";
      } catch {
        continue;
      }
    }
    if (!why) continue;
    const due = ["shipping_due_time", "collection_due_time", "delivery_due_time"].map((k) => (d[k] ? new Date(d[k]) : null)).find((x) => x && x.getTime() > now) ?? null;
    await db().transaction((tx) => logisticsTicket(tx, shop, order, why!, systemActor(shop.merchantId), due));
  }
}
