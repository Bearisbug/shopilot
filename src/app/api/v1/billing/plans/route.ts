import { getPlans } from "@/server/billing/service";
import { route } from "@/server/http/route";

// API-BILL-002
export const GET = route({ auth: "member", perm: "billing.manage", handler: ({ ctx }) => getPlans(ctx) });
