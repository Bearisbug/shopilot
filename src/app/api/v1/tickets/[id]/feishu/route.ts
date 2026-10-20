import { ticketForwardBody } from "@/contracts/tickets";
import { json, route } from "@/server/http/route";
import { forwardTicket, ticketForwardTargets } from "@/server/tickets/forward";

// API-TKT-009：转发弹窗可选的群
export const GET = route({ auth: "member", perm: "tickets.own", handler: ({ ctx, params }) => ticketForwardTargets(ctx, String(params.id)) });

// API-TKT-010：把工单转发成飞书卡片
export const POST = route({
  auth: "member",
  perm: "tickets.own",
  body: ticketForwardBody,
  idempotency: "optional",
  handler: async ({ ctx, params, body }) => json(await forwardTicket(ctx, String(params.id), body), 201),
});
