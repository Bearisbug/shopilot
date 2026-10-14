import { authUrlBody } from "@/contracts/shops";
import { route } from "@/server/http/route";
import { createAuthUrl, parsePlatform } from "@/server/shops/connect";

// API-SHOP-004
export const POST = route({ auth: "member", perm: "shops.manage", body: authUrlBody, handler: ({ ctx, params, body }) => createAuthUrl(ctx, parsePlatform(params.platform), body) });
