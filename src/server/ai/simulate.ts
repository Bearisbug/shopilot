// 模拟出稿（§12.17「会话学习」的内部测试与复测、写卡时的测试）：走出稿同一条链路——改写、检索资料与问答、挑经验卡、同一套提示词与护栏，
// 可让一张拟发布的卡只在这次生效；不存草稿、不计出稿用量、不发消息。DeepSeek 调用记为 simulate。
import { and, eq } from "drizzle-orm";
import type { SimResult } from "@/contracts/cards";
import { receptionContext } from "@/server/conversations/hours";
import { db, schema } from "@/server/db/client";
import { cardsPayload, cardUsed, type CardOverride } from "@/server/knowledge/card-retrieve";
import { knowledgePayload, retrieveForDraft } from "@/server/knowledge/retrieve";
import { chat, parseJson } from "./client";
import { handoffVerdict, parseModelOutput } from "./draft";
import { replyLanguage } from "./language";
import { composePrompt, DEFAULT_PROMPTS, PROMPT_STAGES, UNKNOWN_STAGE_PROMPT, type PromptStage } from "./prompts";

export type SimTurn = { from: string; type: string; text: string; at: string };

/** AI 出错或超时时抛 AiError，由调用方决定怎么记 */
export async function simulateDraft(input: {
  merchantId: string;
  /** 给了店铺就按该店站点过滤、用该店的提示词变量 */
  shopId: string | null;
  stage: string | null;
  productIds: string[];
  /** 截至这条买家消息的对话（旧的在前） */
  conversation: SimTurn[];
  question: string;
  override?: CardOverride | null;
  active?: { cardId: string; step: number } | null;
}): Promise<SimResult> {
  const started = Date.now();
  const [merchant] = await db().select({ name: schema.merchant.name }).from(schema.merchant).where(eq(schema.merchant.id, input.merchantId)).limit(1);
  const [shop] = input.shopId
    ? await db()
        .select()
        .from(schema.shop)
        .where(and(eq(schema.shop.id, input.shopId), eq(schema.shop.merchantId, input.merchantId)))
        .limit(1)
    : [];
  const rc = await receptionContext(input.merchantId);
  const stage = (PROMPT_STAGES as readonly string[]).includes(input.stage ?? "") ? (input.stage as PromptStage) : null;
  let body = UNKNOWN_STAGE_PROMPT;
  if (stage) {
    const [tpl] = await db()
      .select({ text: schema.promptTemplate.text })
      .from(schema.promptTemplate)
      .where(and(eq(schema.promptTemplate.merchantId, input.merchantId), eq(schema.promptTemplate.stage, stage)))
      .limit(1);
    body = tpl?.text.trim() ? tpl.text : DEFAULT_PROMPTS[stage];
  }
  const market = shop?.market ?? null;
  const buyerTexts = input.conversation.filter((m) => m.from === "buyer" && m.type === "text" && m.text).map((m) => m.text).reverse();
  const lang = replyLanguage(buyerTexts.length ? buyerTexts : [input.question], market);
  const system = composePrompt(body, {
    merchantName: merchant?.name ?? "",
    shopName: shop?.name ?? "（测试，未选店铺）",
    platform: shop ? (shop.platform === "shopee" ? "Shopee" : "TikTok Shop") : "电商平台",
    market: market ?? "全部站点",
    replyLanguage: lang,
  });
  const retrieval = await retrieveForDraft({
    merchantId: input.merchantId,
    market,
    original: input.question,
    conversation: input.conversation.slice(-10),
    orderFacts: [],
    stage,
    productIds: input.productIds,
    active: input.active,
    cardOverride: input.override,
  });
  const knowledge = knowledgePayload(retrieval);
  const userPayload = {
    reply_language: lang,
    brand_voice: rc.brandVoice ?? "",
    order_facts: [],
    conversation: input.conversation,
    latest_buyer_message: input.question,
    ...(knowledge ? { knowledge } : {}),
    ...(await cardsPayload(retrieval?.cards ?? null, input.merchantId)),
  };
  const res = await chat(
    "simulate",
    [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    { json: true, stubHint: input.question },
  );
  const parsed = parseModelOutput(parseJson(res.content));
  const verdict = handoffVerdict(parsed, rc.confidenceThreshold);
  const card = cardUsed(retrieval?.cards ?? null, parsed.card);
  return {
    reply: parsed.reply,
    confidence: parsed.confidence,
    handoff: verdict !== null,
    handoffReason: verdict,
    insufficient: parsed.insufficient,
    card: card ? { cardId: card.cardId, title: card.title, step: card.step, action: card.action, reason: card.reason, ticketSummary: card.ticketSummary } : null,
    latencyMs: Date.now() - started,
  };
}
