// 工单定时任务（DESIGN §11.4、§17）：ticket.scan 到期提醒与超时通知；ticket.auto_close 已解决 N 天后关闭；handover.scan 下班时给未回复的处理中会话建跨班交接单。
// `pnpm job` 手动触发时可传 `{ merchantId }` 只处理该商户；handover.scan 另可传 `{ force: true }` 跳过「刚下班」时间窗。
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { audit, systemActor } from "@/server/core/audit";
import { notify, shopLeads } from "@/server/core/notify";
import { isInHours, receptionContext } from "@/server/conversations/hours";
import { db, schema } from "@/server/db/client";
import { DEFAULT_TICKET_TYPES } from "@/server/merchants/defaults";
import { createTicket, TICKET_TYPE_LABEL } from "./engine";
import { OPEN_STATUSES } from "./scope";

const t = schema.ticket;
const BATCH = 1000;
/** 上一次扫描的时刻：调度每 15 分钟一次，多留 5 分钟容忍调度抖动；重复命中由去重键与 handover_ticketed 兜住 */
const HANDOVER_LOOKBACK_MS = 20 * 60_000;

function log(line: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", ...line }));
}

const only = (data: Record<string, unknown> | null) => (typeof data?.merchantId === "string" ? data.merchantId : undefined);

/** 提醒时刻：平台来源按「截止前 N 小时」，商户来源按「剩余 N%」（以建单时刻为起点）；配置缺失时不提醒 */
export function remindAt(ticket: { dueAt: Date; createdAt: Date }, remind: { hoursBefore?: number; remainingPercent?: number }): Date | null {
  if (remind.hoursBefore) return new Date(ticket.dueAt.getTime() - remind.hoursBefore * 3600_000);
  if (remind.remainingPercent) {
    const span = Math.max(0, ticket.dueAt.getTime() - ticket.createdAt.getTime());
    return new Date(ticket.dueAt.getTime() - (span * remind.remainingPercent) / 100);
  }
  return null;
}

// ---------- ticket.scan ----------

export async function ticketScan(data: Record<string, unknown> | null = {}): Promise<void> {
  const now = new Date();
  const merchantId = only(data);
  const rows = await db()
    .select({ ticket: t, remind: schema.ticketTypeConfig.remind })
    .from(t)
    .innerJoin(schema.merchant, eq(schema.merchant.id, t.merchantId))
    .leftJoin(schema.ticketTypeConfig, and(eq(schema.ticketTypeConfig.merchantId, t.merchantId), eq(schema.ticketTypeConfig.type, t.type)))
    .where(
      and(
        eq(schema.merchant.status, "active"),
        merchantId ? eq(t.merchantId, merchantId) : undefined,
        inArray(t.status, [...OPEN_STATUSES]),
        isNotNull(t.dueAt),
        sql`not (${t.remindersSent} @> '["overdue"]'::jsonb)`,
      ),
    )
    .orderBy(asc(t.dueAt))
    .limit(BATCH);

  let reminded = 0;
  let overdue = 0;
  for (const { ticket, remind } of rows) {
    const dueAt = ticket.dueAt!;
    const sent = ticket.remindersSent ?? [];
    let kind: "overdue" | "remind" | null = null;
    if (now > dueAt) kind = "overdue";
    else if (!sent.includes("remind")) {
      const at = remindAt({ dueAt, createdAt: ticket.createdAt }, remind ?? DEFAULT_TICKET_TYPES.find((d) => d.type === ticket.type)!.remind);
      if (at && now >= at) kind = "remind";
    }
    if (!kind) continue;

    await db().transaction(async (tx) => {
      // 以 due_at 为条件更新：扫描期间时限被改过就跳过，留给下一轮按新时限判断
      const [marked] = await tx
        .update(t)
        .set({ remindersSent: sql`${t.remindersSent} || ${JSON.stringify([kind])}::jsonb` })
        .where(and(eq(t.id, ticket.id), eq(t.dueAt, dueAt), inArray(t.status, [...OPEN_STATUSES])))
        .returning({ id: t.id });
      if (!marked) return;
      const label = `${ticket.number} ${TICKET_TYPE_LABEL[ticket.type]}`;
      const actor = systemActor(ticket.merchantId);
      if (kind === "remind") {
        if (ticket.assigneeId) {
          await notify(
            {
              merchantId: ticket.merchantId,
              membershipIds: [ticket.assigneeId],
              event: "ticket_due_soon",
              title: `工单 ${label} 即将到期`,
              body: ticket.buyerName ?? undefined,
              link: `/tickets/${ticket.id}`,
              dedupeKey: `ticket_due_soon:${ticket.id}:${dueAt.getTime()}`,
            },
            tx,
          );
        }
        await audit(actor, { module: "tickets", action: "ticket_due_soon", summary: `${label} 即将到期`, targetType: "ticket", targetId: ticket.id, data: { type: ticket.type } }, tx);
        reminded += 1;
      } else {
        const leads = await shopLeads(ticket.merchantId, ticket.shopId, tx);
        await notify(
          {
            merchantId: ticket.merchantId,
            membershipIds: [...(ticket.assigneeId ? [ticket.assigneeId] : []), ...leads],
            event: "ticket_overdue",
            title: `工单 ${label} 已超时`,
            body: ticket.buyerName ?? undefined,
            link: `/tickets/${ticket.id}`,
            dedupeKey: `ticket_overdue:${ticket.id}:${dueAt.getTime()}`,
          },
          tx,
        );
        await audit(actor, { module: "tickets", action: "ticket_overdue", summary: `${label} 已超时`, targetType: "ticket", targetId: ticket.id, data: { type: ticket.type, due_source: ticket.dueSource } }, tx);
        overdue += 1;
      }
    });
  }
  log({ job: "ticket.scan", scanned: rows.length, reminded, overdue });
}

