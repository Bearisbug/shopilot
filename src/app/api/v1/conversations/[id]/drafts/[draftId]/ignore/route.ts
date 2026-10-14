import { ignoreDraft } from "@/server/conversations/actions";
import { route } from "@/server/http/route";

// API-CONV-008
export const POST = route({
  auth: "member",
  perm: "wb.handle",
  handler: async ({ ctx, params }) => {
    await ignoreDraft(ctx, String(params.id), String(params.draftId));
    return { ok: true };
  },
});
