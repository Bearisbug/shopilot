// 出站消息（DESIGN §11.7）：先落 sending，再调平台，按结果转 sent / failed。员工发送、auto 回复、安抚句、开票图片共用。
import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { dataPath } from "@/server/files/storage";
import { ShopUnavailableError, withShop } from "@/server/platforms/clients";
import { READ_ONLY_SEND_FAILED, ReadOnlyPlatformError } from "@/server/platforms/readonly";
import { shopeeSendImage, shopeeSendItem, shopeeSendOrderCard, shopeeSendText } from "@/server/platforms/shopee";
import { tiktokSendCouponCard, tiktokSendImage, tiktokSendLogisticsCard, tiktokSendOrderCard, tiktokSendProductCard, tiktokSendReturnCard, tiktokSendText } from "@/server/platforms/tiktok";
import { PlatformError, platformErrorText } from "@/server/platforms/types";
import { isInHours, receptionContext } from "./hours";
import type { ConversationRow, MessageRow } from "./ingest";

export type OutboundType = "text" | "image" | "order_card" | "logistics_card" | "return_card" | "coupon_card" | "product_card";

export type OutboundInput = {
  conversation: ConversationRow;
  senderRole: "agent" | "ai";
  sentBy: string | null;
  clientRequestId: string;
  type: OutboundType;
  text?: string | null;
  originalText?: string | null;
  payload?: Record<string, unknown>;
};

export type SendOutcome = { message: MessageRow; error?: { kind: "platform" | "timeout" | "auth"; detail: string; platformCode?: string } };

