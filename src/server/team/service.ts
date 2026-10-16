// 团队与成员（REQ-TEAM-001 至 REQ-TEAM-006）。
import { addDays, startOfWeek, subDays, subWeeks } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { and, count, desc, eq, gt, gte, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import type { InvitationPreview, InviteBody, InviteResult, LoginEventRow, MemberOption, MembersResponse } from "@/contracts/team";
import { auth } from "../auth/auth";
import type { MemberContext } from "../auth/context";
import { audit } from "../core/audit";
import { randomToken, sha256 } from "../core/crypto";
import { notify } from "../core/notify";
import { sendEmail } from "../core/outbox";
import { db, schema, type Tx } from "../db/client";
import { env } from "../env";
import { conflict, notAllowed, notFound, Problem } from "../http/problem";
import { plan } from "../billing/plans";
import { firstReplyStats } from "../dashboard/service";
import { systemEvent } from "../conversations/ingest";
import { queueFeishuCard } from "../feishu/deliver";
import { ROLE_LABEL } from "@/lib/permissions";

const m = schema.membership;
const INVITE_DAYS = 7;

function periodStart(tz: string, period: "week" | "last_week" | "30d"): { from: Date; to: Date } {
  const now = new TZDate(new Date(), tz);
  if (period === "30d") return { from: subDays(now, 30), to: now };
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  return period === "week" ? { from: weekStart, to: now } : { from: subWeeks(weekStart, 1), to: weekStart };
}

async function memberOf(ctx: MemberContext, membershipId: string) {
  const [row] = await db()
    .select({ membership: m, user: schema.user })
    .from(m)
    .innerJoin(schema.user, eq(schema.user.id, m.userId))
    .where(and(eq(m.id, membershipId), eq(m.merchantId, ctx.merchant.id)));
  if (!row) throw notFound();
  return row;
}

async function seatUsage(merchantId: string, tx: Tx | ReturnType<typeof db> = db()) {
  const [active] = await tx.select({ n: count() }).from(m).where(and(eq(m.merchantId, merchantId), eq(m.status, "active")));
  const [pending] = await tx
    .select({ n: count() })
    .from(schema.invitation)
    .where(and(eq(schema.invitation.merchantId, merchantId), eq(schema.invitation.status, "pending")));
  const [sub] = await tx.select({ planCode: schema.subscription.planCode }).from(schema.subscription).where(eq(schema.subscription.merchantId, merchantId));
  return { used: active.n + pending.n, active: active.n, limit: plan(sub?.planCode ?? "basic").seatLimit };
}

export async function listMembers(ctx: MemberContext, query: { role: string; status: string; period: "week" | "last_week" | "30d" }): Promise<MembersResponse> {
  const { from, to } = periodStart(ctx.merchant.timezone, query.period);
  const rows = await db()
    .select({ membership: m, user: schema.user })
    .from(m)
    .innerJoin(schema.user, eq(schema.user.id, m.userId))
    .where(eq(m.merchantId, ctx.merchant.id))
    .orderBy(sql`case ${m.role} when 'admin' then 0 when 'lead' then 1 else 2 end`, schema.user.name);
  const shopRows = await db()
    .select({ membershipId: schema.membershipShop.membershipId, shopId: schema.membershipShop.shopId })
    .from(schema.membershipShop)
    .innerJoin(m, eq(m.id, schema.membershipShop.membershipId))
    .where(eq(m.merchantId, ctx.merchant.id));
  const stats = await db()
    .select({ membershipId: schema.segment.firstClaimedBy, segments: count() })
    .from(schema.segment)
    .where(and(eq(schema.segment.merchantId, ctx.merchant.id), eq(schema.segment.backfilled, false), gte(schema.segment.startedAt, from), lt(schema.segment.startedAt, to), isNotNull(schema.segment.firstClaimedBy)))
    .groupBy(schema.segment.firstClaimedBy);
  const transfers = await db()
    .select({ actor: schema.auditLog.actorMembershipId, n: count() })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.merchantId, ctx.merchant.id), eq(schema.auditLog.action, "conversation_transferred"), gte(schema.auditLog.createdAt, from), lt(schema.auditLog.createdAt, to)))
    .groupBy(schema.auditLog.actorMembershipId);
  // 首响与看板同口径（DESIGN §3 指标口径补充）：总体含平台后台回复，成员只算 Shopilot 成员的回复
  const replies = await firstReplyStats(ctx, { start: from, end: to });
  const [waiting] = await db()
    .select({ oldest: sql<string | null>`min(${schema.conversation.lastBuyerAt})` })
    .from(schema.conversation)
    .where(and(eq(schema.conversation.merchantId, ctx.merchant.id), eq(schema.conversation.handlingState, "awaiting_human")));
  const invites = await db()
    .select({ inv: schema.invitation, inviter: schema.user.name })
    .from(schema.invitation)
    .leftJoin(m, eq(m.id, schema.invitation.invitedBy))
    .leftJoin(schema.user, eq(schema.user.id, m.userId))
    .where(and(eq(schema.invitation.merchantId, ctx.merchant.id), inArray(schema.invitation.status, ["pending", "expired"])))
    .orderBy(desc(schema.invitation.createdAt));
  const recent = await db()
    .select({ id: schema.auditLog.id, summary: schema.auditLog.summary, actorName: schema.auditLog.actorName, createdAt: schema.auditLog.createdAt, action: schema.auditLog.action })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.merchantId, ctx.merchant.id), eq(schema.auditLog.module, "team")))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(8);
  const seats = await seatUsage(ctx.merchant.id);
  const now = Date.now();
  // 在线 = 有未过期的登录会话且 5 分钟内活跃；停用会删掉会话，重新启用后不会因为旧的活跃时间显示在线
  const live = await db()
    .selectDistinct({ userId: schema.session.userId })
    .from(schema.session)
    .where(and(eq(schema.session.activeMerchantId, ctx.merchant.id), gt(schema.session.expiresAt, new Date(now))));
  const liveUsers = new Set(live.map((x) => x.userId));

  let members = rows.map(({ membership, user }) => {
    const st = stats.find((s) => s.membershipId === membership.id);
    const own = replies.byPerson.get(membership.id);
    const online = Boolean(membership.status === "active" && liveUsers.has(user.id) && membership.lastSeenAt && now - membership.lastSeenAt.getTime() < 5 * 60_000);
    return {
      membershipId: membership.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      role: membership.role,
      isOwner: ctx.merchant.ownerUserId === user.id,
      status: membership.status,
      shopIds: shopRows.filter((s) => s.membershipId === membership.id).map((s) => s.shopId),
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      lastSeenAt: membership.lastSeenAt?.toISOString() ?? null,
      online,
      handled: { segments: st?.segments ?? 0, transferred: transfers.find((t) => t.actor === membership.id)?.n ?? 0, firstReplyMedianSec: own === null || own === undefined ? null : Math.round(own) },
    };
  });
  const activeCount = members.filter((x) => x.status === "active").length;
  const onlineCount = members.filter((x) => x.online).length;
  const disabledCount = members.length - activeCount;
  if (query.role !== "all") members = members.filter((x) => x.role === query.role);
  if (query.status === "active" || query.status === "disabled") members = members.filter((x) => x.status === query.status);
  if (query.status === "invited") members = [];

  return {
    members,
    invitations: query.status === "all" || query.status === "invited"
      ? invites
          .filter(({ inv }) => query.role === "all" || inv.role === query.role)
          .map(({ inv, inviter }) => ({ id: inv.id, email: inv.email, role: inv.role, shopIds: inv.shopIds, status: inv.status as "pending" | "expired", expiresAt: inv.expiresAt.toISOString(), invitedByName: inviter, createdAt: inv.createdAt.toISOString() }))
      : [],
    stats: {
      onlineCount,
      activeCount,
      disabledCount,
      firstReplyMedianSec: replies.median,
      longestWaitingSec: waiting?.oldest ? Math.round((now - new Date(waiting.oldest).getTime()) / 1000) : null,
      periodStart: from.toISOString(),
    },
    seats: { used: seats.used, limit: seats.limit },
    recent: recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  };
}

