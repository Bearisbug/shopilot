import { route } from "@/server/http/route";
import { afterSaleDetail } from "@/server/orders/after-sales";

// API-ORD-005：售后单详情（含可做的处理）
export const GET = route({ auth: "member", perm: "orders.use", handler: ({ ctx, params }) => afterSaleDetail(ctx, String(params.id)) });
