import { route } from "@/server/http/route";
import { getLearning } from "@/server/knowledge/learning";

// API-KB-039
export const GET = route({ auth: "member", perm: "knowledge.manage", handler: ({ ctx, params }) => getLearning(ctx, String(params.id)) });
