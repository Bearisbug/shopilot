// draft.generate（DESIGN §11.2 create / create_shadow，§12.2、§12.3、§12.8）：等买家停手 → 转人工判定 → 额度 → 检索知识库 → 出稿 → assist 存草稿 / auto 直接发 / shadow 存影子。
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { audit, systemActor } from "@/server/core/audit";
import { notify, shopMembers } from "@/server/core/notify";
import { currentPeriod } from "@/server/billing/periods";
import { reserveDraft } from "@/server/billing/usage";
import { faqRecordOf, waitForBundles } from "@/server/conversations/bundle";
import { hitKeyword, receptionContext } from "@/server/conversations/hours";
import { DRAFT_QUIET_MS, enqueueDraft, hasShadowDraft, systemEvent, type ConversationRow } from "@/server/conversations/ingest";
import { sendOutbound } from "@/server/conversations/send";
import { db, schema } from "@/server/db/client";
import { enqueue } from "@/server/jobs/boss";
import { inTzText } from "@/server/settings/data";
import { queueFeishuCard } from "@/server/feishu/deliver";
import { citationsFrom, knowledgePayload, retrievalSnapshot, retrieveForDraft, type RetrievalOutcome } from "@/server/knowledge/retrieve";
import { identifyProducts } from "@/server/products/dictionary";
import { AiError, chat, parseJson, type ChatMessage } from "./client";
import { replyLanguage } from "./language";
import { composePrompt, DEFAULT_PROMPTS, UNKNOWN_STAGE_PROMPT, type PromptStage } from "./prompts";

const MODEL_REASONS = new Set(["human_request", "policy", "keyword", "low_confidence"]);

export type HandoffReason = "keyword" | "low_confidence" | "non_text" | "model_error" | "timeout" | "send_failed" | "human_request" | "policy" | "quota" | "manual";

