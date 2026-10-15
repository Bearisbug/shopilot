import { z } from "zod";
import { zTimezone, zUuid } from "./common";

// 接待设置（DESIGN §8.8、§9.2、§9.5）与快捷回复（API-CONV-014、API-RCP-008 至 API-RCP-010）

const segmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });
/** 字数按用户看到的字符计（一个 emoji、一个汉字都算 1），前端计数器与服务端校验共用 */
export const charCount = (s: string): number => [...segmenter.segment(s)].length;
const zText = (max: number, message: string) => z.string().trim().refine((s) => charCount(s) <= max, message);

export const RECEPTION_MODES = ["off", "shadow", "assist", "auto"] as const;
export type ReceptionMode = (typeof RECEPTION_MODES)[number];
export const zReceptionMode = z.enum(RECEPTION_MODES);
export const SHOPEE_AUTO_BLOCKED = "Shopee 平台规则禁止 chatbot 回复，评审前不开放";

export const modesBody = z.object({
  shops: z
    .array(z.object({ shopId: zUuid, modeInHours: zReceptionMode, modeOffHours: zReceptionMode }))
    .max(500)
    .refine((list) => new Set(list.map((s) => s.shopId)).size === list.length, "同一家店只能出现一次"),
});
export type ModesBody = z.infer<typeof modesBody>;

export const WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];
const zClock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间格式为 HH:mm");
const zDay = z
  .object({ on: z.boolean(), start: zClock, end: zClock })
  .refine((d) => !d.on || d.start < d.end, { message: "结束时间要晚于开始时间", path: ["end"] });

export const KEYWORDS_MAX = 30;
export const KEYWORD_MAX_LENGTH = 40;
export const HOLIDAYS_MAX = 60;
export const REMIND_MINUTES = [5, 10, 15] as const;

export const hoursBody = z.object({
  timezone: zTimezone,
  schedule: z.object({ mon: zDay, tue: zDay, wed: zDay, thu: zDay, fri: zDay, sat: zDay, sun: zDay }),
  holidays: z.array(z.iso.date("日期格式为 YYYY-MM-DD")).max(HOLIDAYS_MAX, `节假日最多 ${HOLIDAYS_MAX} 个`),
  keywords: z
    .array(zText(KEYWORD_MAX_LENGTH, `每个关键词最多 ${KEYWORD_MAX_LENGTH} 个字`).refine((s) => s.length > 0, "关键词不能为空"))
    .max(KEYWORDS_MAX, `转人工关键词最多 ${KEYWORDS_MAX} 个`),
  confidenceThreshold: z.number({ error: "请填写 0.50 到 0.95 之间的数" }).min(0.5, "置信度阈值在 0.50 到 0.95 之间").max(0.95, "置信度阈值在 0.50 到 0.95 之间"),
  unclaimedRemindMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.null()], { error: "待认领提醒只能选 5、10、15 分钟或不提醒" }),
  responseSlaMinutes: z.number({ error: "请填写 5 到 120 之间的分钟数" }).int("接待时限按整数分钟填").min(5, "接待时限在 5 到 120 分钟之间").max(120, "接待时限在 5 到 120 分钟之间"),
});
export type HoursBody = z.infer<typeof hoursBody>;

export const PROMPT_STAGE_KEYS = ["presale", "insale", "aftersale"] as const;
export type PromptStageKey = (typeof PROMPT_STAGE_KEYS)[number];
export const PROMPT_MAX_LENGTH = 6000;
export const BRAND_VOICE_MAX_LENGTH = 2000;
export const PROMPT_VERSIONS_KEPT = 10;
const zStageText = zText(PROMPT_MAX_LENGTH, `每段最多 ${PROMPT_MAX_LENGTH.toLocaleString("en-US")} 字`).refine((s) => s.length > 0, "提示词不能为空；要用内置默认请点「恢复默认」");

