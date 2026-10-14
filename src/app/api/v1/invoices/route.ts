import { createInvoiceBody, invoicesQuery } from "@/contracts/orders";
import { route } from "@/server/http/route";
import { createInvoice, listInvoices } from "@/server/invoices/service";

// API-INV-003：发票记录
export const GET = route({ auth: "member", perm: "orders.use", query: invoicesQuery, handler: ({ ctx, query }) => listInvoices(ctx, query) });

// API-INV-002：开具并两路发送，幂等键必填
export const POST = route({ auth: "member", perm: "orders.use", body: createInvoiceBody, idempotency: "required", handler: ({ ctx, body }) => createInvoice(ctx, body) });
