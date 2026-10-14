import { z } from "zod";
import { route } from "@/server/http/route";
import { parsePlatform } from "@/server/shops/connect";
import { rotateKey } from "@/server/shops/service";

// API-SHOP-011
export const POST = route({ auth: "member", perm: "shops.manage", idempotency: "optional", body: z.unknown(), handler: ({ ctx, params, body }) => rotateKey(ctx, parsePlatform(params.platform), body) });
