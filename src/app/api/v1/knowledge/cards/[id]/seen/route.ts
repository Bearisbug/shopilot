import { cardVersionBody } from "@/contracts/cards";
import { route } from "@/server/http/route";
import { markCardSeen } from "@/server/knowledge/cards";

// API-KB-037：Agent 改过的当前版本标为已看
export const POST = route({ auth: "member", perm: "knowledge.manage", body: cardVersionBody, handler: ({ ctx, params, body }) => markCardSeen(ctx, String(params.id), body.version) });
