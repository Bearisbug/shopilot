// 售后（DESIGN §8.6 API-ORD-005…008）：处理买家取消申请、退货退款。先回读平台确认可处理，再持售后单行锁调平台，成功后回读镜像并按 §11.4 推进工单。
import { and, desc, eq, or } from "drizzle-orm";
import type { AfterSaleAction, AfterSaleDetail, RejectReasons, ReturnDecision } from "@/contracts/orders";
import { SHOPEE_DISPUTE_REASONS } from "@/contracts/orders";
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { systemEvent } from "@/server/conversations/ingest";
import { db, schema, type Executor, type Tx } from "@/server/db/client";
import { Problem } from "@/server/http/problem";
import { syncShopeeCancelRequest } from "@/server/inbound/process";
import { isReadOnlyShop, withShop, type ShopClient, type ShopRow } from "@/server/platforms/clients";
import { READ_ONLY_ACTION_REASON } from "@/server/platforms/readonly";
import { shopeeConfirmReturn, shopeeDisputeReturn, shopeeHandleBuyerCancellation } from "@/server/platforms/shopee";
import { tiktokApproveCancellation, tiktokApproveReturn, tiktokRejectCancellation, tiktokRejectReasons, tiktokRejectReturn } from "@/server/platforms/tiktok";
import { syncAfterSaleTicket } from "@/server/tickets/platform";
import { syncAfterSale, syncOrders, type AfterSaleRow, type OrderRow } from "./mirror";
import { onPlatform } from "./platform-errors";
import { visibleAfterSales } from "./scope";
import { afterSaleSummary, buyerConversationFor, iso, shopRef, ticketRef } from "./service";
import { afterSaleOpen } from "./status";

const DECISION_LABEL: Record<ReturnDecision | "accept" | "reject", string> = {
  accept: "同意取消申请",
  reject: "拒绝取消申请",
  approve_return: "同意退货",
  reject_return: "拒绝退货",
  approve_received: "收货后同意退款",
  reject_received: "拒收退货",
  confirm_refund: "同意退款",
  dispute: "发起争议",
};

async function loadAfterSale(ctx: MemberContext, id: string, ex: Executor = db()): Promise<{ a: AfterSaleRow; shop: ShopRow }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Problem("not-found");
  const [row] = await ex
    .select({ a: schema.afterSale, s: schema.shop })
    .from(schema.afterSale)
    .innerJoin(schema.shop, eq(schema.shop.id, schema.afterSale.shopId))
    .where(and(eq(schema.afterSale.id, id), visibleAfterSales(ctx)))
    .limit(1);
  if (!row) throw new Problem("not-found", { detail: "找不到这张售后单，或它不在你负责的店铺里。" });
  return { a: row.a, shop: row.s };
}

async function orderOf(a: AfterSaleRow, ex: Executor = db()): Promise<OrderRow | null> {
  const [r] = await ex
    .select()
    .from(schema.order)
    .where(and(eq(schema.order.shopId, a.shopId), eq(schema.order.externalOrderId, a.externalOrderId)))
    .limit(1);
  return r ?? null;
}

const dedupeKeyOf = (a: AfterSaleRow) => `${a.kind}:${a.externalId}`;

async function ticketOf(a: AfterSaleRow, ex: Executor = db()) {
  const [r] = await ex
    .select()
    .from(schema.ticket)
    .where(and(eq(schema.ticket.merchantId, a.merchantId), or(eq(schema.ticket.afterSaleId, a.id), eq(schema.ticket.dedupeKey, dedupeKeyOf(a)))))
    .orderBy(desc(schema.ticket.createdAt))
    .limit(1);
  return r ?? null;
}

/** 写会话时间线用：买家在该店最近的会话（不按成员可见范围收窄） */
export async function latestBuyerConversation(ex: Executor, shopId: string, buyerExternalId: string | null) {
  if (!buyerExternalId) return null;
  const [c] = await ex
    .select()
    .from(schema.conversation)
    .where(and(eq(schema.conversation.shopId, shopId), eq(schema.conversation.buyerExternalId, buyerExternalId)))
    .orderBy(desc(schema.conversation.lastMessageAt))
    .limit(1);
  return c ?? null;
}

const returnTypeOf = (a: AfterSaleRow) => {
  const raw = (a.raw ?? {}) as Record<string, unknown>;
  return typeof raw.return_type === "string" ? raw.return_type : null;
};

/** 当前状态下可做的处理；不可做的附原因（前端置灰显示）。只读接入的店全部置灰 */
export function actionsFor(a: Pick<AfterSaleRow, "platform" | "kind" | "platformStatus" | "raw">, readOnly = false): AfterSaleAction[] {
  const list = actionsByState(a);
  return readOnly ? list.map((x) => ({ ...x, allowed: false, reason: READ_ONLY_ACTION_REASON })) : list;
}

