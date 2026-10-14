// 看板（DESIGN §8.9 API-DASH-001、REQ-DASH-001；口径见 §3 与 §9.3 段字段）。
// 统计对象：范围内开始的会话段（回补段、达人会话不计）、范围内生成的辅助草稿、范围内解决的工单；
// 组长只算负责店铺（visibleConversations / visibleTickets / visibleShops 收窄），按商户时区切日。
import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, format } from "date-fns";
import { and, asc, eq, gte, inArray, isNotNull, lt, ne, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { DashboardPerson, DashboardPlatformMetric, DashboardResponse, DashRange, DashboardTrendDay, PlatformMetricStatus, Ratio } from "@/contracts/dashboard";
import { MIN_SAMPLE, RANGE_LABEL } from "@/contracts/dashboard";
import type { ShopMetric, ShopPeriod } from "@/contracts/shops";
import { TYPE_LABEL } from "@/contracts/tickets";
import { HANDOFF_LABEL } from "@/server/ai/draft";
import type { MemberContext } from "@/server/auth/context";
import { visibleConversations } from "@/server/conversations/scope";
import { db, schema } from "@/server/db/client";
import { csv } from "@/server/http/route";
import { visibleShops } from "@/server/orders/scope";
import type { StoredMetrics } from "@/server/shops/jobs";
import { OPEN_STATUSES, visibleTickets } from "@/server/tickets/scope";

const G = schema.segment;
const C = schema.conversation;
const D = schema.draft;
const T = schema.ticket;
const A = schema.auditLog;

type Bounds = { start: Date; end: Date; days: string[] };

/** 范围的 [start, end)：近 7 / 90 天含今天；本月从 1 日到今天；上月整月 */
export function rangeBounds(range: DashRange, tz: string, now = new Date()): Bounds {
  const local = new TZDate(now.getTime(), tz);
  const today = new TZDate(local.getFullYear(), local.getMonth(), local.getDate(), 0, 0, 0, tz);
  const tomorrow = addDays(today, 1);
  const monthStart = new TZDate(local.getFullYear(), local.getMonth(), 1, 0, 0, 0, tz);
  const [start, end] =
    range === "7d" ? [addDays(today, -6), tomorrow] : range === "90d" ? [addDays(today, -89), tomorrow] : range === "this_month" ? [monthStart, tomorrow] : [addMonths(monthStart, -1), monthStart];
  const days: string[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) days.push(format(d, "yyyy-MM-dd"));
  return { start: new Date(start.getTime()), end: new Date(end.getTime()), days };
}

export const ratio = (num: number, den: number): Ratio => ({ num, den, rate: den >= MIN_SAMPLE ? num / den : null });
const sec = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v)));
const dayOf = (col: PgColumn, tz: string) => sql<string>`to_char(${col} at time zone ${tz}, 'YYYY-MM-DD')`;

