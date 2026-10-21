// 会话学习（API-CONV-018、API-CONV-019、API-KB-038 至 API-KB-043，§12.17）：客服勾选消息「提交学习」→ learning.analyze 分析；
// 新卡与有冲突的进待审核，审核人改内容 → 复测 → 发布（要求最近一次复测通过、内容没再改）；也可无需更新或驳回。都带乐观锁 version。
import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  LEARNING_STATUSES,
  type ConversationLearning,
  type LearningCloseBody,
  type LearningList,
  type LearningListQuery,
  type LearningMessage,
  type LearningProposalBody,
  type LearningStatus,
  type LearningSubmitBody,
  type LearningTask,
  type LearningTaskResult,
} from "@/contracts/cards";
import { AiError } from "@/server/ai/client";
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { loadVisible } from "@/server/conversations/queries";
import { db, schema, type Executor } from "@/server/db/client";
import { enqueue } from "@/server/jobs/boss";
import { Problem, conflict, notFound, validation } from "@/server/http/problem";
import { identifyProductsWithBasis, type ProductBasis } from "@/server/products/dictionary";
import { checkCardRefs, insertCard, needsEmbed, tryEmbedCard, writeCardVersion } from "./card-store";
import { proposalHash, retestProposal, type TaskRow } from "./retest";

const T = schema.learningTask;
const M = schema.message;
const UUID = /^[0-9a-f-]{36}$/i;

/** 每会话每分钟最多提交几次（§15） */
export const LEARNING_SUBMIT_PER_MINUTE = 5;
/** 快照：勾选消息的前后各取几条、整份最多几条 */
const CONTEXT_EACH_SIDE = 5;
export const SNAPSHOT_MAX = 40;

const BASIS_TEXT: Record<Exclude<ProductBasis, null>, string> = { card: "依据：买家发的商品卡", order: "依据：订单商品的物料编码", text: "依据：消息里提到的型号或名称" };
export const basisText = (b: ProductBasis) => (b ? BASIS_TEXT[b] : null);
export const productStatusOf = (ids: string[]) => (ids.length === 0 ? "none" : ids.length > 1 ? "multiple" : "identified");

/** 每商户每分钟最多复测几次（§15）：一次复测最多调 17 次 DeepSeek（原问题 2 次，3 个回归用例各 5 次） */
export const LEARNING_RETEST_PER_MINUTE = 10;

const windows = new Map<string, { start: number; count: number }>();
function takeQuota(key: string, limit: number, detail: string, now: number) {
  const cur = windows.get(key);
  if (!cur || now - cur.start >= 60_000) {
    windows.set(key, { start: now, count: 1 });
    return;
  }
  if (cur.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((cur.start + 60_000 - now) / 1000));
    throw new Problem("rate-limited", { detail, headers: { "retry-after": String(retryAfter) } });
  }
  cur.count += 1;
}
export const takeSubmitQuota = (conversationId: string, now = Date.now()) =>
  takeQuota(`submit:${conversationId}`, LEARNING_SUBMIT_PER_MINUTE, `同一个会话每分钟最多提交 ${LEARNING_SUBMIT_PER_MINUTE} 次学习，请稍后再试。`, now);
export const takeRetestQuota = (merchantId: string, now = Date.now()) => takeQuota(`retest:${merchantId}`, LEARNING_RETEST_PER_MINUTE, `每分钟最多复测 ${LEARNING_RETEST_PER_MINUTE} 次，请稍后再试。`, now);

type MessageRow = typeof M.$inferSelect;

export function senderOf(role: MessageRow["senderRole"]): LearningMessage["from"] {
  if (role === "buyer") return "buyer";
  if (role === "agent" || role === "platform_human") return "seller";
  if (role === "system") return "system";
  return "ai";
}

const LOCAL = (d: Date) => d.toISOString();

/** 消息快照：文字原样，非文字写「[类型]」 */
export function snapshotOf(m: MessageRow, selected: boolean): LearningMessage {
  return { id: m.id, from: senderOf(m.senderRole), type: m.type, text: m.text?.trim() ? m.text : `[${m.type}]`, at: LOCAL(m.sentAt), selected };
}

/** 勾选的消息全部保留，再由近到远补前后各 5 条，整份最多 40 条，按时间排 */
export function snapshotWindow<Row extends { id: string }>(all: Row[], selectedIds: Set<string>): Row[] {
  const picked = new Set<number>();
  const idx = all.map((m, i) => (selectedIds.has(m.id) ? i : -1)).filter((i) => i >= 0);
  idx.forEach((i) => picked.add(i));
  for (let d = 1; d <= CONTEXT_EACH_SIDE && picked.size < SNAPSHOT_MAX; d++) {
    for (const i of idx) {
      for (const j of [i - d, i + d]) {
        if (j >= 0 && j < all.length && !picked.has(j) && picked.size < SNAPSHOT_MAX) picked.add(j);
      }
    }
  }
  return [...picked].sort((a, b) => a - b).map((i) => all[i]);
}

