import { z } from "zod";
import { charCount } from "./reception";

// 产品清单（DESIGN §8.8 API-KB-020 至 API-KB-025）：官方产品名称与物料编码一一对应，
// 平台商品按卖家 SKU（= 物料编码）自动对应到产品。读要求 knowledge.manage，写要求 products.manage（只给管理员）。

export const PRODUCT_CODE_MAX = 64;
export const PRODUCT_NAME_MAX = 200;
export const PRODUCT_ALIASES_MAX = 20;
export const PRODUCT_ALIAS_MAX = 100;
/** 一次导入最多 2,000 行、20 万字 */
export const PRODUCT_IMPORT_ROWS_MAX = 2000;
export const PRODUCT_IMPORT_TEXT_MAX = 200_000;
export const PRODUCT_LIMIT = 5000;

const zName = z
  .string()
  .trim()
  .refine((s) => charCount(s) >= 1, "请填写产品名称")
  .refine((s) => charCount(s) <= PRODUCT_NAME_MAX, `产品名称最多 ${PRODUCT_NAME_MAX} 个字`);
export const zProductAliases = z
  .array(z.string().trim().min(1, "别名不能为空").max(PRODUCT_ALIAS_MAX, `每个别名最多 ${PRODUCT_ALIAS_MAX} 个字`))
  .max(PRODUCT_ALIASES_MAX, `别名最多 ${PRODUCT_ALIASES_MAX} 个`)
  .refine((a) => new Set(a).size === a.length, "别名不能重复");

// ── 请求 ──

/**
 * API-KB-021：粘贴的 CSV / TSV 文本。每行「物料编码,官方产品名称[,别名;别名]」（制表符分隔也可）；
 * 首行像表头（含「编码」「code」）时跳过；空行跳过；按物料编码新增或更新，别名列为空时不改原有别名。
 */
export const productImportBody = z.object({
  text: z
    .string()
    .refine((s) => s.trim().length > 0, "请粘贴要导入的内容")
    .refine((s) => s.length <= PRODUCT_IMPORT_TEXT_MAX, `一次最多导入 ${PRODUCT_IMPORT_TEXT_MAX.toLocaleString("en-US")} 个字符`),
});
export type ProductImportBody = z.infer<typeof productImportBody>;

/** API-KB-022：改名称或别名；物料编码不能改（要改就删了重新导入） */
export const productPatch = z
  .object({ name: zName.optional(), aliases: zProductAliases.optional() })
  .refine((b) => b.name !== undefined || b.aliases !== undefined, "没有要修改的内容");
export type ProductPatch = z.infer<typeof productPatch>;

/** API-KB-020：q 按编码、名称、别名包含匹配（不分大小写） */
export const productsQuery = z.object({ q: z.string().trim().max(PRODUCT_NAME_MAX).optional() });

// ── 响应 ──

export type Product = {
  id: string;
  code: string;
  name: string;
  aliases: string[];
  /** 按卖家 SKU 对应到这个产品的平台商品数（不同店、不同规格各算一个） */
  listingCount: number;
  createdAt: string;
  updatedAt: string | null;
};

/** API-KB-020：全部产品，按物料编码排序 */
export type ProductList = { items: Product[]; total: number; limit: number };

/** API-KB-021 */
export type ProductImportResult = {
  created: number;
  updated: number;
  /** 空行、表头与内容没变的行 */
  skipped: number;
  /** line 是粘贴内容里的行号（从 1 开始） */
  errors: Array<{ line: number; message: string }>;
};

export type ProductResult = { product: Product };

/** API-KB-024：卖家 SKU 没对应到任何产品的平台商品，按店铺分组；只含拉过商品目录的店 */
export type UnmappedListings = {
  shops: Array<{
    shop: { id: string; name: string; platform: "shopee" | "tiktok"; market: string };
    items: Array<{ externalProductId: string; sku: string; name: string | null }>;
  }>;
  total: number;
};

/** API-KB-025：排队重新拉商品目录的店铺数（只算授予了商品读取权限的已连接店铺） */
export type ListingSyncResult = { queuedShops: number };
