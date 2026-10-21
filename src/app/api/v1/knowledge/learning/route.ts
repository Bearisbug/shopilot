import { learningListQuery } from "@/contracts/cards";
import { route } from "@/server/http/route";
import { listLearning } from "@/server/knowledge/learning";

// API-KB-038
export const GET = route({ auth: "member", perm: "knowledge.manage", query: learningListQuery, handler: ({ ctx, query }) => listLearning(ctx, query) });
