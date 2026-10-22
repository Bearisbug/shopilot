// 站内通知与邮件提醒（REQ-NOTIF-001、REQ-SET-002）：按商户通知规则投递，同一成员同一去重键 10 分钟内只建一条。
import { and, eq, gt, inArray } from "drizzle-orm";
import { db, schema, type Executor } from "../db/client";
import { env } from "../env";
import type { NotificationEvent } from "../merchants/defaults";
import { sendEmail } from "./outbox";

const TYPE_OF: Record<NotificationEvent, "conversation" | "ticket" | "shop" | "usage"> = {
  unclaimed_timeout: "conversation",
  handoff: "conversation",
  auth_expiring: "shop",
  shop_disconnected: "shop",
  platform_metric_low: "shop",
  ticket_due_soon: "ticket",
  ticket_overdue: "ticket",
  ticket_assigned: "ticket",
  usage_threshold: "usage",
  agent_autoapply_paused: "usage",
};

export async function notify(
  input: { merchantId: string; membershipIds: string[]; event: NotificationEvent; title: string; body?: string; link?: string; dedupeKey: string; forceEmail?: boolean },
  tx: Executor = db(),
) {
  const recipients = [...new Set(input.membershipIds)];
  if (recipients.length === 0) return;
  const [rule] = await tx
    .select()
    .from(schema.notificationRule)
    .where(and(eq(schema.notificationRule.merchantId, input.merchantId), eq(schema.notificationRule.event, input.event)));
  const inApp = rule?.inApp ?? true;
  const email = input.forceEmail ?? rule?.email ?? false;
  const since = new Date(Date.now() - 10 * 60_000);
  const recent = await tx
    .select({ membershipId: schema.notification.membershipId })
    .from(schema.notification)
    .where(and(inArray(schema.notification.membershipId, recipients), eq(schema.notification.dedupeKey, input.dedupeKey), gt(schema.notification.createdAt, since)));
  const skip = new Set(recent.map((r) => r.membershipId));
  const targets = recipients.filter((m) => !skip.has(m));
  if (targets.length === 0) return;
  if (inApp) {
    await tx.insert(schema.notification).values(
      targets.map((membershipId) => ({
        merchantId: input.merchantId,
        membershipId,
        type: TYPE_OF[input.event],
        event: input.event,
        title: input.title,
        body: input.body,
        link: input.link,
        dedupeKey: input.dedupeKey,
      })),
    );
  }
  if (email) {
    const users = await tx
      .select({ email: schema.user.email, name: schema.user.name })
      .from(schema.membership)
      .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
      .where(and(inArray(schema.membership.id, targets), eq(schema.membership.status, "active")));
    for (const u of users) {
      await sendEmail(
        {
          to: u.email,
          merchantId: input.merchantId,
          template: input.event.startsWith("ticket") ? "ticket_alert" : input.event === "usage_threshold" ? "usage_alert" : input.event === "auth_expiring" ? "auth_expiring" : "notification",
          subject: input.title,
          body: `${u.name}，你好：\n\n${input.title}${input.body ? `\n${input.body}` : ""}`,
          links: input.link ? [{ label: "在 Shopilot 中查看", url: `${env().APP_BASE_URL}${input.link}` }] : [],
        },
        tx,
      );
    }
  }
}

/** 负责某店的启用组长（无组长时退到管理员） */
export async function shopLeads(merchantId: string, shopId: string, tx: Executor = db()): Promise<string[]> {
  const leads = await tx
    .select({ id: schema.membership.id })
    .from(schema.membership)
    .innerJoin(schema.membershipShop, eq(schema.membershipShop.membershipId, schema.membership.id))
    .where(and(eq(schema.membership.merchantId, merchantId), eq(schema.membership.role, "lead"), eq(schema.membership.status, "active"), eq(schema.membershipShop.shopId, shopId)));
  if (leads.length) return leads.map((l) => l.id);
  return admins(merchantId, tx);
}

export async function admins(merchantId: string, tx: Executor = db()): Promise<string[]> {
  const rows = await tx
    .select({ id: schema.membership.id })
    .from(schema.membership)
    .where(and(eq(schema.membership.merchantId, merchantId), eq(schema.membership.role, "admin"), eq(schema.membership.status, "active")));
  return rows.map((r) => r.id);
}

/** 负责某店的全部启用成员（含管理员） */
export async function shopMembers(merchantId: string, shopId: string, tx: Executor = db()): Promise<string[]> {
  const scoped = await tx
    .select({ id: schema.membership.id })
    .from(schema.membership)
    .innerJoin(schema.membershipShop, eq(schema.membershipShop.membershipId, schema.membership.id))
    .where(and(eq(schema.membership.merchantId, merchantId), eq(schema.membership.status, "active"), eq(schema.membershipShop.shopId, shopId)));
  return [...new Set([...scoped.map((r) => r.id), ...(await admins(merchantId, tx))])];
}
