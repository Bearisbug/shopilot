import { cardVersionBody } from "@/contracts/cards";
import { route } from "@/server/http/route";
import { restoreCard } from "@/server/knowledge/cards";

// API-KB-035：已下架 → 已发布
export const POST = route({ auth: "member", perm: "knowledge.manage", body: cardVersionBody, handler: ({ ctx, params, body }) => restoreCard(ctx, String(params.id), body.version) });
