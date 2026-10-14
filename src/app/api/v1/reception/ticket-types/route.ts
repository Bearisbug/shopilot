import { ticketTypesBody } from "@/contracts/reception";
import { route } from "@/server/http/route";
import { getTicketTypes, saveTicketTypes } from "@/server/reception/service";

// API-RCP-006
export const GET = route({ auth: "member", perm: "reception.manage", handler: ({ ctx }) => getTicketTypes(ctx) });

// API-RCP-007
export const PUT = route({ auth: "member", perm: "reception.manage", body: ticketTypesBody, handler: ({ ctx, body }) => saveTicketTypes(ctx, body) });
