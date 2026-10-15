import { knowledgeTestBody } from "@/contracts/knowledge";
import { route } from "@/server/http/route";
import { askKnowledge } from "@/server/knowledge/ask";

// API-KB-012：同出稿链路同步返回，不存草稿、不计出稿用量；每商户每分钟 20 次
export const POST = route({ auth: "member", perm: "knowledge.manage", body: knowledgeTestBody, handler: ({ ctx, body }) => askKnowledge(ctx, body) });
