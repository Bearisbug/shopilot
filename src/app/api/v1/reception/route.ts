import { route } from "@/server/http/route";
import { getReception } from "@/server/reception/service";

// API-RCP-001
export const GET = route({ auth: "member", perm: "reception.manage", handler: ({ ctx }) => getReception(ctx) });