function actionsByState(a: Pick<AfterSaleRow, "platform" | "kind" | "platformStatus" | "raw">): AfterSaleAction[] {
  const s = a.platformStatus;
  const act = (decision: AfterSaleAction["decision"], allowed: boolean, reason: string | null, needsReason = false): AfterSaleAction => ({ decision, allowed, reason: allowed ? null : reason, needsReason });
  if (a.kind === "cancel") {
    const open = afterSaleOpen(a.platform, "cancel", s);
    const why = `订单已不在取消申请中（当前 ${s}）`;
    return [act("accept", open, why), act("reject", open, why, a.platform === "tiktok")];
  }
  if (a.platform === "shopee") {
    const ok = s === "REQUESTED" || s === "PROCESSING";
    const why = `退货单已是 ${s}，只有 REQUESTED、PROCESSING 能处理`;
    return [act("confirm_refund", ok, why), act("dispute", ok, why, true)];
  }
  if (s === "BUYER_SHIPPED_ITEM") return [act("approve_received", true, null), act("reject_received", true, null, true)];
  if (s === "RETURN_OR_REFUND_REQUEST_PENDING") return [act("approve_return", true, null), act("reject_return", true, null, true)];
  if (s === "AWAITING_BUYER_SHIP") {
    const why = "买家还没寄回，寄回后才能验货";
    return [act("approve_received", false, why), act("reject_received", false, why, true)];
  }
  const why = `退货单当前 ${s}，不需要卖家处理`;
  return [act("approve_return", false, why), act("reject_return", false, why, true)];
}

