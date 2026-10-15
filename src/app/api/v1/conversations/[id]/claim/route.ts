import { claimBody } from "@/contracts/conversations";
import { claim } from "@/server/conversations/actions";
import { route } from "@/server/http/route";

// API-CONV-004
export const POST = route({
  auth: "member",
  perm: "wb.handle",
  body: claimBody,
  handler: async ({ ctx, params, body }) => {
    const c = await claim(ctx, String(params.id), body.version ?? null);
    return { id: c.id, handlingState: c.handlingState, claimedBy: c.claimedBy, version: c.version };
  },
});
