// 按卡定时体检（REQ-KB-014，§12.18）：card.review 每天 19:40 UTC 给每个商户挑最多 10 张卡——已发布、近 7 天用到它的草稿 ≥ 3、
// 其中有问题信号（辅助草稿改后发送或弃用、影子回复部分一致或不一致、按卡转人工或建工单后人工又回复）、24 小时内没有新版本、今天还没体检过，
// 按问题比例排序；每张卡建一个「按卡体检」学习任务（代表性用例的对话作快照，证据记草稿 ID 与处置统计），交给 learning.analyze。
// 只读草稿、对比与消息；按段查消息一律带会话条件（message 只有（会话、时间）索引）。
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import type { CardReviewEvidence, CardReviewItem } from "@/contracts/cards";
import { db, schema } from "@/server/db/client";
import { enqueue } from "@/server/jobs/boss";
import type { RegressionCase } from "./retest";
import { snapshotOf } from "./snapshot";

const C = schema.experienceCard;
const D = schema.draft;
const R = schema.draftReview;
const M = schema.message;
const T = schema.learningTask;

export const REVIEW_PER_MERCHANT = 10;
export const REVIEW_DAYS = 7;
export const REVIEW_MIN_DRAFTS = 3;
export const EVIDENCE_MAX = 12;
/** 证据里原样发送的用例最多取几个当回归用例 */
export const SENT_REGRESSIONS_MAX = 3;
/** 代表性用例的对话快照取到买家那条消息为止的最近几条 */
const SNAPSHOT_TURNS = 20;

/** 草稿 d 的问题信号（SQL 片段，d 是 draft 的别名） */
const PROBLEM = sql.raw(`(
  d.status in ('edited_sent', 'ignored')
  or exists (select 1 from draft_review r where r.draft_id = d.id and r.consistency in ('partial', 'different'))
  or (d.card->>'action' in ('handoff', 'ticket') and exists (
    select 1 from message m where m.conversation_id = d.conversation_id and m.segment_id = d.segment_id and m.sender_role = 'agent' and m.sent_at > d.created_at))
)`);
/** 一个商户今天要体检的卡，按问题比例排序 */
export async function pickCardsForReview(merchantId: string, limit = REVIEW_PER_MERCHANT): Promise<Array<{ cardId: string; total: number; problems: number }>> {
  const res = await db().execute<{ card_id: string; total: number; problems: number }>(sql`
    select c.id as card_id, count(*)::int as total, (count(*) filter (where ${PROBLEM}))::int as problems
    from experience_card c
    join draft d on d.card_id = c.id and d.created_at >= now() - make_interval(days => ${REVIEW_DAYS})
    where c.merchant_id = ${merchantId} and c.status = 'published'
      and not exists (select 1 from experience_card_version v where v.card_id = c.id and v.created_at > now() - interval '24 hours')
      and not exists (select 1 from learning_task t where t.kind = 'card_review' and t.target_card_id = c.id
        and (t.created_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date)
    group by c.id
    having count(*) >= ${REVIEW_MIN_DRAFTS} and count(*) filter (where ${PROBLEM}) >= 1
    order by (count(*) filter (where ${PROBLEM}))::float / count(*) desc, count(*) desc
    limit ${limit}`);
  return res.rows.map((r) => ({ cardId: r.card_id, total: Number(r.total), problems: Number(r.problems) }));
}

