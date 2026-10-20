import { qaRejectBody } from "@/contracts/knowledge";
import { route } from "@/server/http/route";
import { rejectQa } from "@/server/knowledge/qa";

// API-KB-019：待审核 → 已驳回
export const POST = route({ auth: "member", perm: "knowledge.manage", body: qaRejectBody, handler: ({ ctx, params, body }) => rejectQa(ctx, String(params.id), body) });
