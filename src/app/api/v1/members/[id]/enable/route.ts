import { route } from "@/server/http/route";
import { enableMember } from "@/server/team/service";

// API-TEAM-009
export const POST = route({ auth: "member", perm: "team.manage", handler: ({ ctx, params }) => enableMember(ctx, String(params.id)) });
