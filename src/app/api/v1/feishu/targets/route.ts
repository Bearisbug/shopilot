import { feishuTargetBody } from "@/contracts/feishu";
import { saveFeishuTarget } from "@/server/feishu/settings";
import { route } from "@/server/http/route";

// API-SET-022：设默认群或某店的群
export const POST = route({ auth: "member", perm: "settings.manage", body: feishuTargetBody, handler: ({ ctx, body }) => saveFeishuTarget(ctx, body) });
