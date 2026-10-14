import { changePlanBody } from "@/contracts/billing";
import { changePlan } from "@/server/billing/service";
import { route } from "@/server/http/route";

// API-BILL-003：仅所有者（其他管理员 403 /errors/owner-only）
export const POST = route({ auth: "member", perm: ["billing.manage", "billing.owner"], body: changePlanBody, idempotency: "optional", handler: ({ ctx, body }) => changePlan(ctx, body) });