async function validShopIds(merchantId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db()
    .select({ id: schema.shop.id })
    .from(schema.shop)
    .where(and(eq(schema.shop.merchantId, merchantId), inArray(schema.shop.id, ids)));
  if (rows.length !== new Set(ids).size) throw new Problem("validation", { detail: "所选店铺不属于这个商户或已删除。" });
  return rows.map((r) => r.id);
}

function inviteLink(token: string) {
  return `${env().APP_BASE_URL}/invite/${token}`;
}

async function emailInvitation(tx: Tx, ctx: MemberContext, email: string, role: "admin" | "lead" | "agent", link: string, invitationId: string) {
  await sendEmail(
    {
      to: email,
      merchantId: ctx.merchant.id,
      template: "invitation",
      subject: `${ctx.user.name} 邀请你加入「${ctx.merchant.name}」的 Shopilot`,
      body: `你好：\n\n${ctx.user.name} 邀请你以${ROLE_LABEL[role]}身份加入「${ctx.merchant.name}」。链接 ${INVITE_DAYS} 天内有效。`,
      links: [{ label: "接受邀请", url: link }],
      refType: "invitation",
      refId: invitationId,
    },
    tx,
  );
}

export async function invite(ctx: MemberContext, body: InviteBody): Promise<InviteResult> {
  const emails = [...new Set(body.emails.map((e) => e.toLowerCase()))];
  const shopIds = body.role === "admin" ? [] : await validShopIds(ctx.merchant.id, body.shopIds);
  return db().transaction(async (tx) => {
    const existing = await tx
      .select({ email: schema.user.email })
      .from(m)
      .innerJoin(schema.user, eq(schema.user.id, m.userId))
      .where(and(eq(m.merchantId, ctx.merchant.id), inArray(schema.user.email, emails)));
    if (existing.length) {
      throw new Problem("duplicate", { detail: `${existing.map((e) => e.email).join("、")} 已经是这个商户的成员。`, code: "already_member", extra: { emails: existing.map((e) => e.email) } });
    }
    const pending = await tx
      .select({ email: schema.invitation.email })
      .from(schema.invitation)
      .where(and(eq(schema.invitation.merchantId, ctx.merchant.id), eq(schema.invitation.status, "pending"), inArray(schema.invitation.email, emails)));
    if (pending.length) {
      throw new Problem("duplicate", { detail: `${pending.map((e) => e.email).join("、")} 已有待接受的邀请，可在成员列表里重发。`, code: "already_invited", extra: { emails: pending.map((e) => e.email) } });
    }
    const seats = await seatUsage(ctx.merchant.id, tx);
    if (seats.used + emails.length > seats.limit) throw notAllowed(`当前套餐最多 ${seats.limit} 个席位，已用 ${seats.used} 个（含待接受的邀请）。`, "seat_limit");
    const [sentToday] = await tx
      .select({ n: count() })
      .from(schema.invitation)
      .where(and(eq(schema.invitation.merchantId, ctx.merchant.id), gte(schema.invitation.createdAt, subDays(new Date(), 1))));
    if (sentToday.n + emails.length > 100) throw new Problem("rate-limited", { detail: "每个商户每天最多发 100 封邀请。" });

    const items: InviteResult["items"] = [];
    for (const email of emails) {
      const token = randomToken();
      const expiresAt = addDays(new Date(), INVITE_DAYS);
      const [row] = await tx
        .insert(schema.invitation)
        .values({ merchantId: ctx.merchant.id, email, role: body.role, shopIds, tokenHash: sha256(token), expiresAt, invitedBy: ctx.membership.id })
        .returning();
      const link = inviteLink(token);
      await emailInvitation(tx, ctx, email, body.role, link, row.id);
      await audit(ctx.actor, { module: "team", action: "member_invited", summary: `邀请 ${email} 为${ROLE_LABEL[body.role]}`, targetType: "invitation", targetId: row.id, data: { role: body.role, shop_count: shopIds.length } }, tx);
      items.push({ id: row.id, email, link, expiresAt: expiresAt.toISOString() });
    }
    return { items };
  });
}