export async function generateDraft(data: Record<string, unknown>): Promise<void> {
  const conversationId = String(data.conversationId ?? "");
  const mode = String(data.mode ?? "assist") as "shadow" | "assist" | "auto";
  const [conv] = await db().select().from(schema.conversation).where(eq(schema.conversation.id, conversationId)).limit(1);
  if (!conv || conv.buyerKind !== "buyer") return;
  if (mode === "shadow" ? conv.handlingState !== "awaiting_human" : conv.handlingState !== "bot") return;
  const [shop] = await db().select().from(schema.shop).where(eq(schema.shop.id, conv.shopId)).limit(1);
  const [trigger] = await db()
    .select()
    .from(schema.message)
    .where(and(eq(schema.message.conversationId, conv.id), eq(schema.message.senderRole, "buyer")))
    .orderBy(desc(schema.message.sentAt), desc(schema.message.createdAt))
    .limit(1);
  if (!shop || !trigger) return;
  // 防抖：最近一条买家消息到达不满 6 秒就延到满 6 秒再看；同会话排队中的任务只有一个，期间的新消息都并进来，按最后一条出稿
  const wait = DRAFT_QUIET_MS - (Date.now() - trigger.createdAt.getTime());
  if (wait > 0) {
    await enqueueDraft(conv.id, mode, wait);
    return;
  }
  // 影子模式：买家停手时最后一条不是文字（只发了图片、商品卡等）就不出影子回复；每段只出一份影子回复
  if (mode === "shadow" && (trigger.type !== "text" || (await hasShadowDraft(db(), conv.currentSegmentId)))) return;
  // 同一条买家消息只出一次稿
  const [dup] = await db()
    .select({ id: schema.draft.id })
    .from(schema.draft)
    .where(and(eq(schema.draft.conversationId, conv.id), eq(schema.draft.triggerMessageId, trigger.id), inArray(schema.draft.status, ["generated", "shadow", "sent", "edited_sent", "failed"])))
    .limit(1);
  if (dup) return;

  const rc = await receptionContext(conv.merchantId);
  if (mode !== "shadow") {
    // 非文本（图片、视频、表情、订单卡、商品卡等各类卡片）一律按 non_text 转人工（REQ-AI-004、§12.3）
    if (trigger.type !== "text") return handoff(conv, "non_text", mode);
    const kw = hitKeyword(trigger.text, rc.keywords);
    if (kw) return handoff(conv, "keyword", mode, undefined, { keyword: kw });
  }

  const reservation = await reserveDraft(conv.merchantId);
  if (!reservation.allowed) {
    if (mode !== "shadow") await handoff(conv, "quota", mode);
    return;
  }

  const [seg] = conv.currentSegmentId ? await db().select().from(schema.segment).where(eq(schema.segment.id, conv.currentSegmentId)).limit(1) : [];
  const [merchant] = await db().select({ name: schema.merchant.name, timezone: schema.merchant.timezone }).from(schema.merchant).where(eq(schema.merchant.id, conv.merchantId)).limit(1);
  const stage = (seg?.stage ?? "unknown") as PromptStage | "unknown";
  let body = UNKNOWN_STAGE_PROMPT;
  if (stage !== "unknown") {
    const [tpl] = await db()
      .select({ text: schema.promptTemplate.text })
      .from(schema.promptTemplate)
      .where(and(eq(schema.promptTemplate.merchantId, conv.merchantId), eq(schema.promptTemplate.stage, stage)))
      .limit(1);
    body = tpl?.text.trim() ? tpl.text : DEFAULT_PROMPTS[stage];
  }
  // 买家先和 Shopee 商店 AI 助手聊过再转人工时，常见问题记录刚收到还在拉取：稍等，让模型看得到买家原话
  await waitForBundles(conv.id);
  const history = await db()
    .select()
    .from(schema.message)
    .where(eq(schema.message.conversationId, conv.id))
    .orderBy(desc(schema.message.sentAt))
    .limit(20);
  // 给模型的时间一律换成商户时区的本地时间（模型会照抄时间回复买家，UTC 会差出时区）
  const tz = merchant?.timezone ?? "Asia/Kuala_Lumpur";
  const local = (d: Date | string) => inTzText(new Date(d), tz, "yyyy-MM-dd HH:mm");
  const facts = await orderFacts(conv, local);
  const conversation = history
    .reverse()
    .flatMap((m) => {
      // 常见问题记录展开成买家与 Shopee 商店 AI 助手的逐条对话；成员早于记录本身，下面按时间重排
      const faq = faqRecordOf(m);
      if (faq?.status === "ok" && faq.items?.length)
        return faq.items.map((x) => ({ t: new Date(x.sentAt), from: x.role === "buyer" ? "buyer" : "shopee_ai_assistant", type: x.kind === "product_rcmd" ? "product_recommendation" : x.kind, text: x.kind === "product_rcmd" ? `推荐了 ${x.count ?? 0} 个商品` : (x.text ?? ""), card: undefined }));
      if (faq) return [{ t: m.sentAt, from: "system", type: "other", text: "买家转人工前和 Shopee 商店 AI 助手聊过，记录内容没有取到", card: undefined }];
      return [{ t: m.sentAt, from: m.senderRole === "buyer" ? "buyer" : m.senderRole === "system" ? "system" : "seller", type: m.type as string, text: m.text ?? "", card: m.type.endsWith("_card") ? m.payload : undefined }];
    })
    .sort((a, b) => a.t.getTime() - b.t.getTime())
    .map(({ t, ...e }) => ({ ...e, at: local(t) }));
  // 识别买家在问的产品（商品卡 → 订单商品 → 文字里的编码或名称），只用于问答检索的产品过滤
  const productIds = await identifyProducts({
    merchantId: conv.merchantId,
    shopId: conv.shopId,
    buyerExternalId: conv.buyerExternalId,
    productCardIds: history.filter((m) => m.senderRole === "buyer" && m.type === "product_card").map((m) => String((m.payload as { productId?: unknown } | null)?.productId ?? "")),
    buyerTexts: history.filter((m) => m.senderRole === "buyer" && m.type === "text" && m.text).slice(-5).map((m) => m.text!),
  });
  // 有对该店站点可用的资料或已发布问答时，用最近 10 条消息与订单事实改写问题，再检索（§12.8）；检索失败只降级、不转人工（RULE-KB-002）
  const retrieval = await retrieveForDraft({ merchantId: conv.merchantId, market: shop.market, original: trigger.text ?? "", conversation: conversation.slice(-10), orderFacts: facts, stage, productIds });
  const knowledge = knowledgePayload(retrieval);
  // 回复语言按买家最近的文字消息判定，不受品牌语气、提示词与资料的语言影响（§12.8）
  const buyerTexts = conversation.filter((m) => m.from === "buyer" && m.type === "text" && m.text).map((m) => m.text).reverse();
  const lang = replyLanguage(buyerTexts, shop.market);
  const system = composePrompt(body, { merchantName: merchant?.name ?? "", shopName: shop.name, platform: shop.platform === "shopee" ? "Shopee" : "TikTok Shop", market: shop.market, replyLanguage: lang });
  const userPayload = {
    reply_language: lang,
    brand_voice: rc.brandVoice ?? "",
    timezone: tz,
    order_facts: facts,
    conversation,
    latest_buyer_message: trigger.text ?? `[${trigger.type}]`,
    ...(knowledge ? { knowledge } : {}),
  };
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(userPayload) },
  ];

  let parsed: ModelOutput;
  let model = "";
  let latencyMs = 0;
  try {
    const res = await chat("draft", messages, { json: true, stubHint: trigger.text ?? "" });
    model = res.model;
    latencyMs = res.latencyMs;
    parsed = parseModelOutput(parseJson(res.content));
  } catch (e) {
    await releaseDraft(conv.merchantId);
    const reason: HandoffReason = e instanceof AiError && e.kind === "timeout" ? "timeout" : "model_error";
    logRetrieval(conv, retrieval, null);
    if (mode !== "shadow") await handoff(conv, reason, mode);
    return;
  }
  logRetrieval(conv, retrieval, parsed.insufficient);
  const citations = citationsFrom(retrieval, parsed.usedSources);
  const knowledgeFields = { insufficient: parsed.insufficient, retrieval: retrieval ? retrievalSnapshot(retrieval) : null, citations: citations.length ? citations : null };
  const evt = { mode, confidence: parsed.confidence, latency_ms: latencyMs, stage, ...retrievalEvent(retrieval, parsed.insufficient), sources_used: citations.length };

  if (mode === "shadow") {
    const [d] = await db()
      .insert(schema.draft)
      .values({ merchantId: conv.merchantId, conversationId: conv.id, segmentId: conv.currentSegmentId, triggerMessageId: trigger.id, mode, text: parsed.reply || "（空回复）", confidence: parsed.confidence, handoff: parsed.handoff, reason: parsed.reason, status: "shadow", model, latencyMs, ...knowledgeFields })
      .returning();
    await audit(systemActor(conv.merchantId), { module: "workbench", action: "draft_generated", summary: `影子回复 ${conv.buyerName}`, targetType: "draft", targetId: d.id, data: evt });
    // 不是商户语言时由 draft.translate 补一份译文（REQ-AI-007）；翻译失败不影响影子回复
    await enqueue("draft.translate", { draftId: d.id });
    return;
  }

  // 会话在出稿期间可能已被认领或结束
  const [now] = await db().select().from(schema.conversation).where(eq(schema.conversation.id, conv.id)).limit(1);
  if (!now || now.handlingState !== "bot") {
    await releaseDraft(conv.merchantId);
    return;
  }

  const verdict = handoffVerdict(parsed, rc.confidenceThreshold);
  if (verdict) {
    await releaseDraft(conv.merchantId);
    return handoff(now, verdict, mode, parsed.handoff && parsed.reply ? parsed.reply : undefined, { ...retrievalEvent(retrieval, parsed.insufficient) });
  }

  const [draft] = await db()
    .insert(schema.draft)
    .values({ merchantId: conv.merchantId, conversationId: conv.id, segmentId: conv.currentSegmentId, triggerMessageId: trigger.id, mode, text: parsed.reply, confidence: parsed.confidence, handoff: false, reason: parsed.reason, status: "generated", model, latencyMs, ...knowledgeFields })
    .returning();
  await audit(systemActor(conv.merchantId), { module: "workbench", action: "draft_generated", summary: `草稿 ${conv.buyerName}`, targetType: "draft", targetId: draft.id, data: evt });
  if (mode !== "auto") return;

  // auto：立即发送（11.2 send；11.1 ai_reply）
  const out = await sendOutbound({ conversation: now, senderRole: "ai", sentBy: null, clientRequestId: `draft:${draft.id}`, type: "text", text: parsed.reply });
  if (out.error) {
    await db().update(schema.draft).set({ status: "failed", disposedAt: new Date(), sentMessageId: out.message.id }).where(eq(schema.draft.id, draft.id));
    return handoff(now, "send_failed", "assist");
  }
  await db().update(schema.draft).set({ status: "sent", sentMessageId: out.message.id, disposedAt: new Date() }).where(eq(schema.draft.id, draft.id));
  await audit(systemActor(conv.merchantId), { module: "workbench", action: "draft_disposed", summary: `AI 自动回复 ${conv.buyerName}`, targetType: "draft", targetId: draft.id, data: { disposition: "sent", mode } });
}

