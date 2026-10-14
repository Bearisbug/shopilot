import { cancellationDecisionBody } from "@/contracts/orders";
import { route } from "@/server/http/route";
import { decideCancellation } from "@/server/orders/after-sales";

// API-ORD-006：同意 / 拒绝买家取消申请，幂等键必填
export const POST = route({
  auth: "member",
  perm: "orders.use",
  body: cancellationDecisionBody,
  idempotency: "required",
  handler: ({ ctx, params, body }) => decideCancellation(ctx, String(params.id), body),
});