/** 证据：近 7 天用到这张卡的草稿，有问题的、问题重的在前，再按新到旧，取 12 份；统计按全部草稿 */
export async function buildEvidence(cardId: string): Promise<{ evidence: CardReviewEvidence; representativeId: string | null }> {
  const rows = await db().execute<{ id: string; problem: boolean }>(sql`
    select d.id, ${PROBLEM} as problem from draft d
    where d.card_id = ${cardId} and d.created_at >= now() - make_interval(days => ${REVIEW_DAYS})
    -- 有问题的在前，问题轻重：弃用 > 不一致 > 改后发送 > 部分一致 > 其他
    order by ${PROBLEM} desc, (case
      when d.status = 'ignored' then 0
      when exists (select 1 from draft_review r where r.draft_id = d.id and r.consistency = 'different') then 1
      when d.status = 'edited_sent' then 2
      when exists (select 1 from draft_review r where r.draft_id = d.id and r.consistency = 'partial') then 3
      else 4 end), d.created_at desc
    limit ${EVIDENCE_MAX}`);
  const [counts] = (
    await db().execute<CardReviewEvidence["counts"]>(sql`
      select
        (count(*) filter (where d.status = 'sent'))::int as "sent",
        (count(*) filter (where d.status = 'edited_sent'))::int as "edited",
        (count(*) filter (where d.status = 'ignored'))::int as "ignored",
        (count(*) filter (where r.consistency = 'same'))::int as "shadowSame",
        (count(*) filter (where r.consistency = 'partial'))::int as "shadowPartial",
        (count(*) filter (where r.consistency = 'different'))::int as "shadowDifferent",
        (count(*) filter (where d.card->>'action' in ('handoff', 'ticket')))::int as "handoffs"
      from draft d left join draft_review r on r.draft_id = d.id and r.kind = 'shadow'
      where d.card_id = ${cardId} and d.created_at >= now() - make_interval(days => ${REVIEW_DAYS})`)
  ).rows;
  return {
    evidence: { draftIds: rows.rows.map((r) => r.id), counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)])) as CardReviewEvidence["counts"] },
    representativeId: rows.rows.find((r) => r.problem)?.id ?? null,
  };
}

type DraftRow = typeof D.$inferSelect;

/** 草稿出稿时的对话：会话里到触发消息为止的最近 20 条（带会话条件走索引），问题是触发那条买家文字 */
async function turnsAt(d: DraftRow) {
  const [trigger] = d.triggerMessageId ? await db().select().from(M).where(and(eq(M.conversationId, d.conversationId), eq(M.id, d.triggerMessageId))).limit(1) : [];
  const upTo = trigger?.sentAt ?? d.createdAt;
  const rows = (
    await db()
      .select()
      .from(M)
      .where(and(eq(M.conversationId, d.conversationId), lte(M.sentAt, upTo)))
      .orderBy(desc(M.sentAt), desc(M.createdAt))
      .limit(SNAPSHOT_TURNS)
  ).reverse();
  const question = (trigger?.senderRole === "buyer" && trigger.text?.trim() ? trigger.text : rows.filter((r) => r.senderRole === "buyer" && r.type === "text" && r.text?.trim()).at(-1)?.text) ?? "";
  return { trigger, rows, question };
}

/** 草稿之后人工最终发出的内容：有草稿对比就用对比时取的人工回复，否则取同一段里草稿之后客服发的最多 3 条 */
async function humanAfter(d: DraftRow, compared: string | null): Promise<string | null> {
  if (compared) return compared;
  if (!d.segmentId) return null;
  const rows = await db()
    .select({ text: M.text })
    .from(M)
    .where(and(eq(M.conversationId, d.conversationId), eq(M.segmentId, d.segmentId), eq(M.senderRole, "agent"), sql`${M.sentAt} > ${d.createdAt}`))
    .orderBy(M.sentAt)
    .limit(3);
  const text = rows.map((r) => r.text?.trim()).filter(Boolean).join("\n");
  return text || null;
}

export type ReviewCase = {
  draftId: string;
  question: string;
  aiReply: string;
  step: number | null;
  action: string | null;
  disposition: DraftRow["status"];
  mode: DraftRow["mode"];
  humanReply: string | null;
  compare: { editClass: string; consistency: string; reason: string | null } | null;
};

/** 体检交给模型的用例（按证据顺序） */
export async function loadReviewCases(draftIds: string[]): Promise<ReviewCase[]> {
  if (draftIds.length === 0) return [];
  const drafts = await db().select().from(D).where(inArray(D.id, draftIds));
  const reviews = await db().select().from(R).where(inArray(R.draftId, draftIds));
  const reviewOf = new Map(reviews.map((r) => [r.draftId, r]));
  const out: ReviewCase[] = [];
  for (const id of draftIds) {
    const d = drafts.find((x) => x.id === id);
    if (!d) continue;
    const r = reviewOf.get(d.id);
    const { question } = await turnsAt(d);
    out.push({
      draftId: d.id,
      question,
      aiReply: d.text,
      step: d.card?.step ?? null,
      action: d.card?.action ?? null,
      disposition: d.status,
      mode: d.mode,
      humanReply: await humanAfter(d, r?.humanText ?? null),
      compare: r ? { editClass: r.editClass, consistency: r.consistency, reason: r.reason } : null,
    });
  }
  return out;
}