/**
 * 11.1 handoff：bot → awaiting_human，记原因，审计 EVT:handoff，通知负责该店的启用成员，推飞书待认领卡；auto 模式先发安抚句。
 * mode = shadow 时会话已在待认领，不再处理。
 */
export async function handoff(conv: ConversationRow, reason: HandoffReason, mode: "shadow" | "assist" | "auto", soothing?: string, data: Record<string, unknown> = {}): Promise<void> {
  const [updated] = await db()
    .update(schema.conversation)
    .set({ handlingState: "awaiting_human", handoffReason: reason, version: sql`${schema.conversation.version} + 1`, updatedAt: new Date() })
    .where(and(eq(schema.conversation.id, conv.id), eq(schema.conversation.handlingState, "bot")))
    .returning();
  if (!updated) return;
  if (conv.currentSegmentId) await db().update(schema.segment).set({ handedOff: true, handedOffAt: new Date() }).where(eq(schema.segment.id, conv.currentSegmentId));
  if (mode === "auto" && reason !== "send_failed") {
    const text = soothing ?? fixedSoothing(await lastBuyerText(conv.id));
    await sendOutbound({ conversation: updated, senderRole: "ai", sentBy: null, clientRequestId: `soothe:${randomUUID()}`, type: "text", text, payload: { soothing: true } });
  }
  await systemEvent(db(), updated, `转人工：${HANDOFF_LABEL[reason]}`, { handoff: reason });
  await audit(systemActor(conv.merchantId), { module: "workbench", action: "handoff", summary: `${conv.buyerName} 转人工（${HANDOFF_LABEL[reason]}）`, targetType: "conversation", targetId: conv.id, data: { reason, mode, ...data } });
  await notify({
    merchantId: conv.merchantId,
    membershipIds: await shopMembers(conv.merchantId, conv.shopId),
    event: "handoff",
    title: `${conv.buyerName} 需要人工接待`,
    body: `原因：${HANDOFF_LABEL[reason]}`,
    link: `/wb/${conv.id}`,
    dedupeKey: `handoff:${conv.id}`,
  });
  await queueFeishuCard(conv.id, "unclaimed");
}

