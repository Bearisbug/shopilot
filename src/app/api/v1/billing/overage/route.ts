import { overageBody } from "@/contracts/billing";
import { setOverage } from "@/server/billing/service";
import { route } from "@/server/http/route";

// API-BILL-005
export const PUT = route({ auth: "member", perm: "billing.manage", body: overageBody, handler: ({ ctx, body }) => setOverage(ctx, body) });
