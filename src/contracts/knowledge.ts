import { z } from "zod";
import { zUuid } from "./common";
import { charCount } from "./reception";

// 知识库（DESIGN §8.8 API-KB-001 至 API-KB-012、§9.6、§12.7、§12.8）

export const UNCATEGORIZED = "未分类";
export const KNOWLEDGE_MARKETS = ["ALL", "MY", "TH", "VN", "PH", "SG", "ID"] as const;
export type KnowledgeMarket = (typeof KNOWLEDGE_MARKETS)[number];
export const zKnowledgeMarket = z.enum(KNOWLEDGE_MARKETS);

export const KNOWLEDGE_DOCUMENT_LIMIT = 500;
export const KNOWLEDGE_CATEGORY_LIMIT = 50;
export const KNOWLEDGE_CATEGORY_NAME_MAX = 20;
export const KNOWLEDGE_NAME_MAX = 200;
/** 单个文件上限 20 MB；PDF 以外的格式 4 MB（检索服务对非 PDF 的上限） */
export const KNOWLEDGE_FILE_MAX = 20 * 1024 * 1024;
export const KNOWLEDGE_NON_PDF_MAX = 4 * 1024 * 1024;
/** 收的扩展名（文件选择框 accept 用）；ppt、pptx 拒收并提示先导出为 PDF */
export const KNOWLEDGE_EXTENSIONS = ["pdf", "docx", "xlsx", "xls", "csv", "jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "tif", "heic", "md", "txt", "html", "htm", "odt", "ods"] as const;
export const KNOWLEDGE_TEST_QUESTION_MAX = 500;
export const KNOWLEDGE_CHUNKS_PAGE = 50;

/** 列表与详情里可见的处理状态（deleting 任何接口都不返回） */
export const KNOWLEDGE_STATUSES = ["queued", "processing", "ready", "failed"] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];
export type KnowledgePartStatus = "pending" | "indexing" | "indexed" | "failed";

/** 适用站点：["ALL"] 或 MY、TH、VN、PH、SG、ID 的非空子集，ALL 不与具体站点同选 */
export const zMarkets = z
  .array(zKnowledgeMarket)
  .min(1, "至少选一个站点")
  .refine((m) => new Set(m).size === m.length, "站点不能重复")
  .refine((m) => !m.includes("ALL") || m.length === 1, "「全部站点」不能与具体站点同时选");

const zCategoryName = z
  .string()
  .trim()
  .refine((s) => charCount(s) >= 1, "请填写分类名")
  .refine((s) => charCount(s) <= KNOWLEDGE_CATEGORY_NAME_MAX, `分类名最多 ${KNOWLEDGE_CATEGORY_NAME_MAX} 个字`);

// ── 请求 ──

