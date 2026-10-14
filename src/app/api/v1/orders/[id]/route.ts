import { route } from "@/server/http/route";
import { orderDetail } from "@/server/orders/service";

// API-ORD-002：订单详情 + 售后单 + 关联工单 + 发票
export const GET = route({ auth: "member", perm: "orders.use", handler: ({ ctx, params }) => orderDetail(ctx, String(params.id)) });
