// 后台任务 knowledge.ingest（§11.14 start → indexed / fail、§12.7、§17）：确认检索实例 → 大 PDF 按页拆分 → 逐条目上传并等索引
// （失败删除后同名重传，最多 2 次）→ 读回分块 → 资料 ready。每一步之前重读资料状态，发现删除中即停（§16「删除与入库交错」）。
import { readFile } from "node:fs/promises";
import { and, asc, count, eq, lt, sql } from "drizzle-orm";
import { audit, systemActor } from "@/server/core/audit";
import { db, schema } from "@/server/db/client";
import { dataPath } from "@/server/files/storage";
import { enqueue } from "@/server/jobs/boss";
import { KNOWLEDGE_NON_PDF_MAX } from "@/contracts/knowledge";
import { searchService } from "./search-service";
import { splitPdf, type PdfPart } from "./split";
import { KnowledgeServiceError, instanceName, type KnowledgeSearchService } from "./types";

/** 单份资料入库上限 20 分钟（§15）；单个条目等索引最长 15 分钟；条目重传最多 2 次；每商户同时解析 2 份 */
export const INGEST_DEADLINE_MS = 20 * 60_000;
export const INDEX_WAIT_MS = 15 * 60_000;
export const MAX_RETRIES = 2;
export const MERCHANT_SLOTS = 2;
/** 同商户已有 2 份在解析时，过这么久再排 */
const BUSY_DELAY_SECONDS = 15;

const d = schema.knowledgeDocument;
const p = schema.knowledgePart;

/** 资料已删除（或进入删除中）：入库停下，已上传的条目自己删掉，其余交给 knowledge.purge */
class IngestStop extends Error {}
/** 入库失败：写 failure_reason（中文，给管理员看） */
class IngestFail extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function log(line: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", job: "knowledge.ingest", ...line }));
}

/** 11.14 start：每商户最多 2 份同时 processing，计数与改状态在同一把商户锁下 */
async function claim(documentId: string, merchantId: string): Promise<"ok" | "busy" | "gone"> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`knowledge-ingest:${merchantId}`}))`);
    const [n] = await tx.select({ n: count() }).from(d).where(and(eq(d.merchantId, merchantId), eq(d.status, "processing")));
    if ((n?.n ?? 0) >= MERCHANT_SLOTS) return "busy";
    const [row] = await tx.update(d).set({ status: "processing", updatedAt: new Date() }).where(and(eq(d.id, documentId), eq(d.status, "queued"))).returning({ id: d.id });
    return row ? "ok" : "gone";
  });
}

/** 商户的检索实例；没有就建（同商户并发只建一个，§16） */
export async function ensureInstance(merchantId: string, svc: KnowledgeSearchService): Promise<string> {
  const [idx] = await db().select().from(schema.knowledgeIndex).where(eq(schema.knowledgeIndex.merchantId, merchantId)).limit(1);
  if (idx) return idx.instanceName;
  const name = instanceName(merchantId);
  try {
    await db().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`knowledge-index:${merchantId}`}))`);
      const [again] = await tx.select().from(schema.knowledgeIndex).where(eq(schema.knowledgeIndex.merchantId, merchantId)).limit(1);
      if (again) return;
      await svc.createInstance(name);
      await tx.insert(schema.knowledgeIndex).values({ merchantId, instanceName: name }).onConflictDoNothing();
    });
  } catch (e) {
    if (e instanceof KnowledgeServiceError && e.kind === "capacity") throw new IngestFail(`检索服务容量已满（实例数已到上限），请联系 Shopilot 处理：${e.message}`);
    throw new IngestFail(`检索实例创建失败：${message(e)}`);
  }
  return name;
}

