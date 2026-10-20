import { qaPatch } from "@/contracts/knowledge";
import { route } from "@/server/http/route";
import { deleteQa, getQa, updateQa } from "@/server/knowledge/qa";

// API-KB-015
export const GET = route({ auth: "member", perm: "knowledge.manage", handler: ({ ctx, params }) => getQa(ctx, String(params.id)) });

// API-KB-016：version 不一致 409
export const PATCH = route({ auth: "member", perm: "knowledge.manage", body: qaPatch, handler: ({ ctx, params, body }) => updateQa(ctx, String(params.id), body) });

// API-KB-017
export const DELETE = route({
  auth: "member",
  perm: "knowledge.manage",
  handler: async ({ ctx, params }) => {
    await deleteQa(ctx, String(params.id));
    return new Response(null, { status: 204 });
  },
});
