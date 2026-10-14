import { modesBody } from "@/contracts/reception";
import { route } from "@/server/http/route";
import { saveModes } from "@/server/reception/service";

// API-RCP-002
export const PUT = route({ auth: "member", perm: "reception.manage", body: modesBody, handler: ({ ctx, body }) => saveModes(ctx, body) });
