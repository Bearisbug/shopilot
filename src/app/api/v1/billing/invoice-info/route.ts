import { invoiceInfoBody } from "@/contracts/billing";
import { setInvoiceInfo } from "@/server/billing/service";
import { route } from "@/server/http/route";

// API-BILL-008
export const PUT = route({ auth: "member", perm: "billing.manage", body: invoiceInfoBody, handler: ({ ctx, body }) => setInvoiceInfo(ctx, body) });
