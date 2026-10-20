// 看板（DESIGN §8.9 API-DASH-001、REQ-DASH-001；口径见 §3「指标口径补充」与 §9.3 段字段）。
// 统计对象：范围内开始的会话段（回补段、达人会话不计）、范围内生成的辅助草稿与影子回复、范围内解决的工单；
// 组长只算负责店铺（visibleConversations / visibleTickets / visibleShops 收窄），按商户时区切日。
import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, differenceInCalendarDays, format, parseISO, startOfWeek } from "date-fns";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { DashboardIssueList, DashboardIssueStats, DashboardPerson, DashboardPlatformMetric, DashboardResponse, DashboardTrendDay, DashPreset, DashRangeSpec, IssueView, PlatformMetricStatus, Ratio } from "@/contracts/dashboard";
import { ISSUE_LIST_LIMIT, MAX_RANGE_DAYS, MIN_SAMPLE, PRESET_LABEL } from "@/contracts/dashboard";
import type { ShopMetric, ShopPeriod } from "@/contracts/shops";
import { TYPE_LABEL } from "@/contracts/tickets";
import { HANDOFF_LABEL } from "@/server/ai/draft";
import type { MemberContext } from "@/server/auth/context";
import { isInHours, receptionContext, workSeconds } from "@/server/conversations/hours";
import { visibleConversations } from "@/server/conversations/scope";
import { db, schema } from "@/server/db/client";
import { Problem, notFound } from "@/server/http/problem";
import { categoriesOf } from "@/server/issues/categories";
import { csv } from "@/server/http/route";
import { visibleShops } from "@/server/orders/scope";
import type { StoredMetrics } from "@/server/shops/jobs";
import { OPEN_STATUSES, visibleTickets } from "@/server/tickets/scope";

const G = schema.segment;
const C = schema.conversation;
const D = schema.draft;
const T = schema.ticket;
const A = schema.auditLog;
const M = schema.message;

type Bounds = { start: Date; end: Date; days: string[]; preset: DashPreset | null; label: string };
type Span = { start: Date; end: Date };

/**
 * 范围的 [start, end)，按商户时区切日：近 N 天含今天，本周从周一起，本月从 1 日到今天，上月整月；
 * 自定义起止日含首尾，结束日不能晚于今天，最多 MAX_RANGE_DAYS 天。
 */
export function rangeBounds(spec: DashRangeSpec, tz: string, now = new Date()): Bounds {
  const local = new TZDate(now.getTime(), tz);
  const today = new TZDate(local.getFullYear(), local.getMonth(), local.getDate(), 0, 0, 0, tz);
  const tomorrow = addDays(today, 1);
  const monthStart = new TZDate(local.getFullYear(), local.getMonth(), 1, 0, 0, 0, tz);
  let start: Date;
  let end: Date;
  let label: string;
  if ("from" in spec) {
    const [f, t] = [parseISO(spec.from), parseISO(spec.to)];
    start = new TZDate(f.getFullYear(), f.getMonth(), f.getDate(), 0, 0, 0, tz);
    end = addDays(new TZDate(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0, 0, tz), 1);
    if (end.getTime() <= start.getTime()) throw new Problem("validation", { detail: "开始日期不能晚于结束日期。" });
    if (end.getTime() > tomorrow.getTime()) throw new Problem("validation", { detail: "结束日期不能晚于今天。" });
    if (differenceInCalendarDays(t, f) + 1 > MAX_RANGE_DAYS) throw new Problem("validation", { detail: `自定义范围最多 ${MAX_RANGE_DAYS} 天。` });
    label = `${spec.from} 至 ${spec.to}`;
  } else {
    const p = spec.preset;
    [start, end] =
      p === "today"
        ? [today, tomorrow]
        : p === "yesterday"
          ? [addDays(today, -1), today]
          : p === "7d"
            ? [addDays(today, -6), tomorrow]
            : p === "28d"
              ? [addDays(today, -27), tomorrow]
              : p === "90d"
                ? [addDays(today, -89), tomorrow]
                : p === "this_week"
                  ? [startOfWeek(today, { weekStartsOn: 1 }), tomorrow]
                  : p === "this_month"
                    ? [monthStart, tomorrow]
                    : [addMonths(monthStart, -1), monthStart];
    label = PRESET_LABEL[p];
  }
  const days: string[] = [];
  for (let d = new TZDate(start.getTime(), tz); d < end; d = addDays(d, 1)) days.push(format(d, "yyyy-MM-dd"));
  return { start: new Date(start.getTime()), end: new Date(end.getTime()), days, preset: "preset" in spec ? spec.preset : null, label };
}

