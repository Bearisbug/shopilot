import { acceptInviteBody } from "@/contracts/team";
import { auth } from "@/server/auth/auth";
import { json, route } from "@/server/http/route";
import { acceptInvitation } from "@/server/team/service";

// API-TEAM-006（公开；令牌一次性）
export const POST = route({
  auth: "public",
  body: acceptInviteBody,
  handler: async ({ body, req, requestId }) => {
    const s = await auth().api.getSession({ headers: req.headers });
    const result = await acceptInvitation(req, body, s ? { userId: s.user.id, email: s.user.email, sessionId: s.session.id } : null, requestId);
    const res = json({ membership: result.membership });
    for (const c of result.cookies) res.headers.append("set-cookie", c);
    return res;
  },
});
