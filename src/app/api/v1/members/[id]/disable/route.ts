import { route } from "@/server/http/route";
import { disableMember } from "@/server/team/service";

// API-TEAM-008
export const POST = route({ auth: "member", perm: "team.manage", handler: ({ ctx, params }) => disableMember(ctx, String(params.id)) });