// 段的去向按先后判定：AI 独立解决 → 转人工 → 有人工回复 → 其余
const AI = sql`${G.aiResolved}`;
const HANDED = sql`(${G.handedOff} and not ${G.aiResolved})`;
const HUMAN = sql`(not ${G.handedOff} and not ${G.aiResolved} and ${G.humanReplied})`;
/** 人工首响样本：有首条买家消息与首条人工回复；只排除明确记为工作时间外的（§3 只算工作时间内） */
const REPLY_SAMPLE = sql`(${G.firstHumanReplyAt} is not null and ${G.firstBuyerAt} is not null and ${G.firstReplyInHours} is distinct from false)`;
const REPLY_MEDIAN = sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from ${G.firstHumanReplyAt} - ${G.firstBuyerAt})) filter (where ${REPLY_SAMPLE})`;

function segmentWhere(ctx: MemberContext, b: Bounds): SQL {
  return and(visibleConversations(ctx), eq(C.buyerKind, "buyer"), eq(G.backfilled, false), gte(G.startedAt, b.start), lt(G.startedAt, b.end))!;
}

async function segmentStats(ctx: MemberContext, b: Bounds) {
  const tz = ctx.merchant.timezone;
  const day = dayOf(G.startedAt, tz);
  const rows = await db()
    .select({
      day,
      segments: sql<number>`count(*)::int`,
      ended: sql<number>`count(*) filter (where ${G.endedAt} is not null)::int`,
      ai: sql<number>`count(*) filter (where ${AI})::int`,
      handed: sql<number>`count(*) filter (where ${HANDED})::int`,
      human: sql<number>`count(*) filter (where ${HUMAN})::int`,
      samples: sql<number>`count(*) filter (where ${REPLY_SAMPLE})::int`,
      median: REPLY_MEDIAN,
    })
    .from(G)
    .innerJoin(C, eq(C.id, G.conversationId))
    .where(segmentWhere(ctx, b))
    .groupBy(sql`1`);
  const [all] = await db()
    .select({ samples: sql<number>`count(*) filter (where ${REPLY_SAMPLE})::int`, median: REPLY_MEDIAN })
    .from(G)
    .innerJoin(C, eq(C.id, G.conversationId))
    .where(segmentWhere(ctx, b));
  return { rows, samples: all?.samples ?? 0, median: sec(all?.median) };
}

/** 转人工段按原因：取段内最后一次 EVT:handoff 的 reason；没有事件时取会话当前的 handoff_reason（仅当前段） */
async function handoffReasons(ctx: MemberContext, b: Bounds) {
  const res = await db().execute<{ reason: string | null; n: number }>(sql`
    select coalesce(ev.reason, case when ${C.currentSegmentId} = ${G.id} then ${C.handoffReason} end) as reason, count(*)::int as n
    from ${G}
    join ${C} on ${C.id} = ${G.conversationId}
    left join lateral (
      select ${A.data}->>'reason' as reason from ${A}
      where ${A.merchantId} = ${G.merchantId} and ${A.action} = 'handoff' and ${A.targetType} = 'conversation'
        and ${A.targetId} = ${C.id}::text and ${A.createdAt} >= ${G.startedAt}
        and (${G.endedAt} is null or ${A.createdAt} <= ${G.endedAt})
      order by ${A.createdAt} desc limit 1
    ) ev on true
    where ${segmentWhere(ctx, b)} and ${HANDED}
    group by 1
    order by 2 desc, 1`);
  return res.rows.map((r) => ({ reason: r.reason ?? "unknown", label: r.reason ? (HANDOFF_LABEL[r.reason] ?? `未知（${r.reason}）`) : "未记录原因", count: Number(r.n) }));
}

async function draftStats(ctx: MemberContext, b: Bounds) {
  const day = dayOf(D.createdAt, ctx.merchant.timezone);
  const st = (s: string) => sql<number>`count(*) filter (where ${D.status} = ${s})::int`;
  return db()
    .select({ day, generated: sql<number>`count(*)::int`, sent: st("sent"), editedSent: st("edited_sent"), ignored: st("ignored"), expired: st("expired") })
    .from(D)
    .innerJoin(C, eq(C.id, D.conversationId))
    .where(and(visibleConversations(ctx), eq(C.buyerKind, "buyer"), eq(D.mode, "assist"), gte(D.createdAt, b.start), lt(D.createdAt, b.end)))
    .groupBy(sql`1`);
}

const RESOLVED = sql`${T.resolvedAt} is not null and ${T.status} in ('resolved', 'closed')`;
const ON_TIME = sql`(${T.dueAt} is null or ${T.resolvedAt} <= ${T.dueAt})`;
const LATE = sql`(${T.dueAt} is not null and ${T.resolvedAt} > ${T.dueAt})`;

function resolvedWhere(ctx: MemberContext, b: Bounds): SQL {
  return and(visibleTickets(ctx), RESOLVED, gte(T.resolvedAt, b.start), lt(T.resolvedAt, b.end))!;
}

async function ticketStats(ctx: MemberContext, b: Bounds) {
  const now = new Date();
  const soon = new Date(now.getTime() + 6 * 3600_000);
  const OPEN = inArray(T.status, [...OPEN_STATUSES]);
  const [snap] = await db()
    .select({
      open: sql<number>`count(*)::int`,
      due6h: sql<number>`count(*) filter (where ${T.dueAt} > ${now} and ${T.dueAt} <= ${soon})::int`,
      overdue: sql<number>`count(*) filter (where ${T.dueAt} < ${now})::int`,
    })
    .from(T)
    .where(and(visibleTickets(ctx), OPEN));
  const [res] = await db()
    .select({
      resolved: sql<number>`count(*)::int`,
      onTime: sql<number>`count(*) filter (where ${ON_TIME})::int`,
      median: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from ${T.resolvedAt} - ${T.createdAt}))`,
      // 截止后由平台推送解决：Shopilot 推断为平台超时自动处理
      autoHandled: sql<number>`count(*) filter (where ${LATE} and exists (select 1 from ${schema.ticketEvent} e where e.ticket_id = ${T.id} and e.source = 'webhook' and e.data->>'to' = 'resolved'))::int`,
    })
    .from(T)
    .where(resolvedWhere(ctx, b));
  const byType = await db()
    .select({
      type: T.type,
      onTime: sql<number>`count(*) filter (where ${ON_TIME})::int`,
      latePlatform: sql<number>`count(*) filter (where ${LATE} and ${T.dueSource} = 'platform')::int`,
      lateMerchant: sql<number>`count(*) filter (where ${LATE} and ${T.dueSource} is distinct from 'platform')::int`,
    })
    .from(T)
    .where(resolvedWhere(ctx, b))
    .groupBy(T.type);
  const day = dayOf(T.resolvedAt, ctx.merchant.timezone);
  const daily = await db()
    .select({ day, resolved: sql<number>`count(*)::int`, onTime: sql<number>`count(*) filter (where ${ON_TIME})::int` })
    .from(T)
    .where(resolvedWhere(ctx, b))
    .groupBy(sql`1`);
  return { snap, res, byType, daily };
}

