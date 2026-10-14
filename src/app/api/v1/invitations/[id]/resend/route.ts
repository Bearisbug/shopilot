import { route } from "@/server/http/route";
import { resendInvitation } from "@/server/team/service";

// API-TEAM-003
export const POST = route({ auth: "member", perm: "team.manage", idempotency: "optional", handler: ({ ctx, params }) => resendInvitation(ctx, String(params.id)) });
