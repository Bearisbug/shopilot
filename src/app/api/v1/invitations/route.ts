import { inviteBody } from "@/contracts/team";
import { json, route } from "@/server/http/route";
import { invite } from "@/server/team/service";

// API-TEAM-002
export const POST = route({ auth: "member", perm: "team.manage", body: inviteBody, idempotency: "optional", handler: async ({ ctx, body }) => json(await invite(ctx, body), 201) });