async function people(ctx: MemberContext, b: Bounds): Promise<DashboardPerson[]> {
  const segs = await db()
    .select({ id: G.firstClaimedBy, segments: sql<number>`count(*)::int`, median: REPLY_MEDIAN })
    .from(G)
    .innerJoin(C, eq(C.id, G.conversationId))
    .where(and(segmentWhere(ctx, b), isNotNull(G.firstClaimedBy)))
    .groupBy(G.firstClaimedBy);
  const transfers = await db()
    .select({ id: A.actorMembershipId, n: sql<number>`count(*)::int` })
    .from(A)
    .innerJoin(C, sql`${C.id}::text = ${A.targetId}`)
    .where(and(eq(A.merchantId, ctx.merchant.id), eq(A.action, "conversation_transferred"), gte(A.createdAt, b.start), lt(A.createdAt, b.end), visibleConversations(ctx)))
    .groupBy(A.actorMembershipId);
  const tickets = await db()
    .select({ id: T.assigneeId, resolved: sql<number>`count(*)::int`, onTime: sql<number>`count(*) filter (where ${ON_TIME})::int` })
    .from(T)
    .where(and(resolvedWhere(ctx, b), isNotNull(T.assigneeId)))
    .groupBy(T.assigneeId);
  const ids = [...new Set([...segs.map((r) => r.id), ...transfers.map((r) => r.id), ...tickets.map((r) => r.id)].filter((x): x is string => !!x))];
  if (ids.length === 0) return [];
  const names = await db()
    .select({ id: schema.membership.id, name: schema.user.name })
    .from(schema.membership)
    .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .where(and(eq(schema.membership.merchantId, ctx.merchant.id), inArray(schema.membership.id, ids)));
  return names
    .map((n) => {
      const s = segs.find((r) => r.id === n.id);
      const tr = transfers.find((r) => r.id === n.id);
      const tk = tickets.find((r) => r.id === n.id);
      const segments = s?.segments ?? 0;
      return {
        membershipId: n.id,
        name: n.name,
        segments,
        firstReplyMedianSec: sec(s?.median),
        transferRate: ratio(tr?.n ?? 0, segments),
        ticketsOnTimeRate: ratio(tk?.onTime ?? 0, tk?.resolved ?? 0),
      };
    })
    .sort((x, y) => y.segments - x.segments || x.name.localeCompare(y.name, "zh-CN"));
}

const platformPeriodOf = (range: DashRange): ShopPeriod => (range === "90d" ? "30d" : range);

async function platformMetrics(ctx: MemberContext, range: DashRange): Promise<DashboardPlatformMetric[]> {
  const period = platformPeriodOf(range);
  const shops = await db()
    .select({ id: schema.shop.id, name: schema.shop.name, platform: schema.shop.platform, market: schema.shop.market, metrics: schema.shop.metrics, metricsAt: schema.shop.metricsAt })
    .from(schema.shop)
    .where(and(visibleShops(ctx), ne(schema.shop.status, "disconnected")))
    .orderBy(asc(schema.shop.platform), asc(schema.shop.name));
  return shops.map((s) => {
    const m: ShopMetric | null = ((s.metrics as StoredMetrics | null) ?? {})[period] ?? null;
    const value = m?.responseRate ?? null;
    const target = m?.target ?? null;
    const status: PlatformMetricStatus = !m ? "not_returned" : value === null ? "no_data" : typeof target !== "number" ? "no_target" : value < target ? "below" : "met";
    return {
      shopId: s.id,
      shopName: s.name,
      platform: s.platform,
      market: s.market,
      label: m?.platformLabel ?? (s.platform === "shopee" ? "Shopee 聊天回复率" : "TikTok 客服回复率"),
      value,
      target,
      basis: m?.basis ?? null,
      responseTimeMins: m?.responseTimeMins ?? null,
      responseTimeDays: m?.responseTimeDays ?? null,
      satisfaction: m?.satisfaction ?? null,
      sessions: m?.sessions ?? null,
      metricsAt: s.metricsAt?.toISOString() ?? null,
      status,
    };
  });
}

type Loaded = Awaited<ReturnType<typeof load>>;

