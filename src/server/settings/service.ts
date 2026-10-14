// 商户设置（REQ-SET-001 至 REQ-SET-005）：商户资料、通知规则、安全策略、保存期限、审计日志。
import { subDays } from "date-fns";
import { and, desc, eq, gte, isNull, sql, type SQL } from "drizzle-orm";
import {
  AUDIT_MODULE_LABEL,
  AUDIT_SOURCE_LABEL,
  type AuditItem,
  type AuditList,
  type AuditQuery,
  type DataPolicyView,
  type MerchantView,
  type NotificationRules,
  type SecurityPolicyView,
  type UpdateMerchantBody,
} from "@/contracts/settings";
import type { MemberContext } from "../auth/context";
import { ipAllowed, validIpEntry } from "../auth/ip";
import { audit } from "../core/audit";
import { db, schema } from "../db/client";
import { csv } from "../http/route";
import { Problem } from "../http/problem";
import { NOTIFICATION_EVENTS } from "../merchants/defaults";
import { inTzText, listExports } from "./data";

const HOURS_LABEL: Record<number, string> = { 8: "8 小时", 12: "12 小时", 24: "24 小时", 168: "7 天" };
const RETENTION_LABEL: Record<number, string> = { 180: "180 天", 365: "1 年", 730: "2 年" };

// ---------- 商户资料 ----------

export async function merchantView(ctx: MemberContext): Promise<MerchantView> {
  const [m] = await db().select().from(schema.merchant).where(eq(schema.merchant.id, ctx.merchant.id));
  const [owner] = await db()
    .select({ userId: schema.user.id, name: schema.user.name, email: schema.user.email, membershipId: schema.membership.id })
    .from(schema.user)
    .leftJoin(schema.membership, and(eq(schema.membership.userId, schema.user.id), eq(schema.membership.merchantId, m.id)))
    .where(eq(schema.user.id, m.ownerUserId));
  return {
    id: m.id,
    name: m.name,
    timezone: m.timezone,
    language: "zh-CN",
    billingEmail: m.billingEmail,
    owner: { userId: owner.userId, membershipId: owner.membershipId, name: owner.name, email: owner.email },
    createdAt: m.createdAt.toISOString(),
    status: m.status,
    deletion: m.status === "pending_deletion" && m.purgeAt ? { purgeAt: m.purgeAt.toISOString() } : null,
  };
}

export async function updateMerchant(ctx: MemberContext, body: UpdateMerchantBody): Promise<MerchantView> {
  const m = ctx.merchant;
  const set: Partial<typeof schema.merchant.$inferInsert> = {};
  const changes: string[] = [];
  const data: Record<string, { from: string | null; to: string | null }> = {};
  if (body.name !== undefined && body.name !== m.name) {
    set.name = body.name;
    changes.push(`商户名改为「${body.name}」`);
    data.name = { from: m.name, to: body.name };
  }
  if (body.timezone !== undefined && body.timezone !== m.timezone) {
    set.timezone = body.timezone;
    changes.push(`默认时区改为 ${body.timezone}`);
    data.timezone = { from: m.timezone, to: body.timezone };
  }
  if (body.billingEmail !== undefined && body.billingEmail !== m.billingEmail) {
    set.billingEmail = body.billingEmail;
    changes.push(body.billingEmail ? `账单邮箱改为 ${body.billingEmail}` : "清空账单邮箱");
    data.billingEmail = { from: m.billingEmail, to: body.billingEmail };
  }
  if (changes.length) {
    await db().transaction(async (tx) => {
      await tx.update(schema.merchant).set({ ...set, updatedAt: new Date() }).where(eq(schema.merchant.id, m.id));
      await audit(ctx.actor, { module: "settings", action: "merchant_profile_updated", summary: changes.join("；"), targetType: "merchant", targetId: m.id, data }, tx);
    });
  }
  return merchantView(ctx);
}

// ---------- 通知规则 ----------