/** clientRequestId 已存在时返回首次结果，不重复调平台。只读接入的店照常落消息再调平台，由平台层写保护拦下，消息记为发送失败 */
export async function sendOutbound(input: OutboundInput): Promise<SendOutcome> {
  const conv = input.conversation;
  const [msg] = await db()
    .insert(schema.message)
    .values({
      merchantId: conv.merchantId,
      conversationId: conv.id,
      segmentId: conv.currentSegmentId,
      direction: "out",
      senderRole: input.senderRole,
      sentBy: input.sentBy,
      type: input.type,
      text: input.text ?? null,
      originalText: input.originalText ?? null,
      payload: input.payload ?? {},
      clientRequestId: input.clientRequestId,
      sendStatus: "sending",
      sentAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  if (!msg) {
    const [first] = await db()
      .select()
      .from(schema.message)
      .where(and(eq(schema.message.conversationId, conv.id), eq(schema.message.clientRequestId, input.clientRequestId)))
      .limit(1);
    return { message: first };
  }
  return deliver(conv, msg);
}

/** 重试一条 failed 的出站消息（API-CONV-015） */
export async function retryOutbound(conv: ConversationRow, msg: MessageRow): Promise<SendOutcome> {
  const [m] = await db()
    .update(schema.message)
    .set({ sendStatus: "sending", sendError: null })
    .where(and(eq(schema.message.id, msg.id), eq(schema.message.sendStatus, "failed")))
    .returning();
  if (!m) return { message: msg };
  return deliver(conv, m);
}

async function deliver(conv: ConversationRow, msg: MessageRow): Promise<SendOutcome> {
  const p = (msg.payload ?? {}) as Record<string, unknown>;
  try {
    const result = await withShop(conv.shopId, async (c) => {
      if (c.platform === "shopee") {
        switch (msg.type) {
          case "text":
            return shopeeSendText(c.app, c.auth, conv.buyerExternalId, msg.text ?? "");
          case "image":
            return shopeeSendImage(c.app, c.auth, conv.buyerExternalId, await imageOf(p));
          case "order_card":
            return shopeeSendOrderCard(c.app, c.auth, conv.buyerExternalId, String(p.orderId));
          case "product_card":
            return shopeeSendItem(c.app, c.auth, conv.buyerExternalId, String(p.productId));
          default:
            throw new PlatformError("shopee", "unsupported", `Shopee 不支持发送 ${msg.type}`, "forbidden");
        }
      }
      const id = conv.externalConversationId;
      switch (msg.type) {
        case "text":
          return tiktokSendText(c.app, c.auth, id, msg.text ?? "");
        case "image":
          return tiktokSendImage(c.app, c.auth, id, await imageOf(p));
        case "order_card":
          return tiktokSendOrderCard(c.app, c.auth, id, String(p.orderId));
        case "logistics_card":
          return tiktokSendLogisticsCard(c.app, c.auth, id, String(p.orderId), p.packageId ? String(p.packageId) : undefined);
        case "return_card":
          return tiktokSendReturnCard(c.app, c.auth, id, String(p.orderId), String(p.skuId));
        case "coupon_card":
          return tiktokSendCouponCard(c.app, c.auth, id, String(p.couponId));
        case "product_card":
          return tiktokSendProductCard(c.app, c.auth, id, String(p.productId));
        default:
          throw new PlatformError("tiktok", "unsupported", `TikTok 不支持发送 ${msg.type}`, "forbidden");
      }
    });
    const payload = "url" in result && result.url ? { ...p, url: result.url } : p;
    const [sent] = await db()
      .update(schema.message)
      .set({ sendStatus: "sent", externalMessageId: result.messageId, payload, sentAt: result.sentAt })
      .where(eq(schema.message.id, msg.id))
      .returning();
    // 转人工时的安抚句不算回复：买家仍在等人工，不清零等待计时（置顶、已等时长、待认领提醒都以 last_agent_at 为界）
    await db()
      .update(schema.conversation)
      .set(p.soothing ? { lastMessageAt: sent.sentAt, updatedAt: new Date() } : { lastAgentAt: sent.sentAt, lastMessageAt: sent.sentAt, updatedAt: new Date() })
      .where(eq(schema.conversation.id, conv.id));
    if (conv.currentSegmentId) {
      const [seg] = await db().select().from(schema.segment).where(eq(schema.segment.id, conv.currentSegmentId)).limit(1);
      if (seg) {
        await db()
          .update(schema.segment)
          .set(
            msg.senderRole === "ai"
              ? { aiReplied: true }
              : seg.firstHumanReplyAt
                ? { humanReplied: true }
                : // 人工首响：记首次人工回复时刻，并标出这段等待是否从工作时间内开始（看板首响只算工作时间内）
                  { humanReplied: true, firstHumanReplyAt: sent.sentAt, firstReplyInHours: isInHours(await receptionContext(conv.merchantId), seg.firstBuyerAt ?? sent.sentAt) },
          )
          .where(eq(schema.segment.id, seg.id));
      }
    }
    return { message: sent };
  } catch (e) {
    let kind: "platform" | "timeout" | "auth" = "platform";
    let detail: string;
    let platformCode: string | undefined;
    // 只读接入：写请求被平台层拦截，或借用的 token 已过期，请求都没有发出；按普通发送失败记，不当成超时或授权失效
    if (e instanceof ReadOnlyPlatformError || (e instanceof ShopUnavailableError && e.status === "borrowed_expired")) {
      detail = READ_ONLY_SEND_FAILED;
      platformCode = "read_only";
    } else if (e instanceof ShopUnavailableError) {
      kind = "auth";
      detail = "店铺授权已失效，消息没有发出。请管理员到「店铺与连接」续期授权。";
    } else if (e instanceof PlatformError) {
      kind = e.kind === "timeout" ? "timeout" : "platform";
      detail = platformErrorText(e);
      platformCode = e.code;
    } else {
      detail = e instanceof Error ? e.message : String(e);
    }
    const [failed] = await db().update(schema.message).set({ sendStatus: "failed", sendError: detail.slice(0, 500) }).where(eq(schema.message.id, msg.id)).returning();
    return { message: failed, error: { kind, detail, platformCode } };
  }
}

async function imageOf(p: Record<string, unknown>): Promise<{ bytes: Buffer; filename: string; mime: string }> {
  const [file] = await db().select().from(schema.file).where(eq(schema.file.id, String(p.fileId))).limit(1);
  if (!file) throw new Error("图片文件不存在");
  return { bytes: await readFile(dataPath(file.path)), filename: file.path.split("/").pop() ?? "image", mime: file.mime };
}
