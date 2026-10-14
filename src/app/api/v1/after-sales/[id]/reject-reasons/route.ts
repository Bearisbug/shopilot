import { route } from "@/server/http/route";
import { rejectReasons } from "@/server/orders/after-sales";

// API-ORD-008：TikTok 拒绝原因（Shopee 409）
export const GET = route({ auth: "member", perm: "orders.use", handler: ({ ctx, params }) => rejectReasons(ctx, String(params.id)) });
