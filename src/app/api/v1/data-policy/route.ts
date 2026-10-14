import { dataPolicyBody } from "@/contracts/settings";
import { route } from "@/server/http/route";
import { dataPolicy, updateDataPolicy } from "@/server/settings/service";

// API-SET-007
export const GET = route({ auth: "member", perm: "settings.manage", handler: ({ ctx }) => dataPolicy(ctx) });

// API-SET-008
export const PUT = route({ auth: "member", perm: "settings.manage", body: dataPolicyBody, handler: ({ ctx, body }) => updateDataPolicy(ctx, body) });
