// 入站消息落库与会话状态（DESIGN §11.1 open / open_to_queue / record_only / reopen / platform_human，§11.2 supersede）。
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { schema, type Executor } from "@/server/db/client";
import { enqueue } from "@/server/jobs/boss";
import type { ShopRow } from "@/server/platforms/clients";
import type { NormalizedMessage } from "@/server/platforms/types";
import { currentMode, receptionContext, type ReceptionMode } from "./hours";
import { judgeStage } from "./stage";

export type ConversationRow = typeof schema.conversation.$inferSelect;
export type MessageRow = typeof schema.message.$inferSelect;

export type IngestResult = { status: "done" | "ignored"; reason?: string; conversationId?: string; messageId?: string; followUp?: FollowUp };

/** 写一条系统事件到会话时间线（sender_role = system） */
export async function systemEvent(ex: Executor, conv: Pick<ConversationRow, "id" | "merchantId" | "currentSegmentId">, text: string, payload: Record<string, unknown> = {}) {
  await ex.insert(schema.message).values({
    merchantId: conv.merchantId,
    conversationId: conv.id,
    segmentId: conv.currentSegmentId,
    direction: "in",
    senderRole: "system",
    type: "other",
    text,
    payload: { event: true, ...payload },
    sentAt: new Date(),
  });
}

/** 作废会话里未处置的草稿（generated → superseded） */
export async function supersedeDrafts(ex: Executor, conversationId: string) {
  await ex
    .update(schema.draft)
    .set({ status: "superseded", disposedAt: new Date() })
    .where(and(eq(schema.draft.conversationId, conversationId), eq(schema.draft.status, "generated")));
}

export function enqueueDraft(conversationId: string, mode: "shadow" | "assist" | "auto") {
  return enqueue("draft.generate", { conversationId, mode }, { singletonKey: conversationId });
}

const OUT_ROLES = new Set(["agent", "platform_human", "platform_bot"]);

/** 卖家侧消息是不是本方刚发出的回声：同平台消息 ID，或 2 分钟内同类型同文本、还在 sending 的出站消息 */
async function matchEcho(ex: Executor, conv: ConversationRow, m: NormalizedMessage): Promise<boolean> {
  const [byId] = await ex
    .select({ id: schema.message.id })
    .from(schema.message)
    .where(and(eq(schema.message.conversationId, conv.id), eq(schema.message.externalMessageId, m.externalMessageId)))
    .limit(1);
  if (byId) return true;
  const recent = await ex
    .select()
    .from(schema.message)
    .where(and(eq(schema.message.conversationId, conv.id), eq(schema.message.direction, "out"), inArray(schema.message.sendStatus, ["sending", "sent"]), gt(schema.message.createdAt, new Date(Date.now() - 120_000))))
    .orderBy(desc(schema.message.createdAt));
  const hit = recent.find((r) => !r.externalMessageId && r.type === m.type && (m.type !== "text" || r.text === m.text));
  if (!hit) return false;
  await ex.update(schema.message).set({ externalMessageId: m.externalMessageId }).where(eq(schema.message.id, hit.id));
  return true;
}

type OpenPlan = { state: "bot" | "awaiting_human"; handoffReason: string | null; draftMode: "shadow" | "assist" | "auto" | null };

function planFor(mode: ReceptionMode): OpenPlan {
  if (mode === "assist" || mode === "auto") return { state: "bot", handoffReason: null, draftMode: mode };
  if (mode === "shadow") return { state: "awaiting_human", handoffReason: "shadow", draftMode: "shadow" };
  return { state: "awaiting_human", handoffReason: "shop_off", draftMode: null };
}

async function openSegment(ex: Executor, shop: ShopRow, conv: Pick<ConversationRow, "id" | "merchantId" | "buyerExternalId">, m: NormalizedMessage) {
  const stage = await judgeStage(ex, {
    shopId: shop.id,
    platform: shop.platform,
    buyerExternalId: conv.buyerExternalId,
    referencedOrderId: typeof m.payload.orderId === "string" ? m.payload.orderId : null,
    buyerText: m.text,
    backfillDone: shop.backfill.state === "done",
  });
  const [seg] = await ex
    .insert(schema.segment)
    .values({ merchantId: conv.merchantId, conversationId: conv.id, stage: stage.stage, stageSource: stage.source, stageBasis: stage.basis, startedAt: m.sentAt, firstBuyerAt: m.sentAt })
    .returning();
  return seg;
}

