import { qaVersionBody } from "@/contracts/knowledge";
import { route } from "@/server/http/route";
import { archiveQa } from "@/server/knowledge/qa";

// API-KB-026：已发布 → 已下架（不参与检索）
export const POST = route({ auth: "member", perm: "knowledge.manage", body: qaVersionBody, handler: ({ ctx, params, body }) => archiveQa(ctx, String(params.id), body.version) });
