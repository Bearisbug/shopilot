import { route } from "@/server/http/route";
import { resumeAutoapply } from "@/server/analysis/quality";

// API-KB-044：恢复 Agent 自动改卡（只给管理员）；没暂停时照常返回、不写审计
export const POST = route({ auth: "member", perm: "reception.manage", idempotency: "optional", handler: ({ ctx }) => resumeAutoapply(ctx) });