/**
 * 推送来的一条消息落库并推进会话状态。
 * buyer 为 TikTok 时由调用方先查出订单侧 user_id 与是否达人会话（会话列表的 participants）。
 */
export async function ingestMessage(
  ex: Executor,
  shop: ShopRow,
  m: NormalizedMessage,
  buyer: { externalId: string; name: string | null; affiliate: boolean; avatarUrl?: string | null } | null,
): Promise<IngestResult> {
  const [existing] = await ex
    .select()
    .from(schema.conversation)
    .where(and(eq(schema.conversation.shopId, shop.id), eq(schema.conversation.externalConversationId, m.externalConversationId)))
    .limit(1);

  // 卖家侧、平台侧消息
  if (!m.fromBuyer) {
    if (!existing) return { status: "ignored", reason: "会话不存在的卖家侧消息" };
    if (OUT_ROLES.has(m.senderRole) && (await matchEcho(ex, existing, m))) return { status: "ignored", reason: "本方出站回声", conversationId: existing.id };
    const role = m.senderRole === "agent" ? "platform_human" : m.senderRole;
    const [msg] = await ex
      .insert(schema.message)
      .values({
        merchantId: shop.merchantId,
        conversationId: existing.id,
        segmentId: existing.currentSegmentId,
        externalMessageId: m.externalMessageId,
        direction: role === "system" ? "in" : "out",
        senderRole: role,
        type: m.type,
        text: m.text,
        payload: m.payload,
        sentAt: m.sentAt,
      })
      .onConflictDoNothing()
      .returning();
    if (!msg) return { status: "ignored", reason: "重复消息", conversationId: existing.id };
    if (role === "platform_human") {
      const patch: Partial<ConversationRow> = { lastAgentAt: m.sentAt, lastMessageAt: m.sentAt, updatedAt: new Date() };
      if (existing.handlingState === "bot" || existing.handlingState === "awaiting_human") {
        Object.assign(patch, { handlingState: "human", claimedBy: null, claimedAt: null, handoffReason: "platform_human", version: existing.version + 1 });
        await supersedeDrafts(ex, existing.id);
        await systemEvent(ex, existing, "平台侧已有人处理");
      }
      await ex.update(schema.conversation).set(patch).where(eq(schema.conversation.id, existing.id));
      if (existing.currentSegmentId) await ex.update(schema.segment).set({ humanReplied: true }).where(eq(schema.segment.id, existing.currentSegmentId));
    } else {
      await ex.update(schema.conversation).set({ lastMessageAt: m.sentAt, updatedAt: new Date() }).where(eq(schema.conversation.id, existing.id));
    }
    return { status: "done", conversationId: existing.id, messageId: msg.id };
  }

  const rc = await receptionContext(shop.merchantId, ex);
  const { mode } = await currentMode(shop.id, shop.platform, rc, m.sentAt, ex);
  const buyerId = buyer?.externalId ?? m.buyerExternalId ?? "";
  const buyerName = buyer?.name || m.buyerName || existing?.buyerName || buyerId;
  const affiliate = Boolean(buyer?.affiliate || m.affiliate);
  // 头像只在平台给了时写：不拿空值覆盖已有的
  const avatar = buyer?.avatarUrl || m.buyerAvatarUrl || null;

  // 新会话
  if (!existing) {
    if (affiliate) {
      const [conv] = await ex
        .insert(schema.conversation)
        .values({ merchantId: shop.merchantId, shopId: shop.id, platform: shop.platform, externalConversationId: m.externalConversationId, buyerExternalId: buyerId, buyerName, buyerAvatarUrl: avatar, buyerKind: "affiliate", handlingState: "closed", lastMessageAt: m.sentAt, lastBuyerAt: m.sentAt })
        .returning();
      const [msg] = await ex
        .insert(schema.message)
        .values({ merchantId: shop.merchantId, conversationId: conv.id, externalMessageId: m.externalMessageId, direction: "in", senderRole: "buyer", type: m.type, text: m.text, payload: m.payload, sentAt: m.sentAt })
        .returning();
      return { status: "done", reason: "达人会话只记录", conversationId: conv.id, messageId: msg.id };
    }
    const plan = planFor(mode);
    const [conv] = await ex
      .insert(schema.conversation)
      .values({
        merchantId: shop.merchantId,
        shopId: shop.id,
        platform: shop.platform,
        externalConversationId: m.externalConversationId,
        buyerExternalId: buyerId,
        buyerName,
        buyerAvatarUrl: avatar,
        handlingState: plan.state,
        handoffReason: plan.handoffReason,
        lastMessageAt: m.sentAt,
        lastBuyerAt: m.sentAt,
      })
      .returning();
    const seg = await openSegment(ex, shop, conv, m);
    await ex.update(schema.conversation).set({ currentSegmentId: seg.id }).where(eq(schema.conversation.id, conv.id));
    const [msg] = await ex
      .insert(schema.message)
      .values({ merchantId: shop.merchantId, conversationId: conv.id, segmentId: seg.id, externalMessageId: m.externalMessageId, direction: "in", senderRole: "buyer", type: m.type, text: m.text, translation: m.translation, translationSource: m.translation ? "platform" : null, payload: m.payload, sentAt: m.sentAt })
      .returning();
    return { status: "done", conversationId: conv.id, messageId: msg.id, ...afterCommit(conv.id, msg.id, shop.platform, plan.draftMode, m) };
  }

  // 已有会话：先落消息（重复推送在这里挡住）
  const [msg] = await ex
    .insert(schema.message)
    .values({
      merchantId: shop.merchantId,
      conversationId: existing.id,
      segmentId: existing.currentSegmentId,
      externalMessageId: m.externalMessageId,
      direction: "in",
      senderRole: "buyer",
      type: m.type,
      text: m.text,
      translation: m.translation,
      translationSource: m.translation ? "platform" : null,
      payload: m.payload,
      sentAt: m.sentAt,
    })
    .onConflictDoNothing()
    .returning();
  if (!msg) return { status: "ignored", reason: "重复消息", conversationId: existing.id };

  const base = { lastMessageAt: m.sentAt, lastBuyerAt: m.sentAt, buyerName, ...(avatar ? { buyerAvatarUrl: avatar } : {}), updatedAt: new Date() };
  if (existing.buyerKind === "affiliate") {
    await ex.update(schema.conversation).set(base).where(eq(schema.conversation.id, existing.id));
    return { status: "done", reason: "达人会话只记录", conversationId: existing.id, messageId: msg.id };
  }

  if (existing.handlingState === "closed") {
    // reopen / reopen_to_queue：开新段
    const plan = planFor(mode);
    const seg = await openSegment(ex, shop, existing, m);
    await ex.update(schema.message).set({ segmentId: seg.id }).where(eq(schema.message.id, msg.id));
    await ex
      .update(schema.conversation)
      .set({ ...base, handlingState: plan.state, handoffReason: plan.handoffReason, claimedBy: null, claimedAt: null, currentSegmentId: seg.id, version: existing.version + 1 })
      .where(eq(schema.conversation.id, existing.id));
    return { status: "done", conversationId: existing.id, messageId: msg.id, ...afterCommit(existing.id, msg.id, shop.platform, plan.draftMode, m) };
  }

  await ex.update(schema.conversation).set(base).where(eq(schema.conversation.id, existing.id));
  if (existing.handlingState === "bot") {
    // 新买家消息：旧草稿作废并重新出稿（模式按当下）
    await supersedeDrafts(ex, existing.id);
    const draftMode = mode === "assist" || mode === "auto" ? mode : null;
    return { status: "done", conversationId: existing.id, messageId: msg.id, ...afterCommit(existing.id, msg.id, shop.platform, draftMode, m) };
  }
  return { status: "done", conversationId: existing.id, messageId: msg.id, ...afterCommit(existing.id, msg.id, shop.platform, null, m) };
}

