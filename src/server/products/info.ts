// 商品卡片的商品信息（标题、主图、价格、平台商品页链接），缓存 24 小时。为了打开会话时已经有图有名：
// 1. 商品卡消息入库时（推送、拉取、历史回补）就排 product.fetch 预取（prefetchProducts）；
// 2. 打开会话时还没缓存的当场补：没有商品读取权限的店只查本店订单（纯数据库），有权限的并行调平台，最多等 SYNC_BUDGET_MS，
//    没等到的返回「获取中」，前端显示骨架并每 2 秒查一次进度（GET /api/v1/conversations/{id}/products）；
// 3. 过期的先返回旧值，后台刷新。
// 平台商品接口用不了（店铺没有商品读取权限、无权限、商品不存在、店铺不可用）时，借用本店订单里同一商品最近一次的名称、图片、单价；
// 订单里也没有才记 unavailable，24 小时内不再重试，卡片显示「商品 <ID>」与链接。订单补图后由 order.images 清掉这些缓存，下次请求重新取。
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { ProductCardInfo } from "@/contracts/conversations";
import { db, schema } from "@/server/db/client";
import { enqueue } from "@/server/jobs/boss";
import { ShopUnavailableError, withShop, type ShopRow } from "@/server/platforms/clients";
import { shopeeProduct } from "@/server/platforms/shopee";
import { tiktokProduct } from "@/server/platforms/tiktok";
import { PlatformError, type ProductDetail } from "@/server/platforms/types";

const TTL_MS = 24 * 3600_000;
/** 打开会话时当场取商品信息最多等多久；超过的返回「获取中」，取完写进缓存 */
export const SYNC_BUDGET_MS = 1200;
/** 同一商品在本进程内当场取的最小间隔：会话详情每 4 秒、进度每 2 秒轮询，间隔内只等上一次的结果，不重复调平台 */
const SYNC_RETRY_MS = 60_000;

const SHOPEE_DOMAIN: Record<string, string> = {
  MY: "shopee.com.my",
  SG: "shopee.sg",
  TH: "shopee.co.th",
  VN: "shopee.vn",
  PH: "shopee.ph",
  ID: "shopee.co.id",
  TW: "shopee.tw",
  BR: "shopee.com.br",
};

/** 平台上的商品页（新标签页打开）。TikTok 的链接格式没有在真实平台验证过，改格式只改这里 */
export function productUrl(shop: Pick<ShopRow, "platform" | "market" | "externalShopId">, productId: string): string | null {
  if (!productId) return null;
  const market = shop.market.toUpperCase();
  if (shop.platform === "shopee") {
    const domain = SHOPEE_DOMAIN[market];
    return domain ? `https://${domain}/product/${shop.externalShopId}/${productId}` : null;
  }
  return `https://shop.tiktok.com/view/product/${encodeURIComponent(productId)}?region=${market}&locale=en`;
}

type InfoRow = typeof schema.productInfo.$inferSelect;

const isFresh = (r: Pick<InfoRow, "fetchedAt">) => Date.now() - r.fetchedAt.getTime() <= TTL_MS;
const uniqIds = (ids: string[]) => [...new Set(ids.filter(Boolean))];
/** 同一店同一商品 60 秒内只排一个 product.fetch */
const queueFetch = (shopId: string, productId: string) =>
  enqueue("product.fetch", { shopId, productId }, { singletonKey: `${shopId}:${productId}`, singletonSeconds: 60 });

async function readRows(shopId: string, ids: string[]): Promise<Map<string, InfoRow>> {
  if (!ids.length) return new Map();
  const rows = await db()
    .select()
    .from(schema.productInfo)
    .where(and(eq(schema.productInfo.shopId, shopId), inArray(schema.productInfo.externalProductId, ids)));
  return new Map(rows.map((r) => [r.externalProductId, r]));
}