/** API-ORD-005 */
export async function afterSaleDetail(ctx: MemberContext, id: string): Promise<AfterSaleDetail> {
  const { a, shop } = await loadAfterSale(ctx, id);
  const [order, ticket] = await Promise.all([orderOf(a), ticketOf(a)]);
  const conv = await buyerConversationFor(ctx, a.shopId, a.buyerExternalId ?? order?.buyerExternalId ?? null);
  const raw = (a.raw ?? {}) as Record<string, unknown>;
  const evidence = Array.isArray(raw.image) ? (raw.image as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const now = Date.now();
  return {
    ...afterSaleSummary(a),
    nextAction: a.nextAction,
    dueField: a.dueField,
    reason: a.reason,
    amount: a.amount,
    currency: a.currency,
    evidence,
    arbitrationStatus: typeof raw.arbitration_status === "string" ? raw.arbitration_status : null,
    order: {
      id: order?.id ?? null,
      externalOrderId: a.externalOrderId,
      buyerName: order?.buyerName ?? ticket?.buyerName ?? null,
      items: (order?.items ?? []).map((i) => ({ name: i.name, sku: i.sku, qty: i.qty, unitPrice: i.unitPrice })),
      total: order?.totalAmount ?? null,
      currency: order?.currency ?? null,
      platformStatus: order?.platformStatus ?? null,
      shipByAt: iso(order?.shipByAt),
    },
    shop: shopRef(shop),
    ticket: ticket
      ? { ...ticketRef(ticket), dueAt: iso(ticket.dueAt), dueSource: ticket.dueSource, overdue: !!ticket.dueAt && ticket.dueAt.getTime() < now && ["open", "in_progress", "waiting"].includes(ticket.status) }
      : null,
    conversationId: conv?.id ?? null,
    actions: actionsFor(a, await isReadOnlyShop(shop)),
  };
}

/** 从平台回读售后单（Shopee 取消申请回读订单），写镜像并推进工单；返回最新镜像 */
async function readBack(c: ShopClient, a: AfterSaleRow, tx: Tx, ctx: MemberContext): Promise<AfterSaleRow> {
  if (a.platform === "shopee" && a.kind === "cancel") {
    const [ord] = await syncOrders(c, [a.externalOrderId], tx);
    if (ord) await syncShopeeCancelRequest(tx, c.shop, ord, ctx.actor);
  } else {
    const fresh = await syncAfterSale(c, a.kind, a.externalId, tx);
    const [ord] = await syncOrders(c, [a.externalOrderId], tx);
    if (fresh) await syncAfterSaleTicket(tx, c.shop, fresh, ord ?? null, ctx.actor);
  }
  const [row] = await tx.select().from(schema.afterSale).where(eq(schema.afterSale.id, a.id)).limit(1);
  return row;
}

/** 处理前先回读：镜像可能落后（买家撤回、同事已处理），以平台为准判断能否处理 */
async function freshen(ctx: MemberContext, shop: ShopRow, a: AfterSaleRow): Promise<AfterSaleRow> {
  return onPlatform(() => withShop(shop.id, (c) => db().transaction((tx) => readBack(c, a, tx, ctx))));
}

const TIKTOK_RETURN_DECISIONS: Array<AfterSaleAction["decision"]> = ["approve_return", "reject_return", "approve_received", "reject_received"];

function guard(a: AfterSaleRow, decision: AfterSaleAction["decision"], reasonCode: string | undefined): AfterSaleAction {
  const action = actionsFor(a).find((x) => x.decision === decision);
  if (!action) {
    const name = a.platform === "shopee" ? "Shopee" : "TikTok";
    // TikTok 退货单在不同状态下给不同的处理项：平台支持这个处理、只是当前状态不给，说明单子刚被处理过
    if (a.kind === "return" && a.platform === "tiktok" && TIKTOK_RETURN_DECISIONS.includes(decision)) {
      throw new Problem("not-allowed", { detail: `退货单现在是 ${a.platformStatus}，已不能「${DECISION_LABEL[decision]}」，可能刚被处理过。请关闭后重新打开查看最新状态。`, code: "aftersale_state" });
    }
    throw new Problem("not-allowed", { detail: `${name} ${a.kind === "cancel" ? "取消申请" : "退货单"}不支持「${DECISION_LABEL[decision]}」。`, code: "decision_unsupported" });
  }
  if (!action.allowed) throw new Problem("not-allowed", { detail: `${action.reason}，不能${DECISION_LABEL[decision]}。`, code: "aftersale_state" });
  if (action.needsReason && !reasonCode) throw new Problem("validation", { detail: "请选择原因。", extra: { fields: { reasonCode: "请选择原因" } } });
  return action;
}

async function recordAction(tx: Tx, ctx: MemberContext, a: AfterSaleRow, decision: AfterSaleAction["decision"], detail: Record<string, unknown>) {
  const ticket = await ticketOf(a, tx);
  if (ticket && ["open", "in_progress", "waiting"].includes(ticket.status)) {
    await tx.insert(schema.ticketEvent).values({
      merchantId: ctx.merchant.id,
      ticketId: ticket.id,
      type: "action",
      actorId: ctx.membership.id,
      source: "page",
      data: { action: decision, label: DECISION_LABEL[decision], ...detail },
    });
  }
  const order = await orderOf(a, tx);
  const conv = await latestBuyerConversation(tx, a.shopId, a.buyerExternalId ?? order?.buyerExternalId ?? null);
  const what = a.kind === "cancel" ? `订单 ${a.externalOrderId} 的取消申请` : `退货单 ${a.externalId}`;
  if (conv) await systemEvent(tx, conv, `${ctx.user.name} 对${what}：${DECISION_LABEL[decision]}`, { kind: "aftersale_decided", afterSaleId: a.id, decision });
  await audit(
    ctx.actor,
    { module: "orders", action: "aftersale_decided", summary: `${DECISION_LABEL[decision]}：${what}`, targetType: "after_sale", targetId: a.id, data: { kind: a.kind, decision, platform: a.platform } },
    tx,
  );
}

/** 原因代码换成给人看的文字写进工单时间线：Shopee 争议原因取固定表，TikTok 拒绝原因在执行前向平台取（处理完平台就不再给原因列表）；取不到时只留代码 */
async function reasonTextOf(c: ShopClient, a: AfterSaleRow, code: string | undefined): Promise<string | undefined> {
  if (!code) return undefined;
  if (c.platform === "shopee") return SHOPEE_DISPUTE_REASONS.find((r) => r.code === code)?.text;
  try {
    return (await tiktokRejectReasons(c.app, c.auth, a.externalId)).find((r) => r.name === code)?.text;
  } catch {
    return undefined;
  }
}

/** API-ORD-006：Shopee 同意 / 拒绝（订单须 IN_CANCEL）；TikTok 同意 / 拒绝取消（拒绝需平台原因） */
export async function decideCancellation(ctx: MemberContext, id: string, body: { decision: "accept" | "reject"; reason?: string }): Promise<AfterSaleDetail> {
  const { a, shop } = await loadAfterSale(ctx, id);
  if (a.kind !== "cancel") throw new Problem("not-allowed", { detail: "这张售后单是退货退款，请用「处理退货」。", code: "decision_unsupported" });
  if (await isReadOnlyShop(shop)) throw new Problem("not-allowed", { detail: READ_ONLY_ACTION_REASON, code: "read_only" });
  const fresh = await freshen(ctx, shop, a);
  guard(fresh, body.decision, body.reason);
  await db().transaction(async (tx) => {
    await tx.select({ id: schema.afterSale.id }).from(schema.afterSale).where(eq(schema.afterSale.id, a.id)).for("update");
    await onPlatform(() =>
      withShop(shop.id, async (c) => {
        const reasonText = await reasonTextOf(c, a, body.reason);
        if (c.platform === "shopee") await shopeeHandleBuyerCancellation(c.app, c.auth, a.externalOrderId, body.decision === "accept");
        else if (body.decision === "accept") await tiktokApproveCancellation(c.app, c.auth, a.externalId);
        else await tiktokRejectCancellation(c.app, c.auth, a.externalId, body.reason!);
        await recordAction(tx, ctx, fresh, body.decision, { ...(body.reason ? { reason: body.reason } : {}), ...(reasonText ? { reasonText } : {}) });
        await readBack(c, fresh, tx, ctx);
      }),
    );
  });
  return afterSaleDetail(ctx, id);
}

/** API-ORD-007：TikTok 同意退货、拒绝、收货后同意退款、拒收；Shopee 同意退款、发起争议 */
export async function decideReturn(ctx: MemberContext, id: string, body: { decision: ReturnDecision; reasonCode?: string; comment?: string }): Promise<AfterSaleDetail> {
  const { a, shop } = await loadAfterSale(ctx, id);
  if (a.kind !== "return") throw new Problem("not-allowed", { detail: "这张售后单是取消申请，请用「处理取消申请」。", code: "decision_unsupported" });
  if (await isReadOnlyShop(shop)) throw new Problem("not-allowed", { detail: READ_ONLY_ACTION_REASON, code: "read_only" });
  const fresh = await freshen(ctx, shop, a);
  guard(fresh, body.decision, body.reasonCode);
  if (body.decision === "dispute" && !/^\d+$/.test(body.reasonCode ?? "")) throw new Problem("validation", { detail: "争议原因不对，请重新选择。", extra: { fields: { reasonCode: "请选择争议原因" } } });
  const refundOnly = returnTypeOf(fresh) === "REFUND";
  await db().transaction(async (tx) => {
    await tx.select({ id: schema.afterSale.id }).from(schema.afterSale).where(eq(schema.afterSale.id, a.id)).for("update");
    await onPlatform(() =>
      withShop(shop.id, async (c) => {
        const reasonText = await reasonTextOf(c, a, body.reasonCode);
        if (c.platform === "shopee") {
          if (body.decision === "confirm_refund") await shopeeConfirmReturn(c.app, c.auth, a.externalId);
          else await shopeeDisputeReturn(c.app, c.auth, { returnSn: a.externalId, email: ctx.user.email, reasonId: Number(body.reasonCode), text: body.comment });
        } else {
          switch (body.decision) {
            case "approve_return":
              await tiktokApproveReturn(c.app, c.auth, a.externalId, refundOnly ? "APPROVE_REFUND" : "APPROVE_RETURN");
              break;
            case "reject_return":
              await tiktokRejectReturn(c.app, c.auth, a.externalId, refundOnly ? "REJECT_REFUND" : "REJECT_RETURN", body.reasonCode!, body.comment);
              break;
            case "approve_received":
              await tiktokApproveReturn(c.app, c.auth, a.externalId, "APPROVE_RECEIVED_PACKAGE");
              break;
            case "reject_received":
              await tiktokRejectReturn(c.app, c.auth, a.externalId, "REJECT_RECEIVED_PACKAGE", body.reasonCode!, body.comment);
              break;
          }
        }
        await recordAction(tx, ctx, fresh, body.decision, { ...(body.reasonCode ? { reasonCode: body.reasonCode } : {}), ...(reasonText ? { reasonText } : {}), ...(body.comment ? { comment: body.comment } : {}) });
        await readBack(c, fresh, tx, ctx);
      }),
    );
  });
  return afterSaleDetail(ctx, id);
}

/** API-ORD-008：TikTok Get Reject Reasons（取消、退货、收货各自一组）；Shopee 没有对应接口 */
export async function rejectReasons(ctx: MemberContext, id: string): Promise<RejectReasons> {
  const { a, shop } = await loadAfterSale(ctx, id);
  if (shop.platform !== "tiktok") throw new Problem("not-allowed", { detail: "Shopee 不提供拒绝原因列表：取消申请直接拒绝，退货请用「发起争议」。", code: "platform_unsupported" });
  const items = await onPlatform(() => withShop(shop.id, async (c) => (c.platform === "tiktok" ? tiktokRejectReasons(c.app, c.auth, a.externalId) : [])));
  return { items: items.map((r) => ({ code: r.name, text: r.text })) };
}