export const HANDOFF_LABEL: Record<string, string> = {
  keyword: "命中转人工关键词",
  low_confidence: "置信度低于阈值",
  non_text: "非文本消息",
  model_error: "模型出错",
  timeout: "模型超时",
  send_failed: "发送失败",
  human_request: "买家要求人工",
  policy: "超出 AI 可处理范围",
  quota: "用量上限",
  manual: "人工转交",
  shop_off: "店铺未开 AI",
  shadow: "影子模式",
  platform_human: "平台侧已有人处理",
};

async function lastBuyerText(conversationId: string): Promise<string> {
  const [m] = await db()
    .select({ text: schema.message.text })
    .from(schema.message)
    .where(and(eq(schema.message.conversationId, conversationId), eq(schema.message.senderRole, "buyer")))
    .orderBy(desc(schema.message.sentAt))
    .limit(1);
  return m?.text ?? "";
}

/** 固定安抚句：按买家文字的书写系统选语言，其余用英文 */
export function fixedSoothing(buyerText: string): string {
  if (/[฀-๿]/.test(buyerText)) return "ขอบคุณสำหรับข้อความค่ะ เจ้าหน้าที่จะติดต่อกลับโดยเร็วที่สุด";
  if (/[一-鿿]/.test(buyerText)) return "感谢您的留言，客服同事会尽快为您处理。";
  if (/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(buyerText)) return "Cảm ơn bạn đã nhắn tin, nhân viên sẽ phản hồi bạn sớm nhất.";
  return "Thanks for your message! A team member will get back to you shortly.";
}

