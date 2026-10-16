import { unclaimBody } from "@/contracts/conversations";
import { unclaim } from "@/server/conversations/actions";
import { route } from "@/server/http/route";

// API-CONV-016
export const POST = route({
  auth: "member",
  perm: "wb.handle",
  body: unclaimBody,
  handler: async ({ ctx, params, body }) => {
    const c = await unclaim(ctx, String(params.id), body.version);
    return { id: c.id, handlingState: c.handlingState, claimedBy: c.claimedBy, version: c.version };
  },
});
