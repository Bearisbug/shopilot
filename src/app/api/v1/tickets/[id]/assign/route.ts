import { ticketAssignBody } from "@/contracts/tickets";
import { route } from "@/server/http/route";
import { assignTicket } from "@/server/tickets/service";

// API-TKT-005
export const POST = route({ auth: "member", perm: "tickets.manage", body: ticketAssignBody, handler: ({ ctx, params, body }) => assignTicket(ctx, String(params.id), body.assigneeId) });
