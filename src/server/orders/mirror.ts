// 订单与售后镜像：平台为准，Shopilot 只写镜像（DESIGN §11 免建 ②）。推送、回补、手动同步、操作后回读共用。
import { and, eq, inArray } from "drizzle-orm";
import { db, schema, type Executor } from "@/server/db/client";
import type { OrderItem } from "@/server/db/schema";
import type { ShopClient, ShopRow } from "@/server/platforms/clients";
import { shopeeOrderDetails, shopeeReturnDetail, shopeeTracking } from "@/server/platforms/shopee";
import { tiktokAfterSale, tiktokGetOrders, tiktokTracking } from "@/server/platforms/tiktok";
import type { NormalizedAfterSale, NormalizedOrder } from "@/server/platforms/types";
import { afterSaleOpen, statusGroup } from "./status";

export type OrderRow = typeof schema.order.$inferSelect;
export type AfterSaleRow = typeof schema.afterSale.$inferSelect;

async function hasOpenReturn(ex: Executor, shopId: string, externalOrderId: string, platform: "shopee" | "tiktok"): Promise<boolean> {
  const rows = await ex
    .select({ status: schema.afterSale.platformStatus })
    .from(schema.afterSale)
    .where(and(eq(schema.afterSale.shopId, shopId), eq(schema.afterSale.externalOrderId, externalOrderId), eq(schema.afterSale.kind, "return")));
  return rows.some((r) => afterSaleOpen(platform, "return", r.status));
}

/** 按 SKU（没有时按商品 ID）把已存的商品图补到新的订单行上 */
export function keepImages(next: OrderItem[], prev: OrderItem[]): OrderItem[] {
  if (!prev.length) return next;
  return next.map((i) => {
    if (i.image) return i;
    const old = prev.find((p) => (i.skuId && p.skuId === i.skuId) || (!i.skuId && i.productId && p.productId === i.productId));
    return old?.image !== undefined ? { ...i, image: old.image } : i;
  });
}

export async function upsertOrder(ex: Executor, shop: ShopRow, o: NormalizedOrder): Promise<OrderRow> {
  const openReturn = await hasOpenReturn(ex, shop.id, o.externalOrderId, shop.platform);
  const group = statusGroup(shop.platform, o.platformStatus, { buyerRequestedCancel: o.buyerRequestedCancel, openReturn });
  const [prev] = await ex
    .select({ tracking: schema.order.tracking, items: schema.order.items })
    .from(schema.order)
    .where(and(eq(schema.order.shopId, shop.id), eq(schema.order.externalOrderId, o.externalOrderId)))
    .limit(1);
  // 订单详情不带轨迹，Shopee 订单详情也不带运单号（推送 code 4 给）：保留已拿到的
  const tracking = o.tracking
    ? { ...o.tracking, trackingNo: o.tracking.trackingNo ?? prev?.tracking?.trackingNo, events: o.tracking.events.length ? o.tracking.events : (prev?.tracking?.events ?? []) }
    : (prev?.tracking ?? null);
  const values = {
    merchantId: shop.merchantId,
    // 新数据没带商品图时沿用已存的（补图任务写过的不被后续同步冲掉）
    shopId: shop.id,
    platform: shop.platform,
    externalOrderId: o.externalOrderId,
    buyerExternalId: o.buyerExternalId,
    buyerName: o.buyerName,
    platformStatus: o.platformStatus,
    statusGroup: group,
    totalAmount: o.totalAmount,
    currency: o.currency,
    items: keepImages(o.items, prev?.items ?? []),
    shipByAt: o.shipByAt,
    recipient: o.recipient,
    tracking,
    deadlines: o.deadlines,
    platformCreatedAt: o.createdAt,
    platformUpdatedAt: o.updatedAt,
    syncedAt: new Date(),
  };
  const [row] = await ex.insert(schema.order).values(values).onConflictDoUpdate({ target: [schema.order.shopId, schema.order.externalOrderId], set: values }).returning();
  return row;
}