export async function ingestDocument(data: Record<string, unknown>, svc: KnowledgeSearchService = searchService()): Promise<void> {
  const documentId = String(data.documentId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return;
  const started = Date.now();
  const [doc] = await db().select().from(d).where(eq(d.id, documentId)).limit(1);
  if (!doc || doc.status !== "queued") return;
  const claimed = await claim(doc.id, doc.merchantId);
  if (claimed === "busy") {
    await enqueue("knowledge.ingest", { documentId: doc.id }, { singletonKey: doc.id, startAfter: BUSY_DELAY_SECONDS });
    return;
  }
  if (claimed === "gone") return;

  /** 本次运行上传过、还没确认要保留的条目（失败或停下时删掉） */
  const uploaded = new Set<string>();
  let instance: string | null = null;
  let retries = 0;

  const alive = async () => {
    const [cur] = await db().select({ status: d.status }).from(d).where(eq(d.id, doc.id)).limit(1);
    if (!cur || cur.status === "deleting") throw new IngestStop();
    if (Date.now() - started > INGEST_DEADLINE_MS) throw new IngestFail("入库超过 20 分钟没有完成，请稍后重新解析");
  };

  try {
    instance = await ensureInstance(doc.merchantId, svc);
    await alive();
    await clearParts(doc.id, instance, svc);

    const [file] = await db().select().from(schema.file).where(eq(schema.file.id, doc.fileId)).limit(1);
    const bytes = file ? await readFile(dataPath(file.path)).catch(() => null) : null;
    if (!file || !bytes) throw new IngestFail("原文件已不存在，请删除后重新上传");
    const ext = file.path.split(".").pop() ?? "bin";

    let pieces: PdfPart[];
    if (doc.mime === "application/pdf") {
      const split = await splitPdf(new Uint8Array(bytes));
      if (!split.ok) throw new IngestFail("page" in split ? `第 ${split.page} 页超过 10 MB，请压缩后重传` : `PDF 无法按页拆分：${split.error}`);
      pieces = split.parts;
    } else {
      if (bytes.length > KNOWLEDGE_NON_PDF_MAX) throw new IngestFail("PDF 以外的文件不能超过 4 MB");
      pieces = [{ pageFrom: null, pageTo: null, data: new Uint8Array(bytes) }];
    }

    const parts = await db()
      .insert(p)
      .values(pieces.map((piece, i) => ({ merchantId: doc.merchantId, documentId: doc.id, partNo: i + 1, pageFrom: piece.pageFrom, pageTo: piece.pageTo, itemKey: `${doc.id}/${i + 1}.${ext}` })))
      .returning();

    const itemIds: string[] = [];
    for (const part of parts) {
      const piece = pieces[part.partNo - 1];
      const r = await indexPart({ svc, instance, part, data: piece.data, mime: doc.mime, metadata: { document_id: doc.id, category_id: doc.categoryId, markets: doc.markets.join(",") }, uploaded, alive });
      retries += r.retries;
      itemIds.push(r.itemId);
    }

    // 按条目读回分块，资料内从 1 连续编号（§9.6）
    const chunkRows: Array<typeof schema.knowledgeChunk.$inferInsert> = [];
    for (const [i, part] of parts.entries()) {
      await alive();
      for (const c of await svc.listChunks(instance, itemIds[i])) chunkRows.push({ merchantId: doc.merchantId, documentId: doc.id, partId: part.id, no: chunkRows.length + 1, remoteId: c.id, text: c.text });
    }
    await alive();

    const ready = await db().transaction(async (tx) => {
      const [row] = await tx.update(d).set({ status: "ready", readyAt: new Date(), failureReason: null, updatedAt: new Date() }).where(and(eq(d.id, doc.id), eq(d.status, "processing"))).returning({ id: d.id });
      if (!row) return false;
      for (let i = 0; i < chunkRows.length; i += 500) await tx.insert(schema.knowledgeChunk).values(chunkRows.slice(i, i + 500));
      const ingestSec = Math.round((Date.now() - started) / 1000);
      await audit(systemActor(doc.merchantId), { module: "reception", action: "knowledge_ready", summary: `资料「${doc.name}」解析完成`, targetType: "knowledge_document", targetId: doc.id, data: { document_id: doc.id, parts: parts.length, chunks: chunkRows.length, ingest_sec: ingestSec, retries } }, tx);
      return true;
    });
    if (!ready) throw new IngestStop();
    log({ documentId: doc.id, merchantId: doc.merchantId, result: "ready", parts: parts.length, chunks: chunkRows.length, retries, durationMs: Date.now() - started });
  } catch (e) {
    if (instance) await removeUploaded(instance, uploaded, svc);
    if (e instanceof IngestStop) {
      log({ documentId: doc.id, merchantId: doc.merchantId, result: "stopped", reason: "资料已删除", retries });
      return;
    }
    const reason = e instanceof IngestFail ? e.reason : `入库出错：${message(e)}`;
    const [row] = await db().update(d).set({ status: "failed", failureReason: reason, updatedAt: new Date() }).where(and(eq(d.id, doc.id), eq(d.status, "processing"))).returning({ id: d.id });
    if (row) await audit(systemActor(doc.merchantId), { module: "reception", action: "knowledge_failed", summary: `资料「${doc.name}」入库失败：${reason}`, targetType: "knowledge_document", targetId: doc.id, data: { document_id: doc.id, reason } });
    console.log(JSON.stringify({ t: new Date().toISOString(), level: "warn", job: "knowledge.ingest", documentId: doc.id, merchantId: doc.merchantId, result: "failed", reason, retries, durationMs: Date.now() - started }));
  }
}

/** 重新解析或任务重跑：先删旧条目（检索服务里的与库里的），分块随条目级联删除 */
async function clearParts(documentId: string, instance: string, svc: KnowledgeSearchService) {
  const old = await db().select().from(p).where(eq(p.documentId, documentId)).orderBy(asc(p.partNo));
  for (const part of old) {
    const item = await svc.findItem(instance, part.itemKey);
    if (item) await svc.deleteItem(instance, item.id);
  }
  if (old.length) await db().delete(p).where(eq(p.documentId, documentId));
}

async function removeUploaded(instance: string, uploaded: Set<string>, svc: KnowledgeSearchService) {
  for (const id of uploaded) {
    try {
      await svc.deleteItem(instance, id);
    } catch (e) {
      console.error(JSON.stringify({ t: new Date().toISOString(), level: "error", job: "knowledge.ingest", msg: "删除已上传条目失败", instance, itemId: id, err: message(e) }));
    }
  }
  uploaded.clear();
}

type PartInput = {
  svc: KnowledgeSearchService;
  instance: string;
  part: typeof p.$inferSelect;
  data: Uint8Array;
  mime: string;
  metadata: { document_id: string; category_id: string; markets: string };
  uploaded: Set<string>;
  alive: () => Promise<void>;
};

/** 上传一个条目并等索引；报错或 15 分钟没完成时删除后同名重传，最多 2 次（ADR-014：「重新同步」不可靠） */
async function indexPart(x: PartInput): Promise<{ itemId: string; retries: number }> {
  const { svc, instance, part } = x;
  for (let retries = 0; ; retries++) {
    await x.alive();
    let itemId: string | null = null;
    let error: string;
    try {
      const stale = await svc.findItem(instance, part.itemKey);
      if (stale) await svc.deleteItem(instance, stale.id);
      const item = await svc.uploadItem(instance, { key: part.itemKey, data: x.data, mime: x.mime, metadata: x.metadata });
      itemId = item.id;
      x.uploaded.add(item.id);
      await db().update(p).set({ status: "indexing", retries, error: null, updatedAt: new Date() }).where(eq(p.id, part.id));
      // 上传之后再看一眼：资料若刚被删，purge 可能已经扫过条目，这个新条目要自己删
      await x.alive();
      const outcome = await waitIndexed(svc, instance, item.id, x.alive);
      if (outcome === "completed") {
        await db().update(p).set({ status: "indexed", retries, error: null, updatedAt: new Date() }).where(eq(p.id, part.id));
        return { itemId: item.id, retries };
      }
      error = outcome;
    } catch (e) {
      if (e instanceof IngestStop || e instanceof IngestFail) throw e;
      error = message(e);
    }
    if (itemId) {
      await svc.deleteItem(instance, itemId).catch(() => undefined);
      x.uploaded.delete(itemId);
    }
    if (retries >= MAX_RETRIES) {
      await db().update(p).set({ status: "failed", retries, error, updatedAt: new Date() }).where(eq(p.id, part.id));
      throw new IngestFail(`检索服务索引失败（已重传 ${MAX_RETRIES} 次）：${error}`);
    }
    await db().update(p).set({ status: "pending", retries: retries + 1, error, updatedAt: new Date() }).where(eq(p.id, part.id));
  }
}

/** 每隔 pollIntervalMs 查一次索引状态，最长 15 分钟；返回 completed 或失败原因 */
async function waitIndexed(svc: KnowledgeSearchService, instance: string, itemId: string, alive: () => Promise<void>): Promise<string> {
  const deadline = Date.now() + INDEX_WAIT_MS;
  for (;;) {
    await sleep(svc.pollIntervalMs);
    await alive();
    let item;
    try {
      item = await svc.getItem(instance, itemId);
    } catch {
      // 查状态的网络抖动不算失败，下一轮再查
      item = undefined;
    }
    if (item === null) return "检索服务里找不到这个条目";
    if (item?.status === "completed") return "completed";
    if (item && (item.status === "error" || item.status === "skipped")) return item.error ?? item.status;
    if (Date.now() > deadline) return "索引超过 15 分钟没有完成";
  }
}

/** 补扫（knowledge.purge 每小时一次时顺带）：排队超过 10 分钟的重新排入库；解析超过 25 分钟的（任务中断）标失败 */
export async function sweepIngest(): Promise<void> {
  const queued = await db()
    .select({ id: d.id })
    .from(d)
    .where(and(eq(d.status, "queued"), sql`coalesce(${d.updatedAt}, ${d.createdAt}) < ${new Date(Date.now() - 10 * 60_000)}`))
    .limit(500);
  for (const row of queued) await enqueue("knowledge.ingest", { documentId: row.id }, { singletonKey: row.id });
  const stuck = await db()
    .update(d)
    .set({ status: "failed", failureReason: "入库任务中断，请重新解析", updatedAt: new Date() })
    .where(and(eq(d.status, "processing"), lt(d.updatedAt, new Date(Date.now() - INGEST_DEADLINE_MS - 5 * 60_000))))
    .returning({ id: d.id, merchantId: d.merchantId, name: d.name });
  for (const row of stuck) await audit(systemActor(row.merchantId), { module: "reception", action: "knowledge_failed", summary: `资料「${row.name}」入库失败：入库任务中断`, targetType: "knowledge_document", targetId: row.id, data: { document_id: row.id, reason: "入库任务中断" } });
}
