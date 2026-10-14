import { auditQuery } from "@/contracts/settings";
import { route } from "@/server/http/route";
import { auditLogs } from "@/server/settings/service";

// API-SET-012（?format=csv 导出）
export const GET = route({ auth: "member", perm: "settings.manage", query: auditQuery, handler: ({ ctx, query }) => auditLogs(ctx, query) });
