// 会话写操作（DESIGN §11.1、§11.2、§11.7）：认领、取消认领、转交 / 改派、结束、发送、忽略草稿、改阶段、重试。
import { and, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import type { MessageItem, SendBody } from "@/contracts/conversations";
import { handoff } from "@/server/ai/draft";
import { translateText } from "@/server/ai/translate";
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { notify } from "@/server/core/notify";
import { db, schema } from "@/server/db/client";
import { queueFeishuCard } from "@/server/feishu/deliver";
import { conflict, notAllowed, Problem } from "@/server/http/problem";
import { isReadOnlyShopId, withShop } from "@/server/platforms/clients";
import { tiktokEndSession, tiktokFindConversation } from "@/server/platforms/tiktok";
import { supersedeDrafts, systemEvent, type ConversationRow, type MessageRow } from "./ingest";
import { loadVisible } from "./queries";
import { shopScopedConversations } from "./scope";
import { retryOutbound, sendOutbound, type OutboundType } from "./send";

const c = schema.conversation;

async function memberName(id: string | null): Promise<string> {
  if (!id) return "";
  const [r] = await db().select({ name: schema.user.name }).from(schema.membership).innerJoin(schema.user, eq(schema.user.id, schema.membership.userId)).where(eq(schema.membership.id, id)).limit(1);
  return r?.name ?? "";
}

/**
 * 认领、发送、忽略草稿前取会话。员工看不到同事处理中的会话（§10），
 * 但负责店铺内的会话被同事认领时要返回 409 并附处理人，而不是 404（API-CONV-004、§19 并发认领）。
 */
async function loadForHandling(ctx: MemberContext, id: string): Promise<ConversationRow> {
  if (ctx.membership.role === "agent" && /^[0-9a-f-]{36}$/i.test(id)) {
    const [row] = await db().select().from(c).where(and(eq(c.id, id), shopScopedConversations(ctx))).limit(1);
    // 平台后台有人回复过（处理中、没有 Shopilot 处理人）的会话可以接手，不算冲突
    if (row && row.handlingState === "human" && row.claimedBy && row.claimedBy !== ctx.membership.id) {
      const by = await memberName(row.claimedBy);
      throw conflict(row.claimedBy ? `${by} 已经认领了这个会话。` : "会话状态已变化，请刷新后再试。", {
        claimedBy: row.claimedBy ? { id: row.claimedBy, name: by } : null,
        version: row.version,
        handlingState: row.handlingState,
      });
    }
  }
  return loadVisible(ctx, id);
}

/** 11.1 claim：条件更新，先到先得；本人已认领返回 200 */
export async function claim(ctx: MemberContext, id: string, version: number | null): Promise<ConversationRow> {
  const conv = await loadForHandling(ctx, id);
  if (conv.handlingState === "human" && conv.claimedBy === ctx.membership.id) return conv;
  if (conv.buyerKind === "affiliate") throw notAllowed("达人会话只记录，不能认领。");
  // 可认领：AI 接待中、待认领，以及平台后台有人回复过（处理中但没有 Shopilot 处理人）
  const conds = [eq(c.id, conv.id), or(inArray(c.handlingState, ["bot", "awaiting_human"]), and(eq(c.handlingState, "human"), isNull(c.claimedBy)))!];
  if (version !== null) conds.push(eq(c.version, version));
  const now = new Date();
  const [updated] = await db()
    .update(c)
    .set({ handlingState: "human", claimedBy: ctx.membership.id, claimedAt: now, version: sql`${c.version} + 1`, updatedAt: now })
    .where(and(...conds))
    .returning();
  if (!updated) {
    const [cur] = await db().select().from(c).where(eq(c.id, conv.id)).limit(1);
    if (cur.handlingState === "human" && cur.claimedBy === ctx.membership.id) return cur;
    const by = await memberName(cur.claimedBy);
    const detail = cur.handlingState === "closed" ? "会话已经结束。" : cur.claimedBy ? `${by} 已经认领了这个会话。` : "会话状态已变化，请刷新后再试。";
    throw conflict(detail, { claimedBy: cur.claimedBy ? { id: cur.claimedBy, name: by } : null, version: cur.version, handlingState: cur.handlingState });
  }
  if (updated.currentSegmentId) {
    await db().update(schema.segment).set({ firstClaimedBy: sql`coalesce(${schema.segment.firstClaimedBy}, ${ctx.membership.id}::uuid)` }).where(eq(schema.segment.id, updated.currentSegmentId));
  }
  await audit(ctx.actor, { module: "workbench", action: "conversation_claimed", summary: `${ctx.user.name} 认领了会话`, targetType: "conversation", targetId: conv.id });
  return updated;
}

/**
 * 11.1 unclaim：只有当前处理人、版本一致时放回待认领；未处置草稿与关联工单不动。
 * 提交后推飞书待认领卡，本段推过也再推一张（INV-FEISHU-003）。
 */
export async function unclaim(ctx: MemberContext, id: string, version: number): Promise<ConversationRow> {
  const conv = await loadForHandling(ctx, id);
  const now = new Date();
  const [updated] = await db()
    .update(c)
    .set({ handlingState: "awaiting_human", claimedBy: null, handoffReason: "manual", version: sql`${c.version} + 1`, updatedAt: now })
    .where(and(eq(c.id, conv.id), eq(c.version, version), eq(c.handlingState, "human"), eq(c.claimedBy, ctx.membership.id)))
    .returning();
  if (!updated) {
    const [cur] = await db().select().from(c).where(eq(c.id, conv.id)).limit(1);
    const by = await memberName(cur.claimedBy);
    const detail =
      cur.handlingState === "human" && cur.claimedBy && cur.claimedBy !== ctx.membership.id
        ? `${by} 正在处理这个会话，只有处理人能取消认领。`
        : cur.handlingState === "closed"
          ? "会话已经结束。"
          : "会话状态已变化，请刷新后再试。";
    throw conflict(detail, { claimedBy: cur.claimedBy ? { id: cur.claimedBy, name: by } : null, version: cur.version, handlingState: cur.handlingState });
  }
  await systemEvent(db(), updated, `${ctx.user.name} 取消认领，会话放回待认领`, { kind: "unclaimed" });
  await audit(ctx.actor, { module: "workbench", action: "conversation_unclaimed", summary: `${ctx.user.name} 取消认领，会话放回待认领`, targetType: "conversation", targetId: conv.id });
  await queueFeishuCard(conv.id, "unclaimed", { again: true });
  return updated;
}

/** 11.1 assign：员工只能转交自己的；组长、管理员可改派范围内任何处理中的会话 */
export async function assign(ctx: MemberContext, id: string, body: { toMembershipId: string; withTickets: boolean; version: number }): Promise<ConversationRow> {
  const conv = await loadVisible(ctx, id);
  if (conv.handlingState !== "human") throw notAllowed("只能转交处理中的会话；待认领的会话请先认领。");
  if (conv.claimedBy !== ctx.membership.id && !ctx.can("wb.team")) throw new Problem("forbidden", { detail: "只能转交自己处理中的会话。", code: "wb.team" });
  if (conv.claimedBy === body.toMembershipId) return conv;
  const [target] = await db()
    .select({ id: schema.membership.id, role: schema.membership.role, status: schema.membership.status })
    .from(schema.membership)
    .where(and(eq(schema.membership.id, body.toMembershipId), eq(schema.membership.merchantId, ctx.merchant.id)))
    .limit(1);
  let ok = !!target && target.status === "active";
  if (ok && target.role !== "admin") {
    const [scoped] = await db().select().from(schema.membershipShop).where(and(eq(schema.membershipShop.membershipId, target.id), eq(schema.membershipShop.shopId, conv.shopId))).limit(1);
    ok = !!scoped;
  }
  if (!ok) throw new Problem("validation", { detail: "接手人必须是负责该店的启用成员。", code: "assignee_not_allowed", extra: { fields: { toMembershipId: "不负责该店或已停用" } } });

  const now = new Date();
  const [updated] = await db()
    .update(c)
    .set({ claimedBy: body.toMembershipId, claimedAt: now, version: sql`${c.version} + 1`, updatedAt: now })
    .where(and(eq(c.id, conv.id), eq(c.version, body.version), eq(c.handlingState, "human")))
    .returning();
  if (!updated) throw conflict("会话状态已变化，请刷新后再试。", { version: conv.version });
  const toName = await memberName(body.toMembershipId);
  let moved = 0;
  if (body.withTickets) {
    const open = await db()
      .select()
      .from(schema.ticket)
      .where(and(eq(schema.ticket.conversationId, conv.id), notInArray(schema.ticket.status, ["resolved", "closed", "void"])));
    for (const t of open) {
      if (t.assigneeId === body.toMembershipId) continue;
      await db().update(schema.ticket).set({ assigneeId: body.toMembershipId, version: t.version + 1, updatedAt: now }).where(eq(schema.ticket.id, t.id));
      await db().insert(schema.ticketEvent).values({ merchantId: ctx.merchant.id, ticketId: t.id, type: "assign", actorId: ctx.membership.id, source: "page", data: { from: t.assigneeId, to: body.toMembershipId, via: "conversation_transfer" } });
      moved++;
    }
    if (moved) {
      await notify({
        merchantId: ctx.merchant.id,
        membershipIds: [body.toMembershipId],
        event: "ticket_assigned",
        title: `${ctx.user.name} 把会话和 ${moved} 张工单转给了你`,
        body: conv.buyerName,
        link: `/wb/${conv.id}`,
        dedupeKey: `conv_transfer:${conv.id}:${body.toMembershipId}`,
      });
    }
  }
  await systemEvent(db(), updated, `${ctx.user.name} 把会话转交给 ${toName}${moved ? `（含 ${moved} 张工单）` : ""}`);
  await audit(ctx.actor, { module: "workbench", action: conv.claimedBy === ctx.membership.id ? "conversation_transferred" : "conversation_reassigned", summary: `${ctx.user.name} 把会话交给 ${toName}`, targetType: "conversation", targetId: conv.id, data: { to: body.toMembershipId, withTickets: body.withTickets, tickets: moved } });
  return updated;
}

/** 本段结束：ai_resolved = 没有人工消息、没有转人工、至少一条 AI 发出的消息 */
export async function endSegment(conv: ConversationRow, reason: "resolved" | "idle" | "shop_disconnected") {
  if (!conv.currentSegmentId) return;
  const [seg] = await db().select().from(schema.segment).where(eq(schema.segment.id, conv.currentSegmentId)).limit(1);
  if (!seg || seg.endedAt) return;
  await db()
    .update(schema.segment)
    .set({ endedAt: new Date(), endReason: reason, aiResolved: seg.aiReplied && !seg.humanReplied && !seg.handedOff })
    .where(eq(schema.segment.id, seg.id));
}

/** 11.1 resolve：处理人或范围内组长、管理员；待认领与 AI 接待中的只有组长、管理员能结束 */
export async function closeConversation(ctx: MemberContext, id: string, body: { reason?: string; version: number }): Promise<ConversationRow> {
  const conv = await loadVisible(ctx, id);
  if (conv.handlingState === "closed") return conv;
  const mine = conv.handlingState === "human" && conv.claimedBy === ctx.membership.id;
  if (!mine && !ctx.can("wb.team")) throw new Problem("forbidden", { detail: "只能结束自己处理中的会话。", code: "wb.team" });
  const [updated] = await db()
    .update(c)
    .set({ handlingState: "closed", version: sql`${c.version} + 1`, updatedAt: new Date() })
    .where(and(eq(c.id, conv.id), eq(c.version, body.version), notInArray(c.handlingState, ["closed"])))
    .returning();
  if (!updated) throw conflict("会话状态已变化，请刷新后再试。", { version: conv.version });
  await supersedeDrafts(db(), conv.id);
  await endSegment(conv, "resolved");
  if (conv.platform === "tiktok" && (await isReadOnlyShopId(conv.shopId))) {
    await systemEvent(db(), updated, "只读接入：只在 Shopilot 内结束，平台上的会话不受影响");
  } else if (conv.platform === "tiktok") {
    // TikTok 同步结束会话；失败只写系统事件，不阻断
    try {
      await withShop(conv.shopId, async (sc) => {
        if (sc.platform !== "tiktok") return;
        const found = await tiktokFindConversation(sc.app, sc.auth, conv.externalConversationId);
        if (found?.sessionId) await tiktokEndSession(sc.app, sc.auth, conv.externalConversationId, found.sessionId);
      });
    } catch (e) {
      await systemEvent(db(), updated, `TikTok 结束会话没有成功：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await systemEvent(db(), updated, `${ctx.user.name} 结束了会话${body.reason ? `：${body.reason}` : ""}`);
  await audit(ctx.actor, { module: "workbench", action: "conversation_closed", summary: `${ctx.user.name} 结束了会话`, targetType: "conversation", targetId: conv.id, data: { reason: body.reason ?? null } });
  return updated;
}

/** 字符级编辑距离（edited_sent 记录） */
function editDistance(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

/** 平台没发出：消息已记为 failed，路由按 problem 返回 502 / 504 / 409 */
export class SendFailed extends Error {
  constructor(public problem: Problem, public messageRow: MessageRow) {
    super(problem.message);
  }
}

/** API-CONV-007：待认领 / AI 接待中的会话先认领再发送；只有处理人能发 */
export async function sendMessage(ctx: MemberContext, id: string, body: SendBody): Promise<MessageRow> {
  let conv = await loadForHandling(ctx, id);
  // 同一 clientRequestId 重放直接返回首次结果
  const [prior] = await db().select().from(schema.message).where(and(eq(schema.message.conversationId, conv.id), eq(schema.message.clientRequestId, body.clientRequestId))).limit(1);
  if (prior) return prior;

  if (conv.handlingState === "closed") throw conflict("会话已经结束，不能再发送。", { handlingState: "closed" });
  if (conv.handlingState === "human" && conv.claimedBy !== ctx.membership.id) {
    const by = await memberName(conv.claimedBy);
    throw conflict(`${by || "同事"} 正在处理这个会话。`, { claimedBy: conv.claimedBy ? { id: conv.claimedBy, name: by } : null });
  }
  const [shop] = await db().select().from(schema.shop).where(eq(schema.shop.id, conv.shopId)).limit(1);
  if (shop.status !== "connected") throw notAllowed("店铺授权已失效，消息没有发出。请管理员到「店铺与连接」续期授权。", "shop_auth_expired");
  if (!conv.lastBuyerAt || Date.now() - conv.lastBuyerAt.getTime() > 7 * 86400_000) throw notAllowed("买家最后发言已超过 7 天，平台不允许再发消息。", "reply_window_closed");
  const caps = shop.capabilities;
  // 视频只有 Shopee 能发（sellerchat/upload_video）；TikTok 客服接口发视频要平台视频 ID，没有上传接口
  if (body.type === "video" && shop.platform !== "shopee") throw notAllowed("TikTok 接口暂不支持发视频。", "unsupported_type");
  // 商品卡两个平台都能发，前提是店铺授予了商品读取权限（能列出商品）
  if (body.type === "product_card" && !caps.productScope) throw notAllowed("店铺没有授予商品读取权限，不能发商品卡。", "unsupported_type");
  if (body.type !== "text" && body.type !== "image" && body.type !== "video" && body.type !== "product_card") {
    const supported = body.type === "coupon_card" ? caps.coupons : caps.cards.includes(body.type);
    if (!supported) throw notAllowed(`${shop.platform === "shopee" ? "Shopee" : "TikTok"} 店不支持发送这种卡片。`, "unsupported_type");
  }
  if (body.type === "image" || body.type === "video") {
    const what = body.type === "image" ? "图片" : "视频";
    const [file] = await db()
      .select()
      .from(schema.file)
      .where(and(eq(schema.file.id, body.fileId!), eq(schema.file.merchantId, ctx.merchant.id), eq(schema.file.kind, body.type === "image" ? "chat_image" : "chat_video")))
      .limit(1);
    if (!file) throw new Problem("validation", { detail: `${what}不存在，请重新上传。`, extra: { fields: { fileId: `${what}不存在` } } });
  }

  if (conv.handlingState !== "human" || !conv.claimedBy) conv = await claim(ctx, conv.id, null);

  let draft: typeof schema.draft.$inferSelect | undefined;
  if (body.draftId) {
    [draft] = await db().select().from(schema.draft).where(and(eq(schema.draft.id, body.draftId), eq(schema.draft.conversationId, conv.id))).limit(1);
    if (!draft || draft.status !== "generated") throw conflict("这份草稿已经处置或过期。", { draftStatus: draft?.status ?? null });
  }

  let text = body.text ?? null;
  let originalText: string | null = null;
  if (body.type === "text" && body.translateTo && text) {
    originalText = text;
    if (body.translatedText) text = body.translatedText;
    else {
      try {
        text = await translateText(text, body.translateTo);
      } catch {
        throw new Problem("ai-unavailable", { detail: "翻译暂时不可用，可以直接发送原文或稍后再试。" });
      }
    }
    if (Array.from(text).length > caps.maxTextLength) throw new Problem("validation", { detail: `译文超过 ${caps.maxTextLength} 字，请缩短后再发。` });
  }
  const payload: Record<string, unknown> = {};
  if (body.fileId) {
    const [file] = await db().select().from(schema.file).where(eq(schema.file.id, body.fileId)).limit(1);
    Object.assign(payload, { fileId: body.fileId, url: `/api/v1/files/${body.fileId}`, width: file?.width ?? undefined, height: file?.height ?? undefined });
  }
  if (body.orderId) payload.orderId = body.orderId;
  if (body.packageId) payload.packageId = body.packageId;
  if (body.skuId) payload.skuId = body.skuId;
  if (body.productId) payload.productId = body.productId;
  if (body.couponId) payload.couponId = body.couponId;
  if (body.couponTitle) payload.couponTitle = body.couponTitle;

  const out = await sendOutbound({ conversation: conv, senderRole: "agent", sentBy: ctx.membership.id, clientRequestId: body.clientRequestId, type: body.type as OutboundType, text, originalText, payload });

  if (draft) {
    const edited = body.disposition === "edited_sent" || (text ?? "") !== draft.text;
    const distance = edited ? editDistance(draft.text, originalText ?? text ?? "") : null;
    await db()
      .update(schema.draft)
      .set(
        out.error
          ? { status: "failed", disposedBy: ctx.membership.id, disposedAt: new Date(), sentMessageId: out.message.id }
          : { status: edited ? "edited_sent" : "sent", disposedBy: ctx.membership.id, disposedAt: new Date(), sentMessageId: out.message.id, editDistance: distance },
      )
      .where(eq(schema.draft.id, draft.id));
    if (!out.error) {
      await audit(ctx.actor, {
        module: "workbench",
        action: "draft_disposed",
        summary: `${ctx.user.name} ${edited ? `改后发送了 AI 草稿（编辑距离 ${distance}）` : "原样发送了 AI 草稿"}`,
        targetType: "draft",
        targetId: draft.id,
        data: { disposition: edited ? "edited_sent" : "sent", edit_distance: distance },
      });
    }
  } else if (!out.error) {
    // 不引用草稿的回复：未处置草稿作废
    await supersedeDrafts(db(), conv.id);
  }
  if (out.error) {
    const type = out.error.kind === "timeout" ? "platform-timeout" : out.error.kind === "auth" ? "not-allowed" : "platform";
    throw new SendFailed(new Problem(type, { detail: out.error.detail, code: out.error.kind === "auth" ? "shop_auth_expired" : undefined, extra: { messageId: out.message.id, platformCode: out.error.platformCode } }), out.message);
  }
  await audit(ctx.actor, { module: "workbench", action: "agent_reply_sent", summary: `${ctx.user.name} 回复了买家`, targetType: "conversation", targetId: conv.id, data: { type: body.type, translated: !!originalText } });
  return out.message;
}

export async function retryMessage(ctx: MemberContext, id: string, messageId: string): Promise<MessageRow> {
  const conv = await loadVisible(ctx, id);
  if (conv.claimedBy !== ctx.membership.id) throw new Problem("forbidden", { detail: "只有处理人能重试发送。" });
  const [msg] = await db().select().from(schema.message).where(and(eq(schema.message.id, messageId), eq(schema.message.conversationId, conv.id))).limit(1);
  if (!msg) throw new Problem("not-found");
  if (msg.sendStatus !== "failed") throw conflict("这条消息不是发送失败状态。", { sendStatus: msg.sendStatus });
  const out = await retryOutbound(conv, msg);
  if (out.error) {
    const type = out.error.kind === "timeout" ? "platform-timeout" : out.error.kind === "auth" ? "not-allowed" : "platform";
    throw new SendFailed(new Problem(type, { detail: out.error.detail, code: out.error.kind === "auth" ? "shop_auth_expired" : undefined, extra: { messageId: msg.id, platformCode: out.error.platformCode } }), out.message);
  }
  // 失败的草稿重试成功：failed → sent（11.2 retry）
  await db().update(schema.draft).set({ status: "sent", sentMessageId: msg.id, disposedAt: new Date() }).where(and(eq(schema.draft.conversationId, conv.id), eq(schema.draft.status, "failed"), eq(schema.draft.sentMessageId, msg.id)));
  return out.message;
}

/** API-CONV-008：generated → ignored；会话在 AI 接待中时转人工（manual）。员工忽略不了同事处理中会话的草稿（loadForHandling 返回 409） */
export async function ignoreDraft(ctx: MemberContext, id: string, draftId: string): Promise<void> {
  const conv = await loadForHandling(ctx, id);
  const [draft] = await db().select().from(schema.draft).where(and(eq(schema.draft.id, draftId), eq(schema.draft.conversationId, conv.id))).limit(1);
  if (!draft) throw new Problem("not-found");
  if (draft.status === "ignored") return;
  if (draft.status !== "generated") throw conflict("这份草稿已经处置或过期。", { draftStatus: draft.status });
  await db().update(schema.draft).set({ status: "ignored", disposedBy: ctx.membership.id, disposedAt: new Date() }).where(eq(schema.draft.id, draft.id));
  await audit(ctx.actor, { module: "workbench", action: "draft_disposed", summary: `${ctx.user.name} 忽略了 AI 草稿`, targetType: "draft", targetId: draft.id, data: { disposition: "ignored" } });
  if (conv.handlingState === "bot") await handoff(conv, "manual", "assist");
}

/** API-CONV-009：人工改判只改当前段 */
const STAGE_TEXT: Record<string, string> = { presale: "售前", insale: "售中", aftersale: "售后", unknown: "未确认" };

export async function setStage(ctx: MemberContext, id: string, stage: "presale" | "insale" | "aftersale" | "unknown") {
  const conv = await loadVisible(ctx, id);
  if (!conv.currentSegmentId) throw notAllowed("会话还没有会话段。");
  if (!(conv.claimedBy === ctx.membership.id || ctx.can("wb.team"))) throw new Problem("forbidden", { detail: "只能改自己处理中的会话。", code: "wb.team" });
  const [before] = await db().select({ stage: schema.segment.stage }).from(schema.segment).where(eq(schema.segment.id, conv.currentSegmentId)).limit(1);
  const [seg] = await db()
    .update(schema.segment)
    .set({ stage, stageSource: "manual", stageBasis: `${ctx.user.name} 手动改判` })
    .where(eq(schema.segment.id, conv.currentSegmentId))
    .returning();
  const from = before?.stage ?? "unknown";
  await audit(ctx.actor, {
    module: "workbench",
    action: "stage_changed",
    summary: `${ctx.user.name} 把 ${conv.buyerName} 的会话段从${STAGE_TEXT[from]}改为${STAGE_TEXT[stage]}`,
    targetType: "conversation",
    targetId: conv.id,
    data: { from, to: stage, segment_id: seg.id },
  });
  return { id: seg.id, stage: seg.stage, stageSource: seg.stageSource, stageBasis: seg.stageBasis, startedAt: seg.startedAt.toISOString() };
}

export function toMessageItem(m: MessageRow, senderName: string | null): MessageItem {
  return {
    id: m.id,
    direction: m.direction,
    senderRole: m.senderRole,
    senderName,
    type: m.type,
    text: m.text,
    originalText: m.originalText,
    translation: m.translation,
    translationSource: m.translationSource,
    payload: (m.payload ?? {}) as Record<string, unknown>,
    sendStatus: m.sendStatus,
    sendError: m.sendError,
    sentAt: m.sentAt.toISOString(),
    segmentId: m.segmentId,
  };
}
