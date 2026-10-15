import { listFeishuChats } from "@/server/feishu/settings";
import { route } from "@/server/http/route";

// API-SET-021：应用机器人所在的群
export const GET = route({ auth: "member", perm: "settings.manage", handler: ({ ctx }) => listFeishuChats(ctx) });