/** 证据里原样发送的草稿（最多 3 个）复原成回归用例：按草稿出稿时的对话模拟改前改后 */
export async function sentCases(draftIds: string[]): Promise<RegressionCase[]> {
  if (draftIds.length === 0) return [];
  const drafts = await db()
    .select()
    .from(D)
    .where(and(inArray(D.id, draftIds), eq(D.status, "sent")));
  const out: RegressionCase[] = [];
  for (const id of draftIds) {
    const d = drafts.find((x) => x.id === id);
    if (!d || out.length >= SENT_REGRESSIONS_MAX) continue;
    const { rows, question } = await turnsAt(d);
    if (!question) continue;
    const [conv] = await db().select({ shopId: schema.conversation.shopId }).from(schema.conversation).where(eq(schema.conversation.id, d.conversationId)).limit(1);
    const [seg] = d.segmentId ? await db().select({ stage: schema.segment.stage }).from(schema.segment).where(eq(schema.segment.id, d.segmentId)).limit(1) : [];
    if (!conv) continue;
    out.push({
      draftId: d.id,
      conversationId: d.conversationId,
      segmentId: d.segmentId,
      shopId: conv.shopId,
      stage: seg?.stage ?? "unknown",
      productIds: [],
      question,
      conversation: rows.map((m) => ({ from: snapshotOf(m, false).from, type: m.type, text: m.text ?? `[${m.type}]`, at: m.sentAt.toISOString() })),
    });
  }
  return out;
}

/** card.review：每个正常商户（给了 merchantId 只跑这一家，手动补跑用）挑卡、建体检任务并排分析 */
export async function reviewCards(data: Record<string, unknown> = {}): Promise<{ merchants: number; reviewed: number }> {
  const only = typeof data.merchantId === "string" ? data.merchantId : null;
  const merchants = await db()
    .select({ id: schema.merchant.id })
    .from(schema.merchant)
    .where(and(eq(schema.merchant.status, "active"), only ? eq(schema.merchant.id, only) : undefined));
  let reviewed = 0;
  for (const m of merchants) {
    for (const pick of await pickCardsForReview(m.id)) {
      const [card] = await db().select().from(C).where(eq(C.id, pick.cardId)).limit(1);
      if (!card) continue;
      const { evidence, representativeId } = await buildEvidence(card.id);
      const [rep] = representativeId ? await db().select().from(D).where(eq(D.id, representativeId)).limit(1) : [];
      if (!rep) continue;
      const [conv] = await db().select({ shopId: schema.conversation.shopId }).from(schema.conversation).where(eq(schema.conversation.id, rep.conversationId)).limit(1);
      const [seg] = rep.segmentId ? await db().select({ stage: schema.segment.stage }).from(schema.segment).where(eq(schema.segment.id, rep.segmentId)).limit(1) : [];
      if (!conv) continue;
      const { trigger, rows, question } = await turnsAt(rep);
      const [task] = await db()
        .insert(T)
        .values({
          merchantId: m.id,
          shopId: conv.shopId,
          conversationId: rep.conversationId,
          segmentId: rep.segmentId,
          source: "agent",
          kind: "card_review",
          messages: rows.map((r) => snapshotOf(r, r.id === trigger?.id)),
          productIds: card.productIds,
          productStatus: card.productIds.length === 0 ? "none" : card.productIds.length > 1 ? "multiple" : "identified",
          stage: card.stage === "any" ? (seg?.stage ?? "unknown") : card.stage,
          targetCardId: card.id,
          evidence,
          testQuestion: question || null,
        })
        .onConflictDoNothing()
        .returning();
      if (!task) continue;
      reviewed += 1;
      await enqueue("learning.analyze", { taskId: task.id }, { singletonKey: task.id });
    }
  }
  return { merchants: merchants.length, reviewed };
}

/** API-KB-031 的体检记录：这张卡最近 10 次 */
export async function reviewHistory(merchantId: string, cardId: string): Promise<CardReviewItem[]> {
  const rows = await db()
    .select()
    .from(T)
    .where(and(eq(T.merchantId, merchantId), eq(T.kind, "card_review"), eq(T.targetCardId, cardId)))
    .orderBy(desc(T.createdAt))
    .limit(10);
  return rows.map((r) => ({
    taskId: r.id,
    createdAt: r.createdAt.toISOString(),
    status: r.status,
    result: r.result,
    reason: r.reason ?? r.error,
    version: r.publishedCardId === cardId ? r.publishedVersion : null,
  }));
}