export async function notificationRules(ctx: MemberContext): Promise<NotificationRules> {
  const rows = await db().select().from(schema.notificationRule).where(eq(schema.notificationRule.merchantId, ctx.merchant.id));
  return {
    rules: NOTIFICATION_EVENTS.map((e) => {
      const row = rows.find((r) => r.event === e.event);
      return { event: e.event, inApp: row?.inApp ?? e.inApp, email: row?.email ?? e.email };
    }),
  };
}

export async function updateNotificationRules(ctx: MemberContext, body: NotificationRules): Promise<NotificationRules> {
  const before = await notificationRules(ctx);
  const changes: string[] = [];
  for (const rule of body.rules) {
    const old = before.rules.find((r) => r.event === rule.event);
    const label = NOTIFICATION_EVENTS.find((e) => e.event === rule.event)?.label ?? rule.event;
    if (old && old.inApp !== rule.inApp) changes.push(`${label} · 站内${rule.inApp ? "开" : "关"}`);
    if (old && old.email !== rule.email) changes.push(`${label} · 邮件${rule.email ? "开" : "关"}`);
  }
  if (changes.length) {
    await db().transaction(async (tx) => {
      for (const rule of body.rules) {
        await tx
          .insert(schema.notificationRule)
          .values({ merchantId: ctx.merchant.id, event: rule.event, inApp: rule.inApp, email: rule.email })
          .onConflictDoUpdate({ target: [schema.notificationRule.merchantId, schema.notificationRule.event], set: { inApp: rule.inApp, email: rule.email } });
      }
      await audit(ctx.actor, { module: "settings", action: "notification_rules_updated", summary: `通知规则：${changes.join("、")}`, data: { changes } }, tx);
    });
  }
  return notificationRules(ctx);
}

// ---------- 安全策略 ----------

export function securityPolicy(ctx: MemberContext): SecurityPolicyView {
  return ctx.merchant.securityPolicy;
}

export async function updateSecurityPolicy(ctx: MemberContext, body: SecurityPolicyView): Promise<SecurityPolicyView> {
  const list = [...new Set(body.ipAllowlist.map((e) => e.trim()).filter(Boolean))];
  const bad = list.filter((e) => !validIpEntry(e));
  if (bad.length) {
    throw new Problem("validation", { detail: `这些条目不是合法的 IP 或网段：${bad.join("、")}`, extra: { fields: { ipAllowlist: `格式不对：${bad.join("、")}` } } });
  }
  if (body.ipRestrictionOn && !ipAllowed(ctx.ip, list)) {
    throw new Problem("validation", {
      title: "白名单不含你当前的 IP",
      detail: `你当前的 IP 是 ${ctx.ip}，新白名单不含它，保存后你会被挡在外面。先把它加进白名单再保存。`,
      code: "ip_self_lockout",
      extra: { currentIp: ctx.ip, fields: { ipAllowlist: `不含你当前的 IP ${ctx.ip}` } },
    });
  }
  const next: SecurityPolicyView = { ...body, ipAllowlist: list };
  const prev = ctx.merchant.securityPolicy;
  const changes: string[] = [];
  if (prev.requireTwoFactorAdmins !== next.requireTwoFactorAdmins) changes.push(next.requireTwoFactorAdmins ? "要求管理员开启两步验证" : "不再要求管理员开启两步验证");
  if (prev.requireTwoFactorAll !== next.requireTwoFactorAll) changes.push(next.requireTwoFactorAll ? "要求全员开启两步验证" : "不再要求全员开启两步验证");
  if (prev.sessionMaxHours !== next.sessionMaxHours) changes.push(`登录有效期改为 ${HOURS_LABEL[next.sessionMaxHours]}`);
  if (prev.ipRestrictionOn !== next.ipRestrictionOn) changes.push(next.ipRestrictionOn ? "开启 IP 限制" : "关闭 IP 限制");
  if (prev.ipAllowlist.join(",") !== next.ipAllowlist.join(",")) changes.push(`IP 白名单改为 ${next.ipAllowlist.length} 条`);
  if (changes.length) {
    await db().transaction(async (tx) => {
      await tx.update(schema.merchant).set({ securityPolicy: next, updatedAt: new Date() }).where(eq(schema.merchant.id, ctx.merchant.id));
      await audit(ctx.actor, { module: "settings", action: "security_policy_updated", summary: changes.join("；"), targetType: "merchant", targetId: ctx.merchant.id, data: { from: prev, to: next } }, tx);
    });
  }
  return next;
}

