import { ticketStatusBody } from "@/contracts/tickets";
import { route } from "@/server/http/route";
import { changeStatus } from "@/server/tickets/service";

// API-TKT-004：只对手动类；目标状态相同返回 200
export const POST = route({ auth: "member", perm: "tickets.own", body: ticketStatusBody, handler: ({ ctx, params, body }) => changeStatus(ctx, String(params.id), body) });