/** 入库预取：已有新鲜缓存的跳过，其余排 product.fetch；返回排了几个。出错只记日志，不影响消息落库 */
export async function prefetchProducts(shopId: string, ids: string[]): Promise<number> {
  try {
    const uniq = uniqIds(ids);
    const rows = await readRows(shopId, uniq);
    const todo = uniq.filter((id) => !rows.has(id) || !isFresh(rows.get(id)!));
    for (const id of todo) await queueFetch(shopId, id);
    return todo.length;
  } catch (e) {
    console.error(JSON.stringify({ t: new Date().toISOString(), level: "error", msg: "product prefetch failed", shopId, err: e instanceof Error ? e.message : String(e) }));
    return 0;
  }
}

type Attempt = { at: number; done: Promise<void>; failed?: boolean };
const attempts = new Map<string, Attempt>();

/** 当场取一个商品；同一商品 SYNC_RETRY_MS 内复用上一次（进行中的接着等，出错的不再重试） */
function attempt(shop: ShopRow, productId: string): Attempt {
  const now = Date.now();
  for (const [k, a] of attempts) if (now - a.at > SYNC_RETRY_MS) attempts.delete(k);
  const key = `${shop.id}:${productId}`;
  const prev = attempts.get(key);
  if (prev) return prev;
  const a: Attempt = { at: now, done: Promise.resolve() };
  a.done = resolveProduct(shop, productId).catch(() => {
    a.failed = true;
  });
  attempts.set(key, a);
  return a;
}

/**
 * 会话详情与进度查询用：按商品 ID 取商品信息，state 区分 ok / loading（还在取）/ unavailable（取不到，或这次取出错）。
 * 新鲜缓存直接返回；过期的返回旧值并排后台刷新；没有缓存的当场取，最多等 budgetMs，没取到的排进 product.fetch。
 */
export async function productCards(shop: ShopRow, ids: string[], budgetMs = SYNC_BUDGET_MS): Promise<Record<string, ProductCardInfo>> {
  const uniq = uniqIds(ids);
  if (!uniq.length) return {};
  const rows = await readRows(shop.id, uniq);
  const missing = uniq.filter((id) => !rows.has(id));
  for (const id of uniq) if (rows.has(id) && !isFresh(rows.get(id)!)) await queueFetch(shop.id, id);
  const tries = new Map(missing.map((id) => [id, attempt(shop, id)]));
  if (missing.length) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([Promise.all([...tries.values()].map((a) => a.done)), new Promise((r) => (timer = setTimeout(r, budgetMs)))]);
    clearTimeout(timer);
    for (const [id, r] of await readRows(shop.id, missing)) rows.set(id, r);
    for (const id of missing) if (!rows.has(id)) await queueFetch(shop.id, id);
  }
  return Object.fromEntries(
    uniq.map((id): [string, ProductCardInfo] => {
      const r = rows.get(id);
      const ok = r?.status === "ok";
      return [
        id,
        {
          state: ok ? "ok" : r || tries.get(id)?.failed ? "unavailable" : "loading",
          name: ok ? r.name : null,
          imageUrl: ok ? r.imageUrl : null,
          priceMin: ok ? r.priceMin : null,
          priceMax: ok ? r.priceMax : null,
          currency: ok ? r.currency : null,
          url: productUrl(shop, id),
        },
      ];
    }),
  );
}

async function save(shop: ShopRow, productId: string, d: ProductDetail | null, source: "platform" | "order" = "platform") {
  const values = d
    ? { status: "ok" as const, source, name: d.name || null, imageUrl: d.imageUrl, priceMin: d.priceMin, priceMax: d.priceMax, currency: d.currency }
    : { status: "unavailable" as const, source, name: null, imageUrl: null, priceMin: null, priceMax: null, currency: null };
  await db()
    .insert(schema.productInfo)
    .values({ merchantId: shop.merchantId, shopId: shop.id, externalProductId: productId, ...values, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: [schema.productInfo.shopId, schema.productInfo.externalProductId], set: { ...values, fetchedAt: sql`now()` } });
}

