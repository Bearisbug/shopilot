// 出稿检索（REQ-AI-002、REQ-KB-006、§12.8「出稿检索规则」）：有可用资料时改写问题 → 改写与原话两路并行检索 →
// 按 Shopilot 库里资料的当前状态、AI 可用与站点过滤 → 两路交替合并去重取前 8 段。出稿任务与测试问答（API-KB-012）共用。
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { KnowledgeRetrieval } from "@/contracts/knowledge";
import { AiError, chat, parseJson } from "@/server/ai/client";
import { REWRITE_PROMPT } from "@/server/ai/prompts";
import { db, schema } from "@/server/db/client";
import type { DraftCitation, DraftRetrieval } from "@/server/db/schema";
import { searchService } from "./search-service";
import { KnowledgeServiceError, type KnowledgeSearchService, type SearchHit } from "./types";

/** 每路要 20 条、过滤后留 10 条，合并取前 8 段；混合检索每路 5 秒，超时即改纯向量重试 5 秒（§15） */
export const ROUTE_FETCH = 20;
export const ROUTE_KEEP = 10;
export const MERGED_KEEP = 8;
export const SEARCH_TIMEOUT_MS = 5_000;
export const RETRY_TIMEOUT_MS = 5_000;

const d = schema.knowledgeDocument;
const ch = schema.knowledgeChunk;

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  name: string;
  fileId: string;
  chunkNo: number;
  text: string;
  score: number;
  vectorScore: number | null;
  keywordScore: number | null;
  rerankingScore: number | null;
};
export type RouteAttempt = { kind: "rewritten" | "original"; mode: "hybrid" | "vector_only"; latencyMs: number; error: string | null; chunks: RetrievedChunk[] };
export type RetrievalOutcome = {
  rewrittenQuery: string | null;
  routes: RouteAttempt[];
  merged: Array<{ n: number; chunk: RetrievedChunk }>;
  degraded: boolean;
  degradedReason: string | null;
  vectorRetry: boolean;
  latencyMs: number;
};

/** RULE-KB-001：解析完成、AI 可用开着、站点含「全部」或该店站点；market 为 null（测试问答没选店铺）时不看站点 */
function usableWhere(merchantId: string, market: string | null): SQL[] {
  const where: SQL[] = [eq(d.merchantId, merchantId), eq(d.status, "ready"), eq(d.aiEnabled, true)];
  if (market) where.push(sql`(${d.markets} @> '["ALL"]'::jsonb or ${d.markets} @> ${JSON.stringify([market])}::jsonb)`);
  return where;
}

export async function hasUsableDocuments(merchantId: string, market: string | null): Promise<boolean> {
  const [row] = await db().select({ id: d.id }).from(d).where(and(...usableWhere(merchantId, market))).limit(1);
  return !!row;
}

/** 改写：一个中文完整问题；出错、超过 6 秒或输出不合法时返回 null（只用原话检索一路） */
export async function rewriteQuestion(input: { conversation: unknown[]; orderFacts: unknown[]; original: string }): Promise<string | null> {
  try {
    const res = await chat(
      "rewrite",
      [
        { role: "system", content: REWRITE_PROMPT },
        { role: "user", content: JSON.stringify({ conversation: input.conversation, order_facts: input.orderFacts }) },
      ],
      { json: true, maxTokens: 200, stubHint: input.original },
    );
    const q = String(parseJson(res.content).query ?? "").trim();
    return q ? q.slice(0, 500) : null;
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    return null;
  }
}

/** 检索结果对回 Shopilot 的分块并按资料当前值过滤（元数据只是上传时的快照，不用来过滤），保持名次，留前 10 条 */
async function filterHits(merchantId: string, market: string | null, hits: SearchHit[]): Promise<RetrievedChunk[]> {
  if (hits.length === 0) return [];
  const rows = await db()
    .select({ chunkId: ch.id, remoteId: ch.remoteId, documentId: d.id, name: d.name, fileId: d.fileId, chunkNo: ch.no, text: ch.text })
    .from(ch)
    .innerJoin(d, eq(d.id, ch.documentId))
    .where(and(eq(ch.merchantId, merchantId), inArray(ch.remoteId, [...new Set(hits.map((h) => h.id))]), ...usableWhere(merchantId, market)));
  const byRemote = new Map(rows.map((r) => [r.remoteId, r]));
  const out: RetrievedChunk[] = [];
  for (const h of hits) {
    const r = byRemote.get(h.id);
    if (!r || out.some((o) => o.chunkId === r.chunkId)) continue;
    out.push({ chunkId: r.chunkId, documentId: r.documentId, name: r.name, fileId: r.fileId, chunkNo: r.chunkNo, text: r.text, score: h.score, vectorScore: h.vectorScore, keywordScore: h.keywordScore, rerankingScore: h.rerankingScore });
    if (out.length >= ROUTE_KEEP) break;
  }
  return out;
}