/** 快照里买家发的商品卡（识别产品用） */
export function productCardIdsOf(rows: MessageRow[]): string[] {
  return rows.filter((m) => m.senderRole === "buyer" && m.type === "product_card").map((m) => String((m.payload as { productId?: unknown } | null)?.productId ?? ""));
}
export const buyerTextsOf = (rows: MessageRow[]) => rows.filter((m) => m.senderRole === "buyer" && m.type === "text" && m.text?.trim()).map((m) => m.text!);

// ── 视图 ──

async function memberNames(ids: string[], ex: Executor) {
  if (!ids.length) return new Map<string, string>();
  const rows = await ex.select({ id: schema.membership.id, name: schema.user.name }).from(schema.membership).innerJoin(schema.user, eq(schema.user.id, schema.membership.userId)).where(inArray(schema.membership.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function taskViews(rows: TaskRow[], ex: Executor = db()): Promise<LearningTask[]> {
  if (rows.length === 0) return [];
  const convIds = [...new Set(rows.map((r) => r.conversationId))];
  const productIds = [...new Set(rows.flatMap((r) => r.productIds))];
  const cardIds = [...new Set(rows.flatMap((r) => [r.targetCardId, r.publishedCardId]).filter((v): v is string => !!v))];
  const memberIds = [...new Set(rows.flatMap((r) => [r.submittedBy, r.reviewedBy]).filter((v): v is string => !!v))];
  const [convs, products, cards, names] = await Promise.all([
    ex
      .select({ id: schema.conversation.id, buyerName: schema.conversation.buyerName, platform: schema.conversation.platform, shopName: schema.shop.name })
      .from(schema.conversation)
      .innerJoin(schema.shop, eq(schema.shop.id, schema.conversation.shopId))
      .where(inArray(schema.conversation.id, convIds)),
    productIds.length ? ex.select({ id: schema.product.id, code: schema.product.code, name: schema.product.name }).from(schema.product).where(inArray(schema.product.id, productIds)) : [],
    cardIds.length
      ? ex.select({ id: schema.experienceCard.id, title: schema.experienceCard.title, version: schema.experienceCard.version, status: schema.experienceCard.status }).from(schema.experienceCard).where(inArray(schema.experienceCard.id, cardIds))
      : [],
    memberNames(memberIds, ex),
  ]);
  const convOf = new Map(convs.map((c) => [c.id, c]));
  const productOf = new Map(products.map((p) => [p.id, p]));
  const cardOf = new Map(cards.map((c) => [c.id, c]));
  return rows.map((r) => {
    const conv = convOf.get(r.conversationId);
    const target = r.targetCardId ? cardOf.get(r.targetCardId) : undefined;
    const published = r.publishedCardId ? cardOf.get(r.publishedCardId) : undefined;
    return {
      id: r.id,
      source: r.source,
      submittedByName: r.submittedBy ? (names.get(r.submittedBy) ?? null) : null,
      note: r.note,
      conversation: conv ? { id: conv.id, buyerName: conv.buyerName, shopName: conv.shopName, platform: conv.platform } : null,
      messages: r.messages,
      products: r.productIds.map((id) => productOf.get(id)).filter((p): p is NonNullable<typeof p> => !!p),
      productBasis: r.productBasis,
      productStatus: r.productStatus,
      stage: r.stage,
      status: r.status,
      diagnosis: r.diagnosis,
      result: r.result,
      reason: r.reason,
      suggestion: r.suggestion,
      targetCard: target ? { id: target.id, title: target.title, version: target.version, status: target.status } : null,
      proposal: r.proposal,
      similar: r.similar ?? [],
      test: r.test,
      retest: r.retest,
      testQuestion: r.testQuestion,
      error: r.error,
      reviewedByName: r.reviewedBy ? (names.get(r.reviewedBy) ?? null) : null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      reviewNote: r.reviewNote,
      publishedCard: published && r.publishedVersion ? { id: published.id, title: published.title, version: r.publishedVersion } : null,
      version: r.version,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt?.toISOString() ?? null,
    };
  });
}

async function view(row: TaskRow): Promise<LearningTaskResult> {
  return { task: (await taskViews([row]))[0] };
}

/** 学习任务里有买家对话：组长只看负责店铺的任务（同工作台的店铺范围），管理员看全部 */
const scopeWhere = (ctx: MemberContext): SQL[] => (ctx.shopIds === null ? [] : [ctx.shopIds.length ? inArray(T.shopId, ctx.shopIds) : sql`false`]);

async function loadTask(ctx: MemberContext, id: string): Promise<TaskRow> {
  if (!UUID.test(id)) throw notFound();
  const [row] = await db()
    .select()
    .from(T)
    .where(and(eq(T.id, id), eq(T.merchantId, ctx.merchant.id), ...scopeWhere(ctx)))
    .limit(1);
  if (!row) throw notFound("学习任务不存在或已删除。");
  return row;
}

const STATUS_TEXT: Record<LearningStatus, string> = { analyzing: "分析中", pending_review: "待审核", published: "已发布", closed: "已结束", failed: "分析失败" };

function checkState(row: TaskRow, version: number, from: LearningStatus[], verb: string) {
  if (row.version !== version) throw conflict("这个学习任务刚有变化，请刷新后再操作。", { version: row.version }, "version_conflict");
  if (!from.includes(row.status)) throw conflict(`这个学习任务现在是「${STATUS_TEXT[row.status]}」，不能${verb}。`, { status: row.status }, "invalid_state");
}

/** 只在版本未变时写；写不进去 409 */
async function update(row: TaskRow, set: Partial<typeof T.$inferInsert>, ex: Executor = db()): Promise<TaskRow> {
  const [updated] = await ex
    .update(T)
    .set({ ...set, version: row.version + 1, updatedAt: new Date() })
    .where(and(eq(T.id, row.id), eq(T.version, row.version)))
    .returning();
  if (!updated) throw conflict("这个学习任务刚有变化，请刷新后再操作。", undefined, "version_conflict");
  return updated;
}

// ── 提交与本会话 ──

/** API-CONV-018 */
export async function submitLearning(ctx: MemberContext, conversationId: string, body: LearningSubmitBody): Promise<LearningTaskResult> {
  const conv = await loadVisible(ctx, conversationId);
  const chosen = await db()
    .select({ id: M.id })
    .from(M)
    .where(and(eq(M.conversationId, conv.id), inArray(M.id, body.messageIds)));
  if (chosen.length !== body.messageIds.length) throw validation("有消息不属于这个会话，请刷新后重新勾选。", { messageIds: "有消息不属于这个会话" });
  takeSubmitQuota(conv.id);
  const all = await db().select().from(M).where(eq(M.conversationId, conv.id)).orderBy(asc(M.sentAt), asc(M.createdAt)).limit(5000);
  const selected = new Set(body.messageIds);
  const window = snapshotWindow(all, selected);
  const lastSelected = [...window].reverse().find((m) => selected.has(m.id));
  const stageSegmentId = lastSelected?.segmentId ?? conv.currentSegmentId;
  const [seg] = stageSegmentId ? await db().select({ stage: schema.segment.stage }).from(schema.segment).where(eq(schema.segment.id, stageSegmentId)).limit(1) : [];
  // 任务挂在快照里最早的会话段上：前后文可能跨到更早的段，那段被保留期清理时快照随任务一起删（INV-KB-009）
  const segmentId = window.find((m) => m.segmentId)?.segmentId ?? stageSegmentId;
  const products = await identifyProductsWithBasis({ merchantId: conv.merchantId, shopId: conv.shopId, buyerExternalId: conv.buyerExternalId, productCardIds: productCardIdsOf(window), buyerTexts: buyerTextsOf(window).slice(-5) });
  const buyerSelected = window.filter((m) => selected.has(m.id) && m.senderRole === "buyer" && m.type === "text" && m.text?.trim());
  const testQuestion = (buyerSelected.at(-1) ?? window.filter((m) => m.senderRole === "buyer" && m.type === "text" && m.text?.trim()).at(-1))?.text ?? null;
  const [row] = await db()
    .insert(T)
    .values({
      merchantId: conv.merchantId,
      shopId: conv.shopId,
      conversationId: conv.id,
      segmentId: segmentId ?? null,
      source: "member",
      submittedBy: ctx.membership.id,
      note: body.note || null,
      messages: window.map((m) => snapshotOf(m, selected.has(m.id))),
      productIds: products.ids,
      productBasis: basisText(products.basis),
      productStatus: productStatusOf(products.ids),
      stage: seg?.stage ?? "unknown",
      testQuestion,
    })
    .returning();
  await audit(ctx.actor, { module: "workbench", action: "learning_submitted", summary: `提交学习：${conv.buyerName}（${body.messageIds.length} 条消息）`, targetType: "learning_task", targetId: row.id, data: { conversationId: conv.id, messages: body.messageIds.length } });
  await enqueue("learning.analyze", { taskId: row.id }, { singletonKey: row.id });
  return view(row);
}

/** API-CONV-019 */
export async function conversationLearning(ctx: MemberContext, conversationId: string): Promise<ConversationLearning> {
  const conv = await loadVisible(ctx, conversationId);
  const rows = await db().select().from(T).where(eq(T.conversationId, conv.id)).orderBy(desc(T.createdAt)).limit(50);
  const names = await memberNames([...new Set(rows.map((r) => r.submittedBy).filter((v): v is string => !!v))], db());
  return {
    items: rows.map((r) => ({
      id: r.id,
      source: r.source,
      status: r.status,
      result: r.result,
      messageIds: r.messages.filter((m) => m.selected).map((m) => m.id),
      submittedByName: r.submittedBy ? (names.get(r.submittedBy) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// ── 列表与详情 ──

const encodeCursor = (at: string, id: string) => Buffer.from(JSON.stringify([at, id])).toString("base64url");
function decodeCursor(cursor: string): { at: string; id: string } {
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown[];
    if (typeof at === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(at) && typeof id === "string" && UUID.test(id)) return { at, id };
  } catch {}
  throw new Problem("validation", { detail: "分页参数无效，请刷新后重试。" });
}
const sortKey = sql<string>`to_char(${T.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`;

/** API-KB-038：按创建时间倒序 */
export async function listLearning(ctx: MemberContext, query: LearningListQuery): Promise<LearningList> {
  const where: SQL[] = [eq(T.merchantId, ctx.merchant.id), ...scopeWhere(ctx)];
  if (query.status) where.push(eq(T.status, query.status));
  if (query.source) where.push(eq(T.source, query.source));
  if (query.result) where.push(eq(T.result, query.result));
  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    where.push(sql`(${T.createdAt}, ${T.id}) < (${c.at}::timestamp at time zone 'UTC', ${c.id}::uuid)`);
  }
  const rows = await db()
    .select({ row: T, at: sortKey })
    .from(T)
    .where(and(...where))
    .orderBy(desc(T.createdAt), desc(T.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const byStatus = await db()
    .select({ status: T.status, n: count() })
    .from(T)
    .where(and(eq(T.merchantId, ctx.merchant.id), ...scopeWhere(ctx)))
    .groupBy(T.status);
  const counts = Object.fromEntries(LEARNING_STATUSES.map((s) => [s, 0])) as Record<LearningStatus, number>;
  for (const r of byStatus) counts[r.status as LearningStatus] = r.n;
  const last = page[page.length - 1];
  return { items: await taskViews(page.map((r) => r.row)), counts, nextCursor: rows.length > query.limit && last ? encodeCursor(last.at, last.row.id) : null };
}

/** API-KB-039 */
export async function getLearning(ctx: MemberContext, id: string): Promise<LearningTaskResult> {
  return view(await loadTask(ctx, id));
}

// ── 审核 ──

/** API-KB-042：分析失败的重新排队 */
export async function reanalyzeLearning(ctx: MemberContext, id: string, version: number): Promise<LearningTaskResult> {
  const row = await loadTask(ctx, id);
  checkState(row, version, ["failed"], "重新分析");
  const updated = await update(row, { status: "analyzing", error: null });
  await enqueue("learning.analyze", { taskId: row.id }, { singletonKey: row.id });
  await audit(ctx.actor, { module: "reception", action: "learning_reanalyzed", summary: "重新分析学习任务", targetType: "learning_task", targetId: row.id, data: {} });
  return view(updated);
}

/** 审核时指定要改的卡：必须是本商户的卡 */
async function checkTarget(merchantId: string, targetCardId: string | null | undefined) {
  if (!targetCardId) return null;
  const [card] = await db()
    .select()
    .from(schema.experienceCard)
    .where(and(eq(schema.experienceCard.id, targetCardId), eq(schema.experienceCard.merchantId, merchantId)))
    .limit(1);
  if (!card) throw validation("要改的经验卡不存在或已删除，请刷新后重新选择。", { targetCardId: "经验卡不存在或已删除" });
  return card;
}

const aiProblem = (e: AiError) => new Problem("ai-unavailable", { detail: e.kind === "timeout" ? "复测时 AI 超时，请稍后重试。" : "AI 暂时不可用，请稍后重试。", code: e.kind });

/** API-KB-040：用审核人当前编辑的内容同步复测，结果与内容一起写回任务 */
export async function retestLearning(ctx: MemberContext, id: string, body: LearningProposalBody): Promise<LearningTaskResult> {
  const row = await loadTask(ctx, id);
  checkState(row, body.version, ["pending_review"], "复测");
  await checkCardRefs(ctx.merchant.id, body.card);
  takeRetestQuota(ctx.merchant.id);
  const target = await checkTarget(ctx.merchant.id, body.targetCardId);
  let retest;
  try {
    retest = await retestProposal(row, body.card, target ? { id: target.id, version: target.version } : null);
  } catch (e) {
    if (e instanceof AiError) throw aiProblem(e);
    throw e;
  }
  const updated = await update(row, { proposal: body.card, targetCardId: target?.id ?? null, retest });
  await audit(ctx.actor, { module: "reception", action: "learning_retested", summary: `复测学习任务：${retest.passed ? "通过" : "没通过"}`, targetType: "learning_task", targetId: row.id, data: { passed: retest.passed, regressions: retest.regressions.length } });
  return view(updated);
}

/** 卡在某个时刻之后写过新版本（人改、Agent 改或回退） */
async function cardChangedSince(cardId: string, at: string): Promise<boolean> {
  const [hit] = await db()
    .select({ id: schema.experienceCardVersion.id })
    .from(schema.experienceCardVersion)
    .where(and(eq(schema.experienceCardVersion.cardId, cardId), sql`${schema.experienceCardVersion.createdAt} > ${new Date(at)}`))
    .limit(1);
  return !!hit;
}

/** API-KB-041：最近一次复测通过、内容与复测时一致才发布；新卡建卡，指定了卡就写新版本 */
export async function publishLearning(ctx: MemberContext, id: string, body: LearningProposalBody): Promise<LearningTaskResult> {
  const row = await loadTask(ctx, id);
  checkState(row, body.version, ["pending_review"], "发布");
  await checkCardRefs(ctx.merchant.id, body.card);
  const target = await checkTarget(ctx.merchant.id, body.targetCardId);
  // 指纹含要改的卡当时的版本：复测之后卡被别人或 Agent 改过，要重新复测，不能把那次改动整卡盖掉
  if (!row.retest?.passed || row.retest.proposalHash !== proposalHash(body.card, target ? { id: target.id, version: target.version } : null)) {
    const cardChanged = !!target && !!row.retest?.passed && (await cardChangedSince(target.id, row.retest.at));
    throw conflict(cardChanged ? "要改的经验卡在复测后被改过，请重新复测。" : "内容改过后还没复测通过，请先复测。", { retestPassed: row.retest?.passed ?? false }, "retest_required");
  }
  const vec = needsEmbed(target, body.card) ? await tryEmbedCard(body.card) : undefined;
  const author = { kind: "member" as const, memberId: ctx.membership.id };
  const now = new Date();
  const updated = await db().transaction(async (tx) => {
    const card = target
      ? await writeCardVersion(tx, { row: target, content: body.card, author, vec, learningTaskId: row.id, note: "学习任务审核后发布" })
      : await insertCard(tx, { merchantId: ctx.merchant.id, content: body.card, author, vec: vec ?? { embedding: null, embeddingModel: null }, learningTaskId: row.id });
    const t = await update(
      row,
      { status: "published", result: target ? "card_updated" : "new_card", proposal: body.card, targetCardId: target?.id ?? null, publishedCardId: card.id, publishedVersion: card.version, reviewedBy: ctx.membership.id, reviewedAt: now },
      tx,
    );
    await audit(ctx.actor, { module: "reception", action: "learning_published", summary: `${target ? "改了" : "新建了"}经验卡「${card.title}」（第 ${card.version} 版）`, targetType: "learning_task", targetId: row.id, data: { cardId: card.id, version: card.version } }, tx);
    return t;
  });
  return view(updated);
}

/** API-KB-043：无需更新或驳回 */
export async function closeLearning(ctx: MemberContext, id: string, body: LearningCloseBody): Promise<LearningTaskResult> {
  const row = await loadTask(ctx, id);
  checkState(row, body.version, ["pending_review", "failed"], body.result === "rejected" ? "驳回" : "结束");
  const updated = await update(row, { status: "closed", result: body.result, reviewNote: body.reason || null, reviewedBy: ctx.membership.id, reviewedAt: new Date() });
  await audit(ctx.actor, { module: "reception", action: "learning_closed", summary: body.result === "rejected" ? "驳回学习任务" : "学习任务无需更新", targetType: "learning_task", targetId: row.id, data: { result: body.result } });
  return view(updated);
}