export async function resendInvitation(ctx: MemberContext, id: string) {
  return db().transaction(async (tx) => {
    const [inv] = await tx.select().from(schema.invitation).where(and(eq(schema.invitation.id, id), eq(schema.invitation.merchantId, ctx.merchant.id)));
    if (!inv) throw notFound();
    if (inv.status === "accepted") throw conflict("这个邀请已被接受。");
    if (inv.status === "revoked") throw conflict("这个邀请已撤销，请重新邀请。");
    const token = randomToken();
    const expiresAt = addDays(new Date(), INVITE_DAYS);
    await tx.update(schema.invitation).set({ tokenHash: sha256(token), expiresAt, status: "pending" }).where(eq(schema.invitation.id, id));
    const link = inviteLink(token);
    await emailInvitation(tx, ctx, inv.email, inv.role, link, inv.id);
    await audit(ctx.actor, { module: "team", action: "invitation_resent", summary: `重发邀请给 ${inv.email}`, targetType: "invitation", targetId: id }, tx);
    return { link, expiresAt: expiresAt.toISOString() };
  });
}

export async function revokeInvitation(ctx: MemberContext, id: string) {
  const [inv] = await db().select().from(schema.invitation).where(and(eq(schema.invitation.id, id), eq(schema.invitation.merchantId, ctx.merchant.id)));
  if (!inv) throw notFound();
  if (inv.status === "revoked") return { ok: true };
  if (inv.status === "accepted") throw conflict("这个邀请已被接受，不能撤销；需要时请停用该成员。");
  await db().update(schema.invitation).set({ status: "revoked" }).where(eq(schema.invitation.id, id));
  await audit(ctx.actor, { module: "team", action: "invitation_revoked", summary: `撤销给 ${inv.email} 的邀请`, targetType: "invitation", targetId: id });
  return { ok: true };
}

