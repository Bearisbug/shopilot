import { salesLeadBody } from "@/contracts/billing";
import { createSalesLead } from "@/server/billing/service";
import { json, route } from "@/server/http/route";

// API-BILL-009
export const POST = route({ auth: "member", perm: "billing.manage", body: salesLeadBody, idempotency: "optional", handler: async ({ ctx, body }) => json(await createSalesLead(ctx, body), 201) });
