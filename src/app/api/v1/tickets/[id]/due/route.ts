import { ticketDueBody } from "@/contracts/tickets";
import { route } from "@/server/http/route";
import { changeDue } from "@/server/tickets/service";

// API-TKT-008
export const PATCH = route({ auth: "member", perm: "tickets.manage", body: ticketDueBody, handler: ({ ctx, params, body }) => changeDue(ctx, String(params.id), body.dueAt) });