/** 事务提交后要做的事（出稿、翻译），由调用方在提交后执行 */
function afterCommit(conversationId: string, messageId: string, platform: "shopee" | "tiktok", draftMode: "shadow" | "assist" | "auto" | null, m: NormalizedMessage) {
  return { followUp: { conversationId, messageId, draftMode, translate: platform === "tiktok" && m.type === "text" && !!m.text } };
}

export type FollowUp = ReturnType<typeof afterCommit>["followUp"];

export async function runFollowUp(f: FollowUp | undefined) {
  if (!f) return;
  if (f.translate) await enqueue("message.translate", { messageId: f.messageId });
  if (f.draftMode) await enqueueDraft(f.conversationId, f.draftMode);
}

/**
 * 历史回补（record_only）：会话以已结束入库、无处理人；段标 backfilled、不判阶段、不出稿、不计统计。
 * 已存在的会话只补缺失的消息。
 */
export async function backfillConversation(
  ex: Executor,
  shop: ShopRow,
  conv: { externalConversationId: string; buyerExternalId: string; buyerName: string; affiliate: boolean; avatarUrl?: string | null },
  messages: NormalizedMessage[],
): Promise<number> {
  if (messages.length === 0) return 0;
  const sorted = [...messages].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  let [row] = await ex
    .select()
    .from(schema.conversation)
    .where(and(eq(schema.conversation.shopId, shop.id), eq(schema.conversation.externalConversationId, conv.externalConversationId)))
    .limit(1);
  let segmentId = row?.currentSegmentId ?? null;
  if (!row) {
    const last = sorted[sorted.length - 1];
    const lastBuyer = [...sorted].reverse().find((x) => x.fromBuyer);
    const lastAgent = [...sorted].reverse().find((x) => !x.fromBuyer && x.senderRole !== "system");
    [row] = await ex
      .insert(schema.conversation)
      .values({
        merchantId: shop.merchantId,
        shopId: shop.id,
        platform: shop.platform,
        externalConversationId: conv.externalConversationId,
        buyerExternalId: conv.buyerExternalId,
        buyerName: conv.buyerName || conv.buyerExternalId,
        buyerAvatarUrl: conv.avatarUrl ?? null,
        buyerKind: conv.affiliate ? "affiliate" : "buyer",
        handlingState: "closed",
        lastMessageAt: last.sentAt,
        lastBuyerAt: lastBuyer?.sentAt ?? null,
        lastAgentAt: lastAgent?.sentAt ?? null,
      })
      .returning();
    if (!conv.affiliate) {
      const [seg] = await ex
        .insert(schema.segment)
        .values({ merchantId: shop.merchantId, conversationId: row.id, stage: "unknown", stageSource: "auto", stageBasis: "历史回补", startedAt: sorted[0].sentAt, endedAt: last.sentAt, endReason: "backfill", backfilled: true, firstBuyerAt: sorted.find((x) => x.fromBuyer)?.sentAt ?? null })
        .returning();
      segmentId = seg.id;
      await ex.update(schema.conversation).set({ currentSegmentId: seg.id }).where(eq(schema.conversation.id, row.id));
    }
  }
  if (conv.avatarUrl && conv.avatarUrl !== row.buyerAvatarUrl) await ex.update(schema.conversation).set({ buyerAvatarUrl: conv.avatarUrl }).where(eq(schema.conversation.id, row.id));
  let inserted = 0;
  for (const m of sorted) {
    const role = m.fromBuyer ? "buyer" : m.senderRole === "agent" ? "platform_human" : m.senderRole;
    const res = await ex
      .insert(schema.message)
      .values({
        merchantId: shop.merchantId,
        conversationId: row.id,
        segmentId,
        externalMessageId: m.externalMessageId,
        direction: m.fromBuyer || role === "system" ? "in" : "out",
        senderRole: role,
        type: m.type,
        text: m.text,
        translation: m.translation,
        translationSource: m.translation ? "platform" : null,
        payload: m.payload,
        sentAt: m.sentAt,
      })
      .onConflictDoNothing()
      .returning({ id: schema.message.id });
    inserted += res.length;
  }
  return inserted;
}
