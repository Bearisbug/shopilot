import { route } from "@/server/http/route";
import { agentStatus } from "@/server/analysis/quality";

// API-KB-045：Agent 自动改卡是否暂停、今天直接生效几次、最近 12 周的 AI 质量
export const GET = route({ auth: "member", perm: "knowledge.manage", handler: ({ ctx }) => agentStatus(ctx) });
