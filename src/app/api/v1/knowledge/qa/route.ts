import { qaBody, qaListQuery } from "@/contracts/knowledge";
import { json, route } from "@/server/http/route";
import { createQa, listQa } from "@/server/knowledge/qa";

// API-KB-013
export const GET = route({ auth: "member", perm: "knowledge.manage", query: qaListQuery, handler: ({ ctx, query }) => listQa(ctx, query) });

// API-KB-014：手写问答保存即发布
export const POST = route({ auth: "member", perm: "knowledge.manage", body: qaBody, idempotency: "optional", handler: async ({ ctx, body }) => json(await createQa(ctx, body), 201) });
