import { promptsBody } from "@/contracts/reception";
import { route } from "@/server/http/route";
import { savePrompts } from "@/server/reception/service";

// API-RCP-004
export const PUT = route({ auth: "member", perm: "reception.manage", body: promptsBody, handler: ({ ctx, body }) => savePrompts(ctx, body) });
