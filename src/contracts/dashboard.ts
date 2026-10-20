import { z } from "zod";
import type { PlatformKey, ShopPeriod } from "./shops";
import type { TicketType } from "./tickets";

// 看板契约（DESIGN §8.9 API-DASH-001、§3 指标口径、§13 PAGE-DASHBOARD）：前后端共用。

/** 预设范围按商户时区切日：近 N 天含今天，本周从周一起，本月从 1 日到今天，上月整月 */
export const DASH_PRESETS = ["today", "yesterday", "7d", "28d", "this_week", "this_month", "last_month", "90d"] as const;
export type DashPreset = (typeof DASH_PRESETS)[number];
export const PRESET_LABEL: Record<DashPreset, string> = {
  today: "今天",
  yesterday: "昨天",
  "7d": "近 7 天",
  "28d": "近 28 天",
  this_week: "本周",
  this_month: "本月",
  last_month: "上月",
  "90d": "近 90 天",
};
export const DEFAULT_PRESET: DashPreset = "this_month";
/** 自定义范围最多跨多少天（含首尾） */
export const MAX_RANGE_DAYS = 180;

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");

/** 统计范围：预设（range）或自定义起止日（from、to，含首尾，商户时区）；都不给时为本月 */
export type DashRangeSpec = { preset: DashPreset } | { from: string; to: string };

export const dashboardQuery = z
  .object({
    range: z.enum(DASH_PRESETS).optional(),
    from: ymd.optional(),
    to: ymd.optional(),
    format: z.enum(["json", "csv"]).default("json"),
  })
  .superRefine((q, c) => {
    if (!q.from !== !q.to) c.addIssue({ code: "custom", path: [q.from ? "to" : "from"], message: "自定义范围要同时给出起止日期" });
    if (q.from && q.range) c.addIssue({ code: "custom", path: ["range"], message: "预设范围与自定义起止日期只能给一种" });
    if (q.from && q.to && q.from > q.to) c.addIssue({ code: "custom", path: ["from"], message: "开始日期不能晚于结束日期" });
  })
  .transform(({ range, from, to, format }) => ({ spec: (from && to ? { from, to } : { preset: range ?? DEFAULT_PRESET }) as DashRangeSpec, format }));
export type DashboardQuery = z.infer<typeof dashboardQuery>;

/** 问题提取的两个视图：全部有买家发言的会话段；转人工的 AI 接待段（与转人工原因同口径） */
export const ISSUE_VIEWS = ["all", "handoff"] as const;
export type IssueView = (typeof ISSUE_VIEWS)[number];

/** 某类别下的会话段列表：范围同看板，另给视图与类别 */
export const dashboardIssuesQuery = z
  .object({
    range: z.enum(DASH_PRESETS).optional(),
    from: ymd.optional(),
    to: ymd.optional(),
    view: z.enum(ISSUE_VIEWS).default("all"),
    categoryId: z.string().uuid(),
  })
  .superRefine((q, c) => {
    if (!q.from !== !q.to) c.addIssue({ code: "custom", path: [q.from ? "to" : "from"], message: "自定义范围要同时给出起止日期" });
    if (q.from && q.range) c.addIssue({ code: "custom", path: ["range"], message: "预设范围与自定义起止日期只能给一种" });
  })
  .transform(({ range, from, to, view, categoryId }) => ({ spec: (from && to ? { from, to } : { preset: range ?? DEFAULT_PRESET }) as DashRangeSpec, view, categoryId }));

/** 列表最多返回的条数（按会话段开始时间倒序） */
export const ISSUE_LIST_LIMIT = 100;

export type DashboardIssueList = {
  categoryId: string;
  categoryName: string;
  total: number;
  items: Array<{ segmentId: string; conversationId: string; startedAt: string; shopName: string; buyerName: string; summary: string | null }>;
};

export type DashboardIssueStats = {
  /** 范围内的会话段数（全部：有买家发言的段；转人工的：转人工的 AI 接待段） */
  segments: number;
  /** 其中还没提取问题的段（买家停止发言 30 分钟后才提取） */
  pending: number;
  /** 已提取的段按类别计数，类别删除后的段计入「其他」；只列有段的类别，按数量从多到少 */
  byCategory: Array<{ categoryId: string; count: number }>;
  /** 按会话段开始日期（商户时区），每天各类别的段数；没有段的类别不出现 */
  trend: Array<{ date: string; counts: Record<string, number> }>;
};

