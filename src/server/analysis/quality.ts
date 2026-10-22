// AI 质量周指标与自动生效暂停（REQ-KB-015，§12.19，11.20）：ai.quality_weekly 每周一 00:30 UTC 逐商户算上一周（周一到周日，UTC）——
// 辅助草稿采纳率（原样 + 改后）/（原样 + 改后 + 弃用）、影子一致率 一致 /（一致 + 部分一致 + 不一致）、转人工率 转人工的 AI 接待段 / AI 接待段；
// 同时重算前两周（重跑覆盖同一周）。采纳率或一致率中，三周样本都 ≥ 20 的一项连续两周各比前一周降 ≥ 5 个百分点，就暂停 Agent 改卡直接生效，
// 通知管理员；已暂停的不重复通知。只有管理员能恢复（API-KB-044）。
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { AGENT_DAILY_LIMIT, type AgentStatus } from "@/contracts/cards";
import type { MemberContext } from "@/server/auth/context";
import { audit, systemActor } from "@/server/core/audit";
import { admins, notify } from "@/server/core/notify";
import { db, schema } from "@/server/db/client";
import { agentAppliedToday } from "@/server/knowledge/agent-apply";

const W = schema.aiQualityWeek;
const MER = schema.merchant;
/** 一项指标某周至少多少样本才参与暂停判断；连续两周各降多少（百分点） */
export const BRAKE_MIN_SAMPLES = 20;
export const BRAKE_DROP = 0.05;
/** 看板与状态接口返回最近几周 */
export const WEEKS_SHOWN = 12;

const DAY = 86400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** 某个时刻所在周的周一（UTC），YYYY-MM-DD */
export function weekStartOf(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7;
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY));
}
const addDays = (ymd: string, n: number) => iso(new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY));

/** 算一个商户某一周的三项指标并写入（同一周覆盖） */
export async function computeQualityWeek(merchantId: string, weekStart: string) {
  const from = new Date(`${weekStart}T00:00:00Z`);
  const to = new Date(from.getTime() + 7 * DAY);
  const [assist, shadow, segs] = await Promise.all([
    db().execute<{ sent: number; edited: number; ignored: number }>(sql`
      select (count(*) filter (where status = 'sent'))::int as sent, (count(*) filter (where status = 'edited_sent'))::int as edited,
             (count(*) filter (where status = 'ignored'))::int as ignored
      from draft where merchant_id = ${merchantId} and mode = 'assist' and disposed_at >= ${from} and disposed_at < ${to}`),
    db().execute<{ same: number; partial: number; different: number }>(sql`
      select (count(*) filter (where consistency = 'same'))::int as same, (count(*) filter (where consistency = 'partial'))::int as partial,
             (count(*) filter (where consistency = 'different'))::int as different
      from draft_review where merchant_id = ${merchantId} and kind = 'shadow' and compared_at >= ${from} and compared_at < ${to}`),
    // AI 接待段：开段时店铺接待模式为辅助或自动的段（§3 口径），回补的不算
    db().execute<{ total: number; handed: number }>(sql`
      select count(*)::int as total, (count(*) filter (where handed_off))::int as handed
      from segment where merchant_id = ${merchantId} and started_at >= ${from} and started_at < ${to}
        and open_mode in ('assist', 'auto') and not backfilled`),
  ]);
  const a = assist.rows[0];
  const s = shadow.rows[0];
  const g = segs.rows[0];
  const values = {
    assistSent: Number(a.sent),
    assistEdited: Number(a.edited),
    assistIgnored: Number(a.ignored),
    shadowSame: Number(s.same),
    shadowPartial: Number(s.partial),
    shadowDifferent: Number(s.different),
    aiSegments: Number(g.total),
    aiHandoffs: Number(g.handed),
    computedAt: new Date(),
  };
  await db()
    .insert(W)
    .values({ merchantId, weekStart, ...values })
    .onConflictDoUpdate({ target: [W.merchantId, W.weekStart], set: values });
}

type WeekRow = typeof W.$inferSelect;
const adoptionOf = (w: WeekRow) => ({ num: w.assistSent + w.assistEdited, den: w.assistSent + w.assistEdited + w.assistIgnored });
const consistencyOf = (w: WeekRow) => ({ num: w.shadowSame, den: w.shadowSame + w.shadowPartial + w.shadowDifferent });
const pct = (r: { num: number; den: number }) => `${Math.round((r.num / r.den) * 100)}%`;

/**
 * 三周（旧 → 新）是否触发暂停：某一项三周样本都 ≥ 20，且 W-2→W-1、W-1→W 各降 ≥ 5 个百分点；
 * 触发时返回写进暂停原因的一句话，如「辅助草稿采纳率连续两周下降：62% → 55% → 48%」。
 */
export function brakeReason(weeks: WeekRow[]): string | null {
  if (weeks.length < 3) return null;
  for (const [label, of] of [
    ["辅助草稿采纳率", adoptionOf],
    ["影子回复一致率", consistencyOf],
  ] as const) {
    const r = weeks.map(of);
    if (r.some((x) => x.den < BRAKE_MIN_SAMPLES)) continue;
    const rate = r.map((x) => x.num / x.den);
    if (rate[0] - rate[1] >= BRAKE_DROP - 1e-9 && rate[1] - rate[2] >= BRAKE_DROP - 1e-9) return `${label}连续两周下降：${r.map(pct).join(" → ")}`;
  }
  return null;
}

