import { json, route } from "@/server/http/route";
import { listExports, requestExport } from "@/server/settings/data";

// API-SET-011
export const GET = route({ auth: "member", perm: "settings.manage", handler: async ({ ctx }) => ({ items: await listExports(ctx.merchant.id) }) });

// API-SET-010（已有进行中的导出时 409）
export const POST = route({ auth: "member", perm: "settings.manage", idempotency: "optional", handler: async ({ ctx }) => json(await requestExport(ctx), 202) });
