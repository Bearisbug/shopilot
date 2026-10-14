import { alertsBody } from "@/contracts/billing";
import { setAlerts } from "@/server/billing/service";
import { route } from "@/server/http/route";

// API-BILL-006
export const PUT = route({ auth: "member", perm: "billing.manage", body: alertsBody, handler: ({ ctx, body }) => setAlerts(ctx, body) });
