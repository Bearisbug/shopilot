// Agent 改卡能不能直接生效（RULE-KB-007、INV-KB-010）：会话学习的改已有卡与按卡体检共用这一处。
// 必须同时满足：商户的自动生效没被暂停、这张卡今天没被 Agent 改过、商户今天 Agent 直接生效不到 5 次；「今天」按商户时区。
// 在写版本的同一事务里先锁商户行再数，两个分析任务并发时合计也不越过上限。
import { and, count, eq, gte, sql } from "drizzle-orm";
import { AGENT_DAILY_LIMIT } from "@/contracts/cards";
import { db, schema, type Executor } from "@/server/db/client";
import { inTzText } from "@/server/settings/data";

const V = schema.experienceCardVersion;
const MER = schema.merchant;

/** 商户时区今天 0 点（数据库里算） */
const todayStart = (tz: string) => sql<Date>`(date_trunc('day', now() at time zone ${tz}) at time zone ${tz})`;

/** 今天 Agent 直接生效的改卡次数（每个 Agent 版本算一次） */
async function appliedToday(ex: Executor, merchantId: string, tz: string, cardId?: string): Promise<number> {
  const [row] = await ex
    .select({ n: count() })
    .from(V)
    .where(and(eq(V.merchantId, merchantId), eq(V.author, "agent"), gte(V.createdAt, todayStart(tz)), cardId ? eq(V.cardId, cardId) : undefined));
  return row?.n ?? 0;
}

export async function agentAppliedToday(merchantId: string): Promise<number> {
  const [m] = await db().select({ tz: MER.timezone }).from(MER).where(eq(MER.id, merchantId)).limit(1);
  return m ? appliedToday(db(), merchantId, m.tz) : 0;
}

/** 在事务里调用：锁住商户行后判断；不允许时给出写进建议栏的原因 */
export async function agentApplyAllowed(tx: Executor, merchantId: string, cardId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [m] = await tx
    .select({ tz: MER.timezone, pausedAt: MER.agentAutoapplyPausedAt, reason: MER.agentAutoapplyPauseReason })
    .from(MER)
    .where(eq(MER.id, merchantId))
    .for("update");
  if (!m) return { ok: false, reason: "商户不存在。" };
  if (m.pausedAt) return { ok: false, reason: `自动生效已暂停（${inTzText(m.pausedAt, m.tz, "M 月 d 日")}）：${m.reason ?? "AI 质量周指标连续回落"}。` };
  if ((await appliedToday(tx, merchantId, m.tz, cardId)) >= 1) return { ok: false, reason: "这张卡今天已被 Agent 改过一次。" };
  if ((await appliedToday(tx, merchantId, m.tz)) >= AGENT_DAILY_LIMIT) return { ok: false, reason: `今天 Agent 直接生效的改动已满 ${AGENT_DAILY_LIMIT} 次。` };
  return { ok: true };
}
