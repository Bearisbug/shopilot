import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { ShopProducts } from "@/contracts/conversations";
import { db, schema } from "@/server/db/client";
import { notAllowed, Problem } from "@/server/http/problem";
import { route } from "@/server/http/route";
import { ShopUnavailableError } from "@/server/platforms/clients";
import { PlatformError, platformErrorText } from "@/server/platforms/types";
import { shopProducts } from "@/server/products/catalog";

// 店铺在售商品目录（工作台「商品」页签）：?refresh=1 不用 10 分钟缓存
export const GET = route({
  auth: "member",
  perm: "wb.handle",
  query: z.object({ refresh: z.enum(["1"]).optional() }),
  handler: async ({ ctx, params, query }): Promise<ShopProducts> => {
    const id = String(params.id);
    const conds = [eq(schema.shop.id, id), eq(schema.shop.merchantId, ctx.merchant.id)];
    if (ctx.shopIds !== null) conds.push(inArray(schema.shop.id, ctx.shopIds.length ? ctx.shopIds : ["00000000-0000-0000-0000-000000000000"]));
    const [shop] = /^[0-9a-f-]{36}$/i.test(id) ? await db().select().from(schema.shop).where(and(...conds)).limit(1) : [];
    if (!shop) throw new Problem("not-found");
    try {
      return await shopProducts(shop, query.refresh === "1");
    } catch (e) {
      if (e instanceof PlatformError) throw new Problem(e.kind === "timeout" ? "platform-timeout" : "platform", { detail: platformErrorText(e) });
      if (e instanceof ShopUnavailableError) throw notAllowed(e.message, "shop_auth_expired");
      throw e;
    }
  },
});
