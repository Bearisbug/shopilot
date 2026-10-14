import { json, route } from "@/server/http/route";
import { resetMemberPassword } from "@/server/team/service";

// API-TEAM-010
export const POST = route({ auth: "member", perm: "team.manage", handler: async ({ ctx, params }) => json(await resetMemberPassword(ctx, String(params.id)), 202) });
