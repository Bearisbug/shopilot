import { quickRepliesQuery, quickReplyBody } from "@/contracts/reception";
import { json, route } from "@/server/http/route";
import { createQuickReply, listQuickReplies } from "@/server/reception/service";

// API-CONV-014（全部成员可读）
export const GET = route({ auth: "member", query: quickRepliesQuery, handler: ({ ctx, query }) => listQuickReplies(ctx, query.stage) });

// API-RCP-008
export const POST = route({
  auth: "member",
  perm: "reception.manage",
  body: quickReplyBody,
  idempotency: "optional",
  handler: async ({ ctx, body }) => json(await createQuickReply(ctx, body), 201),
});
