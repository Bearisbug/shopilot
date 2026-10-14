// 会话相关定时任务（DESIGN §17）：空闲结束、草稿过期、待认领提醒、邀请过期。
import { and, eq, isNull, lt, notInArray, sql } from "drizzle-orm";
import { audit, systemActor } from "@/server/core/audit";
import { notify, shopLeads } from "@/server/core/notify";
import { db, schema } from "@/server/db/client";
import { expireOwnershipTransfers } from "@/server/settings/ownership";
import { endSegment } from "./actions";
import { supersedeDrafts, systemEvent } from "./ingest";
import { receptionContext } from "./hours";

const c = schema.conversation;

/** 11.1 idle_close：72 小时无新消息结束本段；待认领的写「超时未处理」，处理人保留供统计 */
export async function idleClose(): Promise<void> {
  const edge = new Date(Date.now() - 72 * 3600_000);
  const rows = await db()
    .select()
    .from(c)
    .where(and(notInArray(c.handlingState, ["closed"]), lt(c.lastMessageAt, edge)))
    .limit(500);
  for (const conv of rows) {
    const [updated] = await db()
      .update(c)
      .set({ handlingState: "closed", version: sql`${c.version} + 1`, updatedAt: new Date() })
      .where(and(eq(c.id, conv.id), eq(c.version, conv.version)))
      .returning();
    if (!updated) continue;
    await supersedeDrafts(db(), conv.id);
    await endSegment(conv, "idle");
    await systemEvent(db(), updated, conv.handlingState === "awaiting_human" ? "超时未处理，72 小时无新消息，会话自动结束" : "72 小时无新消息，会话自动结束");
    await audit(systemActor(conv.merchantId), { module: "workbench", action: "conversation_idle_closed", summary: `${conv.buyerName} 72 小时无新消息自动结束`, targetType: "conversation", targetId: conv.id, data: { from: conv.handlingState } });
  }
}

/** 11.2 expire：生成 24 小时未处置的草稿过期 */
export async function expireDrafts(): Promise<void> {
  await db()
    .update(schema.draft)
    .set({ status: "expired", disposedAt: new Date() })
    .where(and(eq(schema.draft.status, "generated"), lt(schema.draft.createdAt, new Date(Date.now() - 24 * 3600_000))));
}

/**
 * REQ-CONV-010：待认领超过商户设定分钟数且本段未提醒过 → 通知负责该店的组长一次（无组长时为管理员）。
 * 等待起点取最早一条未回复的买家消息。
 */
export async function remindUnclaimed(): Promise<void> {
  const rows = await db()
    .select({ conv: c, seg: schema.segment, since: sql<Date>`(select min(m.sent_at) from message m where m.conversation_id = ${c.id} and m.sender_role = 'buyer' and m.sent_at > coalesce(${c.lastAgentAt}, '-infinity'::timestamptz))` })
    .from(c)
    .innerJoin(schema.segment, eq(schema.segment.id, c.currentSegmentId))
    .where(and(eq(c.handlingState, "awaiting_human"), eq(c.buyerKind, "buyer"), isNull(schema.segment.remindedAt)))
    .limit(1000);
  const minutesOf = new Map<string, number | null>();
  for (const { conv, seg, since } of rows) {
    if (!minutesOf.has(conv.merchantId)) minutesOf.set(conv.merchantId, (await receptionContext(conv.merchantId)).unclaimedRemindMinutes);
    const minutes = minutesOf.get(conv.merchantId);
    if (!minutes || !since) continue;
    const waited = Date.now() - new Date(since).getTime();
    if (waited < minutes * 60_000) continue;
    const [claimed] = await db().update(schema.segment).set({ remindedAt: new Date() }).where(and(eq(schema.segment.id, seg.id), isNull(schema.segment.remindedAt))).returning({ id: schema.segment.id });
    if (!claimed) continue;
    await notify({
      merchantId: conv.merchantId,
      membershipIds: await shopLeads(conv.merchantId, conv.shopId),
      event: "unclaimed_timeout",
      title: `${conv.buyerName} 待认领已超过 ${minutes} 分钟`,
      body: "买家还在等回复，请安排同事认领。",
      link: `/wb/${conv.id}`,
      dedupeKey: `unclaimed:${seg.id}`,
    });
  }
}

/** 11.5 expire：过期邀请；11.11 expire：过期的所有权转让 */
export async function expireInvitations(): Promise<void> {
  const rows = await db()
    .update(schema.invitation)
    .set({ status: "expired" })
    .where(and(eq(schema.invitation.status, "pending"), lt(schema.invitation.expiresAt, new Date())))
    .returning({ id: schema.invitation.id, merchantId: schema.invitation.merchantId, email: schema.invitation.email });
  for (const r of rows) await audit(systemActor(r.merchantId), { module: "team", action: "invitation_expired", summary: `邀请 ${r.email} 已过期`, targetType: "invitation", targetId: r.id });
  await expireOwnershipTransfers();
}

