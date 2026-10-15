// 知识库资料（API-KB-001 至 API-KB-007、§11.14、§16）：上传、列表、详情、解析内容、改分类站点与开关、重新解析、删除。
import { createHash, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gt, ilike, inArray, lt, ne, sql, type SQL } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import {
  KNOWLEDGE_CHUNKS_PAGE,
  KNOWLEDGE_DOCUMENT_LIMIT,
  KNOWLEDGE_NAME_MAX,
  uploadFields,
  type DocumentPatch,
  type DocumentsQuery,
  type KnowledgeChunkPage,
  type KnowledgeDocument,
  type KnowledgeDocumentDetail,
  type KnowledgeDocumentList,
  type KnowledgeMarket,
} from "@/contracts/knowledge";
import { charCount } from "@/contracts/reception";
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { db, schema, type Executor } from "@/server/db/client";
import { removeDataFile, writeDataFile } from "@/server/files/storage";
import { Problem, notFound, validation } from "@/server/http/problem";
import { enqueue } from "@/server/jobs/boss";
import { builtinCategoryId } from "./categories";
import { checkKnowledgeFile } from "./format";
import { deniedByRule } from "./shared";

const d = schema.knowledgeDocument;
type DocRow = typeof d.$inferSelect;

async function documentViews(rows: DocRow[], tx: Executor = db()): Promise<KnowledgeDocument[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const parts = await tx.select({ id: schema.knowledgePart.documentId, n: count() }).from(schema.knowledgePart).where(inArray(schema.knowledgePart.documentId, ids)).groupBy(schema.knowledgePart.documentId);
  const chunks = await tx.select({ id: schema.knowledgeChunk.documentId, n: count() }).from(schema.knowledgeChunk).where(inArray(schema.knowledgeChunk.documentId, ids)).groupBy(schema.knowledgeChunk.documentId);
  const uploaders = [...new Set(rows.map((r) => r.uploadedBy).filter((v): v is string => !!v))];
  const names = uploaders.length
    ? await tx.select({ id: schema.membership.id, name: schema.user.name }).from(schema.membership).innerJoin(schema.user, eq(schema.user.id, schema.membership.userId)).where(inArray(schema.membership.id, uploaders))
    : [];
  const partN = new Map(parts.map((p) => [p.id, p.n]));
  const chunkN = new Map(chunks.map((c) => [c.id, c.n]));
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    mime: r.mime,
    size: r.size,
    categoryId: r.categoryId,
    markets: r.markets,
    status: r.status as KnowledgeDocument["status"],
    aiEnabled: r.aiEnabled,
    failureReason: r.failureReason,
    partsCount: partN.get(r.id) ?? 0,
    chunksCount: chunkN.get(r.id) ?? 0,
    uploadedByName: r.uploadedBy ? (nameOf.get(r.uploadedBy) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
    readyAt: r.readyAt?.toISOString() ?? null,
  }));
}

export async function documentView(row: DocRow, tx: Executor = db()): Promise<KnowledgeDocument> {
  return (await documentViews([row], tx))[0];
}

/** 资料行（不含删除中）；不属于当前商户时 404（REQ-PERM-002） */
async function loadDocument(merchantId: string, id: string, tx: Executor = db()): Promise<DocRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  const [row] = await tx.select().from(d).where(and(eq(d.id, id), eq(d.merchantId, merchantId), ne(d.status, "deleting"))).limit(1);
  if (!row) throw notFound();
  return row;
}

const encodeCursor = (v: string) => Buffer.from(v).toString("base64url");
function decodeCursor(cursor: string, pattern: RegExp): string {
  const v = Buffer.from(cursor, "base64url").toString("utf8");
  if (!pattern.test(v)) throw new Problem("validation", { detail: "分页参数无效，请刷新后重试。" });
  return v;
}

