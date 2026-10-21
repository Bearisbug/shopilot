import { cardPatch } from "@/contracts/cards";
import { route } from "@/server/http/route";
import { deleteCard, getCard, updateCard } from "@/server/knowledge/cards";

// API-KB-031：卡与版本
export const GET = route({ auth: "member", perm: "knowledge.manage", handler: ({ ctx, params }) => getCard(ctx, String(params.id)) });

// API-KB-032：整张卡提交，写新版本；version 不一致 409
export const PATCH = route({ auth: "member", perm: "knowledge.manage", body: cardPatch, handler: ({ ctx, params, body }) => updateCard(ctx, String(params.id), body) });

// API-KB-033
export const DELETE = route({
  auth: "member",
  perm: "knowledge.manage",
  handler: async ({ ctx, params }) => {
    await deleteCard(ctx, String(params.id));
    return new Response(null, { status: 204 });
  },
});
