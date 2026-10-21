// 会话学习的后台任务（§12.17、§17）：
// - learning.analyze：相似卡前 5（带产品、阶段是否对得上与近 30 天调用次数）、相关问答前 5 → DeepSeek（learn）给诊断与卡；
//   已有内容覆盖 / 证据不足 / 知识缺失 → 结束；冲突 → 待审核（不带拟发布内容）；新卡 → 内部测试后待审核；
//   改已有卡 → 复测，通过即写 Agent 版本（标还没人看过），不通过结束并记原因；AI 出错 → 分析失败，可重新分析。
// - learning.pick：每天挑最近 7 天已结束、有人工回复、还没有学习任务的会话段，按信号打分，每商户最多 20 段。
// 分析、内部测试与复测都不计商户的出稿用量。
import { and, count, desc, eq, gte, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { BRANCH_ACTIONS, CARD_BRANCHES_MAX, CARD_CONDITION_MAX, CARD_CONDITIONS_MAX, CARD_STEP_MAX, CARD_STEPS_MAX, CARD_TIPS_MAX, CARD_TITLE_MAX, DIAGNOSES, zCardContent, type CardContent, type Diagnosis, type LearningSimilar } from "@/contracts/cards";
import { AiError, chat, parseJson } from "@/server/ai/client";
import { LEARN_PROMPT } from "@/server/ai/prompts";
import { simulateDraft } from "@/server/ai/simulate";
import { audit, systemActor } from "@/server/core/audit";
import { db, schema } from "@/server/db/client";
import { enqueue } from "@/server/jobs/boss";
import { identifyProductsWithBasis } from "@/server/products/dictionary";
import { cardContentOf, needsEmbed, tryEmbedCard, writeCardVersion, type CardRow } from "./card-store";
import { embedTexts } from "./embed";
import { basisText, buyerTextsOf, productCardIdsOf, productStatusOf, snapshotOf, SNAPSHOT_MAX } from "./learning";
import { retestProposal, simInputOf, type TaskRow } from "./retest";

const T = schema.learningTask;
const C = schema.experienceCard;
const Q = schema.knowledgeQa;
const SIMILAR_MAX = 5;
const RELATED_QA_MAX = 5;
/** Agent 每天挑会话：每商户最多几段、看最近几天、至少几分 */
export const PICK_PER_MERCHANT = 20;
export const PICK_DAYS = 7;
export const PICK_MIN_SCORE = 2;

const clipText = (s: unknown, max: number) => (typeof s === "string" ? [...s.trim()].slice(0, max).join("") : "");

type SimilarCard = { key: string; row: CardRow; distance: number; productMatch: boolean; stageMatch: boolean; calls30: number };

/** 用最后一条买家文字（没有就用备注）检索已发布卡与问答；向量化失败时都为空，不影响分析 */
async function neighbors(task: TaskRow, market: string | null): Promise<{ cards: SimilarCard[]; qa: Array<{ questions: string[]; answer: string }> }> {
  const text = simInputOf(task).question || task.note || "";
  if (!text.trim()) return { cards: [], qa: [] };
  let vec: number[];
  try {
    [vec] = await embedTexts([text]);
  } catch {
    return { cards: [], qa: [] };
  }
  const literal = `[${vec.join(",")}]`;
  const marketCond = (col: typeof C.markets | typeof Q.markets): SQL[] => (market ? [sql`(${col} @> '["ALL"]'::jsonb or ${col} @> ${JSON.stringify([market])}::jsonb)`] : []);
  const cd = sql<number>`(${C.embedding} <=> ${literal}::vector)`;
  const qd = sql<number>`(${Q.embedding} <=> ${literal}::vector)`;
  const [cards, qa] = await Promise.all([
    db()
      .select({ row: C, distance: cd })
      .from(C)
      .where(and(eq(C.merchantId, task.merchantId), eq(C.status, "published"), isNotNull(C.embedding), ...marketCond(C.markets)))
      .orderBy(cd)
      .limit(SIMILAR_MAX),
    db()
      .select({ questions: Q.questions, answer: Q.answer })
      .from(Q)
      .where(and(eq(Q.merchantId, task.merchantId), eq(Q.status, "published"), isNotNull(Q.embedding), ...marketCond(Q.markets)))
      .orderBy(qd)
      .limit(RELATED_QA_MAX),
  ]);
  const ids = cards.map((c) => c.row.id);
  const calls = ids.length
    ? await db()
        .select({ id: schema.draft.cardId, n: count() })
        .from(schema.draft)
        .where(and(inArray(schema.draft.cardId, ids), gte(schema.draft.createdAt, new Date(Date.now() - 30 * 86400_000))))
        .groupBy(schema.draft.cardId)
    : [];
  const callsOf = new Map(calls.map((c) => [c.id, c.n]));
  return {
    cards: cards.map((c, i) => ({
      key: `S${i + 1}`,
      row: c.row,
      distance: Number(c.distance),
      productMatch: c.row.productIds.length === 0 || task.productIds.length === 0 || c.row.productIds.some((id) => task.productIds.includes(id)),
      stageMatch: c.row.stage === "any" || task.stage === "unknown" || c.row.stage === task.stage,
      calls30: callsOf.get(c.row.id) ?? 0,
    })),
    qa,
  };
}

/**
 * 模型写的卡转成卡内容：超长的截断、多出的条目丢掉、跳转不合法的分支丢掉。
 * 改已有卡（base）时适用范围不由模型改：产品、阶段、站点、标签、关联问答都沿用原卡——Agent 改卡复测通过即生效，
 * 范围被改窄或改成通用会悄悄影响别的产品。新卡的产品按物料编码对到产品，站点用全部站点。仍不合规时返回 null。
 */
export function cardFromModel(raw: unknown, base: CardContent | null, codeToId: Map<string, string>, fallbackStage: string): CardContent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const steps = (Array.isArray(r.steps) ? r.steps : []).slice(0, CARD_STEPS_MAX).map((st) => {
    const s = (st ?? {}) as Record<string, unknown>;
    return { text: clipText(s.text, CARD_STEP_MAX), rawBranches: Array.isArray(s.branches) ? s.branches : [] };
  });
  const stepCount = steps.length;
  const codes = Array.isArray(r.product_codes) ? r.product_codes.map((x) => String(x).trim().toUpperCase()) : null;
  const stage = ["presale", "insale", "aftersale", "any"].includes(String(r.stage)) ? String(r.stage) : (base?.stage ?? (fallbackStage === "unknown" ? "any" : fallbackStage));
  const content = {
    title: clipText(r.title, CARD_TITLE_MAX),
    productIds: base ? base.productIds : codes ? [...new Set(codes.map((c) => codeToId.get(c)).filter((v): v is string => !!v))] : [],
    stage: base ? base.stage : stage,
    markets: base?.markets ?? ["ALL"],
    tags: base?.tags ?? [],
    conditions: (Array.isArray(r.conditions) ? r.conditions : []).map((x) => clipText(x, CARD_CONDITION_MAX)).filter(Boolean).slice(0, CARD_CONDITIONS_MAX),
    conditionMode: r.condition_mode === "any" ? "any" : "all",
    steps: steps.map((s, i) => ({
      text: s.text,
      branches: s.rawBranches
        .map((b) => (b ?? {}) as Record<string, unknown>)
        .filter((b) => (BRANCH_ACTIONS as readonly string[]).includes(String(b.action)))
        .map((b) => ({ when: clipText(b.when, CARD_CONDITION_MAX), action: String(b.action), ...(b.action === "goto" ? { goto: Number(b.goto) } : {}) }))
        .filter((b) => b.when && (b.action !== "goto" || (Number.isInteger(b.goto) && b.goto! >= 1 && b.goto! <= stepCount && b.goto !== i + 1)))
        .slice(0, CARD_BRANCHES_MAX),
    })),
    tips: typeof r.tips === "string" && r.tips.trim() ? clipText(r.tips, CARD_TIPS_MAX) : null,
    qaIds: base?.qaIds ?? [],
  };
  const parsed = zCardContent.safeParse(content);
  return parsed.success ? parsed.data : null;
}

