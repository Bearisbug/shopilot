import { listSessions } from "@/server/account/service";
import { route } from "@/server/http/route";

// API-AUTH-009（本人；商户要求两步验证而未开启时也可用）
export const GET = route({ auth: "member", allowTwoFactorPending: true, handler: ({ ctx }) => listSessions(ctx) });
