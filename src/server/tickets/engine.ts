// 工单建单与状态推进（DESIGN §11.4）：编号、去重、默认负责人、商户时限、时间线、通知、审计。手动接口与平台事件共用。
import { and, asc, eq, notInArray } from "drizzle-orm";
import { audit, systemActor, type Actor } from "@/server/core/audit";
import { notify } from "@/server/core/notify";
import { nextSequence } from "@/server/core/sequence";
import { addBusinessDays, nextShiftStart, receptionContext } from "@/server/conversations/hours";
import { schema, type Executor } from "@/server/db/client";
import type { MerchantDue, TicketType } from "@/server/db/schema";
import { DEFAULT_TICKET_TYPES } from "@/server/merchants/defaults";

export type TicketRow = typeof schema.ticket.$inferSelect;
export type TicketStatus = TicketRow["status"];
export type WaitingOn = NonNullable<TicketRow["waitingOn"]>;

export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  return_refund: "退货退款",
  cancel_request: "取消申请",
  logistics: "物流异常",
  invoice: "开票",
  stock: "缺货 / 到货跟进",
  handover: "跨班交接",
  internal: "内部确认",
};

const CLOSED: TicketStatus[] = ["resolved", "closed", "void"];

export async function ticketTypeConfig(tx: Executor, merchantId: string, type: TicketType) {
  const [row] = await tx.select().from(schema.ticketTypeConfig).where(and(eq(schema.ticketTypeConfig.merchantId, merchantId), eq(schema.ticketTypeConfig.type, type))).limit(1);
  return row ?? { merchantId, ...DEFAULT_TICKET_TYPES.find((t) => t.type === type)! };
}

/** 商户时限：hours / days 直接加；businessDays 按排班数工作日；afterShiftStartMinutes 为下次上班后 N 分钟 */
export async function merchantDueAt(tx: Executor, merchantId: string, due: MerchantDue | null, from = new Date()): Promise<Date | null> {
  if (!due) return null;
  if (due.hours) return new Date(from.getTime() + due.hours * 3600_000);
  if (due.days) return new Date(from.getTime() + due.days * 86400_000);
  const rc = await receptionContext(merchantId, tx);
  if (due.businessDays) return addBusinessDays(rc, from, due.businessDays);
  if (due.afterShiftStartMinutes !== undefined) return new Date(nextShiftStart(rc, from).getTime() + due.afterShiftStartMinutes * 60_000);
  return null;
}

/** 店铺组长（同店多个取最早加入）→ 所有者 → 任一管理员 */
export async function shopLeadOrOwner(tx: Executor, merchantId: string, shopId: string): Promise<string | null> {
  const [lead] = await tx
    .select({ id: schema.membership.id })
    .from(schema.membership)
    .innerJoin(schema.membershipShop, eq(schema.membershipShop.membershipId, schema.membership.id))
    .where(and(eq(schema.membership.merchantId, merchantId), eq(schema.membership.role, "lead"), eq(schema.membership.status, "active"), eq(schema.membershipShop.shopId, shopId)))
    .orderBy(asc(schema.membership.createdAt))
    .limit(1);
  if (lead) return lead.id;
  const [owner] = await tx
    .select({ id: schema.membership.id })
    .from(schema.membership)
    .innerJoin(schema.merchant, eq(schema.merchant.id, schema.membership.merchantId))
    .where(and(eq(schema.membership.merchantId, merchantId), eq(schema.membership.userId, schema.merchant.ownerUserId), eq(schema.membership.status, "active")))
    .limit(1);
  if (owner) return owner.id;
  const [admin] = await tx
    .select({ id: schema.membership.id })
    .from(schema.membership)
    .where(and(eq(schema.membership.merchantId, merchantId), eq(schema.membership.role, "admin"), eq(schema.membership.status, "active")))
    .orderBy(asc(schema.membership.createdAt))
    .limit(1);
  return admin?.id ?? null;
}

