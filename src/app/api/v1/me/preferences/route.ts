import { preferencesBody } from "@/contracts/auth";
import { updatePreferences } from "@/server/account/service";
import { route } from "@/server/http/route";

// API-AUTH-011
export const PUT = route({ auth: "member", allowTwoFactorPending: true, body: preferencesBody, handler: ({ ctx, body }) => updatePreferences(ctx, body) });
