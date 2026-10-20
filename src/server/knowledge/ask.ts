// 测试问答（API-KB-012、REQ-KB-005）：在 API 进程里同步走出稿同一条链路（§12.8），问题本身既是改写输入也是原话；
// 提示词取售前阶段；不存草稿、不计出稿用量；每商户每分钟 20 次。
import { and, eq } from "drizzle-orm";
import type { KnowledgeTestBody, KnowledgeTestResult } from "@/contracts/knowledge";
import { AiError, chat, parseJson } from "@/server/ai/client";
import { handoffVerdict, parseModelOutput } from "@/server/ai/draft";
import { replyLanguage } from "@/server/ai/language";
import { composePrompt, DEFAULT_PROMPTS } from "@/server/ai/prompts";
import { inScope, type MemberContext } from "@/server/auth/context";
import { receptionContext } from "@/server/conversations/hours";
import { db, schema } from "@/server/db/client";
import { Problem, notFound } from "@/server/http/problem";
import { knowledgePayload, qaDetail, retrievalDetail, retrieveForDraft } from "./retrieve";

export const TEST_RATE_PER_MINUTE = 20;
const SNIPPET_CHARS = 300;

const windows = new Map<string, { start: number; count: number }>();

/** 每商户每分钟 20 次（§15），超出 429 */
export function takeTestQuota(merchantId: string, now = Date.now()) {
  const cur = windows.get(merchantId);
  if (!cur || now - cur.start >= 60_000) {
    windows.set(merchantId, { start: now, count: 1 });
    return;
  }
  if (cur.count >= TEST_RATE_PER_MINUTE) {
    const retryAfter = Math.max(1, Math.ceil((cur.start + 60_000 - now) / 1000));
    throw new Problem("rate-limited", { detail: `测试问答每分钟最多 ${TEST_RATE_PER_MINUTE} 次，请稍后再试。`, headers: { "retry-after": String(retryAfter) } });
  }
  cur.count += 1;
}

export async function askKnowledge(ctx: MemberContext, body: KnowledgeTestBody): Promise<KnowledgeTestResult> {
  const started = Date.now();
  const merchantId = ctx.merchant.id;
  let shop: typeof schema.shop.$inferSelect | null = null;
  if (body.shopId) {
    // 店铺下拉只列本人可见的店（§10）；别的店当作不存在
    const [row] = await db().select().from(schema.shop).where(and(eq(schema.shop.id, body.shopId), eq(schema.shop.merchantId, merchantId))).limit(1);
    if (!row || row.status === "disconnected" || !inScope(ctx, row.id)) throw notFound("店铺不存在或不在你负责的范围内。");
    shop = row;
  }
  takeTestQuota(merchantId);

  const rc = await receptionContext(merchantId);
  const [tpl] = await db()
    .select({ text: schema.promptTemplate.text })
    .from(schema.promptTemplate)
    .where(and(eq(schema.promptTemplate.merchantId, merchantId), eq(schema.promptTemplate.stage, "presale")))
    .limit(1);
  const lang = replyLanguage([body.question], shop?.market ?? null);
  const system = composePrompt(tpl?.text.trim() ? tpl.text : DEFAULT_PROMPTS.presale, {
    merchantName: ctx.merchant.name,
    shopName: shop?.name ?? "（测试问答，未选店铺）",
    platform: shop ? (shop.platform === "shopee" ? "Shopee" : "TikTok Shop") : "电商平台",
    market: shop?.market ?? "全部站点",
    replyLanguage: lang,
  });
  const conversation = [{ from: "buyer", type: "text", text: body.question, at: new Date().toISOString() }];
  if (body.productId) {
    const [p] = await db()
      .select({ id: schema.product.id })
      .from(schema.product)
      .where(and(eq(schema.product.id, body.productId), eq(schema.product.merchantId, merchantId)))
      .limit(1);
    if (!p) throw notFound("产品不存在或已删除。");
  }
  const retrieval = await retrieveForDraft({ merchantId, market: shop?.market ?? null, original: body.question, conversation, orderFacts: [], stage: body.stage ?? null, productIds: body.productId ? [body.productId] : [] });
  const knowledge = knowledgePayload(retrieval);
  const userPayload = { reply_language: lang, brand_voice: rc.brandVoice ?? "", order_facts: [], conversation, latest_buyer_message: body.question, ...(knowledge ? { knowledge } : {}) };

  let parsed;
  try {
    const res = await chat(
      "draft",
      [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      { json: true, stubHint: body.question },
    );
    parsed = parseModelOutput(parseJson(res.content));
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    throw new Problem("ai-unavailable", { detail: e.kind === "timeout" ? "AI 出稿超时，请稍后重试。" : "AI 暂时不可用，请稍后重试。", code: e.kind });
  }

  const verdict = handoffVerdict(parsed, rc.confidenceThreshold);
  // 引用：模型声明用到、且在合并结果里的片段（不在结果里的编号忽略）
  const sources = (retrieval?.merged ?? [])
    .filter((m) => parsed.usedSources.includes(m.n))
    .map((m) => ({ n: m.n, documentId: m.chunk.documentId, name: m.chunk.name, snippet: [...m.chunk.text].slice(0, SNIPPET_CHARS).join(""), fileUrl: `/api/v1/files/${m.chunk.fileId}` }));
  const qaSources = (retrieval?.qa?.merged ?? []).filter((m) => parsed.usedSources.includes(m.n)).map((m) => ({ n: m.n, qaId: m.hit.qaId, question: m.hit.questions[0], answer: m.hit.answer }));
  return {
    answer: parsed.reply,
    confidence: parsed.confidence,
    insufficient: parsed.insufficient,
    wouldHandoff: verdict !== null,
    handoffReason: verdict,
    sources,
    qaSources,
    retrieval: retrieval ? retrievalDetail(retrieval) : null,
    qa: retrieval?.qa ? qaDetail(retrieval.qa) : null,
    latencyMs: Date.now() - started,
  };
}
