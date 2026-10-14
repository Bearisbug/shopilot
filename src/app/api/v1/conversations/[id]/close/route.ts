import { closeBody } from "@/contracts/conversations";
import { closeConversation } from "@/server/conversations/actions";
import { route } from "@/server/http/route";

// API-CONV-006
export const POST = route({
  auth: "member",
  perm: "wb.handle",
  body: closeBody,
  handler: async ({ ctx, params, body }) => {
    const c = await closeConversation(ctx, String(params.id), body);
    return { id: c.id, handlingState: c.handlingState, version: c.version };
  },
});
