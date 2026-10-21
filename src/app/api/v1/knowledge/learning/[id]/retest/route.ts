import { learningProposalBody } from "@/contracts/cards";
import { route } from "@/server/http/route";
import { retestLearning } from "@/server/knowledge/learning";

// API-KB-040：用当前编辑的内容同步复测（≤ 60 秒）
export const POST = route({ auth: "member", perm: "knowledge.manage", body: learningProposalBody, handler: ({ ctx, params, body }) => retestLearning(ctx, String(params.id), body) });
