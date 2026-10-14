import { notificationRulesBody } from "@/contracts/settings";
import { route } from "@/server/http/route";
import { notificationRules, updateNotificationRules } from "@/server/settings/service";

// API-SET-003
export const GET = route({ auth: "member", perm: "settings.manage", handler: ({ ctx }) => notificationRules(ctx) });

// API-SET-004
export const PUT = route({ auth: "member", perm: "settings.manage", body: notificationRulesBody, handler: ({ ctx, body }) => updateNotificationRules(ctx, body) });
