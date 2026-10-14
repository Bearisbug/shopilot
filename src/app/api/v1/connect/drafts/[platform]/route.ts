import { draftBody } from "@/contracts/shops";
import { route } from "@/server/http/route";
import { getDraft, parsePlatform, saveDraft } from "@/server/shops/connect";

// API-SHOP-001
export const GET = route({ auth: "member", perm: "shops.manage", handler: ({ ctx, params }) => getDraft(ctx, parsePlatform(params.platform)) });

// API-SHOP-002
export const PUT = route({ auth: "member", perm: "shops.manage", body: draftBody, handler: ({ ctx, params, body }) => saveDraft(ctx, parsePlatform(params.platform), body) });
