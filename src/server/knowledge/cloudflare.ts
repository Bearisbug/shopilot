// Cloudflare AI Search REST 适配器（ADR-014、§17）。接口路径 /accounts/{account}/ai-search/namespaces/default/instances/...，
// 字段以 developers.cloudflare.com/api/resources/ai_search 为准（2026-10-15 核对）。token 只从环境变量读，不进日志。
import { env } from "@/server/env";
import { KnowledgeServiceError, type ItemMetadata, type KnowledgeSearchService, type RemoteChunk, type RemoteItem, type SearchHit, type SearchRequest } from "./types";

const NAMESPACE = "default";
/** 上传与删除条目 30 秒；网络错误、429 与 5xx 重试 2 次（1 秒、2 秒） */
const WRITE_TIMEOUT_MS = 30_000;
const READ_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [1_000, 2_000];
const CHUNK_PAGE = 100;

/** 实例配置（§17「Cloudflare AI Search 的实例配置与限制」）；元数据最多 5 个字段，这里用 3 个 */
export const INSTANCE_CONFIG = {
  embedding_model: "@cf/qwen/qwen3-embedding-0.6b",
  index_method: { vector: true, keyword: true },
  fusion_method: "rrf",
  reranking: true,
  reranking_model: "@cf/baai/bge-reranker-base",
  indexing_options: { use_ocr: true, keyword_tokenizer: "porter" },
  retrieval_options: { keyword_match_mode: "or" },
  chunk: true,
  chunk_size: 512,
  chunk_overlap: 15,
  rewrite_query: false,
  cache: false,
  custom_metadata: [
    { field_name: "document_id", data_type: "text" },
    { field_name: "category_id", data_type: "text" },
    { field_name: "markets", data_type: "text" },
  ],
} as const;

type Envelope<T> = { success?: boolean; errors?: Array<{ code?: number; message?: string }>; result?: T; result_info?: { total?: number } };
type CfItem = { id: string; key: string; status: RemoteItem["status"]; error?: string | null; chunks_count?: number };
type CfChunk = { id: string; text: string };
type CfSearchChunk = {
  id: string;
  text: string;
  score: number;
  item?: { key?: string };
  scoring_details?: { vector_score?: number; keyword_score?: number; reranking_score?: number };
};

