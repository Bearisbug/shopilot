import { route } from "@/server/http/route";
import { getTicket } from "@/server/tickets/service";

// API-TKT-002
export const GET = route({ auth: "member", perm: "tickets.own", handler: ({ ctx, params }) => getTicket(ctx, String(params.id)) });
