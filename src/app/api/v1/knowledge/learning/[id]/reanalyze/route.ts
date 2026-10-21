import { learningVersionBody } from "@/contracts/cards";
import { route } from "@/server/http/route";
import { reanalyzeLearning } from "@/server/knowledge/learning";

// API-KB-042：分析失败的重新分析
export const POST = route({ auth: "member", perm: "knowledge.manage", body: learningVersionBody, handler: ({ ctx, params, body }) => reanalyzeLearning(ctx, String(params.id), body.version) });