export const ratio = (num: number, den: number): Ratio => ({ num, den, rate: den >= MIN_SAMPLE ? num / den : null });
const sec = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v)));
const dayOf = (col: PgColumn, tz: string) => sql<string>`to_char(${col} at time zone ${tz}, 'YYYY-MM-DD')`;

// 段的去向按先后判定：AI 独立解决 → 转人工 → Shopilot 回复 → 平台后台回复 → 其余
const AI = sql`${G.aiResolved}`;
const HANDED = sql`(${G.handedOff} and not ${G.aiResolved})`;
const SHOPILOT = sql`(not ${G.handedOff} and not ${G.aiResolved} and ${G.firstHumanReplyAt} is not null)`;
const PLATFORM = sql`(not ${G.handedOff} and not ${G.aiResolved} and ${G.humanReplied} and ${G.firstHumanReplyAt} is null)`;
/** AI 接待段：开段时为辅助或自动模式；影子、未开 AI、开段模式未知的旧段都不算 */
const AI_RECEIVED = sql`${G.openMode} in ('assist', 'auto')`;

function segmentWhere(ctx: MemberContext, b: Span): SQL {
  return and(visibleConversations(ctx), eq(C.buyerKind, "buyer"), eq(G.backfilled, false), gte(G.startedAt, b.start), lt(G.startedAt, b.end))!;
}

