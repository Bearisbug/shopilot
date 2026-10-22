import { z } from "zod";
import type { AgentRunView } from "./agent";
import { zUuid } from "./common";
import { knowledgeTestBody, QA_STAGES, zKnowledgeMarket, zMarkets, type KnowledgeMarket, type QaStage } from "./knowledge";
import { charCount } from "./reception";

// 经验卡与会话学习（DESIGN §8.8 API-KB-029 至 API-KB-043、§8.5 API-CONV-018、API-CONV-019、§9.6）：
// 经验卡写的是遇到什么情况、按什么步骤处理、走不通时转人工还是建工单；人写的保存即发布，Agent 改已有卡复测通过即生效。

export const CARD_TITLE_MAX = 100;
export const CARD_CONDITIONS_MAX = 10;
export const CARD_CONDITION_MAX = 200;
export const CARD_STEPS_MAX = 15;
export const CARD_STEP_MAX = 300;
export const CARD_BRANCHES_MAX = 3;
export const CARD_TIPS_MAX = 500;
export const CARD_QA_MAX = 10;
export const CARD_PRODUCTS_MAX = 50;
export const CARD_TAGS_MAX = 10;
export const CARD_TAG_MAX = 20;
/** 每商户最多多少张卡（含已下架） */
export const CARD_LIMIT = 2000;
/** 卡详情最多列多少个版本 */
export const CARD_VERSIONS_SHOWN = 50;
export const LEARNING_NOTE_MAX = 200;
export const LEARNING_MESSAGES_MAX = 20;
export const LEARNING_REASON_MAX = 200;

export const CARD_STATUSES = ["published", "archived"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];
export const CARD_STATUS_LABEL: Record<CardStatus, string> = { published: "已发布", archived: "已下架" };
export const CONDITION_MODES = ["all", "any"] as const;
export type ConditionMode = (typeof CONDITION_MODES)[number];
export const CONDITION_MODE_LABEL: Record<ConditionMode, string> = { all: "全部满足", any: "满足任一" };
export const BRANCH_ACTIONS = ["goto", "handoff", "ticket"] as const;
export type BranchAction = (typeof BRANCH_ACTIONS)[number];
export const BRANCH_ACTION_LABEL: Record<BranchAction, string> = { goto: "跳到第几步", handoff: "转人工", ticket: "建工单" };
/** 出稿时模型对卡的处理：按步骤继续、按分支转人工、按分支建工单 */
export const CARD_ACTIONS = ["continue", "handoff", "ticket"] as const;
export type CardAction = (typeof CARD_ACTIONS)[number];
export const CARD_ACTION_LABEL: Record<CardAction, string> = { continue: "继续处理", handoff: "转人工", ticket: "建工单" };

const text = (max: number, empty: string, long: string) =>
  z
    .string()
    .trim()
    .refine((s) => charCount(s) >= 1, empty)
    .refine((s) => charCount(s) <= max, long);

export type CardBranch = { when: string; action: BranchAction; goto?: number };
export type CardStep = { text: string; branches: CardBranch[] };
/** 卡的全部内容字段：写卡表单、版本快照、学习任务的拟发布内容都用这一个结构；productIds 为空 = 通用 */
export type CardContent = {
  title: string;
  productIds: string[];
  stage: QaStage;
  markets: KnowledgeMarket[];
  tags: string[];
  conditions: string[];
  conditionMode: ConditionMode;
  steps: CardStep[];
  tips: string | null;
  qaIds: string[];
};

const zBranch = z.object({
  when: text(CARD_CONDITION_MAX, "请写分支的条件", `分支条件最多 ${CARD_CONDITION_MAX} 个字`),
  action: z.enum(BRANCH_ACTIONS),
  goto: z.number().int().min(1).optional(),
});
const zStep = z.object({
  text: text(CARD_STEP_MAX, "步骤不能为空", `每一步最多 ${CARD_STEP_MAX} 个字`),
  branches: z.array(zBranch).max(CARD_BRANCHES_MAX, `每一步最多 ${CARD_BRANCHES_MAX} 个分支`).default([]),
});
const zUniqueIds = (max: number, label: string) =>
  z
    .array(zUuid)
    .max(max, `最多关联 ${max} 个${label}`)
    .refine((a) => new Set(a).size === a.length, `${label}不能重复`);

