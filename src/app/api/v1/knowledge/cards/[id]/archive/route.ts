import { cardVersionBody } from "@/contracts/cards";
import { route } from "@/server/http/route";
import { archiveCard } from "@/server/knowledge/cards";

// API-KB-034：已发布 → 已下架（不参与出稿）
export const POST = route({ auth: "member", perm: "knowledge.manage", body: cardVersionBody, handler: ({ ctx, params, body }) => archiveCard(ctx, String(params.id), body.version) });
