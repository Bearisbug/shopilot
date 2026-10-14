import { securityPolicyBody } from "@/contracts/settings";
import { route } from "@/server/http/route";
import { securityPolicy, updateSecurityPolicy } from "@/server/settings/service";

// API-SET-005
export const GET = route({ auth: "member", perm: "settings.manage", handler: async ({ ctx }) => securityPolicy(ctx) });

// API-SET-006（新白名单不含当前请求 IP 时 422，防止把自己锁在外面）
export const PUT = route({ auth: "member", perm: "settings.manage", body: securityPolicyBody, handler: ({ ctx, body }) => updateSecurityPolicy(ctx, body) });
