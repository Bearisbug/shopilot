import { ordersQuery } from "@/contracts/orders";
import { route } from "@/server/http/route";
import { listOrders } from "@/server/orders/service";

// API-ORD-001：订单列表（?format=csv 导出）、售后待处理、同步状态
export const GET = route({ auth: "member", perm: "orders.use", query: ordersQuery, handler: ({ ctx, query }) => listOrders(ctx, query) });
