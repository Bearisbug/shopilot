import { auth } from "@/server/auth/auth";
import { route } from "@/server/http/route";
import { previewInvitation } from "@/server/team/service";

// API-TEAM-005（公开）
export const GET = route({
  auth: "public",
  handler: async ({ params, req }) => {
    const session = await auth().api.getSession({ headers: req.headers });
    return previewInvitation(String(params.token), session?.user.email ?? null);
  },
});
