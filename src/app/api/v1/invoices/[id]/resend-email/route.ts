import { resendInvoiceBody } from "@/contracts/orders";
import { route } from "@/server/http/route";
import { resendInvoiceEmail } from "@/server/invoices/service";

// API-INV-005：重发发票邮件（可换邮箱），幂等键可选
export const POST = route({ auth: "member", perm: "orders.use", body: resendInvoiceBody, idempotency: "optional", handler: ({ ctx, params, body }) => resendInvoiceEmail(ctx, String(params.id), body) });
