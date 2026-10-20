import { qaVersionBody } from "@/contracts/knowledge";
import { route } from "@/server/http/route";
import { restoreQa } from "@/server/knowledge/qa";

// API-KB-027：已下架 → 已发布
export const POST = route({ auth: "member", perm: "knowledge.manage", body: qaVersionBody, handler: ({ ctx, params, body }) => restoreQa(ctx, String(params.id), body.version) });
