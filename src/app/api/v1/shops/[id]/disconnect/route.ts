import { disconnectBody } from "@/contracts/shops";
import { route } from "@/server/http/route";
import { disconnectShop } from "@/server/shops/service";

// API-SHOP-012
export const POST = route({ auth: "member", perm: "shops.manage", idempotency: "optional", body: disconnectBody, handler: ({ ctx, params, body }) => disconnectShop(ctx, String(params.id), body.keepHistory) });
