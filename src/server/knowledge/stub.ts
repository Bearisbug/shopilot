// 检索替身（KNOWLEDGE_MODE=stub，API-MOCK-010）：本机与测试不调 Cloudflare。
// 条目只存在本进程内存里（入库的上传、查状态、读分块都在同一个 knowledge.ingest 任务里完成）；
// 检索读 Shopilot 库里已读回的分块（Web 与 Worker 两个进程都能查），按关键词重合打分并给出向量分。
// 下一次表现由 dev_knowledge_stub 决定：no_vector / timeout / error 作用于检索，ingest_error 作用于入库；sticky 为否时用一次回到 normal。
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import type { KnowledgeStubQuery } from "@/server/db/schema";
import { KnowledgeServiceError, type KnowledgeSearchService, type RemoteChunk, type RemoteItem, type SearchHit, type SearchRequest } from "./types";

type StubItem = RemoteItem & { chunks: RemoteChunk[] };
type StubNext = "normal" | "no_vector" | "timeout" | "error" | "ingest_error";

export const STUB_CHUNK_CHARS = 1_500;
export const STUB_INGEST_ERROR = "workers_ai_timeout_error（替身）";
const LAST_QUERIES_KEPT = 6;
const TEXT_EXT = /\.(md|txt|csv|html?)$/i;

const g = globalThis as unknown as { __shopilotKbStub?: Map<string, Map<string, StubItem>> };
function store(instance: string): Map<string, StubItem> {
  g.__shopilotKbStub ??= new Map();
  let m = g.__shopilotKbStub.get(instance);
  if (!m) {
    m = new Map();
    g.__shopilotKbStub.set(instance, m);
  }
  return m;
}

/** 替身解析：文本类按 1,500 字切块，其余格式生成一段「替身解析：<文件名>」 */
export function stubChunkTexts(key: string, data: Uint8Array, fileName: string): string[] {
  if (!TEXT_EXT.test(key)) return [`替身解析：${fileName}`];
  let text = new TextDecoder().decode(data);
  if (/\.html?$/i.test(key)) text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [`替身解析：${fileName}`];
  const chars = [...text];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += STUB_CHUNK_CHARS) out.push(chars.slice(i, i + STUB_CHUNK_CHARS).join(""));
  return out;
}

/** 关键词：拉丁等按词，中日韩文字按相邻两字 */
export function stubTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (/[㐀-鿿぀-ヿ가-힯]/u.test(w)) {
      const chars = [...w];
      if (chars.length === 1) out.add(w);
      for (let i = 0; i + 1 < chars.length; i++) out.add(chars[i] + chars[i + 1]);
    } else if ([...w].length >= 2 || /\d/.test(w)) out.add(w);
  }
  return out;
}

/** 取下一次表现并按需消耗；两路并发检索时条件更新保证「用一次」只给到一路 */
async function take(kind: "search" | "ingest", retrievalType?: "hybrid" | "vector"): Promise<StubNext> {
  const [row] = await db().select().from(schema.devKnowledgeStub).where(eq(schema.devKnowledgeStub.id, 1)).limit(1);
  const next = (row?.next ?? "normal") as StubNext;
  const applies = kind === "ingest" ? next === "ingest_error" : next === "timeout" || next === "error" || (next === "no_vector" && retrievalType !== "vector");
  if (!row || !applies) return "normal";
  if (row.sticky) return next;
  const consumed = await db()
    .update(schema.devKnowledgeStub)
    .set({ next: "normal", updatedAt: new Date() })
    .where(and(eq(schema.devKnowledgeStub.id, 1), eq(schema.devKnowledgeStub.next, next), eq(schema.devKnowledgeStub.sticky, false)))
    .returning({ id: schema.devKnowledgeStub.id });
  return consumed.length ? next : "normal";
}

