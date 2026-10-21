// 产品清单（API-KB-020 至 API-KB-025）：物料编码 → 官方产品名称（+ 别名）；平台商品按卖家 SKU = 物料编码对应到产品。
// 对应关系存在 product_listing：拉商品目录时写入（catalog.ts），产品清单变更时按编码重算。比较编码时去首尾空白、不分大小写。
import { and, asc, count, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { ShopProduct } from "@/contracts/conversations";
import { PRODUCT_ALIAS_MAX, PRODUCT_ALIASES_MAX, PRODUCT_CODE_MAX, PRODUCT_IMPORT_ROWS_MAX, PRODUCT_LIMIT, PRODUCT_NAME_MAX, type Product, type ProductImportResult, type ProductList, type ProductPatch, type UnmappedListings } from "@/contracts/products";
import { charCount } from "@/contracts/reception";
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { db, schema, type Executor } from "@/server/db/client";
import { conflict, notAllowed, notFound } from "@/server/http/problem";
import { enqueue } from "@/server/jobs/boss";
import type { ShopRow } from "@/server/platforms/clients";

const p = schema.product;
const pl = schema.productListing;
type ProductRow = typeof p.$inferSelect;

export const normCode = (s: string) => s.trim().toUpperCase();

async function productViews(rows: ProductRow[]): Promise<Product[]> {
  if (rows.length === 0) return [];
  const counts = await db()
    .select({ id: pl.productId, n: count() })
    .from(pl)
    .where(inArray(pl.productId, rows.map((r) => r.id)))
    .groupBy(pl.productId);
  const n = new Map(counts.map((c) => [c.id, c.n]));
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, aliases: r.aliases, listingCount: n.get(r.id) ?? 0, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt?.toISOString() ?? null }));
}

export async function listProducts(ctx: MemberContext, query: { q?: string }): Promise<ProductList> {
  const where = [eq(p.merchantId, ctx.merchant.id)];
  if (query.q) {
    const like = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(sql`(${p.code} ilike ${like} or ${p.name} ilike ${like} or array_to_string(${p.aliases}, ' ') ilike ${like})`);
  }
  const rows = await db().select().from(p).where(and(...where)).orderBy(asc(p.code)).limit(PRODUCT_LIMIT);
  const [{ n }] = await db().select({ n: count() }).from(p).where(eq(p.merchantId, ctx.merchant.id));
  return { items: await productViews(rows), total: n, limit: PRODUCT_LIMIT };
}

type ParsedRow = { line: number; code: string; name: string; aliases: string[] | null };

