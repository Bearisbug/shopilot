import { z } from "zod";
import { route } from "@/server/http/route";
import { removeLogo, uploadLogo } from "@/server/invoices/profile";

// API-SET-021：上传发票 Logo（multipart：file，可选 shopId；PNG / JPG ≤ 1 MB），替换原有的
export const POST = route({ auth: "member", perm: "settings.manage", handler: ({ ctx, req }) => uploadLogo(ctx, req) });

// 删除 Logo；?shopId= 指定店铺，不带是商户默认
export const DELETE = route({
  auth: "member",
  perm: "settings.manage",
  query: z.object({ shopId: z.string().uuid().optional() }),
  handler: ({ ctx, query }) => removeLogo(ctx, query.shopId ?? null),
});
