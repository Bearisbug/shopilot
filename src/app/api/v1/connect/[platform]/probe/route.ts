import { route } from "@/server/http/route";
import { parsePlatform, probe } from "@/server/shops/connect";

// API-SHOP-006
export const GET = route({ auth: "member", perm: "shops.manage", handler: ({ ctx, params }) => probe(ctx, parsePlatform(params.platform)) });
