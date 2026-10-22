// 经验卡写入（DESIGN §9.6、§11 经验卡）：建卡、写新版本、向量化。人写的与 Agent 写的都走这里，审计由调用方写。
// 每次内容变化写一行 experience_card_version；卡上的 version 同时是乐观锁。向量 = 标题 + 调用条件，失败照样保存、向量留空，由 knowledge.qa_embed 补上。
import { and, count, eq, inArray } from "drizzle-orm";
import { CARD_LIMIT, zCardContent, type CardContent, type CardRetestSummary } from "@/contracts/cards";
import { db, schema, type Executor } from "@/server/db/client";
import { conflict, notAllowed, validation } from "@/server/http/problem";
import { EMBED_MODEL, embedTexts } from "./embed";

const c = schema.experienceCard;
export type CardRow = typeof c.$inferSelect;
export type CardAuthorInput = { kind: "member"; memberId: string } | { kind: "agent" };
type Vec = { embedding: number[] | null; embeddingModel: string | null };

export function cardContentOf(row: CardRow): CardContent {
  return {
    title: row.title,
    productIds: row.productIds,
    stage: row.stage,
    markets: row.markets,
    tags: row.tags,
    conditions: row.conditions,
    conditionMode: row.conditionMode,
    steps: row.steps,
    tips: row.tips,
    qaIds: row.qaIds,
  };
}

/** 两份卡内容是否相同：库里读出的 jsonb 键序与请求体不同（分支的 goto 在前），先按契约的结构整理一遍再比 */
export function sameCardContent(a: CardContent, b: CardContent): boolean {
  const normalized = (c: CardContent) => {
    const p = zCardContent.safeParse(c);
    return JSON.stringify(p.success ? p.data : c);
  };
  return normalized(a) === normalized(b);
}

/** 参与检索的文本：标题与调用条件（步骤与沟通提示不参与，避免长内容冲淡「什么情况下用」） */
export const cardEmbedText = (x: Pick<CardContent, "title" | "conditions">) => [x.title, ...x.conditions].join("；");

/** 向量化；失败返回空向量（保存照常，后台补） */
export async function tryEmbedCard(content: Pick<CardContent, "title" | "conditions">): Promise<Vec> {
  try {
    const [v] = await embedTexts([cardEmbedText(content)]);
    return { embedding: v, embeddingModel: EMBED_MODEL };
  } catch {
    return { embedding: null, embeddingModel: null };
  }
}

/** 标题或调用条件变了（或还没有向量）才需要重新向量化 */
export function needsEmbed(row: CardRow | null, content: CardContent): boolean {
  return !row || row.embedding === null || cardEmbedText(cardContentOf(row)) !== cardEmbedText(content);
}

/** 关联的产品与问答都要属于本商户 */
export async function checkCardRefs(merchantId: string, content: CardContent, ex: Executor = db()) {
  if (content.productIds.length) {
    const rows = await ex
      .select({ id: schema.product.id })
      .from(schema.product)
      .where(and(eq(schema.product.merchantId, merchantId), inArray(schema.product.id, content.productIds)));
    if (rows.length !== content.productIds.length) throw validation("有产品不存在或已删除，请刷新后重新选择。", { productIds: "有产品不存在或已删除" });
  }
  if (content.qaIds.length) {
    const rows = await ex
      .select({ id: schema.knowledgeQa.id })
      .from(schema.knowledgeQa)
      .where(and(eq(schema.knowledgeQa.merchantId, merchantId), inArray(schema.knowledgeQa.id, content.qaIds)));
    if (rows.length !== content.qaIds.length) throw validation("有关联的问答不存在或已删除，请刷新后重新选择。", { qaIds: "有问答不存在或已删除" });
  }
}

const contentColumns = (x: CardContent) => ({
  title: x.title,
  productIds: x.productIds,
  stage: x.stage,
  markets: x.markets,
  tags: x.tags,
  conditions: x.conditions,
  conditionMode: x.conditionMode,
  steps: x.steps,
  tips: x.tips,
  qaIds: x.qaIds,
});

/** 建卡并写第 1 版：保存即发布。vec 由调用方在事务外算好（tryEmbedCard） */
export async function insertCard(
  tx: Executor,
  input: { merchantId: string; content: CardContent; author: CardAuthorInput; vec: Vec; learningTaskId?: string | null; note?: string | null },
): Promise<CardRow> {
  const [n] = await tx.select({ n: count() }).from(c).where(eq(c.merchantId, input.merchantId));
  if ((n?.n ?? 0) >= CARD_LIMIT) throw notAllowed(`经验卡已满 ${CARD_LIMIT.toLocaleString("en-US")} 张，请先删除不用的。`, "card_quota");
  const memberId = input.author.kind === "member" ? input.author.memberId : null;
  const now = new Date();
  const [row] = await tx
    .insert(c)
    .values({
      merchantId: input.merchantId,
      ...contentColumns(input.content),
      status: "published",
      source: input.author.kind,
      version: 1,
      agentUnseen: input.author.kind === "agent",
      ...input.vec,
      createdBy: memberId,
      updatedBy: memberId,
      publishedAt: now,
    })
    .returning();
  await tx.insert(schema.experienceCardVersion).values({
    merchantId: input.merchantId,
    cardId: row.id,
    version: 1,
    snapshot: input.content,
    author: input.author.kind,
    memberId,
    learningTaskId: input.learningTaskId ?? null,
    note: input.note ?? null,
  });
  return row;
}

/**
 * 写新版本：只在卡的版本仍是 row.version 时生效，否则 409。Agent 写的版本标 agent_unseen；人写的（含回退）清掉它。
 * vec 为 undefined 表示标题与调用条件没变、沿用原向量。
 */
export async function writeCardVersion(
  tx: Executor,
  input: { row: CardRow; content: CardContent; author: CardAuthorInput; vec?: Vec; learningTaskId?: string | null; note?: string | null; retest?: CardRetestSummary | null },
): Promise<CardRow> {
  const memberId = input.author.kind === "member" ? input.author.memberId : null;
  const next = input.row.version + 1;
  const [updated] = await tx
    .update(c)
    .set({ ...contentColumns(input.content), ...(input.vec ?? {}), version: next, agentUnseen: input.author.kind === "agent", updatedBy: memberId, updatedAt: new Date() })
    .where(and(eq(c.id, input.row.id), eq(c.version, input.row.version)))
    .returning();
  if (!updated) throw conflict("这张经验卡刚被别人改过，请刷新后再操作。", undefined, "version_conflict");
  await tx.insert(schema.experienceCardVersion).values({
    merchantId: input.row.merchantId,
    cardId: input.row.id,
    version: next,
    snapshot: input.content,
    author: input.author.kind,
    memberId,
    learningTaskId: input.learningTaskId ?? null,
    note: input.note ?? null,
    retest: input.retest ?? null,
  });
  return updated;
}
