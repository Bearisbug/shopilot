import { assignBody } from "@/contracts/conversations";
import { assign } from "@/server/conversations/actions";
import { route } from "@/server/http/route";

// API-CONV-005
export const POST = route({
  auth: "member",
  perm: "wb.transfer",
  body: assignBody,
  handler: async ({ ctx, params, body }) => {
    const c = await assign(ctx, String(params.id), body);
    return { id: c.id, handlingState: c.handlingState, claimedBy: c.claimedBy, version: c.version };
  },
});