/** 买家近 180 天在本店的订单与售后（只读镜像），作为 order_facts */
async function orderFacts(conv: ConversationRow, local: (d: Date | string) => string) {
  const orders = await db()
    .select()
    .from(schema.order)
    .where(and(eq(schema.order.shopId, conv.shopId), eq(schema.order.buyerExternalId, conv.buyerExternalId), gte(schema.order.platformCreatedAt, new Date(Date.now() - 180 * 86400_000))))
    .orderBy(desc(schema.order.platformCreatedAt))
    .limit(10);
  if (orders.length === 0) return [];
  const sales = await db()
    .select()
    .from(schema.afterSale)
    .where(and(eq(schema.afterSale.shopId, conv.shopId), inArray(schema.afterSale.externalOrderId, orders.map((o) => o.externalOrderId))));
  return orders.map((o) => ({
    order_id: o.externalOrderId,
    status: o.platformStatus,
    created_at: local(o.platformCreatedAt),
    total: `${o.totalAmount} ${o.currency}`,
    items: o.items.map((i) => `${i.name}${i.sku ? ` (${i.sku})` : ""} × ${i.qty}`),
    ship_by: o.shipByAt ? local(o.shipByAt) : null,
    tracking: o.tracking ? { number: o.tracking.trackingNo ?? null, carrier: o.tracking.carrier ?? null, latest: o.tracking.events[0] ? { at: local(o.tracking.events[0].at), text: o.tracking.events[0].text } : null } : null,
    after_sales: sales.filter((s) => s.externalOrderId === o.externalOrderId).map((s) => ({ kind: s.kind, id: s.externalId, status: s.platformStatus, reason: s.reason })),
  }));
}

/** 没有生成草稿时退回预占的 1 次用量（每份草稿计 1 次） */
async function releaseDraft(merchantId: string) {
  const period = await currentPeriod(merchantId);
  if (!period) return;
  await db()
    .update(schema.usagePeriod)
    .set({ draftsUsed: sql`greatest(${schema.usagePeriod.draftsUsed} - 1, 0)` })
    .where(eq(schema.usagePeriod.id, period.id));
}

const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

export type ModelOutput = { reply: string; confidence: number; handoff: boolean; reason: string; insufficient: boolean; usedSources: number[] };

/** 模型 JSON 输出（§12.8）：{ reply, confidence, handoff, reason, insufficient, used_sources } */
export function parseModelOutput(j: Record<string, unknown>): ModelOutput {
  const used = Array.isArray(j.used_sources) ? j.used_sources.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  return {
    reply: String(j.reply ?? "").trim(),
    confidence: clamp(Number(j.confidence ?? 0)),
    handoff: j.handoff === true,
    reason: String(j.reason ?? "none"),
    insufficient: j.insufficient === true,
    usedSources: [...new Set(used)],
  };
}

/**
 * 出稿后要不要转人工、原因是什么；null 表示可以出稿。
 * 资料不足时不论阈值一律转人工，原因记「置信度低于阈值」（RULE-KB-003）。测试问答（API-KB-012）用同一个判定。
 */
export function handoffVerdict(p: ModelOutput, threshold: number): HandoffReason | null {
  if (p.handoff) return (MODEL_REASONS.has(p.reason) ? p.reason : "policy") as HandoffReason;
  if (!p.reply) return "model_error";
  if (p.insufficient || p.confidence < threshold) return "low_confidence";
  return null;
}

/** EVT:draft_generated、EVT:handoff 的检索属性（§20）；没检索时不带 */
function retrievalEvent(r: RetrievalOutcome | null, insufficient: boolean) {
  if (!r) return { insufficient };
  return { insufficient, retrieval_ms: r.latencyMs, retrieval_degraded: r.degraded, vector_retry: r.vectorRetry, qa_hits: r.qa?.merged.length ?? 0 };
}

/** §21 日志字段：job=draft.generate 的 retrievalMs、retrievalDegraded、vectorRetry、insufficient，以及问答检索的 qaRetrievalMs、qaHits、qaError */
function logRetrieval(conv: ConversationRow, r: RetrievalOutcome | null, insufficient: boolean | null) {
  if (!r) return;
  console.log(
    JSON.stringify({
      t: new Date().toISOString(),
      level: "info",
      job: "draft.generate",
      merchantId: conv.merchantId,
      conversationId: conv.id,
      retrievalMs: r.latencyMs,
      retrievalDegraded: r.degraded,
      vectorRetry: r.vectorRetry,
      insufficient,
      qaRetrievalMs: r.qa?.latencyMs ?? null,
      qaHits: r.qa ? r.qa.merged.length : null,
      qaError: r.qa?.error ?? null,
    }),
  );
}
