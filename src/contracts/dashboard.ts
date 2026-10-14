import { z } from "zod";
import type { PlatformKey, ShopPeriod } from "./shops";
import type { TicketType } from "./tickets";

// 看板契约（DESIGN §8.9 API-DASH-001、§3 指标口径、§13 PAGE-DASHBOARD）：前后端共用。

export const DASH_RANGES = ["7d", "this_month", "last_month", "90d"] as const;
export type DashRange = (typeof DASH_RANGES)[number];
export const RANGE_LABEL: Record<DashRange, string> = { "7d": "近 7 天", this_month: "本月", last_month: "上月", "90d": "近 90 天" };

export const dashboardQuery = z.object({
  range: z.enum(DASH_RANGES).default("this_month"),
  format: z.enum(["json", "csv"]).default("json"),
});
export type DashboardQuery = z.infer<typeof dashboardQuery>;

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
  /** 未转人工、有人工回复 */
  human: number;
  /** 其余：还在 AI 接待、待认领或结束时无人回复 */
  pending: number;
};

export type DashboardPerson = {
  membershipId: string;
  name: string;
  /** 本人首个认领的会话段 */
  segments: number;
  firstReplyMedianSec: number | null;
  /** 本人转出的次数 / 本人会话段 */
  transferRate: Ratio;
  /** 指派给本人、在范围内解决的工单里按时的占比 */
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
  range: DashRange;
  /** [start, end)，ISO 时间；按商户时区切日 */
  period: { start: string; end: string; days: number };
  timezone: string;
  shopCount: number;
  kpis: {
    segments: number;
    /** 分子 ai_resolved 段；分母已结束的段 */
    aiResolved: Ratio;
    firstReplyMedianSec: number | null;
    firstReplySamples: number;
    /** 分子 handed_off 段；分母全部会话段 */
    handoffRate: Ratio;
  };
  trend: DashboardTrendDay[];
  /** 转人工会话段按原因计数，合计等于 kpis.handoffRate.num */
  handoffReasons: Array<{ reason: string; label: string; count: number }>;
  drafts: {
    /** 范围内生成的辅助草稿 */
    generated: number;
    sent: number;
    editedSent: number;
    ignored: number;
    expired: number;
    /** 还未处置、被新消息替代或发送失败 */
    other: number;
    /** (原样 + 改后) / (原样 + 改后 + 忽略) */
    adoptionRate: Ratio;
    /** 改后 / (原样 + 改后) */
    editRate: Ratio;
  };
  people: DashboardPerson[];
  tickets: {
    open: number;
    due6h: number;
    overdue: number;
    resolved: number;
    onTimeRate: Ratio;
    resolveMedianSec: number | null;
    /** 截止后由平台事件解决的工单（Shopilot 推断为平台自动处理） */
    platformAutoHandled: number;
    byType: Array<{ type: TicketType; label: string; onTime: number; lateMerchant: number; latePlatform: number }>;
  };
  platformMetrics: DashboardPlatformMetric[];
  /** 平台指标实际取用的周期；90 天范围平台指标按近 30 天取 */
  platformPeriod: ShopPeriod;
};