// ---------- 数据保存期限 ----------

export async function dataPolicy(ctx: MemberContext): Promise<DataPolicyView> {
  return {
    retentionDays: ctx.merchant.retentionDays,
    lastPurgeAt: ctx.merchant.lastPurgeAt?.toISOString() ?? null,
    exports: await listExports(ctx.merchant.id),
  };
}

export async function updateDataPolicy(ctx: MemberContext, body: { retentionDays: 180 | 365 | 730 }): Promise<DataPolicyView> {
  const prev = ctx.merchant.retentionDays;
  if (prev !== body.retentionDays) {
    await db().transaction(async (tx) => {
      await tx.update(schema.merchant).set({ retentionDays: body.retentionDays, updatedAt: new Date() }).where(eq(schema.merchant.id, ctx.merchant.id));
      await audit(ctx.actor, { module: "settings", action: "retention_updated", summary: `数据保存期限改为 ${RETENTION_LABEL[body.retentionDays]}`, targetType: "merchant", targetId: ctx.merchant.id, data: { from: prev, to: body.retentionDays } }, tx);
    });
  }
  return { retentionDays: body.retentionDays, lastPurgeAt: ctx.merchant.lastPurgeAt?.toISOString() ?? null, exports: await listExports(ctx.merchant.id) };
}

// ---------- 审计日志 ----------

const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;
const a = schema.auditLog;

/** 游标 = 最后一行的（created_at 微秒精度文本, id），按 (created_at, id) 行值比较翻页 */
const cursorTs = sql<string>`to_char(${a.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

function encodeCursor(row: { ts: string; id: string }) {
  return Buffer.from(`${row.ts}|${row.id}`).toString("base64url");
}

function decodeCursor(cursor: string): { ts: string; id: string } {
  const [ts, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (!ts || !id || Number.isNaN(new Date(ts).getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) throw new Problem("validation", { detail: "分页参数无效，请刷新后重试。" });
  return { ts, id };
}

export async function auditLogs(ctx: MemberContext, query: AuditQuery): Promise<AuditList | Response> {
  const where: SQL[] = [eq(a.merchantId, ctx.merchant.id), gte(a.createdAt, subDays(new Date(), RANGE_DAYS[query.range]))];
  if (query.module) where.push(eq(a.module, query.module));
  if (query.actor === "system" || query.actor === "webhook") where.push(eq(a.actorSource, query.actor), isNull(a.actorMembershipId));
  else if (query.actor) where.push(eq(a.actorMembershipId, query.actor));

  if (query.format === "csv") {
    const rows = await db().select().from(a).where(and(...where)).orderBy(desc(a.createdAt), desc(a.id)).limit(10_001);
    const tz = ctx.merchant.timezone;
    return csv(`审计日志-${inTzText(new Date(), tz, "yyyyMMdd")}.csv`, [
      ["时间", "操作人", "来源", "模块", "动作", "操作", "对象类型", "对象 ID"],
      ...rows.map((r) => [inTzText(r.createdAt, tz, "yyyy-MM-dd HH:mm:ss"), r.actorName, AUDIT_SOURCE_LABEL[r.actorSource], AUDIT_MODULE_LABEL[r.module], r.action, r.summary, r.targetType, r.targetId]),
    ]);
  }

  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    where.push(sql`(${a.createdAt}, ${a.id}) < (${c.ts}::timestamptz, ${c.id}::uuid)`);
  }
  const rows = await db().select({ r: a, ts: cursorTs }).from(a).where(and(...where)).orderBy(desc(a.createdAt), desc(a.id)).limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const items: AuditItem[] = page.map(({ r }) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    actorName: r.actorName,
    actorSource: r.actorSource,
    module: r.module,
    action: r.action,
    summary: r.summary,
    targetType: r.targetType,
    targetId: r.targetId,
  }));
  const last = page[page.length - 1];
  return { items, nextCursor: rows.length > query.limit ? encodeCursor({ ts: last.ts, id: last.r.id }) : null };
}