type LearnOutput = { diagnosis: Diagnosis; reason: string; suggestion: string; action: "none" | "new_card" | "edit_card"; target: string | null; card: unknown; testQuestion: string };

function parseLearn(j: Record<string, unknown>): LearnOutput {
  const diagnosis = (DIAGNOSES as readonly string[]).includes(String(j.diagnosis)) ? (j.diagnosis as Diagnosis) : "insufficient";
  const action = j.action === "new_card" || j.action === "edit_card" ? j.action : "none";
  return {
    diagnosis,
    reason: clipText(j.reason, 300),
    suggestion: clipText(j.suggestion, 300),
    action,
    target: typeof j.target_card === "string" ? j.target_card.trim() : null,
    card: j.card,
    testQuestion: clipText(j.test_question, 500),
  };
}

/** 卡给模型看的样子（与 LEARN_PROMPT 输出的结构一致） */
const cardForModel = (c: CardContent) => ({
  title: c.title,
  conditions: c.conditions,
  condition_mode: c.conditionMode,
  steps: c.steps.map((s) => ({ text: s.text, branches: s.branches })),
  tips: c.tips,
  stage: c.stage,
});

/** learning.analyze */
export async function analyzeLearning(data: Record<string, unknown>): Promise<void> {
  const taskId = String(data.taskId ?? "");
  const [task] = await db().select().from(T).where(eq(T.id, taskId)).limit(1);
  if (!task || task.status !== "analyzing") return;
  const finish = async (set: Partial<typeof T.$inferInsert>) => {
    await db()
      .update(T)
      .set({ ...set, version: task.version + 1, updatedAt: new Date() })
      .where(and(eq(T.id, task.id), eq(T.version, task.version), eq(T.status, "analyzing")));
  };
  try {
    await analyze(task, finish);
  } catch (e) {
    const message = e instanceof AiError ? (e.kind === "timeout" ? "AI 超时，可以重新分析。" : "AI 出错，可以重新分析。") : `分析出错：${e instanceof Error ? e.message : String(e)}`;
    await finish({ status: "failed", error: message });
    if (!(e instanceof AiError)) console.error(JSON.stringify({ t: new Date().toISOString(), level: "error", job: "learning.analyze", taskId: task.id, err: e instanceof Error ? e.stack : String(e) }));
  }
}

