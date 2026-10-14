import { cancelOrderBody } from "@/contracts/orders";
import { route } from "@/server/http/route";
import { cancelOrder } from "@/server/orders/service";

// API-ORD-004：发货前取消订单（买家要求），幂等键必填
export const POST = route({ auth: "member", perm: "orders.use", body: cancelOrderBody, idempotency: "required", handler: ({ ctx, params, body }) => cancelOrder(ctx, String(params.id), body) });
