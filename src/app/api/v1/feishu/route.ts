import { feishuConnectBody, feishuToggleBody } from "@/contracts/feishu";
import { connectFeishu, disconnectFeishu, feishuView, updateFeishuToggles } from "@/server/feishu/settings";
import { route } from "@/server/http/route";

// API-SET-017：飞书推送设置（接法、群、开关、最近一次失败）
export const GET = route({ auth: "member", perm: "settings.manage", handler: ({ ctx }) => feishuView(ctx) });

// API-SET-018：选接法并保存；应用接法先换 tenant_access_token 校验
export const PUT = route({ auth: "member", perm: "settings.manage", body: feishuConnectBody, handler: ({ ctx, body }) => connectFeishu(ctx, body) });

// API-SET-019：两个推送开关
export const PATCH = route({ auth: "member", perm: "settings.manage", body: feishuToggleBody, handler: ({ ctx, body }) => updateFeishuToggles(ctx, body) });

// API-SET-020：断开飞书（删除凭证与全部群设置）
export const DELETE = route({ auth: "member", perm: "settings.manage", handler: ({ ctx }) => disconnectFeishu(ctx) });