async function analyze(task: TaskRow, finish: (set: Partial<typeof T.$inferInsert>) => Promise<void>) {
  const [shop] = await db().select({ market: schema.shop.market }).from(schema.shop).where(eq(schema.shop.id, task.shopId)).limit(1);
  const products = await db().select({ id: schema.product.id, code: schema.product.code, name: schema.product.name }).from(schema.product).where(eq(schema.product.merchantId, task.merchantId));
  const near = await neighbors(task, shop?.market ?? null);
  const taskProducts = products.filter((p) => task.productIds.includes(p.id));
  const payload = {
    source: task.source,
    note: task.note,
    stage: task.stage,
    products: taskProducts.map((p) => ({ code: p.code, name: p.name })),
    conversation: task.messages.map((m, i) => ({ n: i + 1, from: m.from, type: m.type, text: m.text, at: m.at, selected: m.selected })),
    similar_cards: near.cards.map((c) => ({ id: c.key, ...cardForModel(cardContentOf(c.row)), product_match: c.productMatch, stage_match: c.stageMatch, calls_30d: c.calls30 })),
    related_qa: near.qa.map((q) => ({ questions: q.questions, answer: q.answer })),
  };
  const res = await chat(
    "learn",
    [
      { role: "system", content: LEARN_PROMPT },
      { role: "user", content: JSON.stringify(payload) },
    ],
    { json: true, maxTokens: 2000 },
  );
  const out = parseLearn(parseJson(res.content));
  const similar: LearningSimilar[] = near.cards.map((c) => ({ cardId: c.row.id, title: c.row.title, distance: Number(c.distance.toFixed(4)), productMatch: c.productMatch, stageMatch: c.stageMatch }));
  const common = { diagnosis: out.diagnosis, reason: out.reason || null, suggestion: out.suggestion || null, similar, testQuestion: out.testQuestion || task.testQuestion };
  const t = { ...task, testQuestion: common.testQuestion };

  if (out.diagnosis === "covered") return finish({ ...common, status: "closed", result: "none_needed" });
  if (out.diagnosis === "insufficient") return finish({ ...common, status: "closed", result: "insufficient_evidence" });
  if (out.diagnosis === "missing_knowledge") return finish({ ...common, status: "closed", result: "need_qa" });
  const target = out.action === "edit_card" ? near.cards.find((c) => c.key === out.target) : undefined;
  if (out.diagnosis === "conflict") return finish({ ...common, status: "pending_review", targetCardId: target?.row.id ?? null });
  if (out.action === "none") return finish({ ...common, status: "closed", result: "none_needed" });

  const codeToId = new Map(products.map((p) => [p.code.trim().toUpperCase(), p.id]));
  const content = cardFromModel(out.card, target ? cardContentOf(target.row) : null, codeToId, task.stage);
  if (!content) return finish({ ...common, status: "failed", error: "AI 给的经验卡内容不完整，可以重新分析。" });

  if (!target) {
    // 新卡：内部测试——改前按现有知识、改后加上这张卡，各模拟一次，进待审核
    const input = simInputOf(t);
    const base = { merchantId: task.merchantId, shopId: task.shopId, stage: task.stage, productIds: task.productIds, ...input };
    const [before, after] = await Promise.all([simulateDraft(base), simulateDraft({ ...base, override: { content } })]);
    return finish({ ...common, status: "pending_review", proposal: content, targetCardId: null, test: { question: input.question, before, after } });
  }

  // 改已有卡：直接复测，通过即生效（Agent 版本，标还没人看过）
  const retest = await retestProposal(t, content, { id: target.row.id, version: target.row.version });
  if (!retest.passed) return finish({ ...common, status: "closed", result: "retest_failed", proposal: content, targetCardId: target.row.id, retest, error: retest.failReason });
  const vec = needsEmbed(target.row, content) ? await tryEmbedCard(content) : undefined;
  await db().transaction(async (tx) => {
    const [fresh] = await tx.select().from(C).where(eq(C.id, target.row.id)).for("update");
    const settle = (set: Partial<typeof T.$inferInsert>) =>
      tx
        .update(T)
        .set({ ...common, ...set, version: task.version + 1, updatedAt: new Date() })
        .where(and(eq(T.id, task.id), eq(T.version, task.version)));
    // 原卡在分析期间被下架或删除：这次的内容当作新卡交给审核人（§11.19），审核人要重新复测
    if (!fresh || fresh.status !== "published") {
      await settle({ status: "pending_review", proposal: content, targetCardId: null, retest, suggestion: ["原卡在分析期间被下架或删除，改为新卡待审核。", common.suggestion].filter(Boolean).join("") });
      return;
    }
    // 分析与复测期间卡被人或另一个 Agent 任务改过：不覆盖那次改动，这次作废，可以重新分析
    if (fresh.version !== target.row.version) {
      await settle({ status: "failed", proposal: content, targetCardId: fresh.id, retest, error: `分析期间这张卡被改成了第 ${fresh.version} 版，这次改动没有写入，可以重新分析。` });
      return;
    }
    const card = await writeCardVersion(tx, {
      row: fresh,
      content,
      author: { kind: "agent" },
      vec,
      learningTaskId: task.id,
      note: out.reason || out.suggestion || null,
      retest: { passed: true, regressions: retest.regressions.length, failReason: null },
    });
    await tx
      .update(T)
      .set({ ...common, status: "published", result: "card_updated", proposal: content, targetCardId: card.id, retest, publishedCardId: card.id, publishedVersion: card.version, version: task.version + 1, updatedAt: new Date() })
      .where(and(eq(T.id, task.id), eq(T.version, task.version)));
    await audit(systemActor(task.merchantId), { module: "reception", action: "knowledge_card_agent_updated", summary: `Agent 改了经验卡「${card.title}」（第 ${card.version} 版）`, targetType: "experience_card", targetId: card.id, data: { learningTaskId: task.id, version: card.version, regressions: retest.regressions.length } }, tx);
  });
}