export const zCardContent = z
  .object({
    title: text(CARD_TITLE_MAX, "请写标题与目标", `标题最多 ${CARD_TITLE_MAX} 个字`),
    productIds: zUniqueIds(CARD_PRODUCTS_MAX, "产品").default([]),
    stage: z.enum(QA_STAGES),
    markets: zMarkets.default(["ALL"]),
    tags: z
      .array(z.string().trim().min(1, "标签不能为空").max(CARD_TAG_MAX, `每个标签最多 ${CARD_TAG_MAX} 个字`))
      .max(CARD_TAGS_MAX, `最多 ${CARD_TAGS_MAX} 个标签`)
      .refine((a) => new Set(a).size === a.length, "标签不能重复")
      .default([]),
    conditions: z
      .array(text(CARD_CONDITION_MAX, "调用条件不能为空", `每条调用条件最多 ${CARD_CONDITION_MAX} 个字`))
      .min(1, "至少写一条调用条件")
      .max(CARD_CONDITIONS_MAX, `最多 ${CARD_CONDITIONS_MAX} 条调用条件`),
    conditionMode: z.enum(CONDITION_MODES),
    steps: z.array(zStep).min(1, "至少写一个步骤").max(CARD_STEPS_MAX, `最多 ${CARD_STEPS_MAX} 个步骤`),
    tips: z
      .string()
      .trim()
      .refine((s) => charCount(s) <= CARD_TIPS_MAX, `沟通提示最多 ${CARD_TIPS_MAX} 个字`)
      .nullish()
      .transform((s) => s || null),
    qaIds: zUniqueIds(CARD_QA_MAX, "问答").default([]),
  })
  .superRefine((c, ctx) => {
    c.steps.forEach((s, i) =>
      s.branches.forEach((b, j) => {
        if (b.action !== "goto") return;
        if (!b.goto || b.goto > c.steps.length || b.goto === i + 1) ctx.addIssue({ code: "custom", path: ["steps", i, "branches", j, "goto"], message: "跳到的步骤要是本卡里的另一步" });
      }),
    );
  });

// ── 经验卡请求（API-KB-029 至 API-KB-037） ──

/** API-KB-030：保存即发布，写第 1 版 */
export const cardBody = zCardContent;
/** API-KB-032：整张卡的内容一起提交；version 与当前不一致时 409 */
export const cardPatch = z.object({ version: z.number().int().min(1), card: zCardContent });
export type CardPatch = z.infer<typeof cardPatch>;
/** API-KB-034、API-KB-035、API-KB-037 */
export const cardVersionBody = z.object({ version: z.number().int().min(1) });
/** API-KB-036：用第 toVersion 版的内容写一个新版本 */
export const cardRollbackBody = z.object({ version: z.number().int().min(1), toVersion: z.number().int().min(1) });
export type CardRollbackBody = z.infer<typeof cardRollbackBody>;