const errorText = (e: unknown) => (e instanceof KnowledgeServiceError && e.kind === "timeout" ? "timeout" : e instanceof Error ? e.message : String(e));

/** 一路检索：混合检索没有向量分或失败时改用纯向量重试一次；重试仍失败这一路记失败 */
async function runRoute(svc: KnowledgeSearchService, instance: string, merchantId: string, market: string | null, kind: "rewritten" | "original", query: string): Promise<{ attempts: RouteAttempt[]; chunks: RetrievedChunk[] | null }> {
  const attempts: RouteAttempt[] = [];
  const t0 = Date.now();
  let firstError: string;
  try {
    const hits = await svc.search(instance, { query, maxResults: ROUTE_FETCH, retrievalType: "hybrid", timeoutMs: SEARCH_TIMEOUT_MS });
    const chunks = await filterHits(merchantId, market, hits);
    // 约 2.6% 的混合检索静默降级为只有关键词结果或空（§17）：一个向量分都没有就重试
    if (hits.some((h) => h.vectorScore !== null)) {
      attempts.push({ kind, mode: "hybrid", latencyMs: Date.now() - t0, error: null, chunks });
      return { attempts, chunks };
    }
    firstError = "no_vector";
    attempts.push({ kind, mode: "hybrid", latencyMs: Date.now() - t0, error: firstError, chunks });
  } catch (e) {
    firstError = errorText(e);
    attempts.push({ kind, mode: "hybrid", latencyMs: Date.now() - t0, error: firstError, chunks: [] });
  }
  const t1 = Date.now();
  try {
    const hits = await svc.search(instance, { query, maxResults: ROUTE_FETCH, retrievalType: "vector", timeoutMs: RETRY_TIMEOUT_MS });
    const chunks = await filterHits(merchantId, market, hits);
    attempts.push({ kind, mode: "vector_only", latencyMs: Date.now() - t1, error: null, chunks });
    return { attempts, chunks };
  } catch (e) {
    attempts.push({ kind, mode: "vector_only", latencyMs: Date.now() - t1, error: errorText(e), chunks: [] });
    return { attempts, chunks: null };
  }
}

/** 两路按名次交替取，改写路在前，按分块去重，取前 8 段，编号 1–8 */
export function mergeRoutes(rewritten: RetrievedChunk[] | null, original: RetrievedChunk[] | null): Array<{ n: number; chunk: RetrievedChunk }> {
  const merged: Array<{ n: number; chunk: RetrievedChunk }> = [];
  const seen = new Set<string>();
  const a = rewritten ?? [];
  const b = original ?? [];
  for (let i = 0; i < Math.max(a.length, b.length) && merged.length < MERGED_KEEP; i++) {
    for (const c of [a[i], b[i]]) {
      if (!c || seen.has(c.chunkId) || merged.length >= MERGED_KEEP) continue;
      seen.add(c.chunkId);
      merged.push({ n: merged.length + 1, chunk: c });
    }
  }
  return merged;
}

/**
 * 出稿与测试问答共用的检索链路。没有对该店站点可用的资料时返回 null（不改写、不检索）。
 * rewriteInput 为 null 时（测试问答）问题本身既是改写输入也是原话。
 */
