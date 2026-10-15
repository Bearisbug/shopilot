// 飞书推送契约（商户设置 → 通知 → 飞书）。密钥字段只写不读：响应里没有 App Secret、webhook 地址与签名密钥。
import { z } from "zod";
import { zUuid } from "./common";

export type FeishuMethod = "app" | "webhook";

export type FeishuTargetView = {
  id: string;
  kind: "app_chat" | "webhook";
  /** 群名：应用接法是飞书里的群名，自定义机器人是管理员填的名字 */
  name: string;
  chatId: string | null;
  /** 自定义机器人地址末 4 位 */
  webhookHint: string | null;
};

export type FeishuView = {
  /** stub：本机替身，卡片只记进开发发件箱，不发到飞书 */
  mode: "stub" | "live";
  connection: { method: FeishuMethod; appId: string | null; status: "verified" | "invalid"; verifiedAt: string | null } | null;
  notifyUnclaimed: boolean;
  notifyOverdue: boolean;
  defaultTarget: FeishuTargetView | null;
  shops: Array<{ id: string; name: string; platform: "shopee" | "tiktok"; market: string; target: FeishuTargetView | null }>;
  /** 最近 7 天、且在本次接入之后，最新一次投递失败 */
  lastFailure: { at: string; targetName: string | null; kind: "unclaimed" | "overdue" | "test"; error: string } | null;
};

export const feishuConnectBody = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("app"),
    appId: z
      .string()
      .trim()
      .regex(/^cli_[A-Za-z0-9]{6,40}$/, "App ID 以 cli_ 开头，在飞书开放平台应用的「凭证与基础信息」页复制"),
    /** 同一个 App ID 已保存过时可不填，沿用已保存的 */
    appSecret: z.string().trim().max(200).optional(),
  }),
  z.object({ method: z.literal("webhook") }),
]);
export type FeishuConnectBody = z.infer<typeof feishuConnectBody>;

export const feishuToggleBody = z
  .object({ notifyUnclaimed: z.boolean().optional(), notifyOverdue: z.boolean().optional() })
  .refine((b) => b.notifyUnclaimed !== undefined || b.notifyOverdue !== undefined, "没有要保存的开关");
export type FeishuToggleBody = z.infer<typeof feishuToggleBody>;

/** 设默认群（shopId 为 null）或某店另指定的群：应用接法传 chatId；自定义机器人传 name、webhookUrl、secret（修改时后两项不填则沿用） */
export const feishuTargetBody = z.object({
  shopId: zUuid.nullable(),
  chatId: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1, "请填群名").max(40, "群名最多 40 个字").optional(),
  webhookUrl: z.string().trim().max(500).optional(),
  secret: z.string().trim().max(200).optional(),
});
export type FeishuTargetBody = z.infer<typeof feishuTargetBody>;

export type FeishuChatList = { chats: Array<{ chatId: string; name: string }> };

export type FeishuTestResult = { ok: true; stub: boolean; imageUpload: "ok" | "failed" | "skipped"; imageError: string | null };
