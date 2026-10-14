import { updateMerchantBody } from "@/contracts/settings";
import { route } from "@/server/http/route";
import { merchantView, updateMerchant } from "@/server/settings/service";

// API-SET-001
export const GET = route({ auth: "member", perm: "settings.manage", handler: ({ ctx }) => merchantView(ctx) });

// API-SET-002
export const PUT = route({ auth: "member", perm: "settings.manage", body: updateMerchantBody, handler: ({ ctx, body }) => updateMerchant(ctx, body) });