// ---------- ticket.auto_close ----------

export async function ticketAutoClose(data: Record<string, unknown> | null = {}): Promise<void> {
  const merchantId = only(data);
  const rows = await db()
    .select({ id: t.id, merchantId: t.merchantId, version: t.version, days: schema.merchant.ticketAutoCloseDays })
    .from(t)
    .innerJoin(schema.merchant, eq(schema.merchant.id, t.merchantId))
    .where(
      and(
        eq(schema.merchant.status, "active"),
        merchantId ? eq(t.merchantId, merchantId) : undefined,
        eq(t.status, "resolved"),
        isNotNull(schema.merchant.ticketAutoCloseDays),
        sql`${t.resolvedAt} < now() - make_interval(days => ${schema.merchant.ticketAutoCloseDays})`,
      ),
    )
    .orderBy(asc(t.resolvedAt))
    .limit(BATCH);
  let closed = 0;
  for (const r of rows) {
    await db().transaction(async (tx) => {
      const now = new Date();
      const [done] = await tx
        .update(t)
        .set({ status: "closed", closedAt: now, version: r.version + 1, updatedAt: now })
        .where(and(eq(t.id, r.id), eq(t.status, "resolved")))
        .returning({ id: t.id });
      if (!done) return;
      await tx.insert(schema.ticketEvent).values({ merchantId: r.merchantId, ticketId: r.id, type: "status", source: "system", data: { from: "resolved", to: "closed", autoCloseDays: r.days } });
      closed += 1;
    });
  }
  log({ job: "ticket.auto_close", closed });
}

// ---------- handover.scan ----------

export async function handoverScan(data: Record<string, unknown> | null = {}): Promise<void> {
  const force = data?.force === true;
  const merchantId = only(data);
  const now = new Date();
  const merchants = await db()
    .select({ id: schema.merchant.id })
    .from(schema.merchant)
    .where(and(eq(schema.merchant.status, "active"), merchantId ? eq(schema.merchant.id, merchantId) : undefined));
  let created = 0;
  let hit = 0;
  for (const m of merchants) {
    const rc = await receptionContext(m.id);
    if (!force && !(isInHours(rc, new Date(now.getTime() - HANDOVER_LOOKBACK_MS)) && !isInHours(rc, now))) continue;
    hit += 1;
    const c = schema.conversation;
    const seg = schema.segment;
    const late = new Date(now.getTime() - rc.responseSlaMinutes * 60_000);
    const convs = await db()
      .select({ conv: c, segmentId: seg.id })
      .from(c)
      .innerJoin(seg, eq(seg.id, c.currentSegmentId))
      .where(
        and(
          eq(c.merchantId, m.id),
          eq(c.handlingState, "human"),
          eq(c.buyerKind, "buyer"),
          isNotNull(c.lastBuyerAt),
          sql`(${c.lastAgentAt} is null or ${c.lastBuyerAt} > ${c.lastAgentAt})`,
          sql`${c.lastBuyerAt} < ${late}`,
          sql`${seg.endedAt} is null`,
          eq(seg.handoverTicketed, false),
        ),
      )
      .limit(BATCH);
    for (const { conv, segmentId } of convs) {
      await db().transaction(async (tx) => {
        const res = await createTicket(
          tx,
          {
            merchantId: m.id,
            type: "handover",
            origin: "rule",
            dedupeKey: `handover:${conv.id}`,
            shopId: conv.shopId,
            platform: conv.platform,
            conversationId: conv.id,
            buyerName: conv.buyerName,
            description: "下班时最后一条是买家消息，已超接待时限",
            claimerId: conv.claimedBy,
          },
          systemActor(m.id),
        );
        // 类型关掉了自动建单时不置位，之后打开仍能在下次下班时建单
        if (!res.ticket) return;
        await tx.update(seg).set({ handoverTicketed: true }).where(eq(seg.id, segmentId));
        if (res.created) created += 1;
      });
    }
  }
  log({ job: "handover.scan", merchants: hit, created });
}
