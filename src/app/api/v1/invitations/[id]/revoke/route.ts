import { route } from "@/server/http/route";
import { revokeInvitation } from "@/server/team/service";

// API-TEAM-004
export const POST = route({ auth: "member", perm: "team.manage", handler: ({ ctx, params }) => revokeInvitation(ctx, String(params.id)) });
