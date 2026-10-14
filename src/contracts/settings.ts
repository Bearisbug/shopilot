// 商户设置（DESIGN §8.10 API-SET-001 至 API-SET-016）与文件下载（API-CONV-011）的请求 schema 与响应类型。
import { z } from "zod";
import { zEmail, zPlatform, zTimezone, zUuid } from "./common";

// ---------- 商户资料 API-SET-001 / 002 ----------

export type MerchantView = {
  id: string;
  name: string;
  timezone: string;
  language: "zh-CN";
  billingEmail: string | null;
  owner: { userId: string; membershipId: string | null; name: string; email: string };
  createdAt: string;
  status: "active" | "pending_deletion" | "deleted";
  deletion: { purgeAt: string } | null;
};

export const updateMerchantBody = z
  .object({
    name: z.string().trim().min(1, "请填写商户名").max(80, "商户名最多 80 个字").optional(),
    timezone: zTimezone.optional(),
    billingEmail: zEmail.nullable().optional(),
  })
  .refine((b) => b.name !== undefined || b.timezone !== undefined || b.billingEmail !== undefined, "没有要修改的内容");
export type UpdateMerchantBody = z.infer<typeof updateMerchantBody>;

// ---------- 通知规则 API-SET-003 / 004 ----------

export const NOTIFICATION_EVENT_IDS = [
  "unclaimed_timeout",
  "handoff",
  "auth_expiring",
  "shop_disconnected",
  "platform_metric_low",
  "ticket_due_soon",
  "ticket_overdue",
  "ticket_assigned",
  "usage_threshold",
] as const;
export const zNotificationEvent = z.enum(NOTIFICATION_EVENT_IDS);
export type NotificationRuleRow = { event: (typeof NOTIFICATION_EVENT_IDS)[number]; inApp: boolean; email: boolean };
export type NotificationRules = { rules: NotificationRuleRow[] };

export const notificationRulesBody = z.object({
  rules: z
    .array(z.object({ event: zNotificationEvent, inApp: z.boolean(), email: z.boolean() }))
    .min(1)
    .max(NOTIFICATION_EVENT_IDS.length)
    .refine((rules) => new Set(rules.map((r) => r.event)).size === rules.length, "同一事件只能出现一次"),
});

// ---------- 安全策略 API-SET-005 / 006 ----------

export const SESSION_HOURS = [8, 12, 24, 168] as const;
export const securityPolicyBody = z.object({
  requireTwoFactorAdmins: z.boolean(),
  requireTwoFactorAll: z.boolean(),
  sessionMaxHours: z.union([z.literal(8), z.literal(12), z.literal(24), z.literal(168)]),
  ipRestrictionOn: z.boolean(),
  ipAllowlist: z.array(z.string().trim().min(1).max(64)).max(50, "白名单最多 50 条"),
});
export type SecurityPolicyView = z.infer<typeof securityPolicyBody>;

// ---------- 数据与隐私 API-SET-007 至 API-SET-011 ----------

export const RETENTION_DAYS = [180, 365, 730] as const;
export const dataPolicyBody = z.object({ retentionDays: z.union([z.literal(180), z.literal(365), z.literal(730)]) });

export type ExportItem = {
  id: string;
  status: "queued" | "running" | "done" | "failed" | "expired";
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
  downloadUrl: string | null;
  error: string | null;
};
export type ExportList = { items: ExportItem[] };
export type DataPolicyView = { retentionDays: number; lastPurgeAt: string | null; exports: ExportItem[] };

export const erasureBody = z.object({
  platform: zPlatform,
  buyerExternalId: z.string().trim().min(1, "请填写买家 ID").max(128),
  confirm: z.literal(true, { error: "删除前需要确认" }),
});
export type ErasureResult = { conversations: number; messages: number; drafts: number; invoices: number; orders: number };

// ---------- 审计日志 API-SET-012 ----------

export const AUDIT_MODULE_LABEL = {
  workbench: "工作台",
  tickets: "工单",
  orders: "订单与开票",
  shops: "店铺与连接",
  team: "团队与权限",
  reception: "接待设置",
  billing: "用量与套餐",
  settings: "商户设置",
  auth: "账号与登录",
} as const;
export type AuditModuleId = keyof typeof AUDIT_MODULE_LABEL;
export const AUDIT_MODULES = Object.keys(AUDIT_MODULE_LABEL) as AuditModuleId[];
export const AUDIT_SOURCE_LABEL = { page: "页面", system: "系统", webhook: "平台" } as const;

const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);
export const auditQuery = z.object({
  actor: z.preprocess(blankToUndefined, z.union([zUuid, z.enum(["system", "webhook"])]).optional()),
  module: z.preprocess(blankToUndefined, z.enum(AUDIT_MODULES as [AuditModuleId, ...AuditModuleId[]]).optional()),
  range: z.enum(["7d", "30d", "90d"]).default("30d"),
  format: z.enum(["json", "csv"]).default("json"),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditQuery = z.infer<typeof auditQuery>;

export type AuditItem = {
  id: string;
  createdAt: string;
  actorName: string | null;
  actorSource: keyof typeof AUDIT_SOURCE_LABEL;
  module: AuditModuleId;
  action: string;
  summary: string;
  targetType: string | null;
  targetId: string | null;
};
export type AuditList = { items: AuditItem[]; nextCursor: string | null };

// ---------- 转让所有权与删除商户 API-SET-013 至 API-SET-016 ----------

export const ownershipTransferBody = z.object({ toMembershipId: zUuid });
export type OwnershipTransferResult = { id: string; toName: string; expiresAt: string };
export const acceptOwnershipBody = z.object({ token: z.string().min(16).max(200) });
export type AcceptOwnershipResult = { merchantId: string; merchantName: string };

/** PAGE-OWNERSHIP 打开时的状态（服务端页面直接查库得到，不经 API） */
export type OwnershipPreview =
  | { state: "ok"; merchantName: string; timezone: string; fromName: string; toName: string; expiresAt: string }
  | { state: "not_recipient"; merchantName: string; toName: string }
  | { state: "expired" | "used" | "revoked" | "invalid" | "not_allowed"; merchantName: string | null };

export const deletionBody = z.object({ confirmName: z.string().max(200) });
export type DeletionResult = { purgeAt: string };
