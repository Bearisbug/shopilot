// 商品卡片的商品信息（标题、主图、价格、平台商品页链接）：会话详情只读缓存，缺失或超过 24 小时的排后台任务 product.fetch 去平台取。
// 取不到（TikTok 店没有商品读取权限、商品已删、店铺不可用）也记一行 unavailable，24 小时内不再重试；卡片照常显示「商品 <ID>」与链接。
import { and, eq, inArray, sql } from "drizzle-orm";
import type { ProductCardInfo } from "@/contracts/conversations";
import { db, schema } from "@/server/db/client";
import { enqueue } from "@/server/jobs/boss";
import { ShopUnavailableError, withShop, type ShopRow } from "@/server/platforms/clients";
import { shopeeProduct } from "@/server/platforms/shopee";
import { tiktokProduct } from "@/server/platforms/tiktok";
import { PlatformError, type ProductDetail } from "@/server/platforms/types";

const TTL_MS = 24 * 3600_000;

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

/** 会话详情用：按商品 ID 取缓存的商品信息，缺失或过期的顺手排一次后台抓取（同一商品同时只排一个） */
export async function productCards(shop: ShopRow, ids: string[]): Promise<Record<string, ProductCardInfo>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const rows = await db()
    .select()
    .from(schema.productInfo)
    .where(and(eq(schema.productInfo.shopId, shop.id), inArray(schema.productInfo.externalProductId, uniq)));
  const byId = new Map(rows.map((r) => [r.externalProductId, r]));
  const out: Record<string, ProductCardInfo> = {};
  for (const id of uniq) {
    const r = byId.get(id);
    if (!r || Date.now() - r.fetchedAt.getTime() > TTL_MS) await enqueue("product.fetch", { shopId: shop.id, productId: id }, { singletonKey: `${shop.id}:${id}` });
    const ok = r?.status === "ok";
    out[id] = {
      name: ok ? r.name : null,
      imageUrl: ok ? r.imageUrl : null,
      priceMin: ok ? r.priceMin : null,
      priceMax: ok ? r.priceMax : null,
      currency: ok ? r.currency : null,
      url: productUrl(shop, id),
    };
  }
  return out;
}

async function save(shop: ShopRow, productId: string, d: ProductDetail | null) {
  const values = d
    ? { status: "ok" as const, name: d.name || null, imageUrl: d.imageUrl, priceMin: d.priceMin, priceMax: d.priceMax, currency: d.currency }
    : { status: "unavailable" as const, name: null, imageUrl: null, priceMin: null, priceMax: null, currency: null };
  await db()
    .insert(schema.productInfo)
    .values({ merchantId: shop.merchantId, shopId: shop.id, externalProductId: productId, ...values, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: [schema.productInfo.shopId, schema.productInfo.externalProductId], set: { ...values, fetchedAt: sql`now()` } });
}

/** product.fetch：取一个商品的标题、主图、价格写进缓存 */
export async function fetchProduct(data: Record<string, unknown>): Promise<void> {
  const shopId = String(data.shopId ?? "");
  const productId = String(data.productId ?? "");
  const [shop] = await db().select().from(schema.shop).where(eq(schema.shop.id, shopId)).limit(1);
  if (!shop || !productId) return;
  if (!shop.capabilities.productScope) return save(shop, productId, null);
  try {
    const d = await withShop(shopId, (c) => (c.platform === "shopee" ? shopeeProduct(c.app, c.auth, productId) : tiktokProduct(c.app, c.auth, productId)));
    await save(shop, productId, d);
  } catch (e) {
    // 没有权限、商品不存在、参数不对、店铺不可用：记为取不到；超时、5xx 之类交给队列重试
    if (e instanceof ShopUnavailableError || (e instanceof PlatformError && ["auth", "forbidden", "not_found", "param", "state"].includes(e.kind))) return save(shop, productId, null);
    throw e;
  }
}
