import { ticketNoteBody } from "@/contracts/tickets";
import { json, route } from "@/server/http/route";
import { addNote } from "@/server/tickets/service";

// API-TKT-006
export const POST = route({
  auth: "member",
  perm: "tickets.own",
  body: ticketNoteBody,
  idempotency: "optional",
  handler: async ({ ctx, params, body }) => json(await addNote(ctx, String(params.id), body.text), 201),
});
