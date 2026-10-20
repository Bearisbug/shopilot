import { productImportBody } from "@/contracts/products";
import { route } from "@/server/http/route";
import { importProducts, queueListingSync } from "@/server/products/dictionary";

// API-KB-021：按物料编码新增或更新；导入后排一次重新拉各店商品目录（写卖家 SKU 对应）
export const POST = route({
  auth: "member",
  perm: "products.manage",
  body: productImportBody,
  handler: async ({ ctx, body }) => {
    const result = await importProducts(ctx, body.text);
    if (result.created || result.updated) await queueListingSync(ctx);
    return result;
  },
});