export async function upsertAfterSale(ex: Executor, shop: ShopRow, a: NormalizedAfterSale, buyerExternalId?: string | null): Promise<AfterSaleRow> {
  const [order] = await ex
    .select({ id: schema.order.id, buyerExternalId: schema.order.buyerExternalId })
    .from(schema.order)
    .where(and(eq(schema.order.shopId, shop.id), eq(schema.order.externalOrderId, a.externalOrderId)))
    .limit(1);
  const values = {
    merchantId: shop.merchantId,
    shopId: shop.id,
    platform: shop.platform,
    kind: a.kind,
    externalId: a.externalId,
    externalOrderId: a.externalOrderId,
    orderId: order?.id ?? null,
    buyerExternalId: buyerExternalId ?? a.buyerExternalId ?? order?.buyerExternalId ?? null,
    platformStatus: a.platformStatus,
    nextAction: a.nextAction,
    sellerDueAt: a.sellerDueAt,
    dueField: a.dueField,
    reason: a.reason,
    amount: a.amount,
    currency: a.currency,
    raw: { ...(typeof a.raw === "object" && a.raw ? (a.raw as Record<string, unknown>) : {}), arbitration_status: a.arbitrationStatus ?? undefined, return_type: a.returnType ?? undefined },
    platformUpdatedAt: a.updatedAt,
    updatedAt: new Date(),
  };
  const [row] = await ex
    .insert(schema.afterSale)
    .values(values)
    .onConflictDoUpdate({ target: [schema.afterSale.shopId, schema.afterSale.kind, schema.afterSale.externalId], set: values })
    .returning();
  // 退货开闭会改订单的状态组
  if (order && a.kind === "return") {
    const [o] = await ex.select().from(schema.order).where(eq(schema.order.id, order.id)).limit(1);
    const openReturn = await hasOpenReturn(ex, shop.id, a.externalOrderId, shop.platform);
    const group = statusGroup(shop.platform, o.platformStatus, { openReturn, buyerRequestedCancel: o.statusGroup === "in_cancel" });
    if (group !== o.statusGroup) await ex.update(schema.order).set({ statusGroup: group }).where(eq(schema.order.id, o.id));
  }
  return row;
}

/** 从平台拉单张或多张订单详情并写镜像 */
export async function syncOrders(c: ShopClient, externalOrderIds: string[], ex: Executor = db()): Promise<OrderRow[]> {
  if (externalOrderIds.length === 0) return [];
  const list = c.platform === "shopee" ? await shopeeOrderDetails(c.app, c.auth, externalOrderIds) : await tiktokGetOrders(c.app, c.auth, externalOrderIds);
  const out: OrderRow[] = [];
  for (const o of list) out.push(await upsertOrder(ex, c.shop, o));
  return out;
}

/** 物流轨迹（会话右栏展开时、logistics.scan 时拉） */
export async function syncTracking(c: ShopClient, row: OrderRow, ex: Executor = db(), trackingNo?: string): Promise<OrderRow> {
  let events: Array<{ at: string; text: string }>;
  if (c.platform === "shopee") events = (await shopeeTracking(c.app, c.auth, row.externalOrderId)).events;
  else events = await tiktokTracking(c.app, c.auth, row.externalOrderId);
  const tracking = { ...(row.tracking ?? {}), ...(trackingNo ? { trackingNo } : {}), events };
  const [u] = await ex.update(schema.order).set({ tracking, syncedAt: new Date() }).where(eq(schema.order.id, row.id)).returning();
  return u;
}

/** TikTok 订单详情不带轨迹：待揽收、运输中、已送达且有运单号时回读一次轨迹（推送与 order.sync 共用） */
const TIKTOK_TRACKED = new Set(["AWAITING_COLLECTION", "IN_TRANSIT", "DELIVERED"]);
export async function syncTiktokTracking(c: ShopClient, row: OrderRow, ex: Executor = db()): Promise<OrderRow> {
  if (c.platform !== "tiktok" || !TIKTOK_TRACKED.has(row.platformStatus) || !row.tracking?.trackingNo) return row;
  return syncTracking(c, row, ex);
}

/** 从平台拉售后单详情并写镜像 */
export async function syncAfterSale(c: ShopClient, kind: "return" | "cancel", externalId: string, ex: Executor = db()): Promise<AfterSaleRow | null> {
  const a = c.platform === "shopee" ? (kind === "return" ? await shopeeReturnDetail(c.app, c.auth, externalId) : null) : await tiktokAfterSale(c.app, c.auth, kind, externalId);
  if (!a) return null;
  return upsertAfterSale(ex, c.shop, a);
}

export async function ordersByExternal(shopId: string, ids: string[], ex: Executor = db()): Promise<OrderRow[]> {
  if (ids.length === 0) return [];
  return ex.select().from(schema.order).where(and(eq(schema.order.shopId, shopId), inArray(schema.order.externalOrderId, ids)));
}
