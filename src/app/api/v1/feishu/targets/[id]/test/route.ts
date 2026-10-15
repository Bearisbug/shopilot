import { sendFeishuTest } from "@/server/feishu/settings";
import { route } from "@/server/http/route";

// API-SET-023：往这个群发一张测试卡片（同步发出，失败返回飞书给的原因）
export const POST = route({ auth: "member", perm: "settings.manage", handler: ({ ctx, params }) => sendFeishuTest(ctx, String(params.id)) });
