import { z } from "zod";
import { zUuid } from "./common";
import type { SimCard } from "./cards";
import { charCount } from "./reception";

// 知识库（DESIGN §8.8 API-KB-001 至 API-KB-028、§9.6、§12.7、§12.8）：资料（文件，过渡期照常被检索）与问答（Postgres 向量检索）

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

/** API-KB-012：问题任意语言；选了店铺按该店站点过滤、用该店的提示词变量；可选阶段与产品，用来试问答的过滤 */
export const knowledgeTestBody = z.object({
  question: z
    .string()
    .trim()
    .refine((s) => charCount(s) >= 1, "请输入问题")
    .refine((s) => charCount(s) <= KNOWLEDGE_TEST_QUESTION_MAX, `问题最多 ${KNOWLEDGE_TEST_QUESTION_MAX} 个字`),
  shopId: zUuid.optional(),
  stage: z.enum(["presale", "insale", "aftersale"]).optional(),
  productId: zUuid.optional(),
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
  /** 整理成问答（API-KB-028）的进度：count 是最近一次生成的候选数 */
  qaExtract: { status: KnowledgeQaExtractStatus; count: number; error: string | null; extractedAt: string | null };
  /** 由这份资料整理、已发布的问答数；大于 0 时可以提示管理员关掉这份资料的「AI 可用」 */
  publishedQaCount: number;
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

/** 问答检索的一条命中：distance 是余弦距离（越小越近，阈值见 §12.8） */
export type KnowledgeQaHit = { route: "rewritten" | "original"; qaId: string; question: string; answer: string; distance: number };

export type KnowledgeQaRetrieval = {
  latencyMs: number;
  /** 向量化或查询失败、超时的原因；失败时只降级，不影响资料检索与出稿 */
  error: string | null;
  /** 参与过滤的阶段（null = 不过滤阶段）与识别出的产品 */
  stage: QaStage | null;
  productIds: string[];
  hits: KnowledgeQaHit[];
  /** 两路交替合并、去重后的前 6 条，编号从 1 起，排在资料分块前面 */
  merged: Array<{ n: number; qaId: string }>;
};

/** API-KB-012：走出稿同一条链路，不存草稿、不计出稿用量；既没有可用资料也没有已发布问答时不改写、不检索，retrieval 与 qa 都为 null */
export type KnowledgeTestResult = {
  answer: string;
  confidence: number;
  insufficient: boolean;
  /** 按当前阈值会转人工 */
  wouldHandoff: boolean;
  handoffReason: string | null;
  sources: Array<{ n: number; documentId: string; name: string; snippet: string; fileUrl: string }>;
  /** 模型声明用到的问答 */
  qaSources: Array<{ n: number; qaId: string; question: string; answer: string }>;
  retrieval: KnowledgeRetrieval | null;
  qa: KnowledgeQaRetrieval | null;
  /** 用到的经验卡；带了未保存的卡且新建时 cardId 为 "proposal" */
  card: SimCard | null;
  latencyMs: number;
};

// ── 问答（API-KB-013 至 API-KB-019、API-KB-026 至 API-KB-028） ──

export const QA_STAGES = ["presale", "insale", "aftersale", "any"] as const;
export type QaStage = (typeof QA_STAGES)[number];
export const QA_STAGE_LABEL: Record<QaStage, string> = { presale: "售前", insale: "售中", aftersale: "售后", any: "全部阶段" };
export const QA_STATUSES = ["pending", "published", "rejected", "archived"] as const;
export type QaStatus = (typeof QA_STATUSES)[number];
export const QA_STATUS_LABEL: Record<QaStatus, string> = { pending: "待审核", published: "已发布", rejected: "已驳回", archived: "已下架" };
export type QaSource = "manual" | "import";
export type KnowledgeQaExtractStatus = "idle" | "running" | "done" | "failed";

export const QA_QUESTIONS_MAX = 10;
export const QA_QUESTION_MAX = 200;
export const QA_ANSWER_MAX = 2000;
export const QA_PRODUCTS_MAX = 50;
export const QA_TAGS_MAX = 10;
export const QA_TAG_MAX = 20;
export const QA_REJECT_REASON_MAX = 200;
/** 每份资料最多整理出多少条候选 */
export const QA_EXTRACT_MAX = 200;

const zQuestion = z
  .string()
  .trim()
  .refine((s) => charCount(s) >= 1, "问法不能为空")
  .refine((s) => charCount(s) <= QA_QUESTION_MAX, `每个问法最多 ${QA_QUESTION_MAX} 个字`);
export const zQaQuestions = z
  .array(zQuestion)
  .min(1, "至少写一个问法")
  .max(QA_QUESTIONS_MAX, `最多 ${QA_QUESTIONS_MAX} 个问法`)
  .refine((a) => new Set(a).size === a.length, "问法不能重复");
export const zQaAnswer = z
  .string()
  .trim()
  .refine((s) => charCount(s) >= 1, "请填写回复")
  .refine((s) => charCount(s) <= QA_ANSWER_MAX, `回复最多 ${QA_ANSWER_MAX.toLocaleString("en-US")} 个字`);
const zQaProducts = z
  .array(zUuid)
  .max(QA_PRODUCTS_MAX, `最多关联 ${QA_PRODUCTS_MAX} 个产品`)
  .refine((a) => new Set(a).size === a.length, "产品不能重复");
const zQaTags = z
  .array(z.string().trim().min(1, "标签不能为空").max(QA_TAG_MAX, `每个标签最多 ${QA_TAG_MAX} 个字`))
  .max(QA_TAGS_MAX, `最多 ${QA_TAGS_MAX} 个标签`)
  .refine((a) => new Set(a).size === a.length, "标签不能重复");

/** API-KB-014：手写问答，保存即发布；productIds 为空 = 通用 */
export const qaBody = z.object({
  questions: zQaQuestions,
  answer: zQaAnswer,
  productIds: zQaProducts.default([]),
  stage: z.enum(QA_STAGES),
  markets: zMarkets.default(["ALL"]),
  tags: zQaTags.default([]),
});
export type QaBody = z.infer<typeof qaBody>;

const qaFields = z.object({
  questions: zQaQuestions.optional(),
  answer: zQaAnswer.optional(),
  productIds: zQaProducts.optional(),
  stage: z.enum(QA_STAGES).optional(),
  markets: zMarkets.optional(),
  tags: zQaTags.optional(),
});

/** API-KB-016：改任意字段，version 与当前不一致时 409；已发布的改完重新向量化，待审核的仍是待审核 */
export const qaPatch = qaFields.extend({ version: z.number().int().min(1) }).refine((b) => Object.keys(b).some((k) => k !== "version" && b[k as keyof typeof b] !== undefined), "没有要修改的内容");
export type QaPatch = z.infer<typeof qaPatch>;

/** API-KB-018：待审核候选通过即发布，可同时带修改 */
export const qaApproveBody = qaFields.extend({ version: z.number().int().min(1) });
export type QaApproveBody = z.infer<typeof qaApproveBody>;

/** API-KB-019 */
export const qaRejectBody = z.object({ version: z.number().int().min(1), reason: z.string().trim().max(QA_REJECT_REASON_MAX, `原因最多 ${QA_REJECT_REASON_MAX} 个字`).optional() });
export type QaRejectBody = z.infer<typeof qaRejectBody>;

/** API-KB-026、API-KB-027：下架（不参与检索）与恢复发布 */
export const qaVersionBody = z.object({ version: z.number().int().min(1) });

/**
 * API-KB-013：q 按问法与回复包含匹配；productId=none 只列通用问答；market 规则同资料列表；
 * documentId 只列由这份资料整理出的问答。按更新时间倒序。
 */
export const qaListQuery = z.object({
  status: z.enum(QA_STATUSES).optional(),
  stage: z.enum(QA_STAGES).optional(),
  productId: z.union([zUuid, z.literal("none")]).optional(),
  market: zKnowledgeMarket.optional(),
  documentId: zUuid.optional(),
  q: z.string().trim().max(QA_QUESTION_MAX).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type QaListQuery = z.infer<typeof qaListQuery>;

export type KnowledgeQa = {
  id: string;
  questions: string[];
  answer: string;
  /** 关联的产品；空 = 通用。产品被删了就不再列出 */
  products: Array<{ id: string; code: string; name: string }>;
  stage: QaStage;
  markets: KnowledgeMarket[];
  tags: string[];
  status: QaStatus;
  source: QaSource;
  /** 由哪份资料整理出来（资料删了为 null）与对应的原文片段 */
  sourceDocument: { id: string; name: string } | null;
  sourceExcerpt: string | null;
  /** 疑似和已有问答重复（向量余弦相似度 ≥ 0.92）；那条被删了为 null */
  duplicateOf: { id: string; question: string; status: QaStatus } | null;
  rejectReason: string | null;
  /** 已生成检索向量；已发布但为 false 时会在 5 分钟内由后台补上，期间检索不到 */
  embedded: boolean;
  createdByName: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string | null;
};

/** API-KB-013：counts 是商户全部问答按状态的数量（不受筛选影响） */
export type KnowledgeQaList = { items: KnowledgeQa[]; counts: Record<QaStatus, number>; nextCursor: string | null };
/** API-KB-014（201）、API-KB-015、API-KB-016、API-KB-018、API-KB-019、API-KB-026、API-KB-027 */
export type KnowledgeQaResult = { qa: KnowledgeQa };