/** AI 草稿与人工回复对比（会话分析层）：修改分类与一致性 */
export const DRAFT_EDIT_CLASSES = ["same", "polish", "supplement", "correction", "process", "rewrite"] as const;
export type DraftEditClass = (typeof DRAFT_EDIT_CLASSES)[number];
export const DRAFT_EDIT_LABEL: Record<DraftEditClass, string> = {
  same: "语义一致",
  polish: "仅语言润色",
  supplement: "补充信息",
  correction: "事实更正",
  process: "流程改变",
  rewrite: "弃用重写",
};
export const DRAFT_CONSISTENCIES = ["same", "partial", "different"] as const;
export type DraftConsistency = (typeof DRAFT_CONSISTENCIES)[number];
export const DRAFT_REVIEW_KINDS = ["shadow", "assist"] as const;
export type DraftReviewKind = (typeof DRAFT_REVIEW_KINDS)[number];

export type DraftReviewStats = {
  /** 影子回复：已对比的份数与一致性；一致率 = 语义一致 / 已对比 */
  shadow: { compared: number; same: number; partial: number; different: number; consistency: Ratio };
  /** 辅助草稿：已对比的份数，按客服的处置分 */
  assist: { compared: number; sent: number; editedSent: number; ignored: number };
  /** 两类草稿各自的修改分类计数（六类都列，按固定顺序） */
  byClass: Record<DraftReviewKind, Array<{ editClass: DraftEditClass; count: number }>>;
};

/** 样例列表：范围同看板，另给类型与修改分类 */
export const dashboardDraftReviewsQuery = z
  .object({
    range: z.enum(DASH_PRESETS).optional(),
    from: ymd.optional(),
    to: ymd.optional(),
    kind: z.enum(DRAFT_REVIEW_KINDS).default("shadow"),
    class: z.enum(DRAFT_EDIT_CLASSES).optional(),
  })
  .superRefine((q, c) => {
    if (!q.from !== !q.to) c.addIssue({ code: "custom", path: [q.from ? "to" : "from"], message: "自定义范围要同时给出起止日期" });
    if (q.from && q.range) c.addIssue({ code: "custom", path: ["range"], message: "预设范围与自定义起止日期只能给一种" });
  })
  .transform(({ range, from, to, kind, class: editClass }) => ({ spec: (from && to ? { from, to } : { preset: range ?? DEFAULT_PRESET }) as DashRangeSpec, kind, editClass: editClass ?? null }));

/** 样例最多返回的条数（按草稿生成时间倒序） */
export const DRAFT_REVIEW_LIST_LIMIT = 50;

export type DashboardDraftReviewList = {
  kind: DraftReviewKind;
  editClass: DraftEditClass | null;
  total: number;
  items: Array<{
    draftId: string;
    conversationId: string;
    createdAt: string;
    shopName: string;
    buyerName: string;
    draftStatus: string;
    editClass: DraftEditClass;
    consistency: DraftConsistency;
    draftText: string;
    humanText: string;
    reason: string | null;
    evidence: string | null;
  }>;
};

/** 把范围写成查询串（页面链接与导出共用）；默认的本月不写参数 */
export function rangeSearch(spec: DashRangeSpec): string {
  if ("from" in spec) return `from=${spec.from}&to=${spec.to}`;
  return spec.preset === DEFAULT_PRESET ? "" : `range=${spec.preset}`;
}

/** 比率的最小样本：分母小于它时不给比率，页面显示「数据不足」（PAGE-DASHBOARD 关键页态） */
export const MIN_SAMPLE = 10;

/** 分子、分母与比率（0..1）；分母小于 MIN_SAMPLE 时 rate 为 null */
export type Ratio = { num: number; den: number; rate: number | null };

export type DashboardTrendDay = {
  /** 商户时区的日期 YYYY-MM-DD，按会话段开始时间归日 */
  date: string;
  segments: number;
  aiResolved: number;
  handedOff: number;
  /** 未转人工、有 Shopilot 成员回复 */
  shopilot: number;
  /** 未转人工、只有平台后台回复 */
  platform: number;
  /** 其余：还在 AI 接待、待认领或结束时无人回复 */
  pending: number;
};

