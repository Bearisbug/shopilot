// 出稿检索（REQ-AI-002、REQ-KB-006、REQ-KB-012、§12.8「出稿检索规则」）：有可用资料、已发布问答或已发布经验卡时改写问题 →
// 资料（AI Search 两路检索，按 Shopilot 库里资料的当前状态、AI 可用与站点过滤，两路交替合并去重取前 8 段）、
// 问答（Postgres 向量检索，见 qa-retrieve.ts）与经验卡（见 card-retrieve.ts）并行；问答与卡共用一次向量化。
// 问答编号在前，资料分块接着编号；卡另编 K1…。出稿任务、测试问答（API-KB-012）与模拟出稿共用。
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { KnowledgeQaRetrieval, KnowledgeRetrieval } from "@/contracts/knowledge";
import { AiError, chat, parseJson } from "@/server/ai/client";
import { REWRITE_PROMPT } from "@/server/ai/prompts";
import { db, schema } from "@/server/db/client";
import type { DraftCitation, DraftRetrieval } from "@/server/db/schema";
import { hasPublishedCards, retrieveCards, type CardOutcome, type CardOverride } from "./card-retrieve";
import { EMBED_TIMEOUT_MS, embedTexts } from "./embed";
import { hasPublishedQa, retrieveQa, type QaOutcome, type RouteVector } from "./qa-retrieve";
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
  /** 资料分块；编号接在问答后面 */
  merged: Array<{ n: number; chunk: RetrievedChunk }>;
  /** 资料检索两路都失败（问答检索的失败记在 qa.error，不算降级） */
  degraded: boolean;
  degradedReason: string | null;
  vectorRetry: boolean;
  latencyMs: number;
  /** 问答检索；没有已发布问答时为 null */
  qa: QaOutcome | null;
  /** 候选经验卡；没有已发布卡、也没有拟发布内容时为 null */
  cards: CardOutcome | null;
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
 * 出稿、测试问答与模拟出稿共用的检索链路。对该店站点可用的资料、已发布问答、已发布经验卡都没有、也没有拟发布的卡时返回 null（不改写、不检索）。
 * stage（当前会话段阶段，unknown 或空不过滤）与 productIds（识别出的产品）用于问答与卡的过滤；
 * active 是本段上一份草稿正在用的卡，cardOverride 是只在这次生效的拟发布卡内容。
 */
export async function retrieveForDraft(input: {
  merchantId: string;
  market: string | null;
  original: string;
  conversation: unknown[];
  orderFacts: unknown[];
  stage?: string | null;
  productIds?: string[];
  active?: { cardId: string; step: number } | null;
  cardOverride?: CardOverride | null;
  svc?: KnowledgeSearchService;
}): Promise<RetrievalOutcome | null> {
  const [docsUsable, qaUsable, cardsPublished] = await Promise.all([hasUsableDocuments(input.merchantId, input.market), hasPublishedQa(input.merchantId, input.market), hasPublishedCards(input.merchantId, input.market)]);
  const cardsUsable = cardsPublished || !!input.cardOverride;
  const [idx] = docsUsable ? await db().select().from(schema.knowledgeIndex).where(eq(schema.knowledgeIndex.merchantId, input.merchantId)).limit(1) : [];
  if (!idx && !qaUsable && !cardsUsable) return null;
  const svc = input.svc ?? searchService();
  const started = Date.now();
  const rewrittenQuery = await rewriteQuestion({ conversation: input.conversation, orderFacts: input.orderFacts, original: input.original });
  // 检索服务不接受空查询（Cloudflare 400 7001）：买家只发图片、商品卡时原话为空，这一路不跑；改写也为空时两路都不跑，按没检索到资料处理
  const original = input.original.trim();
  const filter = { merchantId: input.merchantId, market: input.market, stage: input.stage ?? null, productIds: input.productIds ?? [] };
  const embedded = qaUsable || cardsPublished ? await embedRoutes(rewrittenQuery, original) : { vectors: [], error: null };
  const [rw, og, qa, cards] = await Promise.all([
    idx && rewrittenQuery ? runRoute(svc, idx.instanceName, input.merchantId, input.market, "rewritten", rewrittenQuery) : Promise.resolve(null),
    idx && original ? runRoute(svc, idx.instanceName, input.merchantId, input.market, "original", original) : Promise.resolve(null),
    qaUsable ? retrieveQa({ ...filter, rewritten: rewrittenQuery, original, vectors: embedded.vectors, embedError: embedded.error }) : Promise.resolve(null),
    cardsUsable ? retrieveCards({ ...filter, vectors: cardsPublished ? embedded.vectors : [], embedError: embedded.error, active: input.active, override: input.cardOverride }) : Promise.resolve(null),
  ]);
  const attempts = [...(rw?.attempts ?? []), ...(og?.attempts ?? [])];
  const failed = [rw, og].filter((r) => r && r.chunks === null).length;
  const ran = [rw, og].filter(Boolean).length;
  const degraded = ran > 0 && failed === ran;
  const errors = attempts.filter((a) => a.mode === "vector_only" && a.error).map((a) => `${a.kind === "rewritten" ? "改写路" : "原话路"}：${a.error}`);
  const offset = qa?.merged.length ?? 0;
  return {
    rewrittenQuery,
    routes: attempts,
    merged: degraded ? [] : mergeRoutes(rw?.chunks ?? null, og?.chunks ?? null).map((m) => ({ n: m.n + offset, chunk: m.chunk })),
    degraded,
    degradedReason: degraded ? `检索失败（${errors.join("；")}）` : null,
    vectorRetry: attempts.some((a) => a.mode === "vector_only"),
    latencyMs: Date.now() - started,
    qa,
    cards,
  };
}

