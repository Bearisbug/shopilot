import { route } from "@/server/http/route";
import { buildMe } from "@/server/merchants/me";

// API-AUTH-006
export const GET = route({ auth: "member", allowTwoFactorPending: true, handler: async ({ ctx }) => buildMe(ctx) });