export async function retrieveForDraft(input: {
  merchantId: string;
  market: string | null;
  original: string;
  conversation: unknown[];
  orderFacts: unknown[];
  svc?: KnowledgeSearchService;
}): Promise<RetrievalOutcome | null> {
  if (!(await hasUsableDocuments(input.merchantId, input.market))) return null;
  const [idx] = await db().select().from(schema.knowledgeIndex).where(eq(schema.knowledgeIndex.merchantId, input.merchantId)).limit(1);
  if (!idx) return null;
  const svc = input.svc ?? searchService();
  const started = Date.now();
  const rewrittenQuery = await rewriteQuestion({ conversation: input.conversation, orderFacts: input.orderFacts, original: input.original });
  // 检索服务不接受空查询（Cloudflare 400 7001）：买家只发图片、商品卡时原话为空，这一路不跑；改写也为空时两路都不跑，按没检索到资料处理
  const original = input.original.trim();
  const [rw, og] = await Promise.all([
    rewrittenQuery ? runRoute(svc, idx.instanceName, input.merchantId, input.market, "rewritten", rewrittenQuery) : Promise.resolve(null),
    original ? runRoute(svc, idx.instanceName, input.merchantId, input.market, "original", original) : Promise.resolve(null),
  ]);
  const attempts = [...(rw?.attempts ?? []), ...(og?.attempts ?? [])];
  const failed = [rw, og].filter((r) => r && r.chunks === null).length;
  const ran = [rw, og].filter(Boolean).length;
  const degraded = ran > 0 && failed === ran;
  const errors = attempts.filter((a) => a.mode === "vector_only" && a.error).map((a) => `${a.kind === "rewritten" ? "改写路" : "原话路"}：${a.error}`);
  return {
    rewrittenQuery,
    routes: attempts,
    merged: degraded ? [] : mergeRoutes(rw?.chunks ?? null, og?.chunks ?? null),
    degraded,
    degradedReason: degraded ? `检索失败（${errors.join("；")}）` : null,
    vectorRetry: attempts.some((a) => a.mode === "vector_only"),
    latencyMs: Date.now() - started,
  };
}

/** 出稿请求 user 载荷里的资料段 `knowledge: [{ n, title, text }]`；降级时不带 */
export function knowledgePayload(r: RetrievalOutcome | null): Array<{ n: number; title: string; text: string }> | undefined {
  if (!r || r.degraded) return undefined;
  return r.merged.map((m) => ({ n: m.n, title: m.chunk.name, text: m.chunk.text }));
}

/** 依据：used_sources 里在合并结果中的编号，按资料去重（不在结果里的编号忽略） */
export function citationsFrom(r: RetrievalOutcome | null, usedSources: number[]): DraftCitation[] {
  if (!r) return [];
  const out: DraftCitation[] = [];
  for (const n of usedSources) {
    const m = r.merged.find((x) => x.n === n);
    if (m && !out.some((c) => c.documentId === m.chunk.documentId)) out.push({ n, documentId: m.chunk.documentId, name: m.chunk.name });
  }
  return out;
}

/** 草稿里存的检索快照：只存分块 ID 与分数，不存正文（§9.3 draft.retrieval） */
export function retrievalSnapshot(r: RetrievalOutcome): DraftRetrieval {
  return {
    rewrittenQuery: r.rewrittenQuery,
    routes: r.routes.map((a) => ({ kind: a.kind, mode: a.mode, latencyMs: a.latencyMs, ...(a.error ? { error: a.error } : {}), hits: a.chunks.map((c) => ({ chunkId: c.chunkId, documentId: c.documentId, score: c.score })) })),
    merged: r.merged.map((m) => ({ n: m.n, chunkId: m.chunk.chunkId, documentId: m.chunk.documentId })),
    degraded: r.degraded,
    ...(r.degradedReason ? { degradedReason: r.degradedReason } : {}),
    latencyMs: r.latencyMs,
  };
}

/** 测试问答返回的检索明细（API-KB-012） */
export function retrievalDetail(r: RetrievalOutcome): KnowledgeRetrieval {
  return {
    rewrittenQuery: r.rewrittenQuery,
    routes: r.routes.map((a) => ({
      kind: a.kind,
      mode: a.mode,
      latencyMs: a.latencyMs,
      error: a.error,
      chunks: a.chunks.map((c) => ({ documentId: c.documentId, name: c.name, chunkNo: c.chunkNo, text: c.text, score: c.score, scoreDetails: { vectorScore: c.vectorScore, keywordScore: c.keywordScore, rerankingScore: c.rerankingScore } })),
    })),
    merged: r.merged.map((m) => ({ n: m.n, documentId: m.chunk.documentId, chunkNo: m.chunk.chunkNo })),
    degraded: r.degraded,
    degradedReason: r.degradedReason,
  };
}
