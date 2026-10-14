import { route } from "@/server/http/route";
import { invoicePdf } from "@/server/invoices/service";

// API-INV-004：下载发票 PDF
export const GET = route({ auth: "member", perm: "orders.use", handler: ({ ctx, params }) => invoicePdf(ctx, String(params.id)) });
