// 平台售后 → 工单（DESIGN §11.4「平台售后映射」）：售后镜像每次变化后调用，建单或推进平台类工单。
import { and, desc, eq, notInArray } from "drizzle-orm";
import type { Actor } from "@/server/core/audit";
import { schema, type Executor } from "@/server/db/client";
import type { AfterSaleRow, OrderRow } from "@/server/orders/mirror";
import type { ShopRow } from "@/server/platforms/clients";
import { createTicket, moveTicket, type TicketStatus, type WaitingOn } from "./engine";

type Mapped = { status: TicketStatus; waitingOn?: WaitingOn; phase: string; dueAt: Date | null };

const TIKTOK_RETURN_RESOLVED: Record<string, string> = {
  RETURN_OR_REFUND_REQUEST_COMPLETE: "退款完成",
  RETURN_OR_REFUND_REQUEST_CANCEL: "已关闭",
  REFUND_OR_RETURN_REQUEST_REJECT: "已关闭",
};

export function mapAfterSale(a: Pick<AfterSaleRow, "platform" | "kind" | "platformStatus" | "sellerDueAt" | "raw">): Mapped {
  const s = a.platformStatus;
  const raw = (a.raw ?? {}) as Record<string, unknown>;
  if (a.platform === "tiktok" && a.kind === "return") {
    if (s === "RETURN_OR_REFUND_REQUEST_PENDING") return { status: "open", phase: "待审核", dueAt: a.sellerDueAt };
    if (s === "AWAITING_BUYER_SHIP") return { status: "waiting", waitingOn: "buyer", phase: "等买家寄回", dueAt: null };
    if (s === "BUYER_SHIPPED_ITEM") return { status: "in_progress", phase: "待验货", dueAt: a.sellerDueAt };
    if (s === "REJECT_RECEIVE_PACKAGE" || raw.arbitration_status === "IN_PROGRESS") return { status: "waiting", waitingOn: "platform", phase: "平台仲裁中", dueAt: null };
    // SUCCESS 是退款已批准、平台尚未打款；打款后转 COMPLETE 才算解决
    if (s === "RETURN_OR_REFUND_REQUEST_SUCCESS") return { status: "waiting", waitingOn: "platform", phase: "退款中", dueAt: null };
    if (TIKTOK_RETURN_RESOLVED[s]) return { status: "resolved", phase: TIKTOK_RETURN_RESOLVED[s], dueAt: null };
    return { status: "open", phase: "待处理", dueAt: a.sellerDueAt };
  }
  if (a.platform === "tiktok" && a.kind === "cancel") {
    if (s === "CANCELLATION_REQUEST_PENDING") return { status: "open", phase: "待处理", dueAt: a.sellerDueAt };
    return { status: "resolved", phase: s === "CANCELLATION_REQUEST_SUCCESS" || s === "CANCELLATION_REQUEST_COMPLETE" ? "已取消" : "已撤回", dueAt: null };
  }
  if (a.platform === "shopee" && a.kind === "return") {
    if (s === "REQUESTED") return { status: "open", phase: "待处理", dueAt: a.sellerDueAt };
    if (s === "PROCESSING") return { status: "waiting", waitingOn: "buyer", phase: "等买家寄回", dueAt: a.sellerDueAt };
    if (s === "JUDGING" || s === "SELLER_DISPUTE") return { status: "waiting", waitingOn: "platform", phase: "平台判定中", dueAt: a.sellerDueAt };
    return { status: "resolved", phase: s === "ACCEPTED" ? "已退款" : "已关闭", dueAt: null };
  }
  // Shopee 取消申请：订单在 IN_CANCEL 时待处理，离开后已解决
  if (s === "IN_CANCEL") return { status: "open", phase: "待处理", dueAt: a.sellerDueAt };
  return { status: "resolved", phase: s === "CANCELLED" ? "已取消" : "已拒绝", dueAt: null };
}

/** 买家在该店的会话（最近活跃的一个）与处理人，用于工单关联与默认负责人 */
export async function buyerConversation(ex: Executor, shopId: string, buyerExternalId: string | null): Promise<{ id: string; claimedBy: string | null; buyerName: string } | null> {
  if (!buyerExternalId) return null;
  const [c] = await ex
    .select({ id: schema.conversation.id, claimedBy: schema.conversation.claimedBy, buyerName: schema.conversation.buyerName })
    .from(schema.conversation)
    .where(and(eq(schema.conversation.shopId, shopId), eq(schema.conversation.buyerExternalId, buyerExternalId)))
    .orderBy(desc(schema.conversation.lastMessageAt))
    .limit(1);
  return c ?? null;
}

