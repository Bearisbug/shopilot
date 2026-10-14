import { conversationsQuery } from "@/contracts/conversations";
import { listConversations } from "@/server/conversations/queries";
import { route } from "@/server/http/route";

// API-CONV-001
export const GET = route({ auth: "member", perm: "wb.handle", query: conversationsQuery, handler: ({ ctx, query }) => listConversations(ctx, query) });
