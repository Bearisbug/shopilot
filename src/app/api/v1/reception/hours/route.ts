import { hoursBody } from "@/contracts/reception";
import { route } from "@/server/http/route";
import { saveHours } from "@/server/reception/service";

// API-RCP-003
export const PUT = route({ auth: "member", perm: "reception.manage", body: hoursBody, handler: ({ ctx, body }) => saveHours(ctx, body) });