/**
 * 售后镜像变化后同步工单：映射为未结且没有工单 → 建单（受 auto_create）；已有未结工单 → 按映射推进。
 * 映射为已解决且没有未结工单 → 不建单（如卖家自己发起的取消）。
 */
export async function syncAfterSaleTicket(ex: Executor, shop: ShopRow, a: AfterSaleRow, order: OrderRow | null, actor: Actor): Promise<void> {
  const type = a.kind === "return" ? "return_refund" : "cancel_request";
  const dedupeKey = a.kind === "return" ? `return:${a.externalId}` : `cancel:${a.externalId}`;
  const mapped = mapAfterSale(a);
  const [open] = await ex
    .select()
    .from(schema.ticket)
    .where(and(eq(schema.ticket.merchantId, shop.merchantId), eq(schema.ticket.dedupeKey, dedupeKey), notInArray(schema.ticket.status, ["resolved", "closed", "void"])))
    .limit(1);
  if (open) {
    await moveTicket(
      ex,
      open,
      { status: mapped.status, waitingOn: mapped.waitingOn ?? null, phase: mapped.phase, platformStatus: a.platformStatus, dueAt: mapped.dueAt ?? (mapped.status === "waiting" ? null : open.dueAt), dueSource: mapped.dueAt ? "platform" : open.dueSource },
      actor,
      "platform_event",
    );
    if (!open.afterSaleId) await ex.update(schema.ticket).set({ afterSaleId: a.id }).where(eq(schema.ticket.id, open.id));
    return;
  }
  if (mapped.status === "resolved") return;
  // 同一售后单的工单被组长、管理员作废过：之后的平台事件不再重建
  const [voided] = await ex
    .select({ id: schema.ticket.id })
    .from(schema.ticket)
    .where(and(eq(schema.ticket.merchantId, shop.merchantId), eq(schema.ticket.dedupeKey, dedupeKey), eq(schema.ticket.status, "void")))
    .limit(1);
  if (voided) return;
  // Shopee 取消申请没有平台截止：商户 24 小时且不晚于 ship_by_date
  let platformDueAt = mapped.dueAt;
  let dueAt: Date | null = null;
  let dueSource: "platform" | "merchant" | null = null;
  if (shop.platform === "shopee" && a.kind === "cancel") {
    const cap = order?.shipByAt ?? null;
    const merchant24 = new Date(Date.now() + 24 * 3600_000);
    dueAt = cap && cap < merchant24 ? cap : merchant24;
    dueSource = cap && cap < merchant24 ? "platform" : "merchant";
    platformDueAt = null;
  }
  const conv = await buyerConversation(ex, shop.id, a.buyerExternalId ?? order?.buyerExternalId ?? null);
  await createTicket(
    ex,
    {
      merchantId: shop.merchantId,
      type,
      origin: "platform",
      dedupeKey,
      shopId: shop.id,
      platform: shop.platform,
      orderId: order?.id ?? a.orderId,
      afterSaleId: a.id,
      conversationId: conv?.id ?? null,
      buyerName: conv?.buyerName ?? order?.buyerName ?? null,
      status: mapped.status,
      waitingOn: mapped.waitingOn ?? null,
      phase: mapped.phase,
      platformStatus: a.platformStatus,
      platformDueAt,
      dueAt,
      dueSource,
      description: a.reason,
      claimerId: conv?.claimedBy ?? null,
    },
    actor,
  );
}

/** 物流异常建单（手动类推进）：去重键 logistics:<订单号>；时限 ship_by_date / TikTok 截止字段，无则按类型配置 */
export async function logisticsTicket(ex: Executor, shop: ShopRow, order: OrderRow, why: string, actor: Actor, dueAt?: Date | null): Promise<void> {
  const conv = await buyerConversation(ex, shop.id, order.buyerExternalId);
  await createTicket(
    ex,
    {
      merchantId: shop.merchantId,
      type: "logistics",
      origin: "platform",
      dedupeKey: `logistics:${order.externalOrderId}`,
      shopId: shop.id,
      platform: shop.platform,
      orderId: order.id,
      conversationId: conv?.id ?? null,
      buyerName: conv?.buyerName ?? order.buyerName,
      phase: "物流异常",
      platformStatus: order.platformStatus,
      platformDueAt: dueAt ?? null,
      description: why,
      claimerId: conv?.claimedBy ?? null,
    },
    actor,
  );
}
