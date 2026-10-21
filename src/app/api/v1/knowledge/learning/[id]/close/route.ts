import { learningCloseBody } from "@/contracts/cards";
import { route } from "@/server/http/route";
import { closeLearning } from "@/server/knowledge/learning";

// API-KB-043：无需更新或驳回
export const POST = route({ auth: "member", perm: "knowledge.manage", body: learningCloseBody, handler: ({ ctx, params, body }) => closeLearning(ctx, String(params.id), body) });
