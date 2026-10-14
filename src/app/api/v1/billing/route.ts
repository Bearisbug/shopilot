import { billingQuery } from "@/contracts/billing";
import { getBilling } from "@/server/billing/service";
import { route } from "@/server/http/route";

// API-BILL-001
export const GET = route({ auth: "member", perm: "billing.manage", query: billingQuery, handler: ({ ctx, query }) => getBilling(ctx, query) });
