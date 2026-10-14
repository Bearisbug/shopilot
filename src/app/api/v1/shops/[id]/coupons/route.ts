import { and, eq, inArray } from "drizzle-orm";
import type { CouponOption } from "@/contracts/conversations";
import { db, schema } from "@/server/db/client";
import { notAllowed, Problem } from "@/server/http/problem";
import { route } from "@/server/http/route";
import { ShopUnavailableError, withShop } from "@/server/platforms/clients";
import { tiktokChatCoupons } from "@/server/platforms/tiktok";
import { PlatformError, platformErrorText } from "@/server/platforms/types";

// API-CONV-013：只返回可在聊天发送的券
export const GET = route({
  auth: "member",
  perm: "wb.handle",
  handler: async ({ ctx, params }): Promise<{ items: CouponOption[] }> => {
    const id = String(params.id);
    const conds = [eq(schema.shop.id, id), eq(schema.shop.merchantId, ctx.merchant.id)];
    if (ctx.shopIds !== null) conds.push(inArray(schema.shop.id, ctx.shopIds.length ? ctx.shopIds : ["00000000-0000-0000-0000-000000000000"]));
    const [shop] = /^[0-9a-f-]{36}$/i.test(id) ? await db().select().from(schema.shop).where(and(...conds)).limit(1) : [];
    if (!shop) throw new Problem("not-found");
    if (shop.platform !== "tiktok") throw notAllowed("Shopee 店不支持在聊天里发优惠券。");
    try {
      return { items: await withShop(shop.id, (c) => (c.platform === "tiktok" ? tiktokChatCoupons(c.app, c.auth) : Promise.resolve([]))) };
    } catch (e) {
      if (e instanceof PlatformError) throw new Problem(e.kind === "timeout" ? "platform-timeout" : "platform", { detail: platformErrorText(e) });
      if (e instanceof ShopUnavailableError) throw notAllowed(e.message, "shop_auth_expired");
      throw e;
    }
  },
});