export const promptsBody = z.object({
  brandVoice: zText(BRAND_VOICE_MAX_LENGTH, `品牌语气最多 ${BRAND_VOICE_MAX_LENGTH.toLocaleString("en-US")} 字`).optional(),
  stages: z.object({ presale: zStageText.optional(), insale: zStageText.optional(), aftersale: zStageText.optional() }).optional(),
});
export type PromptsBody = z.infer<typeof promptsBody>;
export const zPromptStage = z.enum(PROMPT_STAGE_KEYS);

export type Schedule = Record<WeekDay, { on: boolean; start: string; end: string }>;
export type ReceptionShop = {
  shopId: string;
  name: string;
  platform: "shopee" | "tiktok";
  market: string;
  modeInHours: ReceptionMode;
  modeOffHours: ReceptionMode;
  autoAllowed: boolean;
  autoBlockedReason?: string;
  /** 只读接入：可选 off、shadow、assist，auto 置灰，原因见 autoBlockedReason */
  readOnly?: boolean;
};
export type PromptVersion = { savedAt: string; text: string };
export type PromptStageState = { text: string; isDefault: boolean; versions: PromptVersion[] };
export type ReceptionSettings = {
  shops: ReceptionShop[];
  hours: { timezone: string; schedule: Schedule; holidays: string[] };
  handoff: { keywords: string[]; confidenceThreshold: number; unclaimedRemindMinutes: number | null; responseSlaMinutes: number };
  prompts: { brandVoice: string; stages: Record<PromptStageKey, PromptStageState>; unknownStageText: string; guardrails: string };
};
export type ModesResult = { changed: number; warnings: string[] };

// ---------- 工单类型与时限（REQ-RCP-004） ----------

export const TICKET_TYPES = ["return_refund", "cancel_request", "logistics", "invoice", "stock", "handover", "internal"] as const;
export type TicketTypeKey = (typeof TICKET_TYPES)[number];
export const TICKET_TYPE_LABEL: Record<TicketTypeKey, string> = {
  return_refund: "退货退款",
  cancel_request: "取消申请",
  logistics: "物流异常",
  invoice: "开票",
  stock: "缺货 / 到货跟进",
  handover: "跨班交接",
  internal: "内部确认",
};
export const ASSIGNEES = ["claimer", "shop_lead", "creator"] as const;
export type Assignee = (typeof ASSIGNEES)[number];
export const ASSIGNEE_LABEL: Record<Assignee, string> = { claimer: "会话认领人", shop_lead: "店铺组长", creator: "建单人" };

export type MerchantDue = { hours?: number; businessDays?: number; days?: number; afterShiftStartMinutes?: number };
export type Remind = { hoursBefore?: number; remainingPercent?: number };

/** 商户时限的可选值；null = 时限只来自平台，不能改（409） */
export const DUE_OPTIONS: Record<TicketTypeKey, MerchantDue[] | null> = {
  return_refund: null,
  cancel_request: [{ hours: 12 }, { hours: 24 }, { hours: 48 }],
  logistics: [{ hours: 12 }, { hours: 24 }, { hours: 48 }],
  invoice: [{ businessDays: 1 }, { businessDays: 2 }, { businessDays: 3 }],
  stock: [{ days: 1 }, { days: 3 }, { days: 7 }],
  handover: [{ afterShiftStartMinutes: 30 }, { afterShiftStartMinutes: 60 }, { afterShiftStartMinutes: 120 }],
  internal: [{ businessDays: 1 }, { businessDays: 2 }, { businessDays: 3 }],
};
/** 提醒阈值：时限可能来自平台的类型按「截止前 N 小时」，其余按「剩余 N%」 */
export const REMIND_KIND: Record<TicketTypeKey, "hoursBefore" | "remainingPercent"> = {
  return_refund: "hoursBefore",
  cancel_request: "hoursBefore",
  logistics: "hoursBefore",
  invoice: "remainingPercent",
  stock: "remainingPercent",
  handover: "remainingPercent",
  internal: "remainingPercent",
};
export const REMIND_OPTIONS = { hoursBefore: [3, 6, 12], remainingPercent: [10, 20, 30] } as const;
/** 没有自动触发来源、只能手动建的类型 */
export const MANUAL_ONLY_TYPES: TicketTypeKey[] = ["stock", "internal"];
export const AUTO_CLOSE_DAYS = [3, 7, 14] as const;