/** 站点筛选：ALL 只列适用全部站点的资料；具体站点列出适用该站点的资料（含适用全部站点的） */
function marketFilter(market: KnowledgeMarket): SQL {
  if (market === "ALL") return sql`${d.markets} @> '["ALL"]'::jsonb`;
  return sql`(${d.markets} @> ${JSON.stringify([market])}::jsonb or ${d.markets} @> '["ALL"]'::jsonb)`;
}

/** API-KB-001 */
export async function listDocuments(ctx: MemberContext, q: DocumentsQuery, tx: Executor = db()): Promise<KnowledgeDocumentList> {
  const merchantId = ctx.merchant.id;
  const where: SQL[] = [eq(d.merchantId, merchantId), ne(d.status, "deleting")];
  if (q.categoryId) where.push(eq(d.categoryId, q.categoryId));
  if (q.market) where.push(marketFilter(q.market));
  if (q.status) where.push(eq(d.status, q.status));
  if (q.aiEnabled !== undefined) where.push(eq(d.aiEnabled, q.aiEnabled));
  if (q.q) where.push(ilike(d.name, `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`));
  if (q.cursor) where.push(lt(d.id, decodeCursor(q.cursor, /^[0-9a-f-]{36}$/i)));
  const rows = await tx.select().from(d).where(and(...where)).orderBy(desc(d.id)).limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const [total] = await tx.select({ n: count() }).from(d).where(and(eq(d.merchantId, merchantId), ne(d.status, "deleting")));
  return {
    items: await documentViews(page, tx),
    counts: { total: total?.n ?? 0, limit: KNOWLEDGE_DOCUMENT_LIMIT },
    nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1].id) : null,
  };
}

/** multipart 里的站点：markets[] 或 markets 多值，都没有时缺省 ALL */
function formMarkets(form: FormData): string[] | undefined {
  const values = [...form.getAll("markets[]"), ...form.getAll("markets")].filter((v): v is string => typeof v === "string" && v !== "");
  return values.length ? values : undefined;
}

