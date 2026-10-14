// draft.generate（DESIGN §11.2 create / create_shadow，§12.2、§12.3）：转人工判定 → 额度 → 出稿 → assist 存草稿 / auto 直接发 / shadow 存影子。
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { audit, systemActor } from "@/server/core/audit";
import { notify, shopMembers } from "@/server/core/notify";
import { currentPeriod } from "@/server/billing/periods";
import { reserveDraft } from "@/server/billing/usage";
import { hitKeyword, receptionContext } from "@/server/conversations/hours";
import { systemEvent, type ConversationRow } from "@/server/conversations/ingest";
import { sendOutbound } from "@/server/conversations/send";
import { db, schema } from "@/server/db/client";
import { AiError, chat, parseJson, type ChatMessage } from "./client";
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
  const [merchant] = await db().select({ name: schema.merchant.name }).from(schema.merchant).where(eq(schema.merchant.id, conv.merchantId)).limit(1);
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
  const system = composePrompt(body, { merchantName: merchant?.name ?? "", shopName: shop.name, platform: shop.platform === "shopee" ? "Shopee" : "TikTok Shop", market: shop.market });
  const history = await db()
    .select()
    .from(schema.message)
    .where(eq(schema.message.conversationId, conv.id))
    .orderBy(desc(schema.message.sentAt))
    .limit(20);
  const facts = await orderFacts(conv);
  const userPayload = {
    brand_voice: rc.brandVoice ?? "",
    order_facts: facts,
    conversation: history.reverse().map((m) => ({ from: m.senderRole === "buyer" ? "buyer" : m.senderRole === "system" ? "system" : "seller", type: m.type, text: m.text ?? "", card: m.type.endsWith("_card") ? m.payload : undefined, at: m.sentAt.toISOString() })),
    latest_buyer_message: trigger.text ?? `[${trigger.type}]`,
  };
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(userPayload) },
  ];

  let parsed: { reply: string; confidence: number; handoff: boolean; reason: string };
  let model = "";
  let latencyMs = 0;
  try {
    const res = await chat("draft", messages, { json: true, stubHint: trigger.text ?? "" });
    model = res.model;
    latencyMs = res.latencyMs;
    const j = parseJson(res.content);
    parsed = { reply: String(j.reply ?? "").trim(), confidence: clamp(Number(j.confidence ?? 0)), handoff: j.handoff === true, reason: String(j.reason ?? "none") };
  } catch (e) {
    await releaseDraft(conv.merchantId);
    const reason: HandoffReason = e instanceof AiError && e.kind === "timeout" ? "timeout" : "model_error";
    if (mode !== "shadow") await handoff(conv, reason, mode);
    return;
  }

  if (mode === "shadow") {
    const [d] = await db()
      .insert(schema.draft)
      .values({ merchantId: conv.merchantId, conversationId: conv.id, segmentId: conv.currentSegmentId, triggerMessageId: trigger.id, mode, text: parsed.reply || "（空回复）", confidence: parsed.confidence, handoff: parsed.handoff, reason: parsed.reason, status: "shadow", model, latencyMs })
      .returning();
    await audit(systemActor(conv.merchantId), { module: "workbench", action: "draft_generated", summary: `影子回复 ${conv.buyerName}`, targetType: "draft", targetId: d.id, data: { mode, confidence: parsed.confidence } });
    return;
  }

  // 会话在出稿期间可能已被认领或结束
  const [now] = await db().select().from(schema.conversation).where(eq(schema.conversation.id, conv.id)).limit(1);
  if (!now || now.handlingState !== "bot") {
    await releaseDraft(conv.merchantId);
    return;
  }

  if (parsed.handoff || !parsed.reply || parsed.confidence < rc.confidenceThreshold) {
    await releaseDraft(conv.merchantId);
    const reason: HandoffReason = parsed.handoff ? ((MODEL_REASONS.has(parsed.reason) ? parsed.reason : "policy") as HandoffReason) : !parsed.reply ? "model_error" : "low_confidence";
    return handoff(now, reason, mode, parsed.handoff && parsed.reply ? parsed.reply : undefined);
  }

  const [draft] = await db()
    .insert(schema.draft)
    .values({ merchantId: conv.merchantId, conversationId: conv.id, segmentId: conv.currentSegmentId, triggerMessageId: trigger.id, mode, text: parsed.reply, confidence: parsed.confidence, handoff: false, reason: parsed.reason, status: "generated", model, latencyMs })
    .returning();
  await audit(systemActor(conv.merchantId), { module: "workbench", action: "draft_generated", summary: `草稿 ${conv.buyerName}`, targetType: "draft", targetId: draft.id, data: { mode, confidence: parsed.confidence } });
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
 * 11.1 handoff：bot → awaiting_human，记原因，审计 EVT:handoff，通知负责该店的启用成员；auto 模式先发安抚句。
 * mode = shadow 时会话已在待认领，不再处理。
 */
export async function handoff(conv: ConversationRow, reason: HandoffReason, mode: "shadow" | "assist" | "auto", soothing?: string, data: Record<string, unknown> = {}): Promise<void> {
  const [updated] = await db()
    .update(schema.conversation)
    .set({ handlingState: "awaiting_human", handoffReason: reason, version: sql`${schema.conversation.version} + 1`, updatedAt: new Date() })
    .where(and(eq(schema.conversation.id, conv.id), eq(schema.conversation.handlingState, "bot")))
    .returning();
  if (!updated) return;
  if (conv.currentSegmentId) await db().update(schema.segment).set({ handedOff: true }).where(eq(schema.segment.id, conv.currentSegmentId));
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
async function orderFacts(conv: ConversationRow) {
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
    created_at: o.platformCreatedAt.toISOString(),
    total: `${o.totalAmount} ${o.currency}`,
    items: o.items.map((i) => `${i.name}${i.sku ? ` (${i.sku})` : ""} × ${i.qty}`),
    ship_by: o.shipByAt?.toISOString() ?? null,
    tracking: o.tracking ? { number: o.tracking.trackingNo ?? null, carrier: o.tracking.carrier ?? null, latest: o.tracking.events[0] ?? null } : null,
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
