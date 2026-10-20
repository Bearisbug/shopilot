// 问答（API-KB-013 至 API-KB-019、API-KB-026、API-KB-027，§11 问答状态）：手写保存即发布；资料整理出的候选待审核，通过才发布。
// 发布与改问法时同步向量化（2 秒），失败照样保存、向量留空，由 knowledge.qa_embed 每 5 分钟补上。
import { and, count, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { KnowledgeQa, KnowledgeQaList, QaApproveBody, QaBody, QaListQuery, QaPatch, QaRejectBody, QaStatus } from "@/contracts/knowledge";
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { db, schema, type Executor } from "@/server/db/client";
import { Problem, conflict, notFound, validation } from "@/server/http/problem";
import { EMBED_MODEL, embedTexts, qaEmbedText } from "./embed";

const q = schema.knowledgeQa;
type QaRow = typeof q.$inferSelect;

const UUID = /^[0-9a-f-]{36}$/i;

export async function qaViews(rows: QaRow[], tx: Executor = db()): Promise<KnowledgeQa[]> {
  if (rows.length === 0) return [];
  const productIds = [...new Set(rows.flatMap((r) => r.productIds))];
  const docIds = [...new Set(rows.map((r) => r.sourceDocumentId).filter((v): v is string => !!v))];
  const dupIds = [...new Set(rows.map((r) => r.duplicateOf).filter((v): v is string => !!v))];
  const memberIds = [...new Set(rows.flatMap((r) => [r.createdBy, r.reviewedBy]).filter((v): v is string => !!v))];
  const [products, docs, dups, names] = await Promise.all([
    productIds.length ? tx.select({ id: schema.product.id, code: schema.product.code, name: schema.product.name }).from(schema.product).where(inArray(schema.product.id, productIds)) : [],
    docIds.length ? tx.select({ id: schema.knowledgeDocument.id, name: schema.knowledgeDocument.name }).from(schema.knowledgeDocument).where(and(inArray(schema.knowledgeDocument.id, docIds), sql`${schema.knowledgeDocument.status} <> 'deleting'`)) : [],
    dupIds.length ? tx.select({ id: q.id, questions: q.questions, status: q.status }).from(q).where(inArray(q.id, dupIds)) : [],
    memberIds.length ? tx.select({ id: schema.membership.id, name: schema.user.name }).from(schema.membership).innerJoin(schema.user, eq(schema.user.id, schema.membership.userId)).where(inArray(schema.membership.id, memberIds)) : [],
  ]);
  const productOf = new Map(products.map((p) => [p.id, p]));
  const docOf = new Map(docs.map((d) => [d.id, d]));
  const dupOf = new Map(dups.map((d) => [d.id, d]));
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  return rows.map((r) => {
    const dup = r.duplicateOf ? dupOf.get(r.duplicateOf) : undefined;
    return {
      id: r.id,
      questions: r.questions,
      answer: r.answer,
      products: r.productIds.map((id) => productOf.get(id)).filter((p): p is NonNullable<typeof p> => !!p),
      stage: r.stage,
      markets: r.markets,
      tags: r.tags,
      status: r.status,
      source: r.source,
      sourceDocument: r.sourceDocumentId ? (docOf.get(r.sourceDocumentId) ?? null) : null,
      sourceExcerpt: r.sourceExcerpt,
      duplicateOf: dup ? { id: dup.id, question: dup.questions[0] ?? "", status: dup.status as QaStatus } : null,
      rejectReason: r.rejectReason,
      embedded: r.embedding !== null,
      createdByName: r.createdBy ? (nameOf.get(r.createdBy) ?? null) : null,
      reviewedByName: r.reviewedBy ? (nameOf.get(r.reviewedBy) ?? null) : null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      version: r.version,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt?.toISOString() ?? null,
    };
  });
}

async function view(row: QaRow, tx: Executor = db()) {
  return { qa: (await qaViews([row], tx))[0] };
}

async function loadQa(merchantId: string, id: string, tx: Executor = db()): Promise<QaRow> {
  if (!UUID.test(id)) throw notFound();
  const [row] = await tx.select().from(q).where(and(eq(q.id, id), eq(q.merchantId, merchantId))).limit(1);
  if (!row) throw notFound("问答不存在或已删除。");
  return row;
}

/** 关联的产品都要属于本商户 */
async function checkProducts(merchantId: string, ids: string[] | undefined) {
  if (!ids?.length) return;
  const rows = await db()
    .select({ id: schema.product.id })
    .from(schema.product)
    .where(and(eq(schema.product.merchantId, merchantId), inArray(schema.product.id, ids)));
  if (rows.length !== ids.length) throw validation("有产品不存在或已删除，请刷新后重新选择。", { productIds: "有产品不存在或已删除" });
}

function checkVersion(row: QaRow, version: number) {
  if (row.version !== version) throw conflict("这条问答刚被别人改过，请刷新后再操作。", { version: row.version }, "version_conflict");
}

/** 向量化问法；失败返回 null（保存照常，后台补） */
async function tryEmbed(questions: string[]): Promise<{ embedding: number[] | null; embeddingModel: string | null }> {
  try {
    const [v] = await embedTexts([qaEmbedText(questions)]);
    return { embedding: v, embeddingModel: EMBED_MODEL };
  } catch {
    return { embedding: null, embeddingModel: null };
  }
}

const sortKey = sql<string>`to_char(coalesce(${q.updatedAt}, ${q.createdAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`;
const encodeCursor = (at: string, id: string) => Buffer.from(JSON.stringify([at, id])).toString("base64url");
function decodeCursor(cursor: string): { at: string; id: string } {
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown[];
    if (typeof at === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(at) && typeof id === "string" && UUID.test(id)) return { at, id };
  } catch {}
  throw new Problem("validation", { detail: "分页参数无效，请刷新后重试。" });
}

