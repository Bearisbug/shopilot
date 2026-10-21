import { cardTestBody } from "@/contracts/cards";
import { route } from "@/server/http/route";
import { askKnowledge } from "@/server/knowledge/ask";

// API-KB-012：同出稿链路同步返回，不存草稿、不计出稿用量；每商户每分钟 20 次；带 card 时这张未保存的卡只在这次生效
export const POST = route({ auth: "member", perm: "knowledge.manage", body: cardTestBody, handler: ({ ctx, body }) => askKnowledge(ctx, body) });
