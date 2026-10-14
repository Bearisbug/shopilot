// 新商户的默认配置（REQ-AUTH-001、11.10 signup 的动作）。数值是演示与起步值，不是业务规则，商户可在设置里改。
import type { MerchantDue, Schedule, SecurityPolicy, TicketType } from "../db/schema";

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  requireTwoFactorAdmins: false,
  requireTwoFactorAll: false,
  sessionMaxHours: 168,
  ipRestrictionOn: false,
  ipAllowlist: [],
};

const day = (on: boolean) => ({ on, start: "09:00", end: "18:00" });
export const DEFAULT_SCHEDULE: Schedule = { mon: day(true), tue: day(true), wed: day(true), thu: day(true), fri: day(true), sat: day(false), sun: day(false) };

export const DEFAULT_HANDOFF_KEYWORDS = ["转人工", "投诉", "退款", "人工客服", "refund", "complaint", "human"];

export const DEFAULT_TICKET_TYPES: Array<{ type: TicketType; autoCreate: boolean; merchantDue: MerchantDue | null; defaultAssignee: "claimer" | "shop_lead" | "creator"; remind: { hoursBefore?: number; remainingPercent?: number } }> = [
  { type: "return_refund", autoCreate: true, merchantDue: null, defaultAssignee: "claimer", remind: { hoursBefore: 6 } },
  { type: "cancel_request", autoCreate: true, merchantDue: { hours: 24 }, defaultAssignee: "claimer", remind: { hoursBefore: 6 } },
  { type: "logistics", autoCreate: true, merchantDue: { hours: 24 }, defaultAssignee: "shop_lead", remind: { hoursBefore: 6 } },
  { type: "invoice", autoCreate: true, merchantDue: { businessDays: 2 }, defaultAssignee: "creator", remind: { remainingPercent: 20 } },
  { type: "stock", autoCreate: false, merchantDue: { days: 3 }, defaultAssignee: "creator", remind: { remainingPercent: 20 } },
  { type: "handover", autoCreate: true, merchantDue: { afterShiftStartMinutes: 60 }, defaultAssignee: "shop_lead", remind: { remainingPercent: 20 } },
  { type: "internal", autoCreate: false, merchantDue: { businessDays: 1 }, defaultAssignee: "creator", remind: { remainingPercent: 20 } },
];

export const NOTIFICATION_EVENTS = [
  { event: "unclaimed_timeout", label: "待认领超过提醒时长", inApp: true, email: false },
  { event: "handoff", label: "买家要求人工 / AI 转人工", inApp: true, email: false },
  { event: "auth_expiring", label: "店铺授权即将到期", inApp: true, email: true },
  { event: "shop_disconnected", label: "店铺被取消授权或断开", inApp: true, email: true },
  { event: "platform_metric_low", label: "平台客服指标不达标", inApp: true, email: false },
  { event: "ticket_due_soon", label: "工单即将到期", inApp: true, email: false },
  { event: "ticket_overdue", label: "工单已超时", inApp: true, email: true },
  { event: "ticket_assigned", label: "工单指派或改派给我", inApp: true, email: false },
  { event: "usage_threshold", label: "出稿用量跨过提醒阈值", inApp: true, email: true },
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]["event"];
