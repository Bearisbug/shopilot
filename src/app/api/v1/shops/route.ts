import { shopsQuery } from "@/contracts/shops";
import { route } from "@/server/http/route";
import { listShops } from "@/server/shops/service";

// API-SHOP-008
export const GET = route({ auth: "member", perm: "shops.manage", query: shopsQuery, handler: ({ ctx, query }) => listShops(ctx, query) });
