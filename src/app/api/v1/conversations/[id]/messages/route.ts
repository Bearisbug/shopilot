import { sendBody } from "@/contracts/conversations";
import { SendFailed, sendMessage, toMessageItem } from "@/server/conversations/actions";
import { json, route } from "@/server/http/route";

// API-CONV-007：平台没发出时消息记为 failed，按 problem 返回 502 / 504（页面给「重试」）
export const POST = route({
  auth: "member",
  perm: "wb.handle",
  body: sendBody,
  handler: async ({ ctx, params, body }) => {
    try {
      const m = await sendMessage(ctx, String(params.id), body);
      return json({ message: toMessageItem(m, ctx.user.name) }, 201);
    } catch (e) {
      if (e instanceof SendFailed) throw e.problem;
      throw e;
    }
  },
});
