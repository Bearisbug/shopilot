import { revokeSessionBody } from "@/contracts/auth";
import { revokeSessions } from "@/server/account/service";
import { route } from "@/server/http/route";

// API-AUTH-010
export const POST = route({ auth: "member", allowTwoFactorPending: true, body: revokeSessionBody, handler: ({ ctx, body }) => revokeSessions(ctx, body) });