async function invitationByToken(token: string) {
  const [inv] = await db().select().from(schema.invitation).where(eq(schema.invitation.tokenHash, sha256(token)));
  if (!inv) throw new Problem("expired", { detail: "邀请链接无效，请联系管理员重新邀请。", code: "invalid" });
  if (inv.status === "revoked") throw new Problem("expired", { detail: "这个邀请已撤销，请联系管理员重发。", code: "revoked" });
  if (inv.status === "accepted") throw new Problem("expired", { detail: "这个邀请已经用过了，直接登录即可。", code: "used" });
  if (inv.status === "expired" || inv.expiresAt < new Date()) throw new Problem("expired", { detail: "邀请已过期（7 天有效），请联系管理员重发。", code: "expired" });
  return inv;
}

export async function previewInvitation(token: string, loggedInEmail: string | null): Promise<InvitationPreview> {
  const inv = await invitationByToken(token);
  const [merchant] = await db().select({ name: schema.merchant.name }).from(schema.merchant).where(eq(schema.merchant.id, inv.merchantId));
  const [inviter] = inv.invitedBy
    ? await db().select({ name: schema.user.name }).from(m).innerJoin(schema.user, eq(schema.user.id, m.userId)).where(eq(m.id, inv.invitedBy))
    : [];
  const shops = inv.shopIds.length ? await db().select({ name: schema.shop.name }).from(schema.shop).where(inArray(schema.shop.id, inv.shopIds)) : [];
  const [account] = await db().select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, inv.email));
  return { merchantName: merchant.name, inviterName: inviter?.name ?? null, email: inv.email, role: inv.role, shopNames: shops.map((s) => s.name), accountExists: Boolean(account), loggedInEmail };
}