async function segmentStats(ctx: MemberContext, b: Bounds) {
  const tz = ctx.merchant.timezone;
  const day = dayOf(G.startedAt, tz);
  return db()
    .select({
      day,
      segments: sql<number>`count(*)::int`,
      ai: sql<number>`count(*) filter (where ${AI})::int`,
      handed: sql<number>`count(*) filter (where ${HANDED})::int`,
      shopilot: sql<number>`count(*) filter (where ${SHOPILOT})::int`,
      platform: sql<number>`count(*) filter (where ${PLATFORM})::int`,
      aiSegments: sql<number>`count(*) filter (where ${AI_RECEIVED})::int`,
      aiEnded: sql<number>`count(*) filter (where ${AI_RECEIVED} and ${G.endedAt} is not null)::int`,
      aiResolvedAi: sql<number>`count(*) filter (where ${AI_RECEIVED} and ${AI})::int`,
      handedAi: sql<number>`count(*) filter (where ${AI_RECEIVED} and ${G.handedOff})::int`,
    })
    .from(G)
    .innerJoin(C, eq(C.id, G.conversationId))
    .where(segmentWhere(ctx, b))
    .groupBy(sql`1`);
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const mean = (xs: number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * 一段人工首响的工作时段秒数；工作时间外开始、在下一个上班时刻之前就回复的段返回 null（不进样本）：
 * 这段等待不占任何工作时段，按「从下一个上班时刻起算」会记成 0 秒，把平均与中位拉到 0。
 */
export function replyWorkSeconds(rc: Parameters<typeof workSeconds>[0], from: Date, reply: Date): number | null {
  const v = workSeconds(rc, from, reply);
  return v === 0 && !isInHours(rc, from) ? null : v;
}

/**
 * 人工首响（§3 指标口径补充）：起点为首条买家消息，转人工前 AI 已回过买家的段改为转人工时刻；
 * 总体的终点是 Shopilot 成员首条回复与开段后首条平台后台回复里较早的一条，按人只取 Shopilot 成员的回复；只累计工作时段。
 * 团队页（API-TEAM-001）共用：团队页用中位，看板用平均。
 */
export async function firstReplyStats(ctx: MemberContext, b: Span) {
  const tz = ctx.merchant.timezone;
  const platformAt = sql<Date | null>`(select min(${M.sentAt}) from ${M} where ${M.conversationId} = ${G.conversationId} and ${M.segmentId} = ${G.id} and ${M.senderRole} = 'platform_human' and ${M.sentAt} >= ${G.startedAt})`.mapWith(M.sentAt);
  const [rc, rows] = await Promise.all([
    receptionContext(ctx.merchant.id),
    db()
      .select({ day: dayOf(G.startedAt, tz), claimedBy: G.firstClaimedBy, startedAt: G.startedAt, firstBuyerAt: G.firstBuyerAt, handedOffAt: G.handedOffAt, aiReplied: G.aiReplied, shopilotAt: G.firstHumanReplyAt, platformAt })
      .from(G)
      .innerJoin(C, eq(C.id, G.conversationId))
      .where(and(segmentWhere(ctx, b), sql`(${G.firstHumanReplyAt} is not null or ${G.humanReplied})`)),
  ]);
  const all: number[] = [];
  const byDay = new Map<string, number[]>();
  const byPerson = new Map<string, number[]>();
  const push = (m: Map<string, number[]>, k: string, v: number) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);
  for (const r of rows) {
    const from = r.handedOffAt && r.aiReplied ? r.handedOffAt : (r.firstBuyerAt ?? r.startedAt);
    const replies = [r.shopilotAt, r.platformAt].filter((t): t is Date => !!t);
    if (replies.length === 0) continue;
    const v = replyWorkSeconds(rc, from, new Date(Math.min(...replies.map((t) => t.getTime()))));
    if (v !== null) {
      all.push(v);
      push(byDay, r.day, v);
    }
    const own = r.claimedBy && r.shopilotAt ? replyWorkSeconds(rc, from, r.shopilotAt) : null;
    if (r.claimedBy && own !== null) push(byPerson, r.claimedBy, own);
  }
  const of = (m: Map<string, number[]>, f: (xs: number[]) => number | null) => new Map([...m].map(([k, v]) => [k, sec(f(v))]));
  return {
    samples: all.length,
    median: sec(median(all)),
    mean: sec(mean(all)),
    byDayMean: of(byDay, mean),
    byPerson: of(byPerson, median),
    byPersonMean: of(byPerson, mean),
  };
}

const TWELVE_HOURS_MS = 12 * 3600_000;

/**
 * 12 小时回复率：以会话段为单位，起点是段内首条买家消息；终点是段内之后第一条发出的回复
 * （Shopilot 成员、AI 发出、平台后台都算；转人工时的安抚句、店铺自动回复、发送失败的不算）。
 * 分母只含已有结论的段：12 小时内已回复，或首条买家消息已过去 12 小时。
 * 按人：只算本人首个认领的段，回复只算本人发出的。
 */
async function replied12hStats(ctx: MemberContext, b: Span, now = new Date()) {
  const tz = ctx.merchant.timezone;
  const sent = sql`${M.direction} = 'out' and (${M.sendStatus} is null or ${M.sendStatus} = 'sent') and coalesce((${M.payload}->>'soothing')::boolean, false) = false and ${M.sentAt} >= ${G.firstBuyerAt}`;
  const anyReply = sql<Date | null>`(select min(${M.sentAt}) from ${M} where ${M.conversationId} = ${G.conversationId} and ${M.segmentId} = ${G.id} and ${M.senderRole} in ('agent', 'ai', 'platform_human') and ${sent})`.mapWith(M.sentAt);
  const ownReply = sql<Date | null>`(select min(${M.sentAt}) from ${M} where ${M.conversationId} = ${G.conversationId} and ${M.segmentId} = ${G.id} and ${M.senderRole} = 'agent' and ${M.sentBy} = ${G.firstClaimedBy} and ${sent})`.mapWith(M.sentAt);
  const rows = await db()
    .select({ day: dayOf(G.startedAt, tz), claimedBy: G.firstClaimedBy, firstBuyerAt: G.firstBuyerAt, anyReply, ownReply })
    .from(G)
    .innerJoin(C, eq(C.id, G.conversationId))
    .where(and(segmentWhere(ctx, b), isNotNull(G.firstBuyerAt)));
  const tally = () => ({ num: 0, den: 0 });
  const total = tally();
  const byPerson = new Map<string, { num: number; den: number }>();
  const byDay = new Map<string, { num: number; den: number }>();
  const count = (t: { num: number; den: number }, from: Date, reply: Date | null) => {
    const deadline = from.getTime() + TWELVE_HOURS_MS;
    const within = !!reply && reply.getTime() <= deadline;
    if (!within && deadline > now.getTime()) return; // 还没等满 12 小时、也还没回：结论未定
    t.den += 1;
    if (within) t.num += 1;
  };
  for (const r of rows) {
    const from = r.firstBuyerAt!;
    count(total, from, r.anyReply);
    count(byDay.get(r.day) ?? byDay.set(r.day, tally()).get(r.day)!, from, r.anyReply);
    if (r.claimedBy) count(byPerson.get(r.claimedBy) ?? byPerson.set(r.claimedBy, tally()).get(r.claimedBy)!, from, r.ownReply);
  }
  return { total, byDay, byPerson };
}

/** 转人工的 AI 接待段按原因：取段内最后一次 EVT:handoff 的 reason；没有事件时取会话当前的 handoff_reason（仅当前段） */
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
    where ${segmentWhere(ctx, b)} and ${HANDED} and ${AI_RECEIVED}
    group by 1
    order by 2 desc, 1`);
  return res.rows.map((r) => ({ reason: r.reason ?? "unknown", label: r.reason ? (HANDOFF_LABEL[r.reason] ?? `未知（${r.reason}）`) : "未记录原因", count: Number(r.n) }));
}

/** 问题提取的视图：全部 = 有买家发言的段；转人工的 = 转人工的 AI 接待段（与转人工原因同口径） */
const issueViewWhere = (view: IssueView): SQL => (view === "handoff" ? sql`(${HANDED} and ${AI_RECEIVED})` : sql`true`);

/** 问题提取：两个视图下各类别的段数与按日趋势；提取后类别被删（外键置空）的段计入「其他」 */
async function issueStats(ctx: MemberContext, b: Bounds) {
  const categories = await categoriesOf(ctx.merchant.id);
  const other = categories.find((x) => x.builtin)!.id;
  const known = new Set(categories.map((x) => x.id));
  const rows = await db()
    .select({
      day: dayOf(G.startedAt, ctx.merchant.timezone),
      category: G.issueCategoryId,
      extracted: sql<boolean>`${G.issueExtractedAt} is not null`,
      handoff: sql<boolean>`(${HANDED} and ${AI_RECEIVED})`,
      n: sql<number>`count(*)::int`,
    })
    .from(G)
    .innerJoin(C, eq(C.id, G.conversationId))
    .where(and(segmentWhere(ctx, b), isNotNull(G.firstBuyerAt)))
    .groupBy(sql`1`, sql`2`, sql`3`, sql`4`);
  const view = (only: (r: (typeof rows)[number]) => boolean): DashboardIssueStats => {
    const mine = rows.filter(only);
    const byCategory = new Map<string, number>();
    const trend = new Map<string, Record<string, number>>();
    let segments = 0;
    let pending = 0;
    for (const r of mine) {
      segments += r.n;
      if (!r.extracted) {
        pending += r.n;
        continue;
      }
      const cat = r.category && known.has(r.category) ? r.category : other;
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + r.n);
      const day = trend.get(r.day) ?? trend.set(r.day, {}).get(r.day)!;
      day[cat] = (day[cat] ?? 0) + r.n;
    }
    return {
      segments,
      pending,
      byCategory: [...byCategory].map(([categoryId, count]) => ({ categoryId, count })).sort((x, y) => y.count - x.count),
      trend: b.days.map((date) => ({ date, counts: trend.get(date) ?? {} })),
    };
  };
  return { categories, views: { all: view(() => true), handoff: view((r) => r.handoff) } };
}

/** 某类别下的会话段（按开始时间倒序，最多 ISSUE_LIST_LIMIT 条）；「其他」含类别被删后置空的段 */
export async function issueList(ctx: MemberContext, spec: DashRangeSpec, view: IssueView, categoryId: string): Promise<DashboardIssueList> {
  const b = rangeBounds(spec, ctx.merchant.timezone);
  const cat = (await categoriesOf(ctx.merchant.id)).find((x) => x.id === categoryId);
  if (!cat) throw notFound("这个问题类别不存在或已删除。");
  const where = and(
    segmentWhere(ctx, b),
    isNotNull(G.firstBuyerAt),
    isNotNull(G.issueExtractedAt),
    issueViewWhere(view),
    cat.builtin ? or(eq(G.issueCategoryId, cat.id), isNull(G.issueCategoryId)) : eq(G.issueCategoryId, cat.id),
  );
  const [{ total }] = await db().select({ total: sql<number>`count(*)::int` }).from(G).innerJoin(C, eq(C.id, G.conversationId)).where(where);
  const items = await db()
    .select({ segmentId: G.id, conversationId: G.conversationId, startedAt: G.startedAt, shopName: schema.shop.name, buyerName: C.buyerName, summary: G.issueSummary })
    .from(G)
    .innerJoin(C, eq(C.id, G.conversationId))
    .innerJoin(schema.shop, eq(schema.shop.id, C.shopId))
    .where(where)
    .orderBy(desc(G.startedAt), desc(G.id))
    .limit(ISSUE_LIST_LIMIT);
  return { categoryId: cat.id, categoryName: cat.name, total, items: items.map((r) => ({ ...r, startedAt: r.startedAt.toISOString() })) };
}

async function draftStats(ctx: MemberContext, b: Bounds) {
  const day = dayOf(D.createdAt, ctx.merchant.timezone);
  const st = (s: string) => sql<number>`count(*) filter (where ${D.mode} = 'assist' and ${D.status} = ${s})::int`;
  return db()
    .select({
      day,
      generated: sql<number>`count(*) filter (where ${D.mode} = 'assist')::int`,
      sent: st("sent"),
      editedSent: st("edited_sent"),
      ignored: st("ignored"),
      expired: st("expired"),
      shadow: sql<number>`count(*) filter (where ${D.mode} = 'shadow')::int`,
    })
    .from(D)
    .innerJoin(C, eq(C.id, D.conversationId))
    .where(and(visibleConversations(ctx), eq(C.buyerKind, "buyer"), inArray(D.mode, ["assist", "shadow"]), gte(D.createdAt, b.start), lt(D.createdAt, b.end)))
    .groupBy(sql`1`);
}

const RESOLVED = sql`${T.resolvedAt} is not null and ${T.status} in ('resolved', 'closed')`;
/** 按时只看有截止时间的；没有截止时间的单列「无时限」，不进按时率 */
const ON_TIME = sql`(${T.dueAt} is not null and ${T.resolvedAt} <= ${T.dueAt})`;
const NO_DUE = sql`${T.dueAt} is null`;
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
      noDue: sql<number>`count(*) filter (where ${NO_DUE})::int`,
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
      noDue: sql<number>`count(*) filter (where ${NO_DUE})::int`,
    })
    .from(T)
    .where(resolvedWhere(ctx, b))
    .groupBy(T.type);
  const day = dayOf(T.resolvedAt, ctx.merchant.timezone);
  const daily = await db()
    .select({ day, resolved: sql<number>`count(*)::int`, onTime: sql<number>`count(*) filter (where ${ON_TIME})::int`, noDue: sql<number>`count(*) filter (where ${NO_DUE})::int` })
    .from(T)
    .where(resolvedWhere(ctx, b))
    .groupBy(sql`1`);
  return { snap, res, byType, daily };
}

async function people(ctx: MemberContext, b: Bounds, replies: Awaited<ReturnType<typeof firstReplyStats>>, r12: Awaited<ReturnType<typeof replied12hStats>>): Promise<DashboardPerson[]> {
  const segs = await db()
    .select({ id: G.firstClaimedBy, segments: sql<number>`count(*)::int` })
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
    .select({ id: T.assigneeId, withDue: sql<number>`count(*) filter (where not ${NO_DUE})::int`, onTime: sql<number>`count(*) filter (where ${ON_TIME})::int` })
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
        firstReplyAvgSec: replies.byPersonMean.get(n.id) ?? null,
        replied12h: ratio(r12.byPerson.get(n.id)?.num ?? 0, r12.byPerson.get(n.id)?.den ?? 0),
        transferRate: ratio(tr?.n ?? 0, segments),
        ticketsOnTimeRate: ratio(tk?.onTime ?? 0, tk?.withDue ?? 0),
      };
    })
    .sort((x, y) => y.segments - x.segments || x.name.localeCompare(y.name, "zh-CN"));
}

/** 平台只存近 7 天、近 30 天、本月、上月四个窗口：本月、上月、近 7 天原样取，其余不超过 7 天取近 7 天，超过取近 30 天 */
export function platformPeriodOf(b: Pick<Bounds, "preset" | "days">): ShopPeriod {
  if (b.preset === "this_month" || b.preset === "last_month" || b.preset === "7d") return b.preset;
  return b.days.length <= 7 ? "7d" : "30d";
}

async function platformMetrics(ctx: MemberContext, period: ShopPeriod): Promise<DashboardPlatformMetric[]> {
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

async function load(ctx: MemberContext, spec: DashRangeSpec) {
  const b = rangeBounds(spec, ctx.merchant.timezone);
  const [replies, r12] = await Promise.all([firstReplyStats(ctx, b), replied12hStats(ctx, b)]);
  const [seg, reasons, issues, drafts, tickets, ppl, metrics] = await Promise.all([
    segmentStats(ctx, b),
    handoffReasons(ctx, b),
    issueStats(ctx, b),
    draftStats(ctx, b),
    ticketStats(ctx, b),
    people(ctx, b, replies, r12),
    platformMetrics(ctx, platformPeriodOf(b)),
  ]);
  return { b, seg, replies, r12, reasons, issues, drafts, tickets, people: ppl, metrics };
}

function trendOf(l: Loaded): DashboardTrendDay[] {
  return l.b.days.map((date) => {
    const r = l.seg.find((x) => x.day === date);
    const segments = r?.segments ?? 0;
    const aiResolved = r?.ai ?? 0;
    const handedOff = r?.handed ?? 0;
    const shopilot = r?.shopilot ?? 0;
    const platform = r?.platform ?? 0;
    return { date, segments, aiResolved, handedOff, shopilot, platform, pending: segments - aiResolved - handedOff - shopilot - platform };
  });
}

export async function dashboard(ctx: MemberContext, spec: DashRangeSpec): Promise<DashboardResponse> {
  const l = await load(ctx, spec);
  const sum = <K extends string>(rows: Array<Record<K, number | string>>, k: K) => rows.reduce((s, r) => s + Number(r[k]), 0);
  const segRows = l.seg;
  const segments = sum(segRows, "segments");
  const d = { generated: sum(l.drafts, "generated"), sent: sum(l.drafts, "sent"), editedSent: sum(l.drafts, "editedSent"), ignored: sum(l.drafts, "ignored"), expired: sum(l.drafts, "expired") };
  const { snap, res, byType } = l.tickets;
  return {
    range: { preset: l.b.preset, from: l.b.days[0], to: l.b.days[l.b.days.length - 1], label: l.b.label },
    period: { start: l.b.start.toISOString(), end: l.b.end.toISOString(), days: l.b.days.length },
    timezone: ctx.merchant.timezone,
    shopCount: l.metrics.length,
    kpis: {
      segments,
      aiResolved: ratio(sum(segRows, "aiResolvedAi"), sum(segRows, "aiEnded")),
      firstReplyAvgSec: l.replies.mean,
      firstReplySamples: l.replies.samples,
      replied12h: ratio(l.r12.total.num, l.r12.total.den),
      handoffRate: ratio(sum(segRows, "handedAi"), sum(segRows, "aiSegments")),
    },
    trend: trendOf(l),
    handoffReasons: l.reasons,
    issues: l.issues,
    drafts: {
      ...d,
      other: d.generated - d.sent - d.editedSent - d.ignored - d.expired,
      shadow: sum(l.drafts, "shadow"),
      adoptionRate: ratio(d.sent + d.editedSent, d.sent + d.editedSent + d.ignored),
      editRate: ratio(d.editedSent, d.sent + d.editedSent),
    },
    people: l.people,
    tickets: {
      open: snap?.open ?? 0,
      due6h: snap?.due6h ?? 0,
      overdue: snap?.overdue ?? 0,
      resolved: res?.resolved ?? 0,
      onTimeRate: ratio(res?.onTime ?? 0, (res?.resolved ?? 0) - (res?.noDue ?? 0)),
      noDue: res?.noDue ?? 0,
      resolveMedianSec: sec(res?.median),
      platformAutoHandled: res?.autoHandled ?? 0,
      byType: byType
        .map((r) => ({ type: r.type, label: TYPE_LABEL[r.type], onTime: r.onTime, lateMerchant: r.lateMerchant, latePlatform: r.latePlatform, noDue: r.noDue }))
        .sort((x, y) => y.onTime + y.lateMerchant + y.latePlatform + y.noDue - (x.onTime + x.lateMerchant + x.latePlatform + x.noDue)),
    },
    platformMetrics: l.metrics,
    platformPeriod: platformPeriodOf(l.b),
  };
}

/** 导出：按日一行，最后一行合计；列含会话段去向、人工首响、12 小时回复、草稿处置、影子回复与工单按时 */
export async function dashboardCsv(ctx: MemberContext, spec: DashRangeSpec): Promise<Response> {
  const l = await load(ctx, spec);
  const trend = trendOf(l);
  const header = ["日期", "会话段", "AI 独立解决", "转人工", "Shopilot 回复", "平台后台回复", "未回复或进行中", "人工首响平均（秒）", "12 小时内回复", "12 小时回复率分母", "辅助草稿", "原样发送", "改后发送", "忽略", "过期", "影子回复", "工单已解决", "工单按时解决", "工单无时限"];
  const AVG_COL = 7;
  const rows: Array<Array<string | number | null>> = trend.map((t) => {
    const dr = l.drafts.find((x) => x.day === t.date);
    const tk = l.tickets.daily.find((x) => x.day === t.date);
    const r12 = l.r12.byDay.get(t.date);
    return [t.date, t.segments, t.aiResolved, t.handedOff, t.shopilot, t.platform, t.pending, l.replies.byDayMean.get(t.date) ?? null, r12?.num ?? 0, r12?.den ?? 0, dr?.generated ?? 0, dr?.sent ?? 0, dr?.editedSent ?? 0, dr?.ignored ?? 0, dr?.expired ?? 0, dr?.shadow ?? 0, tk?.resolved ?? 0, tk?.onTime ?? 0, tk?.noDue ?? 0];
  });
  const total = (i: number) => rows.reduce((s, r) => s + Number(r[i] ?? 0), 0);
  rows.push(["合计", ...header.slice(1).map((_, k) => (k + 1 === AVG_COL ? l.replies.mean : total(k + 1)))]);
  const first = l.b.days[0];
  const last = l.b.days[l.b.days.length - 1];
  return csv(`看板_${l.b.preset ? PRESET_LABEL[l.b.preset] : "自定义"}_${first}_${last}.csv`, [header, ...rows]);
}
