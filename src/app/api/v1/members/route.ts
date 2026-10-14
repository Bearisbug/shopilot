import { membersQuery } from "@/contracts/team";
import { route } from "@/server/http/route";
import { listMembers } from "@/server/team/service";

// API-TEAM-001
export const GET = route({ auth: "member", perm: "team.manage", query: membersQuery, handler: ({ ctx, query }) => listMembers(ctx, query) });