/** 接受邀请：新邮箱建账号并登录；已有账号须以该邮箱登录。返回需要转发给浏览器的 Set-Cookie。 */
export async function acceptInvitation(req: Request, input: { token: string; name?: string; password?: string }, session: { userId: string; email: string; sessionId: string } | null, requestId: string) {
  const inv = await invitationByToken(input.token);
  const [account] = await db().select().from(schema.user).where(eq(schema.user.email, inv.email));
  const cookies: string[] = [];
  let userId: string;
  let userName: string;
  if (account) {
    if (!session) throw new Problem("unauthenticated", { detail: "这个邮箱已有 Shopilot 账号，请先登录再接受邀请。", code: "login_required" });
    if (session.email !== inv.email) throw new Problem("forbidden", { detail: `当前登录的是 ${session.email}，邀请发给的是 ${inv.email}。请退出后用受邀邮箱登录。`, code: "email_mismatch" });
    userId = account.id;
    userName = account.name;
  } else {
    if (!input.name || !input.password) throw new Problem("validation", { detail: "请填写姓名和密码。", extra: { fields: { ...(input.name ? {} : { name: "请填写姓名" }), ...(input.password ? {} : { password: "密码至少 10 位" }) } } });
    const res = await auth().api.signUpEmail({ body: { email: inv.email, password: input.password, name: input.name }, headers: req.headers, asResponse: true });
    if (!res.ok) throw new Problem("validation", { detail: "账号创建失败，请检查密码。" });
    cookies.push(...res.headers.getSetCookie());
    const created = (await res.json()) as { user: { id: string; name: string } };
    userId = created.user.id;
    userName = created.user.name;
  }
  const membership = await db().transaction(async (tx) => {
    const updated = await tx.update(schema.invitation).set({ status: "accepted", acceptedAt: new Date() }).where(and(eq(schema.invitation.id, inv.id), eq(schema.invitation.status, "pending"))).returning({ id: schema.invitation.id });
    if (updated.length === 0) throw new Problem("expired", { detail: "这个邀请已经用过了。", code: "used" });
    const [existing] = await tx.select().from(m).where(and(eq(m.merchantId, inv.merchantId), eq(m.userId, userId)));
    if (existing) throw new Problem("duplicate", { detail: "你已经是这个商户的成员。" });
    const [row] = await tx.insert(m).values({ merchantId: inv.merchantId, userId, role: inv.role }).returning();
    if (inv.role !== "admin" && inv.shopIds.length) {
      const live = await tx.select({ id: schema.shop.id }).from(schema.shop).where(and(eq(schema.shop.merchantId, inv.merchantId), inArray(schema.shop.id, inv.shopIds)));
      if (live.length) await tx.insert(schema.membershipShop).values(live.map((s) => ({ membershipId: row.id, shopId: s.id })));
    }
    await tx.update(schema.session).set({ activeMerchantId: inv.merchantId }).where(eq(schema.session.userId, userId));
    const hours = Math.round((Date.now() - inv.createdAt.getTime()) / 3600_000);
    await audit(
      { kind: "member", merchantId: inv.merchantId, membershipId: row.id, userId, name: userName, requestId },
      { module: "team", action: "invitation_accepted", summary: `${userName} 接受邀请，成为${ROLE_LABEL[inv.role]}`, targetType: "membership", targetId: row.id, data: { role: inv.role, hours_to_accept: hours } },
      tx,
    );
    return row;
  });
  return { membership: { id: membership.id, merchantId: membership.merchantId, role: membership.role }, cookies };
}

export async function updateMember(ctx: MemberContext, membershipId: string, body: { role?: "admin" | "lead" | "agent"; shopIds?: string[] }) {
  const { membership, user } = await memberOf(ctx, membershipId);
  const isOwner = ctx.merchant.ownerUserId === user.id;
  if (body.role && body.role !== membership.role) {
    if (isOwner) throw notAllowed("账号所有者不能改角色；需要时先在商户设置里转让所有权。", "owner_locked");
  }
  const role = body.role ?? membership.role;
  const shopIds = body.shopIds ? await validShopIds(ctx.merchant.id, body.shopIds) : undefined;
  await db().transaction(async (tx) => {
    if (body.role && body.role !== membership.role) {
      await tx.update(m).set({ role: body.role, updatedAt: new Date() }).where(eq(m.id, membershipId));
      await audit(ctx.actor, { module: "team", action: "member_role_changed", summary: `${user.name} 由${ROLE_LABEL[membership.role]}改为${ROLE_LABEL[body.role]}`, targetType: "membership", targetId: membershipId, data: { from: membership.role, to: body.role } }, tx);
    }
    // 只在显式传入 shopIds 时改负责店铺；改角色不动这张表（管理员不读它，改回组长、员工时原负责店铺仍在）
    if (shopIds !== undefined) {
      await tx.delete(schema.membershipShop).where(eq(schema.membershipShop.membershipId, membershipId));
      if (role !== "admin" && shopIds.length) await tx.insert(schema.membershipShop).values(shopIds.map((shopId) => ({ membershipId, shopId })));
      await audit(ctx.actor, { module: "team", action: "member_shops_changed", summary: `${user.name} 负责店铺改为 ${shopIds.length} 家`, targetType: "membership", targetId: membershipId, data: { shop_count: shopIds.length } }, tx);
    }
  });
  return { ok: true };
}

