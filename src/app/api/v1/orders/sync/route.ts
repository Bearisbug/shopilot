import { syncBody } from "@/contracts/orders";
import { route } from "@/server/http/route";
import { requestSync } from "@/server/orders/service";

// API-ORD-003：立即同步（202 { jobIds }；同店 60 秒内重复 429）
export const POST = route({ auth: "member", perm: "orders.use", body: syncBody, handler: ({ ctx, body }) => requestSync(ctx, body) });