/** 分析中超过 15 分钟没有动静（任务被杀、排队失败）就标分析失败，可以重新分析；learning.analyze 本身 10 分钟过期、不重试 */
export const STALE_ANALYZING_MS = 15 * 60_000;

export async function failStaleLearning(): Promise<number> {
  const rows = await db()
    .update(T)
    .set({ status: "failed", error: "分析任务中断，可以重新分析。", version: sql`${T.version} + 1`, updatedAt: new Date() })
    .where(and(eq(T.status, "analyzing"), sql`coalesce(${T.updatedAt}, ${T.createdAt}) < ${new Date(Date.now() - STALE_ANALYZING_MS)}`))
    .returning({ id: T.id });
  return rows.length;
}

// ── Agent 挑会话 ──

const S = schema.segment;
const CONV = schema.conversation;

/** 一个商户这一轮挑出的会话段：最近 7 天已结束、非回补、买家会话、有人工回复、还没有学习任务；按信号打分 */
export async function pickCandidates(merchantId: string, limit = PICK_PER_MERCHANT) {
  const since = new Date(Date.now() - PICK_DAYS * 86400_000);
  const score = sql<number>`(
    case when exists (select 1 from draft d where d.segment_id = ${S.id} and d.card_id is not null and d.status in ('edited_sent', 'ignored')) then 3 else 0 end
    + case when exists (select 1 from draft_review r where r.segment_id = ${S.id} and r.edit_class in ('process', 'correction', 'supplement')) then 3 else 0 end
    + case when ${S.handedOff} then 2 else 0 end
    + case when exists (select 1 from ticket k where k.conversation_id = ${S.conversationId} and k.created_at >= ${S.startedAt} and k.created_at <= coalesce(${S.endedAt}, now())) then 2 else 0 end
    + case when (select count(*) from message m where m.segment_id = ${S.id}) >= 6 then 1 else 0 end
  )::int`;
  return db()
    .select({ segmentId: S.id, conversationId: S.conversationId, stage: S.stage, score })
    .from(S)
    .innerJoin(CONV, eq(CONV.id, S.conversationId))
    .where(
      and(
        eq(S.merchantId, merchantId),
        isNotNull(S.endedAt),
        gte(S.endedAt, since),
        eq(S.backfilled, false),
        eq(S.humanReplied, true),
        eq(CONV.buyerKind, "buyer"),
        sql`not exists (select 1 from learning_task t where t.segment_id = ${S.id})`,
        sql`${score} >= ${PICK_MIN_SCORE}`,
      ),
    )
    .orderBy(desc(score), desc(S.endedAt))
    .limit(limit);
}