/** 停用：吊销其在本商户的会话；处理中会话退回待认领；名下未结工单退回店铺组长（11.1 release、11.4） */
export async function disableMember(ctx: MemberContext, membershipId: string) {
  const { membership, user } = await memberOf(ctx, membershipId);
  if (ctx.merchant.ownerUserId === user.id) throw notAllowed("账号所有者不能停用；需要时先在商户设置里转让所有权。", "owner_locked");
  if (membershipId === ctx.membership.id) throw notAllowed("不能停用自己。", "self");
  if (membership.status === "disabled") return { releasedConversations: 0, returnedTickets: 0 };
  let releasedIds: string[] = [];
  const result = await db().transaction(async (tx) => {
    await tx.update(m).set({ status: "disabled", disabledAt: new Date() }).where(eq(m.id, membershipId));
    await tx.delete(schema.session).where(and(eq(schema.session.userId, user.id), eq(schema.session.activeMerchantId, ctx.merchant.id)));
    const released = await tx
      .update(schema.conversation)
      .set({ handlingState: "awaiting_human", claimedBy: null, handoffReason: "manual", version: sql`${schema.conversation.version} + 1`, updatedAt: new Date() })
      .where(and(eq(schema.conversation.merchantId, ctx.merchant.id), eq(schema.conversation.claimedBy, membershipId), eq(schema.conversation.handlingState, "human")))
      .returning({ id: schema.conversation.id, merchantId: schema.conversation.merchantId, currentSegmentId: schema.conversation.currentSegmentId });
    for (const conv of released) {
      await systemEvent(tx, conv, `处理人 ${user.name} 被停用，会话退回待认领`, { kind: "member_disabled" });
      await audit(ctx.actor, { module: "workbench", action: "conversation_released", summary: `${user.name} 被停用，会话退回待认领`, targetType: "conversation", targetId: conv.id }, tx);
    }
    const tickets = await tx
      .select({ id: schema.ticket.id, shopId: schema.ticket.shopId, number: schema.ticket.number })
      .from(schema.ticket)
      .where(and(eq(schema.ticket.merchantId, ctx.merchant.id), eq(schema.ticket.assigneeId, membershipId), inArray(schema.ticket.status, ["open", "in_progress", "waiting"])));
    const [owner] = await tx.select({ id: m.id }).from(m).where(and(eq(m.merchantId, ctx.merchant.id), eq(m.userId, ctx.merchant.ownerUserId)));
    for (const t of tickets) {
      const [lead] = await tx
        .select({ id: m.id })
        .from(m)
        .innerJoin(schema.membershipShop, eq(schema.membershipShop.membershipId, m.id))
        .where(and(eq(m.merchantId, ctx.merchant.id), eq(m.role, "lead"), eq(m.status, "active"), eq(schema.membershipShop.shopId, t.shopId), ne(m.id, membershipId)))
        .limit(1);
      const to = lead?.id ?? owner?.id ?? null;
      await tx.update(schema.ticket).set({ assigneeId: to, version: sql`${schema.ticket.version} + 1`, updatedAt: new Date() }).where(eq(schema.ticket.id, t.id));
      // 系统改派：操作人留空，时间线按 reason 写「X 被停用，系统改派给 Y」
      await tx.insert(schema.ticketEvent).values({ merchantId: ctx.merchant.id, ticketId: t.id, type: "assign", actorId: null, source: "system", data: { reason: "member_disabled", from: membershipId, to } });
      const where = lead ? "名下未结工单退回该店组长" : "该店没有组长，名下未结工单转给账号所有者";
      if (to) await notify({ merchantId: ctx.merchant.id, membershipIds: [to], event: "ticket_assigned", title: `工单 ${t.number} 已改派给你`, body: `${user.name} 被停用，${where}。`, link: `/tickets/${t.id}`, dedupeKey: `ticket_assigned:${t.id}:${to}` }, tx);
    }
    await audit(ctx.actor, { module: "team", action: "member_disabled", summary: `停用 ${user.name}`, targetType: "membership", targetId: membershipId, data: { released: released.length, tickets: tickets.length } }, tx);
    releasedIds = released.map((r) => r.id);
    return { releasedConversations: released.length, returnedTickets: tickets.length };
  });
  // 退回待认领的会话推飞书待认领卡（提交后再排，任务读得到会话的新状态）
  for (const id of releasedIds) await queueFeishuCard(id, "unclaimed");
  return result;
}

