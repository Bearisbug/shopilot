import { acceptOwnershipBody } from "@/contracts/settings";
import { route } from "@/server/http/route";
import { acceptTransfer } from "@/server/settings/ownership";

// API-SET-014（须以受让人登录；令牌一次性）
export const POST = route({ auth: "session", body: acceptOwnershipBody, handler: ({ ctx, body }) => acceptTransfer(ctx, body.token) });
