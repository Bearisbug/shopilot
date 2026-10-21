import { learningProposalBody } from "@/contracts/cards";
import { route } from "@/server/http/route";
import { publishLearning } from "@/server/knowledge/learning";

// API-KB-041：最近一次复测通过且内容没再改才发布
export const POST = route({ auth: "member", perm: "knowledge.manage", body: learningProposalBody, handler: ({ ctx, params, body }) => publishLearning(ctx, String(params.id), body) });