/** learning.pick：每个正常商户挑一轮（给了 merchantId 只挑这一家，手动补跑用），建 Agent 学习任务并排分析 */
export async function pickLearning(data: Record<string, unknown> = {}): Promise<{ merchants: number; picked: number }> {
  const only = typeof data.merchantId === "string" ? data.merchantId : null;
  const merchants = await db()
    .select({ id: schema.merchant.id })
    .from(schema.merchant)
    .where(and(eq(schema.merchant.status, "active"), only ? eq(schema.merchant.id, only) : undefined));
  let picked = 0;
  for (const m of merchants) {
    for (const cand of await pickCandidates(m.id)) {
      const [conv] = await db().select().from(CONV).where(eq(CONV.id, cand.conversationId)).limit(1);
      if (!conv) continue;
      const rows = (await db().select().from(schema.message).where(eq(schema.message.segmentId, cand.segmentId)).orderBy(desc(schema.message.sentAt), desc(schema.message.createdAt)).limit(SNAPSHOT_MAX)).reverse();
      if (!rows.some((r) => r.senderRole === "buyer")) continue;
      const products = await identifyProductsWithBasis({ merchantId: m.id, shopId: conv.shopId, buyerExternalId: conv.buyerExternalId, productCardIds: productCardIdsOf(rows), buyerTexts: buyerTextsOf(rows).slice(-5) });
      const [task] = await db()
        .insert(T)
        .values({
          merchantId: m.id,
          shopId: conv.shopId,
          conversationId: conv.id,
          segmentId: cand.segmentId,
          source: "agent",
          messages: rows.map((r) => snapshotOf(r, false)),
          productIds: products.ids,
          productBasis: basisText(products.basis),
          productStatus: productStatusOf(products.ids),
          stage: cand.stage,
          testQuestion: buyerTextsOf(rows).at(-1) ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (!task) continue;
      picked += 1;
      await enqueue("learning.analyze", { taskId: task.id }, { singletonKey: task.id });
    }
  }
  return { merchants: merchants.length, picked };
}