export async function listQa(ctx: MemberContext, query: QaListQuery): Promise<KnowledgeQaList> {
  const merchantId = ctx.merchant.id;
  const where: SQL[] = [eq(q.merchantId, merchantId)];
  if (query.status) where.push(eq(q.status, query.status));
  if (query.stage) where.push(eq(q.stage, query.stage));
  if (query.productId === "none") where.push(sql`cardinality(${q.productIds}) = 0`);
  else if (query.productId) where.push(sql`${query.productId}::uuid = any(${q.productIds})`);
  if (query.market === "ALL") where.push(sql`${q.markets} @> '["ALL"]'::jsonb`);
  else if (query.market) where.push(sql`(${q.markets} @> '["ALL"]'::jsonb or ${q.markets} @> ${JSON.stringify([query.market])}::jsonb)`);
  if (query.documentId) where.push(eq(q.sourceDocumentId, query.documentId));
  if (query.q) {
    const like = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(sql`(array_to_string(${q.questions}, ' ') ilike ${like} or ${q.answer} ilike ${like})`);
  }
  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    where.push(sql`(coalesce(${q.updatedAt}, ${q.createdAt}), ${q.id}) < (${c.at}::timestamp at time zone 'UTC', ${c.id}::uuid)`);
  }
  const rows = await db()
    .select({ row: q, at: sortKey })
    .from(q)
    .where(and(...where))
    .orderBy(desc(sql`coalesce(${q.updatedAt}, ${q.createdAt})`), desc(q.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const byStatus = await db().select({ status: q.status, n: count() }).from(q).where(eq(q.merchantId, merchantId)).groupBy(q.status);
  const counts: Record<QaStatus, number> = { pending: 0, published: 0, rejected: 0, archived: 0 };
  for (const r of byStatus) counts[r.status as QaStatus] = r.n;
  const last = page[page.length - 1];
  return { items: await qaViews(page.map((r) => r.row)), counts, nextCursor: rows.length > query.limit && last ? encodeCursor(last.at, last.row.id) : null };
}

export async function getQa(ctx: MemberContext, id: string) {
  return view(await loadQa(ctx.merchant.id, id));
}

export async function createQa(ctx: MemberContext, body: QaBody) {
  await checkProducts(ctx.merchant.id, body.productIds);
  const now = new Date();
  const vec = await tryEmbed(body.questions);
  const [row] = await db()
    .insert(q)
    .values({
      merchantId: ctx.merchant.id,
      questions: body.questions,
      answer: body.answer,
      productIds: body.productIds,
      stage: body.stage,
      markets: body.markets,
      tags: body.tags,
      status: "published",
      source: "manual",
      createdBy: ctx.membership.id,
      reviewedBy: ctx.membership.id,
      reviewedAt: now,
      publishedAt: now,
      ...vec,
    })
    .returning();
  await audit(ctx.actor, { module: "reception", action: "knowledge_qa_created", summary: `新增问答「${body.questions[0]}」`, targetType: "knowledge_qa", targetId: row.id, data: { stage: body.stage, products: body.productIds.length, markets: body.markets } });
  return view(row);
}

type QaFields = Omit<QaPatch, "version">;

/** 把可选字段并进行；问法变了才重新向量化 */
async function applyFields(row: QaRow, f: QaFields) {
  const set: Partial<typeof q.$inferInsert> = {};
  if (f.questions !== undefined) set.questions = f.questions;
  if (f.answer !== undefined) set.answer = f.answer;
  if (f.productIds !== undefined) set.productIds = f.productIds;
  if (f.stage !== undefined) set.stage = f.stage;
  if (f.markets !== undefined) set.markets = f.markets;
  if (f.tags !== undefined) set.tags = f.tags;
  const questionsChanged = f.questions !== undefined && f.questions.join("\n") !== row.questions.join("\n");
  if (questionsChanged || row.embedding === null) Object.assign(set, await tryEmbed(f.questions ?? row.questions));
  return set;
}

export async function updateQa(ctx: MemberContext, id: string, body: QaPatch) {
  const row = await loadQa(ctx.merchant.id, id);
  const { version, ...fields } = body;
  checkVersion(row, version);
  await checkProducts(ctx.merchant.id, fields.productIds);
  const set = await applyFields(row, fields);
  const [updated] = await db()
    .update(q)
    .set({ ...set, version: row.version + 1, updatedAt: new Date() })
    .where(and(eq(q.id, row.id), eq(q.version, row.version)))
    .returning();
  if (!updated) throw conflict("这条问答刚被别人改过，请刷新后再操作。", undefined, "version_conflict");
  await audit(ctx.actor, { module: "reception", action: "knowledge_qa_updated", summary: `修改问答「${updated.questions[0]}」`, targetType: "knowledge_qa", targetId: row.id, data: { fields: Object.keys(fields).filter((k) => fields[k as keyof QaFields] !== undefined), status: updated.status } });
  return view(updated);
}

/** 状态迁移的公共写法：只在 from 状态且版本一致时生效 */
async function transition(ctx: MemberContext, id: string, version: number, from: QaRow["status"][], to: QaRow["status"], extra: (row: QaRow) => Promise<Partial<typeof q.$inferInsert>>, action: string, verb: string) {
  const row = await loadQa(ctx.merchant.id, id);
  checkVersion(row, version);
  if (!from.includes(row.status)) throw conflict(`这条问答现在是「${STATUS_TEXT[row.status]}」，不能${verb}。`, { status: row.status }, "invalid_state");
  const set = await extra(row);
  const [updated] = await db()
    .update(q)
    .set({ ...set, status: to, version: row.version + 1, updatedAt: new Date() })
    .where(and(eq(q.id, row.id), eq(q.version, row.version), inArray(q.status, from)))
    .returning();
  if (!updated) throw conflict("这条问答刚被别人改过，请刷新后再操作。", undefined, "version_conflict");
  await audit(ctx.actor, { module: "reception", action, summary: `${verb}问答「${updated.questions[0]}」`, targetType: "knowledge_qa", targetId: row.id, data: { from: row.status, to } });
  return view(updated);
}

const STATUS_TEXT: Record<QaRow["status"], string> = { pending: "待审核", published: "已发布", rejected: "已驳回", archived: "已下架" };

/** API-KB-018：待审核 → 已发布，可同时带修改 */
export async function approveQa(ctx: MemberContext, id: string, body: QaApproveBody) {
  const { version, ...fields } = body;
  await checkProducts(ctx.merchant.id, fields.productIds);
  const now = new Date();
  return transition(ctx, id, version, ["pending"], "published", async (row) => ({ ...(await applyFields(row, fields)), duplicateOf: null, reviewedBy: ctx.membership.id, reviewedAt: now, publishedAt: now }), "knowledge_qa_approved", "通过");
}

/** API-KB-019：待审核 → 已驳回 */
export async function rejectQa(ctx: MemberContext, id: string, body: QaRejectBody) {
  return transition(ctx, id, body.version, ["pending"], "rejected", async () => ({ rejectReason: body.reason || null, reviewedBy: ctx.membership.id, reviewedAt: new Date() }), "knowledge_qa_rejected", "驳回");
}

/** API-KB-026：已发布 → 已下架（不参与检索） */
export async function archiveQa(ctx: MemberContext, id: string, version: number) {
  return transition(ctx, id, version, ["published"], "archived", async () => ({}), "knowledge_qa_archived", "下架");
}

/** API-KB-027：已下架 → 已发布 */
export async function restoreQa(ctx: MemberContext, id: string, version: number) {
  return transition(ctx, id, version, ["archived"], "published", async (row) => ({ publishedAt: new Date(), ...(row.embedding === null ? await tryEmbed(row.questions) : {}) }), "knowledge_qa_restored", "恢复发布");
}

/** API-KB-017：任何状态都可删；被它标成疑似重复的候选清掉标记 */
export async function deleteQa(ctx: MemberContext, id: string) {
  const row = await loadQa(ctx.merchant.id, id);
  await db().transaction(async (tx) => {
    await tx.update(q).set({ duplicateOf: null }).where(and(eq(q.merchantId, ctx.merchant.id), eq(q.duplicateOf, row.id)));
    await tx.delete(q).where(eq(q.id, row.id));
    await audit(ctx.actor, { module: "reception", action: "knowledge_qa_deleted", summary: `删除问答「${row.questions[0]}」`, targetType: "knowledge_qa", targetId: row.id, data: { status: row.status, source: row.source } }, tx);
  });
}

/** knowledge.qa_embed：补已发布、待审核里向量为空的问答，每轮最多 200 条；向量化失败留到下一轮 */
export async function embedMissing(limit = 200): Promise<{ picked: number; embedded: number }> {
  const rows = await db()
    .select({ id: q.id, questions: q.questions })
    .from(q)
    .where(and(isNull(q.embedding), or(eq(q.status, "published"), eq(q.status, "pending"))))
    .orderBy(q.createdAt)
    .limit(limit);
  let embedded = 0;
  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20);
    let vecs: number[][];
    try {
      vecs = await embedTexts(
        batch.map((r) => qaEmbedText(r.questions)),
        10_000,
      );
    } catch {
      break;
    }
    for (const [j, r] of batch.entries()) {
      await db().update(q).set({ embedding: vecs[j], embeddingModel: EMBED_MODEL }).where(and(eq(q.id, r.id), isNull(q.embedding)));
      embedded += 1;
    }
  }
  return { picked: rows.length, embedded };
}

/** 资料上的已发布问答数（API-KB-001 的 publishedQaCount） */
export async function publishedQaCounts(documentIds: string[], tx: Executor = db()): Promise<Map<string, number>> {
  if (documentIds.length === 0) return new Map();
  const rows = await tx
    .select({ id: q.sourceDocumentId, n: count() })
    .from(q)
    .where(and(inArray(q.sourceDocumentId, documentIds), eq(q.status, "published")))
    .groupBy(q.sourceDocumentId);
  return new Map(rows.map((r) => [r.id!, r.n]));
}