/** 改写问题与买家原话一次向量化（问答与卡共用）；失败只记原因，两样都降级 */
async function embedRoutes(rewritten: string | null, original: string): Promise<{ vectors: RouteVector[]; error: string | null }> {
  const routes = [...(rewritten?.trim() ? [{ route: "rewritten" as const, text: rewritten.trim() }] : []), ...(original ? [{ route: "original" as const, text: original }] : [])];
  if (routes.length === 0) return { vectors: [], error: null };
  try {
    const vecs = await embedTexts(
      routes.map((r) => r.text),
      EMBED_TIMEOUT_MS,
    );
    return { vectors: routes.map((r, i) => ({ route: r.route, vec: vecs[i] })), error: null };
  } catch (e) {
    return { vectors: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 出稿请求 user 载荷里的资料段 `knowledge: [{ n, title, text }]`：问答在前（标题「问答：第一个问法」，正文「问：…答：…」），
 * 资料分块在后；资料检索降级时只带问答，两样都没有时不带。
 */
export function knowledgePayload(r: RetrievalOutcome | null): Array<{ n: number; title: string; text: string }> | undefined {
  if (!r) return undefined;
  const qa = (r.qa?.merged ?? []).map((m) => ({ n: m.n, title: `问答：${m.hit.questions[0]}`, text: `问：${m.hit.questions.join(" / ")}\n答：${m.hit.answer}` }));
  const docs = r.degraded ? [] : r.merged.map((m) => ({ n: m.n, title: m.chunk.name, text: m.chunk.text }));
  const all = [...qa, ...docs];
  return all.length ? all : undefined;
}

/** 依据：used_sources 里在合并结果中的编号，问答按问答去重、资料按资料去重（不在结果里的编号忽略） */
export function citationsFrom(r: RetrievalOutcome | null, usedSources: number[]): DraftCitation[] {
  if (!r) return [];
  const out: DraftCitation[] = [];
  for (const n of usedSources) {
    const qa = r.qa?.merged.find((x) => x.n === n);
    if (qa) {
      if (!out.some((c) => c.kind === "qa" && c.qaId === qa.hit.qaId)) out.push({ n, kind: "qa", qaId: qa.hit.qaId, name: qa.hit.questions[0] });
      continue;
    }
    const m = r.merged.find((x) => x.n === n);
    if (m && !out.some((c) => c.kind !== "qa" && c.documentId === m.chunk.documentId)) out.push({ n, kind: "document", documentId: m.chunk.documentId, name: m.chunk.name });
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
    ...(r.cards
      ? {
          cards: {
            latencyMs: r.cards.latencyMs,
            ...(r.cards.error ? { error: r.cards.error } : {}),
            hits: r.cards.hits.map((h) => ({ ...h, distance: Number(h.distance.toFixed(4)) })),
            candidates: r.cards.candidates.map((x) => ({ key: x.key, cardId: x.cardId, version: x.version, distance: x.distance === null ? null : Number(x.distance.toFixed(4)), active: x.active })),
          },
        }
      : {}),
    ...(r.qa
      ? {
          qa: {
            latencyMs: r.qa.latencyMs,
            ...(r.qa.error ? { error: r.qa.error } : {}),
            productIds: r.qa.productIds,
            hits: r.qa.hits.map((h) => ({ route: h.route, qaId: h.qaId, distance: Number(h.distance.toFixed(4)) })),
            merged: r.qa.merged.map((m) => ({ n: m.n, qaId: m.hit.qaId })),
          },
        }
      : {}),
  };
}

/** 测试问答返回的问答检索明细（API-KB-012） */
export function qaDetail(qa: QaOutcome): KnowledgeQaRetrieval {
  return {
    latencyMs: qa.latencyMs,
    error: qa.error,
    stage: qa.stage,
    productIds: qa.productIds,
    hits: qa.hits.map((h) => ({ route: h.route, qaId: h.qaId, question: h.questions[0], answer: h.answer, distance: Number(h.distance.toFixed(4)) })),
    merged: qa.merged.map((m) => ({ n: m.n, qaId: m.hit.qaId })),
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
