import { documentPatch } from "@/contracts/knowledge";
import { route } from "@/server/http/route";
import { deleteDocument, getDocument, updateDocument } from "@/server/knowledge/documents";

// API-KB-003
export const GET = route({ auth: "member", perm: "knowledge.manage", handler: ({ ctx, params }) => getDocument(ctx, String(params.id)) });

// API-KB-005：改分类、站点、AI 可用，立即生效，不重新解析
export const PATCH = route({
  auth: "member",
  perm: "knowledge.manage",
  body: documentPatch,
  handler: async ({ ctx, params, body }) => ({ document: await updateDocument(ctx, String(params.id), body) }),
});

// API-KB-007：删除中或已删除也返回 204
export const DELETE = route({
  auth: "member",
  perm: "knowledge.manage",
  handler: async ({ ctx, params }) => {
    await deleteDocument(ctx, String(params.id));
    return new Response(null, { status: 204 });
  },
});
