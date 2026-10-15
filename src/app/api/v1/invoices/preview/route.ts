import { z } from "zod";
import { route } from "@/server/http/route";
import { invoicePreview } from "@/server/invoices/profile";

// 开票弹层：订单所在店的开票资料缺哪些项、按开票资料算出的金额
export const GET = route({ auth: "member", perm: "orders.use", query: z.object({ orderId: z.string().uuid() }), handler: ({ ctx, query }) => invoicePreview(ctx, query.orderId) });
