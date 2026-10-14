import { retryMessage, SendFailed, toMessageItem } from "@/server/conversations/actions";
import { route } from "@/server/http/route";

// API-CONV-015
export const POST = route({
  auth: "member",
  perm: "wb.handle",
  handler: async ({ ctx, params }) => {
    try {
      const m = await retryMessage(ctx, String(params.id), String(params.messageId));
      return { message: toMessageItem(m, ctx.user.name) };
    } catch (e) {
      if (e instanceof SendFailed) throw e.problem;
      throw e;
    }
  },
});
