// 店铺商品目录（工作台「商品」页签）：在售商品的名称、主图、价格区间、可售库存、卖家 SKU 与买家可见的商品页。
// 整店目录在进程内缓存 10 分钟（同一店同时只取一次），搜索在前端做；取到的商品顺手写进商品卡缓存，发出的商品卡立即有图有名。
import type { ShopProducts } from "@/contracts/conversations";
import { notAllowed } from "@/server/http/problem";
import { withShop, type ShopRow } from "@/server/platforms/clients";
import { shopeeItemIds, shopeeItemModels, shopeeItemsBase } from "@/server/platforms/shopee";
import { tiktokCatalog, tiktokProduct } from "@/server/platforms/tiktok";
import { cachedImages, productUrl, rememberProducts } from "./info";

const TTL_MS = 10 * 60_000;
/** 每店最多列多少个商品 */
const MAX_PRODUCTS = 500;
/** 逐个补规格（Shopee）或主图（TikTok）时的并发数 */
const CONCURRENCY = 6;

type Entry = { at: number; done: Promise<ShopProducts> };
const cache = new Map<string, Entry>();

/** 取店铺商品目录；refresh 时不用缓存。店铺没有商品读取权限时 409 product_scope_missing */
export async function shopProducts(shop: ShopRow, refresh = false): Promise<ShopProducts> {
  if (!shop.capabilities.productScope) throw notAllowed("店铺没有授予商品读取权限，请管理员到「店铺与连接」续期授权。", "product_scope_missing");
  const hit = cache.get(shop.id);
  if (hit && !refresh && Date.now() - hit.at < TTL_MS) return hit.done;
  const entry: Entry = { at: Date.now(), done: load(shop) };
  cache.set(shop.id, entry);
  // 出错的不缓存，下次请求重新取
  entry.done.catch(() => cache.get(shop.id) === entry && cache.delete(shop.id));
  return entry.done;
}

async function load(shop: ShopRow): Promise<ShopProducts> {
  const list = await withShop(shop.id, async (c) => {
    if (c.platform === "shopee") {
      const ids = await shopeeItemIds(c.app, c.auth, MAX_PRODUCTS + 1);
      const { items, withModels } = await shopeeItemsBase(c.app, c.auth, ids.slice(0, MAX_PRODUCTS));
      // 多规格商品的价格、库存、规格 SKU 要逐个取；单个取失败只缺这几项，不影响整张列表
      const multi = new Set(withModels);
      await eachLimit(
        items.filter((p) => multi.has(p.productId)),
        CONCURRENCY,
        async (p) => void Object.assign(p, await shopeeItemModels(c.app, c.auth, p.productId).catch(() => ({}))),
      );
      return { items, truncated: ids.length > MAX_PRODUCTS };
    }
    const all = await tiktokCatalog(c.app, c.auth, MAX_PRODUCTS + 1);
    const items = all.slice(0, MAX_PRODUCTS);
    // 搜索接口不给主图：先用商品卡缓存里的，没有的逐个调商品详情
    const images = await cachedImages(shop.id, items.map((p) => p.productId));
    await eachLimit(items, CONCURRENCY, async (p) => {
      p.imageUrl = images.get(p.productId) ?? (await tiktokProduct(c.app, c.auth, p.productId).catch(() => null))?.imageUrl ?? null;
    });
    return { items, truncated: all.length > MAX_PRODUCTS };
  });
  await rememberProducts(shop, list.items);
  return {
    items: list.items.map((p) => ({ ...p, url: productUrl(shop, p.productId) })),
    truncated: list.truncated,
    fetchedAt: new Date().toISOString(),
  };
}

async function eachLimit<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}
