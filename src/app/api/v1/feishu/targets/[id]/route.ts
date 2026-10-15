import { removeFeishuTarget } from "@/server/feishu/settings";
import { route } from "@/server/http/route";

// API-SET-023：清除默认群，或让店铺改回跟随默认群
export const DELETE = route({ auth: "member", perm: "settings.manage", handler: ({ ctx, params }) => removeFeishuTarget(ctx, String(params.id)) });
