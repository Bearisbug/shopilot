import { json, route } from "@/server/http/route";
import { startQaExtract } from "@/server/knowledge/qa-extract";

// API-KB-028：资料解析完成才可整理，正在整理时 409；生成的候选待审核
export const POST = route({ auth: "member", perm: "knowledge.manage", handler: async ({ ctx, params }) => json(await startQaExtract(ctx, String(params.id)), 202) });
