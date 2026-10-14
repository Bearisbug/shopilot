import { conversationQuery } from "@/contracts/conversations";
import { getConversation } from "@/server/conversations/queries";
import { route } from "@/server/http/route";

// API-CONV-002
export const GET = route({ auth: "member", perm: "wb.handle", query: conversationQuery, handler: ({ ctx, params, query }) => getConversation(ctx, String(params.id), query.before) });