/** 一行按制表符（有就用）或逗号切开，去掉成对的引号；别名列按「;」或「；」再切 */
function splitLine(line: string): string[] {
  const sep = line.includes("\t") ? "\t" : ",";
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/** 解析粘贴的产品清单；表头（首个非空行含「编码」或 code）跳过；同一编码后出现的行报错 */
export function parseProductImport(text: string): { rows: ParsedRow[]; skipped: number; errors: Array<{ line: number; message: string }> } {
  const rows: ParsedRow[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  let skipped = 0;
  let seenContent = false;
  const seen = new Map<string, number>();
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  for (const [i, raw] of lines.entries()) {
    const line = i + 1;
    if (!raw.trim()) {
      skipped += 1;
      continue;
    }
    const cells = splitLine(raw);
    if (!seenContent) {
      seenContent = true;
      if (/编码|物料|code/i.test(cells[0] ?? "")) {
        skipped += 1;
        continue;
      }
    }
    const [code = "", name = "", aliasCell] = cells;
    if (!code) {
      errors.push({ line, message: "缺少物料编码" });
      continue;
    }
    if (charCount(code) > PRODUCT_CODE_MAX) {
      errors.push({ line, message: `物料编码最多 ${PRODUCT_CODE_MAX} 个字` });
      continue;
    }
    if (!name) {
      errors.push({ line, message: "缺少官方产品名称" });
      continue;
    }
    if (charCount(name) > PRODUCT_NAME_MAX) {
      errors.push({ line, message: `产品名称最多 ${PRODUCT_NAME_MAX} 个字` });
      continue;
    }
    const aliases = aliasCell === undefined || aliasCell === "" ? null : [...new Set(aliasCell.split(/[;；]/).map((a) => a.trim()).filter(Boolean))];
    if (aliases && aliases.length > PRODUCT_ALIASES_MAX) {
      errors.push({ line, message: `别名最多 ${PRODUCT_ALIASES_MAX} 个` });
      continue;
    }
    if (aliases?.some((a) => charCount(a) > PRODUCT_ALIAS_MAX)) {
      errors.push({ line, message: `每个别名最多 ${PRODUCT_ALIAS_MAX} 个字` });
      continue;
    }
    const key = normCode(code);
    const first = seen.get(key);
    if (first !== undefined) {
      errors.push({ line, message: `物料编码和第 ${first} 行重复` });
      continue;
    }
    seen.set(key, line);
    rows.push({ line, code, name, aliases });
  }
  return { rows, skipped, errors };
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** API-KB-021：按物料编码新增或更新；别名列为空时保留原有别名；超过 2,000 行 422 */
export async function importProducts(ctx: MemberContext, text: string): Promise<ProductImportResult> {
  const parsed = parseProductImport(text);
  if (parsed.rows.length + parsed.errors.length > PRODUCT_IMPORT_ROWS_MAX) throw notAllowed(`一次最多导入 ${PRODUCT_IMPORT_ROWS_MAX.toLocaleString("en-US")} 行，请分批导入。`, "too_many_rows");
  const merchantId = ctx.merchant.id;
  const existing = await db().select().from(p).where(eq(p.merchantId, merchantId));
  const byCode = new Map(existing.map((r) => [normCode(r.code), r]));
  const fresh = parsed.rows.filter((r) => !byCode.has(normCode(r.code)));
  if (existing.length + fresh.length > PRODUCT_LIMIT) throw notAllowed(`产品清单最多 ${PRODUCT_LIMIT.toLocaleString("en-US")} 个。`, "product_limit");
  let created = 0;
  let updated = 0;
  let skipped = parsed.skipped;
  await db().transaction(async (tx) => {
    for (const r of parsed.rows) {
      const cur = byCode.get(normCode(r.code));
      if (!cur) {
        await tx.insert(p).values({ merchantId, code: r.code, name: r.name, aliases: r.aliases ?? [] });
        created += 1;
      } else if (cur.name !== r.name || (r.aliases && !sameList(cur.aliases, r.aliases))) {
        await tx
          .update(p)
          .set({ name: r.name, ...(r.aliases ? { aliases: r.aliases } : {}), updatedAt: new Date() })
          .where(eq(p.id, cur.id));
        updated += 1;
      } else skipped += 1;
    }
    await recomputeListings(merchantId, tx);
    await audit(ctx.actor, { module: "reception", action: "products_imported", summary: `导入产品清单：新增 ${created}、更新 ${updated}`, targetType: "merchant", targetId: merchantId, data: { created, updated, skipped, errors: parsed.errors.length } }, tx);
  });
  return { created, updated, skipped, errors: parsed.errors };
}

async function loadProduct(merchantId: string, id: string): Promise<ProductRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  const [row] = await db().select().from(p).where(and(eq(p.id, id), eq(p.merchantId, merchantId))).limit(1);
  if (!row) throw notFound("产品不存在或已删除。");
  return row;
}

/** API-KB-022：改名称与别名，编码不能改 */
export async function updateProduct(ctx: MemberContext, id: string, body: ProductPatch): Promise<{ product: Product }> {
  const row = await loadProduct(ctx.merchant.id, id);
  const [updated] = await db()
    .update(p)
    .set({ ...(body.name !== undefined ? { name: body.name } : {}), ...(body.aliases !== undefined ? { aliases: body.aliases } : {}), updatedAt: new Date() })
    .where(eq(p.id, row.id))
    .returning();
  await audit(ctx.actor, { module: "reception", action: "product_updated", summary: `修改产品「${row.code}」`, targetType: "product", targetId: row.id, data: { name: body.name !== undefined, aliases: body.aliases !== undefined } });
  return { product: (await productViews([updated]))[0] };
}

/** API-KB-023：还有问答关联这个产品时 409（删了会让那些问答失去适用范围，先改问答） */
export async function deleteProduct(ctx: MemberContext, id: string): Promise<void> {
  const row = await loadProduct(ctx.merchant.id, id);
  const [{ n }] = await db()
    .select({ n: count() })
    .from(schema.knowledgeQa)
    .where(and(eq(schema.knowledgeQa.merchantId, ctx.merchant.id), sql`${row.id}::uuid = any(${schema.knowledgeQa.productIds})`));
  if (n > 0) throw conflict(`有 ${n} 条问答关联这个产品，请先在问答里去掉它再删除。`, { qaCount: n }, "product_in_use");
  await db().transaction(async (tx) => {
    await tx.delete(p).where(eq(p.id, row.id));
    await audit(ctx.actor, { module: "reception", action: "product_deleted", summary: `删除产品「${row.code}」`, targetType: "product", targetId: row.id }, tx);
  });
}

/** 按编码重算 product_listing.product_id（产品清单变更后调用） */
export async function recomputeListings(merchantId: string, tx: Executor = db()): Promise<void> {
  await tx.execute(sql`
    update product_listing pl set product_id = m.id
    from product m
    where pl.merchant_id = ${merchantId} and m.merchant_id = ${merchantId} and upper(trim(m.code)) = upper(trim(pl.sku))
      and pl.product_id is distinct from m.id`);
  await tx.execute(sql`
    update product_listing pl set product_id = null
    where pl.merchant_id = ${merchantId} and pl.product_id is not null
      and not exists (select 1 from product m where m.merchant_id = ${merchantId} and upper(trim(m.code)) = upper(trim(pl.sku)))`);
}

/**
 * 拉到商品目录后写对应关系：每个商品的每个卖家 SKU 一行，按编码对应产品；
 * 目录没被截断时删掉这家店本轮没出现的旧行（下架、删除、改了 SKU 的）。
 */
export async function writeListings(shop: Pick<ShopRow, "id" | "merchantId">, items: Array<Pick<ShopProduct, "productId" | "skus">>, truncated: boolean): Promise<void> {
  const started = new Date();
  const pairs = items.flatMap((i) => [...new Set(i.skus.map((s) => s.trim()).filter(Boolean))].map((sku) => ({ externalProductId: i.productId, sku })));
  const products = await db().select({ id: p.id, code: p.code }).from(p).where(eq(p.merchantId, shop.merchantId));
  const idOf = new Map(products.map((r) => [normCode(r.code), r.id]));
  for (let i = 0; i < pairs.length; i += 500) {
    const values = pairs.slice(i, i + 500).map((x) => ({ merchantId: shop.merchantId, shopId: shop.id, externalProductId: x.externalProductId, sku: x.sku, productId: idOf.get(normCode(x.sku)) ?? null, updatedAt: started }));
    await db()
      .insert(pl)
      .values(values)
      .onConflictDoUpdate({ target: [pl.shopId, pl.externalProductId, pl.sku], set: { productId: sql`excluded.product_id`, updatedAt: sql`excluded.updated_at` } });
  }
  if (!truncated) await db().delete(pl).where(and(eq(pl.shopId, shop.id), lt(pl.updatedAt, started)));
}

/** API-KB-024：卖家 SKU 没对应到产品的平台商品，按店铺分组，最多 500 条 */
export async function unmappedListings(ctx: MemberContext): Promise<UnmappedListings> {
  const rows = await db()
    .select({ shopId: schema.shop.id, shopName: schema.shop.name, platform: schema.shop.platform, market: schema.shop.market, externalProductId: pl.externalProductId, sku: pl.sku, name: schema.productInfo.name })
    .from(pl)
    .innerJoin(schema.shop, eq(schema.shop.id, pl.shopId))
    .leftJoin(schema.productInfo, and(eq(schema.productInfo.shopId, pl.shopId), eq(schema.productInfo.externalProductId, pl.externalProductId)))
    .where(and(eq(pl.merchantId, ctx.merchant.id), isNull(pl.productId)))
    .orderBy(asc(schema.shop.name), asc(pl.sku))
    .limit(500);
  const [{ n }] = await db()
    .select({ n: count() })
    .from(pl)
    .where(and(eq(pl.merchantId, ctx.merchant.id), isNull(pl.productId)));
  const shops = new Map<string, UnmappedListings["shops"][number]>();
  for (const r of rows) {
    const g = shops.get(r.shopId) ?? { shop: { id: r.shopId, name: r.shopName, platform: r.platform, market: r.market }, items: [] };
    g.items.push({ externalProductId: r.externalProductId, sku: r.sku, name: r.name });
    shops.set(r.shopId, g);
  }
  return { shops: [...shops.values()], total: n };
}

/** 可以拉商品目录的店：已连接且授予了商品读取权限 */
async function catalogShops(merchantId: string): Promise<ShopRow[]> {
  const rows = await db()
    .select()
    .from(schema.shop)
    .where(and(eq(schema.shop.merchantId, merchantId), eq(schema.shop.status, "connected")));
  return rows.filter((s) => s.capabilities.productScope);
}

/** API-KB-025：排队重新拉各店商品目录（写对应关系）；导入产品清单后也会排一次 */
export async function queueListingSync(ctx: MemberContext): Promise<{ queuedShops: number }> {
  const shops = await catalogShops(ctx.merchant.id);
  if (shops.length) await enqueue("product.listing_sync", { merchantId: ctx.merchant.id }, { singletonKey: ctx.merchant.id });
  return { queuedShops: shops.length };
}

/** product.listing_sync：逐店强制刷新商品目录（catalog.ts 拉到后写 product_listing）；单店失败不影响其他店 */
export async function syncListings(data: Record<string, unknown>): Promise<void> {
  const merchantId = String(data.merchantId ?? "");
  if (!merchantId) return;
  const { shopProducts } = await import("./catalog");
  for (const shop of await catalogShops(merchantId)) {
    try {
      await shopProducts(shop, true);
    } catch (e) {
      console.log(JSON.stringify({ t: new Date().toISOString(), level: "warn", msg: "listing sync failed", shopId: shop.id, err: e instanceof Error ? e.message : String(e) }));
    }
  }
}

/**
 * 识别买家在问的产品（§12.8「问答检索」的产品过滤）：按优先级取第一个有结果的来源——
 * ① 最近消息里买家发的商品卡 → product_listing；② 该买家近 180 天本店订单的商品（卖家 SKU = 物料编码，或平台商品 → product_listing）；
 * ③ 买家最近文字里出现的物料编码、产品名或别名（3 个字以上才比）。都没有返回空数组。
 */
export async function identifyProducts(input: IdentifyInput): Promise<string[]> {
  return (await identifyProductsWithBasis(input)).ids;
}

type IdentifyInput = { merchantId: string; shopId: string; buyerExternalId: string; productCardIds: string[]; buyerTexts: string[] };
/** 识别出的产品来自哪一处：商品卡、订单商品、消息文字；都没有为 null */
export type ProductBasis = "card" | "order" | "text" | null;

/** 同 identifyProducts，另给出依据（学习任务记「依据：…」） */
export async function identifyProductsWithBasis(input: IdentifyInput): Promise<{ ids: string[]; basis: ProductBasis }> {
  const viaListings = async (externalIds: string[]) => {
    if (!externalIds.length) return [];
    const rows = await db()
      .selectDistinct({ id: pl.productId })
      .from(pl)
      .where(and(eq(pl.shopId, input.shopId), inArray(pl.externalProductId, externalIds)));
    return rows.map((r) => r.id).filter((v): v is string => !!v);
  };
  const cards = await viaListings([...new Set(input.productCardIds.filter(Boolean))]);
  if (cards.length) return { ids: [...new Set(cards)], basis: "card" };

  const orders = await db()
    .select({ items: schema.order.items })
    .from(schema.order)
    .where(and(eq(schema.order.shopId, input.shopId), eq(schema.order.buyerExternalId, input.buyerExternalId), sql`${schema.order.platformCreatedAt} > now() - interval '180 days'`))
    .limit(10);
  const items = orders.flatMap((o) => o.items);
  const skus = [...new Set(items.map((i) => i.sellerSku).filter((s): s is string => !!s).map(normCode))];
  const bySku = skus.length
    ? (await db().select({ id: p.id }).from(p).where(and(eq(p.merchantId, input.merchantId), inArray(sql`upper(trim(${p.code}))`, skus)))).map((r) => r.id)
    : [];
  const byListing = await viaListings([...new Set(items.map((i) => i.productId).filter((v): v is string => !!v))]);
  const fromOrders = [...new Set([...bySku, ...byListing])];
  if (fromOrders.length) return { ids: fromOrders, basis: "order" };

  const text = input.buyerTexts.join("\n").toLowerCase();
  if (!text.trim()) return { ids: [], basis: null };
  const all = await db().select({ id: p.id, code: p.code, name: p.name, aliases: p.aliases }).from(p).where(eq(p.merchantId, input.merchantId)).limit(PRODUCT_LIMIT);
  const ids = all.filter((r) => [r.code, r.name, ...r.aliases].some((w) => charCount(w.trim()) >= 3 && text.includes(w.trim().toLowerCase()))).map((r) => r.id);
  return { ids, basis: ids.length ? "text" : null };
}
