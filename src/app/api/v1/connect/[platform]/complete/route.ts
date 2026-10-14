import { completeBody } from "@/contracts/shops";
import { route } from "@/server/http/route";
import { complete, parsePlatform } from "@/server/shops/connect";

// API-SHOP-007
export const POST = route({ auth: "member", perm: "shops.manage", idempotency: "optional", body: completeBody, handler: ({ ctx, params, body }) => complete(ctx, parsePlatform(params.platform), body.initialMode) });