/** API-KB-029：q 按标题与调用条件包含匹配；productId=none 只列通用卡；unseen=1 只列 Agent 改过、还没人看过的卡；按更新时间倒序 */
export const cardListQuery = z.object({
  status: z.enum(CARD_STATUSES).optional(),
  stage: z.enum(QA_STAGES).optional(),
  productId: z.union([zUuid, z.literal("none")]).optional(),
  market: zKnowledgeMarket.optional(),
  q: z.string().trim().max(CARD_TITLE_MAX).optional(),
  unseen: z.literal("1").optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type CardListQuery = z.infer<typeof cardListQuery>;

// ── 经验卡响应 ──

/** 近 30 天效果：calls = 用到这张卡的草稿数；sent / edited / ignored 是辅助模式草稿的处置；handoffs = 按卡转人工或建工单的次数；shadow* 是影子回复与人工回复的对比结果 */
export type CardStats = { calls: number; sent: number; edited: number; ignored: number; handoffs: number; shadowSame: number; shadowPartial: number; shadowDifferent: number };
export type CardAuthor = "member" | "agent";

export type ExperienceCard = Omit<CardContent, "productIds" | "qaIds"> & {
  id: string;
  /** 关联的产品；空 = 通用。产品被删了就不再列出 */
  products: Array<{ id: string; code: string; name: string }>;
  /** 关联的问答（删了的不列）：第一个问法与状态 */
  qa: Array<{ id: string; question: string; status: string }>;
  status: CardStatus;
  source: CardAuthor;
  version: number;
  /** 当前版本是 Agent 改的、还没人看过 */
  agentUnseen: boolean;
  /** 已生成检索向量；false 时 5 分钟内由后台补上，期间出稿找不到这张卡 */
  embedded: boolean;
  lastAuthor: CardAuthor;
  createdByName: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string | null;
  publishedAt: string | null;
  stats: CardStats;
};

/** 复测摘要（Agent 改卡的版本才有） */
export type CardRetestSummary = { passed: boolean; regressions: number; failReason: string | null };
export type CardVersionView = {
  version: number;
  snapshot: CardContent;
  author: CardAuthor;
  memberName: string | null;
  learningTaskId: string | null;
  note: string | null;
  retest: CardRetestSummary | null;
  seenByName: string | null;
  seenAt: string | null;
  createdAt: string;
};

/** API-KB-029：counts 是商户全部卡按状态的数量；unseenCount 是 Agent 改过、还没人看过的已发布卡数（都不受筛选影响） */
export type CardList = { items: ExperienceCard[]; counts: Record<CardStatus, number>; unseenCount: number; nextCursor: string | null };
/** 卡的体检记录（按卡体检的学习任务）；version 是这次体检改出的版本，没改为 null */
export type CardReviewItem = { taskId: string; createdAt: string; status: LearningStatus; result: LearningResult | null; reason: string | null; version: number | null };
/** API-KB-031：卡与版本（倒序，最多 50 个）、体检记录（倒序，最多 10 次） */
export type CardDetail = { card: ExperienceCard; versions: CardVersionView[]; reviews: CardReviewItem[] };
/** API-KB-030（201）、API-KB-032、API-KB-034 至 API-KB-037 */
export type CardResult = { card: ExperienceCard };

// ── 出稿里的卡（draft.card、测试问答、模拟出稿） ──

/** draft.card：出稿时用到的卡的快照（卡后来改了、删了也照这里显示） */
export type DraftCardInfo = { version: number; title: string; step: number; action: CardAction; reason: string; ticketSummary: string | null };
/** 模拟出稿用到的卡；cardId 为 "proposal" 表示还没保存的拟发布内容 */
export type SimCard = { cardId: string; title: string; step: number; action: CardAction; reason: string; ticketSummary: string | null };
/** 模拟出稿（内部测试、复测、写卡时测试）的结果：不存草稿、不计用量、不发消息 */
export type SimResult = {
  reply: string;
  confidence: number;
  handoff: boolean;
  handoffReason: string | null;
  insufficient: boolean;
  card: SimCard | null;
  latencyMs: number;
};

/**
 * API-KB-012 带卡测试：card 是写卡表单里还没保存的内容，只在这次测试里生效；
 * 同时给 cardId 表示替换那张已有卡的内容（改卡时测），不给表示当作一张新卡加入候选。
 */
export const cardTestBody = knowledgeTestBody.extend({ card: zCardContent.optional(), cardId: zUuid.optional() });
export type CardTestBody = z.infer<typeof cardTestBody>;

// ── 会话学习（API-CONV-018、API-CONV-019、API-KB-038 至 API-KB-043） ──

export const LEARNING_STATUSES = ["analyzing", "pending_review", "published", "closed", "failed"] as const;
export type LearningStatus = (typeof LEARNING_STATUSES)[number];
export const LEARNING_STATUS_LABEL: Record<LearningStatus, string> = { analyzing: "分析中", pending_review: "待审核", published: "已发布", closed: "已结束", failed: "分析失败" };
export const LEARNING_SOURCES = ["member", "agent"] as const;
export type LearningSource = (typeof LEARNING_SOURCES)[number];
export const LEARNING_SOURCE_LABEL: Record<LearningSource, string> = { member: "客服提交", agent: "Agent 挑选" };
/** 会话学习，或按卡体检（Agent 每天把一张卡近 7 天的用例汇总起来判断要不要改） */
export const LEARNING_KINDS = ["conversation", "card_review"] as const;
export type LearningKind = (typeof LEARNING_KINDS)[number];
export const LEARNING_KIND_LABEL: Record<LearningKind, string> = { conversation: "会话学习", card_review: "按卡体检" };
/** 按卡体检的证据：用到这张卡的草稿（≤ 12 份）与处置统计 */
export type CardReviewEvidence = {
  draftIds: string[];
  counts: { sent: number; edited: number; ignored: number; shadowSame: number; shadowPartial: number; shadowDifferent: number; handoffs: number };
};
/** Agent 改卡直接生效：每商户每天最多几次（每张卡每天最多 1 次，RULE-KB-007） */
export const AGENT_DAILY_LIMIT = 5;
/** 预审诊断（确认稿第五节的诊断方向） */
export const DIAGNOSES = ["covered", "not_triggered", "missing_knowledge", "process", "tone", "conflict", "insufficient"] as const;
export type Diagnosis = (typeof DIAGNOSES)[number];
export const DIAGNOSIS_LABEL: Record<Diagnosis, string> = {
  covered: "已有内容覆盖",
  not_triggered: "已有内容但没调用到",
  missing_knowledge: "知识缺失",
  process: "流程需要补充",
  tone: "沟通方式要调整",
  conflict: "内容冲突",
  insufficient: "证据不足",
};
export const LEARNING_RESULTS = ["none_needed", "new_card", "card_updated", "retest_failed", "rejected", "need_qa", "insufficient_evidence"] as const;
export type LearningResult = (typeof LEARNING_RESULTS)[number];
export const LEARNING_RESULT_LABEL: Record<LearningResult, string> = {
  none_needed: "无需更新",
  new_card: "新建了经验卡",
  card_updated: "改了经验卡",
  retest_failed: "复测没通过",
  rejected: "已驳回",
  need_qa: "建议补问答",
  insufficient_evidence: "证据不足",
};
export const PRODUCT_STATUSES = ["identified", "none", "multiple"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** API-CONV-018：选 1–20 条本会话的消息提交学习，可附一句备注 */
export const learningSubmitBody = z.object({
  messageIds: z
    .array(zUuid)
    .min(1, "至少选一条消息")
    .max(LEARNING_MESSAGES_MAX, `一次最多选 ${LEARNING_MESSAGES_MAX} 条消息`)
    .refine((a) => new Set(a).size === a.length, "消息不能重复"),
  note: z
    .string()
    .trim()
    .refine((s) => charCount(s) <= LEARNING_NOTE_MAX, `备注最多 ${LEARNING_NOTE_MAX} 个字`)
    .optional(),
});
export type LearningSubmitBody = z.infer<typeof learningSubmitBody>;

/** API-KB-038 */
export const learningListQuery = z.object({
  status: z.enum(LEARNING_STATUSES).optional(),
  source: z.enum(LEARNING_SOURCES).optional(),
  kind: z.enum(LEARNING_KINDS).optional(),
  result: z.enum(LEARNING_RESULTS).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type LearningListQuery = z.infer<typeof learningListQuery>;

/** API-KB-040 复测、API-KB-041 发布：审核人编辑后的拟发布内容；targetCardId 给了表示改这张已有卡，不给表示新建 */
export const learningProposalBody = z.object({ version: z.number().int().min(1), card: zCardContent, targetCardId: zUuid.nullish() });
export type LearningProposalBody = z.infer<typeof learningProposalBody>;
/** API-KB-043：无需更新或驳回 */
export const learningCloseBody = z.object({
  version: z.number().int().min(1),
  result: z.enum(["none_needed", "rejected"]),
  reason: z
    .string()
    .trim()
    .refine((s) => charCount(s) <= LEARNING_REASON_MAX, `原因最多 ${LEARNING_REASON_MAX} 个字`)
    .optional(),
});
export type LearningCloseBody = z.infer<typeof learningCloseBody>;
/** API-KB-042 重新分析 */
export const learningVersionBody = z.object({ version: z.number().int().min(1) });

export type LearningMessage = { id: string; from: "buyer" | "seller" | "ai" | "system"; type: string; text: string; at: string; selected: boolean };
export type LearningTest = { question: string; before: SimResult; after: SimResult };
/**
 * 回归用例：以前发布过的学习任务（taskId），或按卡体检证据里原样发送的草稿（draftId，taskId 为 null）。
 * conversationId、segmentId 是用例所在的会话与段，买家删除数据、保留期清理时据此去掉这条用例。
 */
export type LearningRegression = {
  taskId: string | null;
  draftId?: string;
  conversationId?: string;
  segmentId?: string | null;
  question: string;
  before: SimResult;
  after: SimResult;
  notWorse: boolean;
  reason: string;
};
/** 复测：original 是原问题用拟发布内容的结果，必须用到这张卡；回归用例改后都不比改前差才算通过 */
export type LearningRetest = { at: string; proposalHash: string; passed: boolean; failReason: string | null; original: SimResult; regressions: LearningRegression[] };
export type LearningSimilar = { cardId: string; title: string; distance: number; productMatch: boolean; stageMatch: boolean };

export type LearningTask = {
  id: string;
  source: LearningSource;
  kind: LearningKind;
  /** 按卡体检才有 */
  evidence: CardReviewEvidence | null;
  submittedByName: string | null;
  note: string | null;
  conversation: { id: string; buyerName: string; shopName: string; platform: "shopee" | "tiktok" } | null;
  messages: LearningMessage[];
  products: Array<{ id: string; code: string; name: string }>;
  productBasis: string | null;
  productStatus: ProductStatus;
  stage: string;
  status: LearningStatus;
  diagnosis: Diagnosis | null;
  result: LearningResult | null;
  reason: string | null;
  suggestion: string | null;
  targetCard: { id: string; title: string; version: number; status: CardStatus } | null;
  proposal: CardContent | null;
  similar: LearningSimilar[];
  test: LearningTest | null;
  retest: LearningRetest | null;
  testQuestion: string | null;
  error: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  /** 审核人结束任务时写的原因 */
  reviewNote: string | null;
  publishedCard: { id: string; title: string; version: number } | null;
  version: number;
  createdAt: string;
  updatedAt: string | null;
};

/** API-KB-038：counts 是商户全部学习任务按状态的数量（不受筛选影响） */
export type LearningList = { items: LearningTask[]; counts: Record<LearningStatus, number>; nextCursor: string | null };
/** API-CONV-018（201）、API-KB-039 至 API-KB-043 */
export type LearningTaskResult = { task: LearningTask };
/** API-KB-039：另带这个任务最近 5 次 Agent 运行，新的在前 */
export type LearningTaskDetail = LearningTaskResult & { agentRuns: AgentRunView[] };
/** API-CONV-019：本会话的学习任务（时间线据 messageIds 标「已提交学习」） */
export type ConversationLearning = {
  items: Array<{ id: string; source: LearningSource; status: LearningStatus; result: LearningResult | null; messageIds: string[]; submittedByName: string | null; createdAt: string }>;
};

/** API-KB-045：自动生效状态与最近 12 周的 AI 质量（旧的在前）；todayApplied 是按商户时区今天 Agent 直接生效的改卡次数 */
export type AgentStatus = {
  paused: { at: string; reason: string | null } | null;
  todayApplied: number;
  dailyLimit: number;
  weeks: Array<{ weekStart: string; adoption: { num: number; den: number }; consistency: { num: number; den: number }; handoff: { num: number; den: number } }>;
};
