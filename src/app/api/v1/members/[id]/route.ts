import { updateMemberBody } from "@/contracts/team";
import { route } from "@/server/http/route";
import { updateMember } from "@/server/team/service";

// API-TEAM-007
export const PATCH = route({ auth: "member", perm: "team.manage", body: updateMemberBody, handler: ({ ctx, body, params }) => updateMember(ctx, String(params.id), body) });
