// 订单商品图补齐（任务 order.images，手动触发）：早于「订单行存商品图」同步进来的订单没有图，按店分批重新取订单详情，
// 只把图片写回 items，不改订单状态、不走 upsertOrder，因此不会触发工单或通知。平台没给图的行记为空串，下次不再重取。
// 每店补完清掉该店「取不到」与「借用订单但当时没图」的商品信息缓存，商品卡下次请求时重新取。
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { OrderItem } from "@/server/db/schema";
import { ShopUnavailableError, withShop } from "@/server/platforms/clients";
import { shopeeOrderDetails } from "@/server/platforms/shopee";
import { tiktokGetOrders } from "@/server/platforms/tiktok";
import type { NormalizedOrder } from "@/server/platforms/types";

const BATCH = 50;
const PAUSE_MS = 1000;

const missingImage = sql`exists (select 1 from jsonb_array_elements(${schema.order.items}) it where it->'image' is null)`;

function withImages(items: OrderItem[], fresh: NormalizedOrder | undefined): OrderItem[] {
  return items.map((i) => {
    if (i.image !== undefined) return i;
    const hit = fresh?.items.find((f) => (i.skuId && f.skuId === i.skuId) || (!i.skuId && i.productId && f.productId === i.productId));
    return { ...i, image: hit?.image ?? "" };
  });
}

async function fillShop(shopId: string, maxBatches: number): Promise<{ orders: number; batches: number; skipped?: string }> {
  let orders = 0;
  let batches = 0;
  let cursor: { at: Date; id: string } | null = null;
  try {
    while (batches < maxBatches) {
      const rows: Array<{ id: string; externalOrderId: string; items: OrderItem[]; platformCreatedAt: Date }> = await db()
        .select({ id: schema.order.id, externalOrderId: schema.order.externalOrderId, items: schema.order.items, platformCreatedAt: schema.order.platformCreatedAt })
        .from(schema.order)
        .where(
          and(
            eq(schema.order.shopId, shopId),
            missingImage,
            cursor ? or(lt(schema.order.platformCreatedAt, cursor.at), and(eq(schema.order.platformCreatedAt, cursor.at), lt(schema.order.id, cursor.id))) : undefined,
          ),
        )
        .orderBy(desc(schema.order.platformCreatedAt), desc(schema.order.id))
        .limit(BATCH);
      if (!rows.length) break;
      const ids = rows.map((r) => r.externalOrderId);
      const fresh = await withShop(shopId, (c) => (c.platform === "shopee" ? shopeeOrderDetails(c.app, c.auth, ids) : tiktokGetOrders(c.app, c.auth, ids)));
      const byId = new Map(fresh.map((o) => [o.externalOrderId, o]));
      for (const r of rows) {
        await db().update(schema.order).set({ items: withImages(r.items, byId.get(r.externalOrderId)) }).where(eq(schema.order.id, r.id));
      }
      orders += rows.length;
      batches += 1;
      const last = rows[rows.length - 1];
      cursor = { at: last.platformCreatedAt, id: last.id };
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  } catch (e) {
    if (e instanceof ShopUnavailableError) return { orders, batches, skipped: e.message };
    throw e;
  }
  await db()
    .delete(schema.productInfo)
    .where(and(eq(schema.productInfo.shopId, shopId), or(eq(schema.productInfo.status, "unavailable"), and(eq(schema.productInfo.source, "order"), isNull(schema.productInfo.imageUrl)))));
  return { orders, batches };
}

/** order.images：参数 shopId 只补一家店（缺省补全部已连接的店），maxBatches 限每店批数（缺省 40 批，即 2000 张订单） */
export async function backfillOrderImages(data: Record<string, unknown>): Promise<void> {
  const maxBatches = Number(data.maxBatches ?? 40);
  const shops = data.shopId
    ? [{ id: String(data.shopId), name: "" }]
    : await db().select({ id: schema.shop.id, name: schema.shop.name }).from(schema.shop).where(eq(schema.shop.status, "connected"));
  for (const s of shops) {
    const r = await fillShop(s.id, maxBatches);
    console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", job: "order.images", shop: s.name || s.id, ...r }));
  }
}
