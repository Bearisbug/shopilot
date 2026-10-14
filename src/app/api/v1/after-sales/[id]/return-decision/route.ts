import { returnDecisionBody } from "@/contracts/orders";
import { route } from "@/server/http/route";
import { decideReturn } from "@/server/orders/after-sales";

// API-ORD-007：处理退货退款，幂等键必填
export const POST = route({
  auth: "member",
  perm: "orders.use",
  body: returnDecisionBody,
  idempotency: "required",
  handler: ({ ctx, params, body }) => decideReturn(ctx, String(params.id), body),
});