/** 本店订单里同一商品最近一次的名称、图片（补图前可能没有）、单价 */
async function fromOrders(shop: ShopRow, productId: string): Promise<ProductDetail | null> {
  const [row] = await db()
    .select({ items: schema.order.items, currency: schema.order.currency })
    .from(schema.order)
    .where(and(eq(schema.order.shopId, shop.id), sql`${schema.order.items} @> ${JSON.stringify([{ productId }])}::jsonb`))
    .orderBy(desc(schema.order.platformCreatedAt))
    .limit(1);
  const item = row?.items.find((i) => i.productId === productId);
  if (!item) return null;
  return { name: item.name, imageUrl: item.image || null, priceMin: item.unitPrice, priceMax: null, currency: row.currency };
}

async function saveFromOrders(shop: ShopRow, productId: string) {
  const d = await fromOrders(shop, productId);
  await save(shop, productId, d, d ? "order" : "platform");
}

/** 取一个商品写进缓存。超时、网络、平台 5xx 抛出（由队列重试）；平台接口用不了的改从订单借用 */
async function resolveProduct(shop: ShopRow, productId: string): Promise<void> {
  if (!shop.capabilities.productScope) return saveFromOrders(shop, productId);
  try {
    const d = await withShop(shop.id, (c) => (c.platform === "shopee" ? shopeeProduct(c.app, c.auth, productId) : tiktokProduct(c.app, c.auth, productId)));
    await save(shop, productId, d);
  } catch (e) {
    if (e instanceof ShopUnavailableError || (e instanceof PlatformError && ["auth", "forbidden", "not_found", "param", "state"].includes(e.kind))) return saveFromOrders(shop, productId);
    throw e;
  }
}

/** product.fetch：取一个商品写进缓存；缓存已经新鲜（入库预取、打开会话时已取过）就跳过 */
export async function fetchProduct(data: Record<string, unknown>): Promise<void> {
  const shopId = String(data.shopId ?? "");
  const productId = String(data.productId ?? "");
  const [shop] = await db().select().from(schema.shop).where(eq(schema.shop.id, shopId)).limit(1);
  if (!shop || !productId) return;
  const r = (await readRows(shopId, [productId])).get(productId);
  if (r && isFresh(r)) return;
  await resolveProduct(shop, productId);
}

const PREFETCH_PAUSE_MS = 300;

/**
 * product.prefetch（手动触发，可重复执行）：库里所有还没有新鲜缓存的商品卡，按店逐个取一次。
 * 要调平台的店（有商品读取权限）每个商品之间停 300 毫秒；出错的排进 product.fetch 由队列重试。参数 shopId 只处理一家店。
 */
export async function prefetchAllProducts(data: Record<string, unknown>): Promise<void> {
  const productId = sql<string>`${schema.message.payload}->>'productId'`;
  const rows = await db()
    .selectDistinct({ shopId: schema.conversation.shopId, productId })
    .from(schema.message)
    .innerJoin(schema.conversation, eq(schema.conversation.id, schema.message.conversationId))
    .leftJoin(schema.productInfo, and(eq(schema.productInfo.shopId, schema.conversation.shopId), sql`${schema.productInfo.externalProductId} = ${productId}`))
    .where(
      and(
        eq(schema.message.type, "product_card"),
        sql`coalesce(${productId}, '') <> ''`,
        or(isNull(schema.productInfo.id), lt(schema.productInfo.fetchedAt, new Date(Date.now() - TTL_MS))),
        data.shopId ? eq(schema.conversation.shopId, String(data.shopId)) : undefined,
      ),
    );
  const byShop = new Map<string, string[]>();
  for (const r of rows) byShop.set(r.shopId, [...(byShop.get(r.shopId) ?? []), r.productId]);
  for (const [shopId, ids] of byShop) {
    const [shop] = await db().select().from(schema.shop).where(eq(schema.shop.id, shopId)).limit(1);
    if (!shop) continue;
    let resolved = 0;
    let queued = 0;
    for (const id of ids) {
      try {
        await resolveProduct(shop, id);
        resolved++;
      } catch {
        await queueFetch(shopId, id);
        queued++;
      }
      if (shop.capabilities.productScope) await new Promise((r) => setTimeout(r, PREFETCH_PAUSE_MS));
    }
    console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", job: "product.prefetch", shop: shop.name, products: ids.length, resolved, queued }));
  }
}
