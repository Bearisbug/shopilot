import { qaApproveBody } from "@/contracts/knowledge";
import { route } from "@/server/http/route";
import { approveQa } from "@/server/knowledge/qa";

// API-KB-018：待审核 → 已发布，可同时带修改
export const POST = route({ auth: "member", perm: "knowledge.manage", body: qaApproveBody, handler: ({ ctx, params, body }) => approveQa(ctx, String(params.id), body) });