/** API-KB-001：q 按文件名包含匹配；market=ALL 只列适用全部站点的资料，其余站点值列出适用该站点的资料（含适用全部站点的） */
export const documentsQuery = z.object({
  categoryId: zUuid.optional(),
  market: zKnowledgeMarket.optional(),
  status: z.enum(KNOWLEDGE_STATUSES).optional(),
  aiEnabled: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  q: z.string().trim().max(KNOWLEDGE_NAME_MAX).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type DocumentsQuery = z.infer<typeof documentsQuery>;

/** API-KB-002 的 multipart 字段（file 之外）：categoryId 缺省为「未分类」，markets[] 缺省为 ALL */
export const uploadFields = z.object({
  categoryId: zUuid.optional(),
  markets: zMarkets.default(["ALL"]),
});
export type UploadFields = z.infer<typeof uploadFields>;

/** API-KB-005：立即生效，不重新解析 */
export const documentPatch = z
  .object({ categoryId: zUuid.optional(), markets: zMarkets.optional(), aiEnabled: z.boolean().optional() })
  .refine((b) => b.categoryId !== undefined || b.markets !== undefined || b.aiEnabled !== undefined, "没有要修改的内容");
export type DocumentPatch = z.infer<typeof documentPatch>;

/** API-KB-004 */
export const chunksQuery = z.object({ cursor: z.string().optional() });

/** API-KB-009、API-KB-010 */
export const categoryBody = z.object({ name: zCategoryName });
export type CategoryBody = z.infer<typeof categoryBody>;

/** API-KB-012：问题任意语言；选了店铺按该店站点过滤、用该店的提示词变量 */
export const knowledgeTestBody = z.object({
  question: z
    .string()
    .trim()
    .refine((s) => charCount(s) >= 1, "请输入问题")
    .refine((s) => charCount(s) <= KNOWLEDGE_TEST_QUESTION_MAX, `问题最多 ${KNOWLEDGE_TEST_QUESTION_MAX} 个字`),
  shopId: zUuid.optional(),
});
export type KnowledgeTestBody = z.infer<typeof knowledgeTestBody>;

// ── 响应 ──

export type KnowledgeDocument = {
  id: string;
  name: string;
  mime: string;
  size: number;
  categoryId: string;
  markets: KnowledgeMarket[];
  status: KnowledgeStatus;
  aiEnabled: boolean;
  /** status = failed 时必有，中文 */
  failureReason: string | null;
  partsCount: number;
  chunksCount: number;
  /** 上传人已被删除时为 null */
  uploadedByName: string | null;
  createdAt: string;
  readyAt: string | null;
};

/** API-KB-001：counts.total 是商户全部资料数（不受筛选影响），limit 为 500 */
export type KnowledgeDocumentList = { items: KnowledgeDocument[]; counts: { total: number; limit: number }; nextCursor: string | null };

/** API-KB-002（201）、API-KB-005（200）、API-KB-006（202） */
export type KnowledgeDocumentResult = { document: KnowledgeDocument };

export type KnowledgePart = { partNo: number; pageFrom: number | null; pageTo: number | null; status: KnowledgePartStatus; retries: number; error: string | null };

/** API-KB-003：fileUrl 指向 API-CONV-011；PDF 与图片可内嵌预览，其余只给下载 */
export type KnowledgeDocumentDetail = { document: KnowledgeDocument; fileUrl: string; parts: KnowledgePart[] };

/** API-KB-004：每页 50；资料不是 ready 时为空列表 */
export type KnowledgeChunkPage = { items: Array<{ no: number; partNo: number; text: string }>; nextCursor: string | null };

export type KnowledgeCategory = { id: string; name: string; builtin: boolean; documentCount: number };
/** API-KB-008：内置「未分类」排第一 */
export type KnowledgeCategoryList = { items: KnowledgeCategory[] };
/** API-KB-011 */
export type KnowledgeCategoryDeleteResult = { movedDocuments: number };

export type KnowledgeScoreDetails = {
  vectorScore: number | null;
  keywordScore: number | null;
  rerankingScore: number | null;
};

/** 一路检索的一次请求；某路重试时先列失败的混合检索，再列纯向量重试 */
export type KnowledgeRoute = {
  kind: "rewritten" | "original";
  mode: "hybrid" | "vector_only";
  latencyMs: number;
  /** 失败原因：timeout、no_vector（结果里没有向量分）或检索服务的错误 */
  error: string | null;
  /** 按 Shopilot 库里资料的当前状态、AI 可用与站点过滤后的前 10 条 */
  chunks: Array<{ documentId: string; name: string; chunkNo: number; text: string; score: number; scoreDetails: KnowledgeScoreDetails }>;
};

export type KnowledgeRetrieval = {
  /** 改写失败时为 null，只用买家原话检索一路 */
  rewrittenQuery: string | null;
  routes: KnowledgeRoute[];
  /** 两路交替合并、按分块去重后的前 8 段，编号 1–8 */
  merged: Array<{ n: number; documentId: string; chunkNo: number }>;
  degraded: boolean;
  degradedReason: string | null;
};

/** API-KB-012：走出稿同一条链路，不存草稿、不计出稿用量；没有可用资料时不改写、不检索，retrieval 为 null */
export type KnowledgeTestResult = {
  answer: string;
  confidence: number;
  insufficient: boolean;
  /** 按当前阈值会转人工 */
  wouldHandoff: boolean;
  handoffReason: string | null;
  sources: Array<{ n: number; documentId: string; name: string; snippet: string; fileUrl: string }>;
  retrieval: KnowledgeRetrieval | null;
  latencyMs: number;
};