/** API-KB-002：一次一个文件；类型、大小、资料数、内容重复都不合规时不建资料 */
export async function uploadDocument(ctx: MemberContext, req: Request): Promise<KnowledgeDocument> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new Problem("validation", { detail: "请用 multipart/form-data 上传，字段名 file。" });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") throw validation("没有收到文件。", { file: "请选择文件" });
  const categoryRaw = form.get("categoryId");
  const fields = uploadFields.parse({ categoryId: typeof categoryRaw === "string" && categoryRaw ? categoryRaw : undefined, markets: formMarkets(form) });
  const name = file.name.trim() || "未命名";
  if (charCount(name) > KNOWLEDGE_NAME_MAX) throw validation(`文件名最多 ${KNOWLEDGE_NAME_MAX} 个字，请改短后再上传。`, { file: `文件名最多 ${KNOWLEDGE_NAME_MAX} 个字` });
  const format = checkKnowledgeFile(name, file.size, new Uint8Array(await file.slice(0, 8192).arrayBuffer()));
  const buf = new Uint8Array(await file.arrayBuffer());
  const sha = createHash("sha256").update(buf).digest("hex");

  const merchantId = ctx.merchant.id;
  const documentId = uuidv7();
  const fileId = randomUUID();
  const path = `knowledge/${merchantId}/${documentId}.${format.ext}`;
  let written = false;
  let row: DocRow;
  try {
    row = await db().transaction(async (tx) => {
      // 资料数上限与内容去重在同一把商户咨询锁下判断（§16「并发上传越过资料上限」）
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`knowledge:${merchantId}`}))`);
      const [n] = await tx.select({ n: count() }).from(d).where(and(eq(d.merchantId, merchantId), ne(d.status, "deleting")));
      if ((n?.n ?? 0) >= KNOWLEDGE_DOCUMENT_LIMIT) await deniedByRule(ctx, "API-KB-002", "document_quota", `资料已满 ${KNOWLEDGE_DOCUMENT_LIMIT} 份，请先删除不用的。`);
      const [dup] = await tx.select({ id: d.id, name: d.name }).from(d).where(and(eq(d.merchantId, merchantId), eq(d.sha256, sha), ne(d.status, "deleting"))).limit(1);
      if (dup) throw new Problem("duplicate", { detail: `已有同样的文件「${dup.name}」。`, code: "document_duplicate", extra: { existingId: dup.id, existingName: dup.name } });
      let categoryId = fields.categoryId;
      if (categoryId) {
        // 共享锁挡住并发删除分类（§16「删除分类时有资料正上传到它」）
        const [cat] = await tx
          .select({ id: schema.knowledgeCategory.id })
          .from(schema.knowledgeCategory)
          .where(and(eq(schema.knowledgeCategory.id, categoryId), eq(schema.knowledgeCategory.merchantId, merchantId)))
          .for("share");
        if (!cat) throw validation("所选分类不存在，可能刚被删除，请刷新后重选。", { categoryId: "分类不存在" });
      } else categoryId = await builtinCategoryId(merchantId, tx);
      await tx.insert(schema.file).values({ id: fileId, merchantId, kind: "knowledge_source", path, mime: format.mime, size: buf.length, createdBy: ctx.membership.id });
      const [doc] = await tx
        .insert(d)
        .values({ id: documentId, merchantId, categoryId, fileId, name, mime: format.mime, size: buf.length, sha256: sha, markets: fields.markets, uploadedBy: ctx.membership.id })
        .returning();
      await writeDataFile(path, buf);
      written = true;
      await audit(ctx.actor, { module: "reception", action: "knowledge_uploaded", summary: `上传资料「${name}」`, targetType: "knowledge_document", targetId: doc.id, data: { document_id: doc.id, mime: format.mime, size: buf.length, markets: fields.markets } }, tx);
      return doc;
    });
  } catch (e) {
    if (written) await removeDataFile(path);
    // 部分唯一索引兜底同一内容并发上传
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "23505") throw new Problem("duplicate", { detail: "已有同样的文件。", code: "document_duplicate" });
    throw e;
  }
  await enqueue("knowledge.ingest", { documentId: row.id, requestId: ctx.requestId }, { singletonKey: row.id });
  return documentView(row);
}

/** API-KB-003 */
export async function getDocument(ctx: MemberContext, id: string): Promise<KnowledgeDocumentDetail> {
  const row = await loadDocument(ctx.merchant.id, id);
  const parts = await db().select().from(schema.knowledgePart).where(eq(schema.knowledgePart.documentId, row.id)).orderBy(asc(schema.knowledgePart.partNo));
  return {
    document: await documentView(row),
    fileUrl: `/api/v1/files/${row.fileId}`,
    parts: parts.map((p) => ({ partNo: p.partNo, pageFrom: p.pageFrom, pageTo: p.pageTo, status: p.status, retries: p.retries, error: p.error })),
  };
}

/** API-KB-004：资料不是 ready 时为空列表 */
export async function listDocumentChunks(ctx: MemberContext, id: string, cursor?: string): Promise<KnowledgeChunkPage> {
  const row = await loadDocument(ctx.merchant.id, id);
  if (row.status !== "ready") return { items: [], nextCursor: null };
  const c = schema.knowledgeChunk;
  const where: SQL[] = [eq(c.documentId, row.id)];
  if (cursor) where.push(gt(c.no, Number(decodeCursor(cursor, /^\d{1,7}$/))));
  const rows = await db()
    .select({ no: c.no, partNo: schema.knowledgePart.partNo, text: c.text })
    .from(c)
    .innerJoin(schema.knowledgePart, eq(schema.knowledgePart.id, c.partId))
    .where(and(...where))
    .orderBy(asc(c.no))
    .limit(KNOWLEDGE_CHUNKS_PAGE + 1);
  const page = rows.slice(0, KNOWLEDGE_CHUNKS_PAGE);
  return { items: page, nextCursor: rows.length > KNOWLEDGE_CHUNKS_PAGE ? encodeCursor(String(page[page.length - 1].no)) : null };
}

/** API-KB-005：立即生效，不重新解析，不改检索服务里的副本 */
export async function updateDocument(ctx: MemberContext, id: string, patch: DocumentPatch): Promise<KnowledgeDocument> {
  const merchantId = ctx.merchant.id;
  const row = await db().transaction(async (tx) => {
    const cur = await loadDocument(merchantId, id, tx);
    if (patch.categoryId && patch.categoryId !== cur.categoryId) {
      const [cat] = await tx
        .select({ id: schema.knowledgeCategory.id })
        .from(schema.knowledgeCategory)
        .where(and(eq(schema.knowledgeCategory.id, patch.categoryId), eq(schema.knowledgeCategory.merchantId, merchantId)))
        .for("share");
      if (!cat) throw validation("所选分类不存在，可能刚被删除，请刷新后重选。", { categoryId: "分类不存在" });
    }
    const [updated] = await tx
      .update(d)
      .set({ ...(patch.categoryId ? { categoryId: patch.categoryId } : {}), ...(patch.markets ? { markets: patch.markets } : {}), ...(patch.aiEnabled !== undefined ? { aiEnabled: patch.aiEnabled } : {}), updatedAt: new Date() })
      .where(and(eq(d.id, cur.id), ne(d.status, "deleting")))
      .returning();
    if (!updated) throw notFound();
    const changed = Object.keys(patch).filter((k) => patch[k as keyof DocumentPatch] !== undefined);
    await audit(ctx.actor, { module: "reception", action: "knowledge_updated", summary: `修改资料「${cur.name}」`, targetType: "knowledge_document", targetId: cur.id, data: { fields: changed, ai_enabled: updated.aiEnabled, markets: updated.markets } }, tx);
    return updated;
  });
  return documentView(row);
}

/** API-KB-006：只从 ready、failed 发起；清空分块，入库任务先删旧条目再重传 */
export async function reparseDocument(ctx: MemberContext, id: string): Promise<KnowledgeDocument> {
  const merchantId = ctx.merchant.id;
  const cur = await loadDocument(merchantId, id);
  const row = await db().transaction(async (tx) => {
    const [updated] = await tx
      .update(d)
      .set({ status: "queued", failureReason: null, readyAt: null, updatedAt: new Date() })
      .where(and(eq(d.id, cur.id), eq(d.merchantId, merchantId), inArray(d.status, ["ready", "failed"])))
      .returning();
    if (!updated) throw new Problem("conflict", { detail: "这份资料正在解析，完成后再试。", code: "processing" });
    await tx.delete(schema.knowledgeChunk).where(eq(schema.knowledgeChunk.documentId, cur.id));
    await audit(ctx.actor, { module: "reception", action: "knowledge_reparsed", summary: `重新解析资料「${cur.name}」`, targetType: "knowledge_document", targetId: cur.id }, tx);
    return updated;
  });
  await enqueue("knowledge.ingest", { documentId: row.id, requestId: ctx.requestId }, { singletonKey: row.id });
  return documentView(row);
}

/** API-KB-007：资料立即从所有接口消失，由 knowledge.purge 删检索副本、原文件与记录；删除中或已删除也返回 204 */
export async function deleteDocument(ctx: MemberContext, id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  const merchantId = ctx.merchant.id;
  const [exists] = await db().select({ id: d.id }).from(d).where(and(eq(d.id, id), eq(d.merchantId, merchantId))).limit(1);
  if (!exists) return;
  const marked = await db().transaction(async (tx) => {
    const [updated] = await tx
      .update(d)
      .set({ status: "deleting", updatedAt: new Date() })
      .where(and(eq(d.id, id), eq(d.merchantId, merchantId), ne(d.status, "deleting")))
      .returning({ id: d.id, name: d.name });
    if (!updated) return false;
    await audit(ctx.actor, { module: "reception", action: "knowledge_deleted", summary: `删除资料「${updated.name}」`, targetType: "knowledge_document", targetId: updated.id, data: { document_id: updated.id } }, tx);
    return true;
  });
  if (marked) await enqueue("knowledge.purge", { documentId: id, requestId: ctx.requestId }, { singletonKey: `doc:${id}` });
}