export function dueKey(d: MerchantDue): string {
  if (d.hours !== undefined) return `hours:${d.hours}`;
  if (d.businessDays !== undefined) return `businessDays:${d.businessDays}`;
  if (d.days !== undefined) return `days:${d.days}`;
  return `afterShiftStartMinutes:${d.afterShiftStartMinutes}`;
}
export function dueLabel(d: MerchantDue): string {
  if (d.hours !== undefined) return `${d.hours} 小时`;
  if (d.businessDays !== undefined) return `${d.businessDays} 个工作日`;
  if (d.days !== undefined) return `${d.days} 天`;
  const m = d.afterShiftStartMinutes ?? 0;
  return m % 60 === 0 ? `开工后 ${m / 60} 小时` : `开工后 ${m} 分钟`;
}
export function remindLabel(r: Remind): string {
  return r.hoursBefore !== undefined ? `截止前 ${r.hoursBefore} 小时` : `剩 ${r.remainingPercent}%`;
}

const zMerchantDue = z.union([
  z.strictObject({ hours: z.number().int().positive() }),
  z.strictObject({ businessDays: z.number().int().positive() }),
  z.strictObject({ days: z.number().int().positive() }),
  z.strictObject({ afterShiftStartMinutes: z.number().int().positive() }),
]);
const zRemind = z.union([z.strictObject({ hoursBefore: z.number().int() }), z.strictObject({ remainingPercent: z.number().int() })]);

export const ticketTypesBody = z.object({
  types: z
    .array(
      z.object({
        type: z.enum(TICKET_TYPES),
        autoCreate: z.boolean().optional(),
        merchantDue: zMerchantDue.optional(),
        defaultAssignee: z.enum(ASSIGNEES).optional(),
        remind: zRemind.optional(),
      }),
    )
    .refine((list) => new Set(list.map((t) => t.type)).size === list.length, "同一类工单只能出现一次"),
  autoCloseDays: z.union([z.literal(3), z.literal(7), z.literal(14), z.null()], { error: "自动关闭只能选 3、7、14 天或不自动关闭" }),
});
export type TicketTypesBody = z.infer<typeof ticketTypesBody>;

export type TicketTypeRow = {
  type: TicketTypeKey;
  trigger: string;
  dueSourceLabel: string;
  autoCreate: boolean;
  merchantDue: MerchantDue | null;
  defaultAssignee: Assignee;
  remind: Remind;
  platformDriven: boolean;
};
export type TicketTypesResponse = { types: TicketTypeRow[]; autoCloseDays: number | null; numberPrefix: string };

// ---------- 快捷回复（REQ-CONV-009） ----------

export const QUICK_REPLY_STAGES = ["presale", "insale", "aftersale", "any"] as const;
export type QuickReplyStage = (typeof QUICK_REPLY_STAGES)[number];
export const QUICK_REPLY_TEXT_MAX = 2000;
export const QUICK_REPLY_TITLE_MAX = 40;

export const quickReplyBody = z.object({
  title: zText(QUICK_REPLY_TITLE_MAX, `标题最多 ${QUICK_REPLY_TITLE_MAX} 个字`).refine((s) => s.length > 0, "请填写标题"),
  stage: z.enum(QUICK_REPLY_STAGES),
  text: zText(QUICK_REPLY_TEXT_MAX, `回复内容最多 ${QUICK_REPLY_TEXT_MAX.toLocaleString("en-US")} 字`).refine((s) => s.length > 0, "请填写回复内容"),
});
export type QuickReplyBody = z.infer<typeof quickReplyBody>;
export const quickReplyPatch = quickReplyBody.partial().refine((b) => b.title !== undefined || b.stage !== undefined || b.text !== undefined, "没有要修改的内容");
export const quickRepliesQuery = z.object({ stage: z.enum(QUICK_REPLY_STAGES).optional() });

export type QuickReply = { id: string; title: string; stage: QuickReplyStage; text: string };
export type QuickReplyList = { items: QuickReply[] };