/** 看最近算完的三周，满足条件就暂停并通知管理员（已暂停的不再处理） */
export async function checkBrake(merchantId: string, lastWeek: string): Promise<boolean> {
  const weeks = await db()
    .select()
    .from(W)
    .where(and(eq(W.merchantId, merchantId), sql`${W.weekStart} in (${addDays(lastWeek, -14)}, ${addDays(lastWeek, -7)}, ${lastWeek})`))
    .orderBy(asc(W.weekStart));
  const reason = brakeReason(weeks);
  if (!reason) return false;
  const [paused] = await db()
    .update(MER)
    .set({ agentAutoapplyPausedAt: new Date(), agentAutoapplyPauseReason: reason, updatedAt: new Date() })
    .where(and(eq(MER.id, merchantId), sql`${MER.agentAutoapplyPausedAt} is null`))
    .returning({ id: MER.id });
  if (!paused) return false;
  await notify({
    merchantId,
    membershipIds: await admins(merchantId),
    event: "agent_autoapply_paused",
    title: "Agent 自动改卡已暂停",
    body: `${reason}。Agent 改卡改为先审，管理员可在知识库「经验卡」页签恢复。`,
    link: "/reception/knowledge?tab=cards",
    dedupeKey: `agent_autoapply_paused:${lastWeek}`,
  });
  const last = weeks[weeks.length - 1];
  await audit(systemActor(merchantId), {
    module: "reception",
    action: "agent_autoapply_paused",
    summary: `Agent 自动改卡已暂停：${reason}`,
    targetType: "merchant",
    targetId: merchantId,
    data: { metric: reason.startsWith("辅助") ? "adoption" : "consistency", rates: weeks.map((w) => (reason.startsWith("辅助") ? pct(adoptionOf(w)) : pct(consistencyOf(w)))), samples: reason.startsWith("辅助") ? adoptionOf(last).den : consistencyOf(last).den },
  });
  return true;
}

/** ai.quality_weekly：给了 merchantId 只算这一家（手动补算用），now 只供测试 */
export async function qualityWeekly(data: Record<string, unknown> = {}, now = new Date()): Promise<{ merchants: number; paused: number }> {
  const only = typeof data.merchantId === "string" ? data.merchantId : null;
  const lastWeek = addDays(weekStartOf(now), -7);
  const merchants = await db()
    .select({ id: MER.id })
    .from(MER)
    .where(and(eq(MER.status, "active"), only ? eq(MER.id, only) : undefined));
  let paused = 0;
  for (const m of merchants) {
    for (const w of [addDays(lastWeek, -14), addDays(lastWeek, -7), lastWeek]) await computeQualityWeek(m.id, w);
    if (await checkBrake(m.id, lastWeek)) paused += 1;
  }
  return { merchants: merchants.length, paused };
}

/** API-KB-044：清掉暂停；没暂停时照常返回、不写审计 */
export async function resumeAutoapply(ctx: MemberContext): Promise<{ paused: null }> {
  const [cleared] = await db()
    .update(MER)
    .set({ agentAutoapplyPausedAt: null, agentAutoapplyPauseReason: null, updatedAt: new Date() })
    .where(and(eq(MER.id, ctx.merchant.id), sql`${MER.agentAutoapplyPausedAt} is not null`))
    .returning({ id: MER.id });
  if (cleared) {
    const pausedAt = ctx.merchant.agentAutoapplyPausedAt;
    await audit(ctx.actor, {
      module: "reception",
      action: "agent_autoapply_resumed",
      summary: "恢复 Agent 自动改卡",
      targetType: "merchant",
      targetId: ctx.merchant.id,
      data: { paused_days: pausedAt ? Math.round((Date.now() - pausedAt.getTime()) / DAY) : null },
    });
  }
  return { paused: null };
}

/** API-KB-045：暂停状态、今天 Agent 直接生效几次、最近 12 周（旧的在前） */
export async function agentStatus(ctx: MemberContext): Promise<AgentStatus> {
  const [m] = await db().select({ at: MER.agentAutoapplyPausedAt, reason: MER.agentAutoapplyPauseReason }).from(MER).where(eq(MER.id, ctx.merchant.id)).limit(1);
  const rows = await db().select().from(W).where(eq(W.merchantId, ctx.merchant.id)).orderBy(desc(W.weekStart)).limit(WEEKS_SHOWN);
  return {
    paused: m?.at ? { at: m.at.toISOString(), reason: m.reason } : null,
    todayApplied: await agentAppliedToday(ctx.merchant.id),
    dailyLimit: AGENT_DAILY_LIMIT,
    weeks: rows.reverse().map((w) => ({ weekStart: w.weekStart, adoption: adoptionOf(w), consistency: consistencyOf(w), handoff: { num: w.aiHandoffs, den: w.aiSegments } })),
  };
}
