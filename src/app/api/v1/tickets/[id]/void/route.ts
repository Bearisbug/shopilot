import { ticketVoidBody } from "@/contracts/tickets";
import { route } from "@/server/http/route";
import { voidTicket } from "@/server/tickets/service";

// API-TKT-007：已作废返回 200
export const POST = route({ auth: "member", perm: "tickets.manage", body: ticketVoidBody, handler: ({ ctx, params, body }) => voidTicket(ctx, String(params.id), body.reason) });
