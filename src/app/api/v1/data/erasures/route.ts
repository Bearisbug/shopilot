import { erasureBody } from "@/contracts/settings";
import { route } from "@/server/http/route";
import { eraseBuyer } from "@/server/settings/data";

// API-SET-009（找不到该买家时返回全 0；再删返回 0）
export const POST = route({ auth: "member", perm: "settings.manage", body: erasureBody, handler: ({ ctx, body }) => eraseBuyer(ctx, body) });
