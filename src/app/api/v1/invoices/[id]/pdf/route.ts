import { z } from "zod";
import { route } from "@/server/http/route";
import { invoicePdf } from "@/server/invoices/service";

// API-INV-004：下载发票 PDF；?inline=1 时按内嵌返回，供页面预览
export const GET = route({ auth: "member", perm: "orders.use", query: z.object({ inline: z.literal("1").optional() }), handler: ({ ctx, params, query }) => invoicePdf(ctx, String(params.id), query.inline === "1") });
