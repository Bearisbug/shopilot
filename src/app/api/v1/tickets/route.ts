import { createTicketBody, ticketListQuery } from "@/contracts/tickets";
import { csv, json, route } from "@/server/http/route";
import { boardTickets, createManualTicket, exportRows, listTickets } from "@/server/tickets/service";

// API-TKT-001：列表 / 看板 / CSV
export const GET = route({
  auth: "member",
  perm: "tickets.own",
  query: ticketListQuery,
  handler: async ({ ctx, query }) => {
    if (query.format === "csv") return csv("工单.csv", await exportRows(ctx, query));
    return query.view === "board" ? boardTickets(ctx, query) : listTickets(ctx, query);
  },
});

// API-TKT-003：手动建单（去重键即幂等；另接受 Idempotency-Key）
export const POST = route({
  auth: "member",
  perm: "tickets.own",
  body: createTicketBody,
  idempotency: "optional",
  handler: async ({ ctx, body }) => json(await createManualTicket(ctx, body), 201),
});