async function load(ctx: MemberContext, range: DashRange) {
  const b = rangeBounds(range, ctx.merchant.timezone);
  const [seg, reasons, drafts, tickets, ppl, metrics] = await Promise.all([
    segmentStats(ctx, b),
    handoffReasons(ctx, b),
    draftStats(ctx, b),
    ticketStats(ctx, b),
    people(ctx, b),
    platformMetrics(ctx, range),
  ]);
  return { b, seg, reasons, drafts, tickets, people: ppl, metrics };
}

function trendOf(l: Loaded): DashboardTrendDay[] {
  return l.b.days.map((date) => {
    const r = l.seg.rows.find((x) => x.day === date);
    const segments = r?.segments ?? 0;
    const aiResolved = r?.ai ?? 0;
    const handedOff = r?.handed ?? 0;
    const human = r?.human ?? 0;
    return { date, segments, aiResolved, handedOff, human, pending: segments - aiResolved - handedOff - human };
  });
}

export async function dashboard(ctx: MemberContext, range: DashRange): Promise<DashboardResponse> {
  const l = await load(ctx, range);
  const sum = <K extends string>(rows: Array<Record<K, number | string>>, k: K) => rows.reduce((s, r) => s + Number(r[k]), 0);
  const segRows = l.seg.rows;
  const segments = sum(segRows, "segments");
  const ended = sum(segRows, "ended");
  const ai = sum(segRows, "ai");
  const handed = sum(segRows, "handed");
  const d = { generated: sum(l.drafts, "generated"), sent: sum(l.drafts, "sent"), editedSent: sum(l.drafts, "editedSent"), ignored: sum(l.drafts, "ignored"), expired: sum(l.drafts, "expired") };
  const { snap, res, byType } = l.tickets;
  return {
    range,
    period: { start: l.b.start.toISOString(), end: l.b.end.toISOString(), days: l.b.days.length },
    timezone: ctx.merchant.timezone,
    shopCount: l.metrics.length,
    kpis: {
      segments,
      aiResolved: ratio(ai, ended),
      firstReplyMedianSec: l.seg.median,
      firstReplySamples: l.seg.samples,
      handoffRate: ratio(handed, segments),
    },
    trend: trendOf(l),
    handoffReasons: l.reasons,
    drafts: {
      ...d,
      other: d.generated - d.sent - d.editedSent - d.ignored - d.expired,
      adoptionRate: ratio(d.sent + d.editedSent, d.sent + d.editedSent + d.ignored),
      editRate: ratio(d.editedSent, d.sent + d.editedSent),
    },
    people: l.people,
    tickets: {
      open: snap?.open ?? 0,
      due6h: snap?.due6h ?? 0,
      overdue: snap?.overdue ?? 0,
      resolved: res?.resolved ?? 0,
      onTimeRate: ratio(res?.onTime ?? 0, res?.resolved ?? 0),
      resolveMedianSec: sec(res?.median),
      platformAutoHandled: res?.autoHandled ?? 0,
      byType: byType.map((r) => ({ type: r.type, label: TYPE_LABEL[r.type], onTime: r.onTime, lateMerchant: r.lateMerchant, latePlatform: r.latePlatform })).sort((x, y) => y.onTime + y.lateMerchant + y.latePlatform - (x.onTime + x.lateMerchant + x.latePlatform)),
    },
    platformMetrics: l.metrics,
    platformPeriod: platformPeriodOf(range),
  };
}

/** 导出：按日一行，最后一行合计；列含会话段去向、人工首响、草稿处置与工单按时 */
export async function dashboardCsv(ctx: MemberContext, range: DashRange): Promise<Response> {
  const l = await load(ctx, range);
  const trend = trendOf(l);
  const header = ["日期", "会话段", "AI 独立解决", "转人工", "人工直接接待", "未回复或进行中", "人工首响中位（秒）", "辅助草稿", "原样发送", "改后发送", "忽略", "过期", "工单已解决", "工单按时解决"];
  const rows: Array<Array<string | number | null>> = trend.map((t) => {
    const s = l.seg.rows.find((x) => x.day === t.date);
    const dr = l.drafts.find((x) => x.day === t.date);
    const tk = l.tickets.daily.find((x) => x.day === t.date);
    return [t.date, t.segments, t.aiResolved, t.handedOff, t.human, t.pending, sec(s?.median), dr?.generated ?? 0, dr?.sent ?? 0, dr?.editedSent ?? 0, dr?.ignored ?? 0, dr?.expired ?? 0, tk?.resolved ?? 0, tk?.onTime ?? 0];
  });
  const total = (i: number) => rows.reduce((s, r) => s + Number(r[i] ?? 0), 0);
  rows.push(["合计", total(1), total(2), total(3), total(4), total(5), l.seg.median, total(7), total(8), total(9), total(10), total(11), total(12), total(13)]);
  const first = l.b.days[0];
  const last = l.b.days[l.b.days.length - 1];
  return csv(`看板_${RANGE_LABEL[range]}_${first}_${last}.csv`, [header, ...rows]);
}
