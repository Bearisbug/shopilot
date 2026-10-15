import { json, route } from "@/server/http/route";
import { reparseDocument } from "@/server/knowledge/documents";

// API-KB-006：只从 ready、failed 发起，正在排队或解析时 409
export const POST = route({
  auth: "member",
  perm: "knowledge.manage",
  handler: async ({ ctx, params }) => json({ document: await reparseDocument(ctx, String(params.id)) }, 202),
});
