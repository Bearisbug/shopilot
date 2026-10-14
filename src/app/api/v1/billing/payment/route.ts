import { paymentBody } from "@/contracts/billing";
import { setPayment } from "@/server/billing/service";
import { route } from "@/server/http/route";

// API-BILL-007：仅所有者（其他管理员 403 /errors/owner-only）
export const PUT = route({ auth: "member", perm: ["billing.manage", "billing.owner"], body: paymentBody, handler: ({ ctx, body }) => setPayment(ctx, body) });
