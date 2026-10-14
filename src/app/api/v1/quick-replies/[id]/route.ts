import { quickReplyPatch } from "@/contracts/reception";
import { route } from "@/server/http/route";
import { deleteQuickReply, updateQuickReply } from "@/server/reception/service";

// API-RCP-009
export const PATCH = route({ auth: "member", perm: "reception.manage", body: quickReplyPatch, handler: ({ ctx, body, params }) => updateQuickReply(ctx, String(params.id), body) });

// API-RCP-010
export const DELETE = route({
  auth: "member",
  perm: "reception.manage",
  handler: async ({ ctx, params }) => {
    await deleteQuickReply(ctx, String(params.id));
    return new Response(null, { status: 204 });
  },
});