/** 追加一条检索请求，只留最近 6 条；两路并发时行锁保证两条都记下 */
async function recordQuery(q: KnowledgeStubQuery) {
  const appended = sql`coalesce(${schema.devKnowledgeStub.lastQuery}, '[]'::jsonb) || ${JSON.stringify([q])}::jsonb`;
  await db()
    .insert(schema.devKnowledgeStub)
    .values({ id: 1, lastQuery: [q] })
    .onConflictDoUpdate({
      target: schema.devKnowledgeStub.id,
      set: { lastQuery: sql`case when jsonb_array_length(${appended}) > ${LAST_QUERIES_KEPT} then (${appended}) - 0 else ${appended} end`, updatedAt: new Date() },
    });
}

async function stubSearch(instance: string, req: SearchRequest): Promise<SearchHit[]> {
  await recordQuery({ at: new Date().toISOString(), instance, query: req.query, retrievalType: req.retrievalType, maxResults: req.maxResults });
  const next = await take("search", req.retrievalType);
  if (next === "timeout") throw new KnowledgeServiceError("timeout", "检索服务超时（替身）");
  if (next === "error") throw new KnowledgeServiceError("http", "500 检索服务错误（替身）", 500);
  const [idx] = await db().select({ merchantId: schema.knowledgeIndex.merchantId }).from(schema.knowledgeIndex).where(eq(schema.knowledgeIndex.instanceName, instance)).limit(1);
  if (!idx) return [];
  const rows = await db()
    .select({ remoteId: schema.knowledgeChunk.remoteId, text: schema.knowledgeChunk.text, itemKey: schema.knowledgePart.itemKey })
    .from(schema.knowledgeChunk)
    .innerJoin(schema.knowledgePart, eq(schema.knowledgePart.id, schema.knowledgeChunk.partId))
    .where(eq(schema.knowledgeChunk.merchantId, idx.merchantId));
  const q = stubTokens(req.query);
  const scored = rows.map((r) => {
    const t = stubTokens(r.text);
    let overlap = 0;
    for (const k of q) if (t.has(k)) overlap++;
    const ratio = q.size ? overlap / q.size : 0;
    const vector = Math.round((0.05 + 0.9 * ratio) * 1000) / 1000;
    return {
      id: r.remoteId,
      text: r.text,
      itemKey: r.itemKey,
      score: vector,
      vectorScore: next === "no_vector" ? null : vector,
      keywordScore: overlap,
      rerankingScore: Math.round(ratio * 1000) / 1000,
    } satisfies SearchHit;
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, req.maxResults);
}

export function stubSearchService(): KnowledgeSearchService {
  return {
    mode: "stub",
    pollIntervalMs: 50,
    async createInstance(name) {
      store(name);
    },
    async deleteInstance(name) {
      g.__shopilotKbStub?.delete(name);
    },
    async uploadItem(instance, item) {
      const next = await take("ingest");
      const [doc] = await db().select({ name: schema.knowledgeDocument.name }).from(schema.knowledgeDocument).where(eq(schema.knowledgeDocument.id, item.metadata.document_id)).limit(1);
      const id = randomUUID().replace(/-/g, "");
      const texts = next === "ingest_error" ? [] : stubChunkTexts(item.key, item.data, doc?.name ?? item.key);
      const stubItem: StubItem = {
        id,
        key: item.key,
        status: next === "ingest_error" ? "error" : "completed",
        error: next === "ingest_error" ? STUB_INGEST_ERROR : null,
        chunksCount: texts.length,
        chunks: texts.map((text, i) => ({ id: `${id}-${i + 1}`, text })),
      };
      const items = store(instance);
      for (const [k, v] of items) if (v.key === item.key) items.delete(k);
      items.set(id, stubItem);
      return { id, key: item.key, status: "queued", error: null, chunksCount: 0 };
    },
    async getItem(instance, itemId) {
      const it = store(instance).get(itemId);
      return it ? { id: it.id, key: it.key, status: it.status, error: it.error, chunksCount: it.chunksCount } : null;
    },
    async findItem(instance, key) {
      for (const it of store(instance).values()) if (it.key === key) return { id: it.id, key: it.key, status: it.status, error: it.error, chunksCount: it.chunksCount };
      return null;
    },
    async deleteItem(instance, itemId) {
      store(instance).delete(itemId);
    },
    async listChunks(instance, itemId) {
      return store(instance).get(itemId)?.chunks ?? [];
    },
    search: stubSearch,
  };
}