export type DashboardPerson = {
  membershipId: string;
  name: string;
  /** 本人首个认领的会话段 */
  segments: number;
  /** 本人首个认领的段里 Shopilot 成员首条回复的首响平均（工作时段秒数，§3） */
  firstReplyAvgSec: number | null;
  /** 本人首个认领、买家已等满 12 小时或已被本人回复的段里，本人 12 小时内回复的占比 */
  replied12h: Ratio;
  /** 本人转出的次数 / 本人会话段 */
  transferRate: Ratio;
  /** 指派给本人、在范围内解决、有截止时间的工单里按时的占比 */
  ticketsOnTimeRate: Ratio;
};

/** met / below 对照平台给的目标；no_target 有值但平台没给目标（TikTok）；no_data 接口有返回但没有回复率；not_returned 还没取到指标 */
export type PlatformMetricStatus = "met" | "below" | "no_target" | "no_data" | "not_returned";

export type DashboardPlatformMetric = {
  shopId: string;
  shopName: string;
  platform: PlatformKey;
  market: string;
  /** 平台口径名，如「Shopee 聊天回复率」「TikTok 客服回复率」 */
  label: string;
  /** 回复率（百分数，如 92 表示 92%）；平台没给时为 null */
  value: number | null;
  target?: number | null;
  /** 口径说明，来自 shop.metrics */
  basis: string | null;
  responseTimeMins?: number | null;
  responseTimeDays?: number | null;
  satisfaction?: number | null;
  sessions?: number | null;
  metricsAt: string | null;
  status: PlatformMetricStatus;
};

export type DashboardResponse = {
  /** 实际统计的范围；preset 为空表示自定义起止日 */
  range: { preset: DashPreset | null; from: string; to: string; label: string };
  /** [start, end)，ISO 时间；按商户时区切日 */
  period: { start: string; end: string; days: number };
  timezone: string;
  shopCount: number;
  kpis: {
    segments: number;
    /** AI 接待段（开段模式为 assist / auto）里：分子 AI 独立解决的段，分母已结束的段 */
    aiResolved: Ratio;
    /** 人工首响平均：起点到首条人工回复（含平台后台回复）的工作时段秒数（§3 指标口径补充） */
    firstReplyAvgSec: number | null;
    firstReplySamples: number;
    /** 买家已等满 12 小时或已有回复的段里，12 小时内有回复（人工、AI 发出、平台后台）的占比 */
    replied12h: Ratio;
    /** AI 接待段里：分子转人工的段，分母全部 AI 接待段 */
    handoffRate: Ratio;
  };
  trend: DashboardTrendDay[];
  /** 转人工的 AI 接待段按原因计数，合计等于 kpis.handoffRate.num */
  handoffReasons: Array<{ reason: string; label: string; count: number }>;
  /** 问题提取：类别表（「其他」最后）与两个视图的统计 */
  issues: { categories: Array<{ id: string; name: string; builtin: boolean }>; views: Record<IssueView, DashboardIssueStats> };
  drafts: {
    /** 范围内生成的辅助草稿 */
    generated: number;
    sent: number;
    editedSent: number;
    ignored: number;
    expired: number;
    /** 还未处置、被新消息替代或发送失败 */
    other: number;
    /** 范围内生成的影子回复，不进采纳率与改写率 */
    shadow: number;
    /** (原样 + 改后) / (原样 + 改后 + 忽略) */
    adoptionRate: Ratio;
    /** 改后 / (原样 + 改后) */
    editRate: Ratio;
  };
  /** AI 草稿与人工回复对比，按草稿生成日期统计 */
  draftReview: DraftReviewStats;
  people: DashboardPerson[];
  tickets: {
    open: number;
    due6h: number;
    overdue: number;
    resolved: number;
    /** 分母只含有截止时间的已解决工单 */
    onTimeRate: Ratio;
    /** 范围内解决、没有截止时间的工单，不进按时率 */
    noDue: number;
    resolveMedianSec: number | null;
    /** 截止后由平台事件解决的工单（Shopilot 推断为平台自动处理） */
    platformAutoHandled: number;
    byType: Array<{ type: TicketType; label: string; onTime: number; lateMerchant: number; latePlatform: number; noDue: number }>;
  };
  platformMetrics: DashboardPlatformMetric[];
  /** 平台指标实际取用的窗口：本月、上月、近 7 天原样；其余范围不超过 7 天取近 7 天，超过取近 30 天 */
  platformPeriod: ShopPeriod;
};