export type CreateTicketInput = {
  merchantId: string;
  type: TicketType;
  origin: "platform" | "manual" | "rule";
  dedupeKey: string;
  shopId: string;
  platform: "shopee" | "tiktok";
  orderId?: string | null;
  afterSaleId?: string | null;
  conversationId?: string | null;
  buyerName?: string | null;
  status?: TicketStatus;
  waitingOn?: WaitingOn | null;
  phase?: string | null;
  platformStatus?: string | null;
  /** 平台截止；为空时按类型配置算商户时限 */
  platformDueAt?: Date | null;
  /** 明确给定的时限（手动建单、跨班交接） */
  dueAt?: Date | null;
  dueSource?: "platform" | "merchant" | null;
  description?: string | null;
  assigneeId?: string | null;
  createdBy?: string | null;
  /** 会话处理人（默认负责人为 claimer 时用） */
  claimerId?: string | null;
};

/**
 * 建单：自动建单（origin ≠ manual）受类型 auto_create 约束；未结工单中同 dedupe_key 已存在时返回已有工单（created = false）。
 */
export async function createTicket(tx: Executor, input: CreateTicketInput, actor: Actor = systemActor(input.merchantId)): Promise<{ ticket: TicketRow | null; created: boolean }> {
  const [existing] = await tx
    .select()
    .from(schema.ticket)
    .where(and(eq(schema.ticket.merchantId, input.merchantId), eq(schema.ticket.dedupeKey, input.dedupeKey), notInArray(schema.ticket.status, CLOSED)))
    .limit(1);
  if (existing) return { ticket: existing, created: false };
  const cfg = await ticketTypeConfig(tx, input.merchantId, input.type);
  if (input.origin !== "manual" && !cfg.autoCreate) return { ticket: null, created: false };

  let assignee = input.assigneeId ?? null;
  if (!assignee) {
    if (cfg.defaultAssignee === "claimer") assignee = input.claimerId ?? null;
    if (cfg.defaultAssignee === "creator") assignee = input.createdBy ?? null;
    assignee ??= await shopLeadOrOwner(tx, input.merchantId, input.shopId);
  }

  let dueAt = input.dueAt ?? input.platformDueAt ?? null;
  let dueSource = input.dueSource ?? (input.platformDueAt ? "platform" : null);
  if (!dueAt && input.status !== "waiting") {
    dueAt = await merchantDueAt(tx, input.merchantId, cfg.merchantDue ?? null);
    dueSource = dueAt ? "merchant" : null;
  }

  const n = await nextSequence(tx, input.merchantId, "ticket", 1001);
  const [ticket] = await tx
    .insert(schema.ticket)
    .values({
      merchantId: input.merchantId,
      number: `T-${n}`,
      type: input.type,
      origin: input.origin,
      dedupeKey: input.dedupeKey,
      shopId: input.shopId,
      platform: input.platform,
      orderId: input.orderId ?? null,
      afterSaleId: input.afterSaleId ?? null,
      conversationId: input.conversationId ?? null,
      buyerName: input.buyerName ?? null,
      status: input.status ?? "open",
      waitingOn: input.status === "waiting" ? (input.waitingOn ?? "internal") : null,
      phase: input.phase ?? null,
      platformStatus: input.platformStatus ?? null,
      assigneeId: assignee,
      dueAt,
      dueSource: dueAt ? dueSource : null,
      description: input.description ?? null,
      createdBy: input.createdBy ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  if (!ticket) {
    // 并发建单撞上未结去重索引：取已存在的那张
    const [again] = await tx
      .select()
      .from(schema.ticket)
      .where(and(eq(schema.ticket.merchantId, input.merchantId), eq(schema.ticket.dedupeKey, input.dedupeKey), notInArray(schema.ticket.status, CLOSED)))
      .limit(1);
    return { ticket: again ?? null, created: false };
  }
  const source = actor.kind === "member" ? "page" : actor.kind === "webhook" ? "webhook" : "system";
  await tx.insert(schema.ticketEvent).values({
    merchantId: input.merchantId,
    ticketId: ticket.id,
    type: "created",
    actorId: actor.kind === "member" ? actor.membershipId : null,
    source,
    data: { status: ticket.status, phase: ticket.phase, platformStatus: ticket.platformStatus, assigneeId: assignee, dueAt: dueAt?.toISOString() ?? null },
  });
  await audit(actor, { module: "tickets", action: "ticket_created", summary: `${ticket.number} ${TICKET_TYPE_LABEL[ticket.type]}`, targetType: "ticket", targetId: ticket.id, data: { type: ticket.type, origin: ticket.origin } }, tx);
  if (assignee && !(actor.kind === "member" && actor.membershipId === assignee)) {
    await notify(
      {
        merchantId: input.merchantId,
        membershipIds: [assignee],
        event: "ticket_assigned",
        title: `新工单 ${ticket.number} ${TICKET_TYPE_LABEL[ticket.type]}`,
        body: [input.buyerName, ticket.phase].filter(Boolean).join(" · ") || undefined,
        link: `/tickets/${ticket.id}`,
        dedupeKey: `ticket_assigned:${ticket.id}:${assignee}`,
      },
      tx,
    );
  }
  return { ticket, created: true };
}

/**
 * 推进工单状态并写时间线；resolved 时写 resolved_at 与 EVT:ticket_resolved（带 on_time）。
 * 相同状态、阶段、时限时不写任何东西。
 */
export async function moveTicket(
  tx: Executor,
  ticket: TicketRow,
  next: { status: TicketStatus; waitingOn?: WaitingOn | null; phase?: string | null; platformStatus?: string | null; dueAt?: Date | null; dueSource?: "platform" | "merchant" | null },
  actor: Actor,
  eventType: "status" | "platform_event" = "status",
): Promise<TicketRow> {
  const waitingOn = next.status === "waiting" ? (next.waitingOn ?? ticket.waitingOn ?? "internal") : null;
  const dueAt = next.dueAt !== undefined ? next.dueAt : ticket.dueAt;
  const same =
    ticket.status === next.status &&
    ticket.waitingOn === waitingOn &&
    (next.phase === undefined || ticket.phase === next.phase) &&
    (next.platformStatus === undefined || ticket.platformStatus === next.platformStatus) &&
    (dueAt?.getTime() ?? null) === (ticket.dueAt?.getTime() ?? null);
  if (same) return ticket;
  const now = new Date();
  const resolving = next.status === "resolved" && ticket.status !== "resolved";
  const [updated] = await tx
    .update(schema.ticket)
    .set({
      status: next.status,
      waitingOn,
      phase: next.phase !== undefined ? next.phase : ticket.phase,
      platformStatus: next.platformStatus !== undefined ? next.platformStatus : ticket.platformStatus,
      dueAt,
      dueSource: next.dueAt !== undefined ? (next.dueAt ? (next.dueSource ?? ticket.dueSource) : null) : ticket.dueSource,
      resolvedAt: resolving ? now : next.status === "resolved" ? ticket.resolvedAt : null,
      remindersSent: (dueAt?.getTime() ?? null) !== (ticket.dueAt?.getTime() ?? null) ? [] : ticket.remindersSent,
      version: ticket.version + 1,
      updatedAt: now,
    })
    .where(eq(schema.ticket.id, ticket.id))
    .returning();
  // 平台事件来源一律记平台：成员处理售后后回读到的平台状态也是平台给的，成员自己的动作另有一条 action 事件
  const platformEvent = eventType === "platform_event";
  const source = platformEvent || actor.kind === "webhook" ? "webhook" : actor.kind === "member" ? "page" : "system";
  await tx.insert(schema.ticketEvent).values({
    merchantId: ticket.merchantId,
    ticketId: ticket.id,
    type: eventType,
    actorId: actor.kind === "member" && !platformEvent ? actor.membershipId : null,
    source,
    data: { from: ticket.status, fromWaitingOn: ticket.waitingOn, to: next.status, waitingOn, phase: updated.phase, platformStatus: updated.platformStatus, dueAt: dueAt?.toISOString() ?? null },
  });
  if (resolving) {
    await audit(
      actor,
      {
        module: "tickets",
        action: "ticket_resolved",
        summary: `${ticket.number} 已解决`,
        targetType: "ticket",
        targetId: ticket.id,
        data: { on_time: !ticket.dueAt || now <= ticket.dueAt, type: ticket.type, resolve_sec: Math.round((now.getTime() - ticket.createdAt.getTime()) / 1000), due_source: ticket.dueSource },
      },
      tx,
    );
  }
  return updated;
}

/** 平台类工单（退货退款、取消申请且关联售后单）的状态只随平台事件变化 */
export const platformDriven = (t: Pick<TicketRow, "type" | "afterSaleId">) => (t.type === "return_refund" || t.type === "cancel_request") && !!t.afterSaleId;