function base(): { url: string; token: string } {
  const e = env();
  if (!e.CLOUDFLARE_ACCOUNT_ID || !e.CLOUDFLARE_API_TOKEN) throw new KnowledgeServiceError("http", "CLOUDFLARE_ACCOUNT_ID 或 CLOUDFLARE_API_TOKEN 未配置");
  return { url: `https://api.cloudflare.com/client/v4/accounts/${e.CLOUDFLARE_ACCOUNT_ID}/ai-search/namespaces/${NAMESPACE}`, token: e.CLOUDFLARE_API_TOKEN };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function errorText(status: number, body: Envelope<unknown>): string {
  const first = body.errors?.[0];
  if (first) return `${first.code ?? status} ${first.message ?? ""}`.trim();
  return `HTTP ${status}`;
}

async function call<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  opts: { json?: unknown; form?: () => FormData; timeoutMs: number; retry: boolean },
): Promise<{ status: number; body: Envelope<T> }> {
  const { url, token } = base();
  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    let status = 0;
    try {
      const headers: Record<string, string> = { authorization: `Bearer ${token}` };
      let body: BodyInit | undefined;
      if (opts.form) body = opts.form();
      else if (opts.json !== undefined) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(opts.json);
      }
      const res = await fetch(url + path, { method, headers, body, signal: AbortSignal.timeout(opts.timeoutMs), cache: "no-store" });
      status = res.status;
      const text = await res.text();
      let parsed: Envelope<T> = {};
      try {
        parsed = text ? (JSON.parse(text) as Envelope<T>) : {};
      } catch {
        parsed = { errors: [{ message: text.slice(0, 200) }] };
      }
      log(method, path, status, Date.now() - started);
      if ((status === 429 || status >= 500) && opts.retry && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      return { status, body: parsed };
    } catch (e) {
      const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      log(method, path, status || null, Date.now() - started, timeout ? "timeout" : "network");
      if (!timeout && opts.retry && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw new KnowledgeServiceError(timeout ? "timeout" : "network", timeout ? "检索服务超时" : `检索服务连不上：${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

function ok<T>(r: { status: number; body: Envelope<T> }): T {
  if (r.status >= 200 && r.status < 300 && r.body.success !== false && r.body.result !== undefined) return r.body.result;
  throw new KnowledgeServiceError("http", errorText(r.status, r.body), r.status);
}

function toItem(i: CfItem): RemoteItem {
  return { id: i.id, key: i.key, status: i.status, error: i.error ?? null, chunksCount: i.chunks_count ?? 0 };
}

const enc = encodeURIComponent;

export function cloudflareSearchService(): KnowledgeSearchService {
  return {
    mode: "cloudflare",
    pollIntervalMs: 15_000,

    async createInstance(name) {
      const r = await call<unknown>("POST", "/instances", { json: { id: name, ...INSTANCE_CONFIG }, timeoutMs: WRITE_TIMEOUT_MS, retry: true });
      if (r.status >= 200 && r.status < 300 && r.body.success !== false) return;
      const text = errorText(r.status, r.body);
      // 同名实例已存在（上一次建了但没来得及记库）视为成功
      const existing = await call<unknown>("GET", `/instances/${enc(name)}`, { timeoutMs: READ_TIMEOUT_MS, retry: true });
      if (existing.status === 200 && existing.body.result) return;
      if (/limit|quota|maximum/i.test(text)) throw new KnowledgeServiceError("capacity", text, r.status);
      throw new KnowledgeServiceError("http", text, r.status);
    },

    async deleteInstance(name) {
      const r = await call<unknown>("DELETE", `/instances/${enc(name)}`, { timeoutMs: WRITE_TIMEOUT_MS, retry: true });
      if (r.status === 404) return;
      ok(r);
    },

    async uploadItem(instance, item) {
      const form = () => {
        const fd = new FormData();
        fd.append("file", new Blob([new Uint8Array(item.data)], { type: item.mime }), item.key);
        fd.append("metadata", JSON.stringify(item.metadata satisfies ItemMetadata));
        return fd;
      };
      const r = await call<CfItem>("POST", `/instances/${enc(instance)}/items`, { form, timeoutMs: WRITE_TIMEOUT_MS, retry: true });
      return toItem(ok(r));
    },

    async getItem(instance, itemId) {
      const r = await call<CfItem>("GET", `/instances/${enc(instance)}/items/${enc(itemId)}`, { timeoutMs: READ_TIMEOUT_MS, retry: true });
      if (r.status === 404) return null;
      return toItem(ok(r));
    },

    async findItem(instance, key) {
      const r = await call<CfItem[]>("GET", `/instances/${enc(instance)}/items?key=${enc(key)}&source=builtin`, { timeoutMs: READ_TIMEOUT_MS, retry: true });
      if (r.status === 404) return null;
      const hit = ok(r).find((i) => i.key === key);
      return hit ? toItem(hit) : null;
    },

    async deleteItem(instance, itemId) {
      const r = await call<unknown>("DELETE", `/instances/${enc(instance)}/items/${enc(itemId)}`, { timeoutMs: WRITE_TIMEOUT_MS, retry: true });
      if (r.status === 404) return;
      ok(r);
    },

    async listChunks(instance, itemId) {
      const all: RemoteChunk[] = [];
      for (let offset = 0; ; offset += CHUNK_PAGE) {
        const r = await call<CfChunk[]>("GET", `/instances/${enc(instance)}/items/${enc(itemId)}/chunks?limit=${CHUNK_PAGE}&offset=${offset}`, { timeoutMs: READ_TIMEOUT_MS, retry: true });
        const page = ok(r);
        for (const c of page) all.push({ id: c.id, text: c.text });
        if (page.length < CHUNK_PAGE) break;
      }
      return all;
    },

    async search(instance, req: SearchRequest) {
      // 门槛一律 0：默认 0.4 会让约 70% 的原话查询返回空（§12.8）
      const retrieval: Record<string, unknown> = { max_num_results: req.maxResults, match_threshold: 0 };
      if (req.retrievalType === "vector") retrieval.retrieval_type = "vector";
      const body = { messages: [{ role: "user", content: req.query }], ai_search_options: { retrieval, reranking: { enabled: true, match_threshold: 0 } } };
      const r = await call<{ chunks?: CfSearchChunk[] }>("POST", `/instances/${enc(instance)}/search`, { json: body, timeoutMs: req.timeoutMs, retry: false });
      const result = ok(r);
      return (result.chunks ?? []).map(
        (c): SearchHit => ({
          id: c.id,
          text: c.text,
          score: c.score,
          itemKey: c.item?.key ?? "",
          vectorScore: c.scoring_details?.vector_score ?? null,
          keywordScore: c.scoring_details?.keyword_score ?? null,
          rerankingScore: c.scoring_details?.reranking_score ?? null,
        }),
      );
    },
  };
}

function log(method: string, path: string, status: number | null, ms: number, error?: string) {
  console.log(JSON.stringify({ t: new Date().toISOString(), level: error || (status ?? 0) >= 400 ? "warn" : "info", msg: "ai-search call", method, path: path.split("?")[0], status, ms, error }));
}
