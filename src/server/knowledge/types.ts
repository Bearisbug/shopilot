// 检索层的公共类型与错误（实现见 cloudflare.ts、stub.ts，接口与选择见 search-service.ts）。

/** 检索服务里一个条目的索引状态（Cloudflare 原值） */
export type RemoteItemStatus = "queued" | "running" | "completed" | "error" | "skipped" | "outdated";
export type RemoteItem = { id: string; key: string; status: RemoteItemStatus; error: string | null; chunksCount: number };
export type RemoteChunk = { id: string; text: string };
export type SearchHit = {
  /** 检索服务的分块 ID，对应 knowledge_chunk.remote_id */
  id: string;
  text: string;
  score: number;
  itemKey: string;
  vectorScore: number | null;
  keywordScore: number | null;
  rerankingScore: number | null;
};
export type SearchRequest = { query: string; maxResults: number; retrievalType: "hybrid" | "vector"; timeoutMs: number };
/** 上传时写进检索服务的元数据：只用来把结果对回资料，不用来过滤（§12.8） */
export type ItemMetadata = { document_id: string; category_id: string; markets: string };

export type KnowledgeErrorKind = "timeout" | "network" | "http" | "capacity";

export class KnowledgeServiceError extends Error {
  constructor(
    public kind: KnowledgeErrorKind,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

export interface KnowledgeSearchService {
  readonly mode: "stub" | "cloudflare";
  /** knowledge.ingest 查索引状态的间隔：Cloudflare 15 秒，替身不等 */
  readonly pollIntervalMs: number;
  /** 建实例；同名实例已存在视为成功 */
  createInstance(name: string): Promise<void>;
  /** 删实例；不存在视为成功 */
  deleteInstance(name: string): Promise<void>;
  uploadItem(instance: string, item: { key: string; data: Uint8Array; mime: string; metadata: ItemMetadata }): Promise<RemoteItem>;
  getItem(instance: string, itemId: string): Promise<RemoteItem | null>;
  /** 按条目键找条目（删除与重传时用）；没有返回 null */
  findItem(instance: string, key: string): Promise<RemoteItem | null>;
  /** 删条目；不存在视为成功 */
  deleteItem(instance: string, itemId: string): Promise<void>;
  /** 按条目分页读回全部分块，顺序即条目内顺序 */
  listChunks(instance: string, itemId: string): Promise<RemoteChunk[]>;
  search(instance: string, req: SearchRequest): Promise<SearchHit[]>;
}

/** 检索实例名：sp-<商户 ID 去掉连字符后的后 12 位>，避开 uuid v7 的时间前缀（§9.6） */
export function instanceName(merchantId: string): string {
  return `sp-${merchantId.replace(/-/g, "").slice(-12).toLowerCase()}`;
}