export async function enableMember(ctx: MemberContext, membershipId: string) {
  const { membership, user } = await memberOf(ctx, membershipId);
  if (membership.status === "active") return { ok: true };
  const seats = await seatUsage(ctx.merchant.id);
  if (seats.used + 1 > seats.limit) throw notAllowed(`当前套餐最多 ${seats.limit} 个席位，已用 ${seats.used} 个。`, "seat_limit");
  await db().update(m).set({ status: "active", disabledAt: null }).where(eq(m.id, membershipId));
  await audit(ctx.actor, { module: "team", action: "member_enabled", summary: `重新启用 ${user.name}`, targetType: "membership", targetId: membershipId });
  return { ok: true };
}

export async function resetMemberPassword(ctx: MemberContext, membershipId: string) {
  const { user } = await memberOf(ctx, membershipId);
  // 60 秒内同一成员只发一封（API-TEAM-010），与「忘记密码」共用发件箱判断
  const [recent] = await db()
    .select({ id: schema.emailOutbox.id })
    .from(schema.emailOutbox)
    .where(and(eq(schema.emailOutbox.toEmail, user.email), eq(schema.emailOutbox.template, "password_reset"), gte(schema.emailOutbox.createdAt, new Date(Date.now() - 60_000))))
    .limit(1);
  if (recent) return { ok: true };
  await auth().api.requestPasswordReset({ body: { email: user.email, redirectTo: `${env().APP_BASE_URL}/reset-password` } });
  await audit(ctx.actor, { module: "team", action: "member_password_reset", summary: `给 ${user.name} 发送重置密码链接`, targetType: "membership", targetId: membershipId });
  return { ok: true };
}

export async function memberOptions(ctx: MemberContext, shopId: string | undefined): Promise<MemberOption[]> {
  const rows = await db()
    .select({ id: m.id, role: m.role, name: schema.user.name })
    .from(m)
    .innerJoin(schema.user, eq(schema.user.id, m.userId))
    .where(and(eq(m.merchantId, ctx.merchant.id), eq(m.status, "active")))
    .orderBy(schema.user.name);
  if (!shopId) return rows.map((r) => ({ membershipId: r.id, name: r.name, role: r.role }));
  const scoped = await db().select({ id: schema.membershipShop.membershipId }).from(schema.membershipShop).where(eq(schema.membershipShop.shopId, shopId));
  const allowed = new Set(scoped.map((s) => s.id));
  return rows.filter((r) => r.role === "admin" || allowed.has(r.id)).map((r) => ({ membershipId: r.id, name: r.name, role: r.role }));
}

export async function loginEvents(ctx: MemberContext, query: { result: string; range: string }): Promise<LoginEventRow[]> {
  const now = new TZDate(new Date(), ctx.merchant.timezone);
  const from =
    query.range === "30d" ? subDays(now, 30)
    : query.range === "this_month" ? new TZDate(now.getFullYear(), now.getMonth(), 1, ctx.merchant.timezone)
    : query.range === "last_month" ? new TZDate(now.getFullYear(), now.getMonth() - 1, 1, ctx.merchant.timezone)
    : subDays(now, 7);
  const to = query.range === "last_month" ? new TZDate(now.getFullYear(), now.getMonth(), 1, ctx.merchant.timezone) : now;
  const memberUsers = await db().select({ userId: m.userId }).from(m).where(eq(m.merchantId, ctx.merchant.id));
  const userIds = memberUsers.map((u) => u.userId);
  const conds = [gte(schema.loginEvent.createdAt, from), lt(schema.loginEvent.createdAt, to), sql`(${schema.loginEvent.merchantId} = ${ctx.merchant.id} or ${schema.loginEvent.userId} in ${userIds.length ? userIds : ["-"]})`];
  if (query.result !== "all") conds.push(eq(schema.loginEvent.result, query.result as "success" | "failure"));
  const rows = await db()
    .select({ e: schema.loginEvent, name: schema.user.name })
    .from(schema.loginEvent)
    .leftJoin(schema.user, eq(schema.user.id, schema.loginEvent.userId))
    .where(and(...conds))
    .orderBy(desc(schema.loginEvent.createdAt))
    .limit(1000);
  return rows.map(({ e, name }) => ({ id: e.id, email: e.email, name, result: e.result, reason: e.reason, ip: e.ip, userAgent: e.userAgent, createdAt: e.createdAt.toISOString() }));
}
