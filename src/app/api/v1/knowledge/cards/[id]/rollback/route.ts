import { cardRollbackBody } from "@/contracts/cards";
import { route } from "@/server/http/route";
import { rollbackCard } from "@/server/knowledge/cards";

// API-KB-036：用第 toVersion 版的内容写一个新版本
export const POST = route({ auth: "member", perm: "knowledge.manage", body: cardRollbackBody, handler: ({ ctx, params, body }) => rollbackCard(ctx, String(params.id), body) });
