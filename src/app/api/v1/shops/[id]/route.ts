import { z } from "zod";
import { SHOP_PERIODS } from "@/contracts/shops";
import { route } from "@/server/http/route";
import { shopDetail } from "@/server/shops/service";

// API-SHOP-009
export const GET = route({
  auth: "member",
  perm: "shops.manage",
  query: z.object({ period: z.enum(SHOP_PERIODS).default("7d") }),
  handler: ({ ctx, params, query }) => shopDetail(ctx, String(params.id), query.period),
});
