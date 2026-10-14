// 转让所有权（11.11）与删除商户（11.10）：REQ-SET-006，API-SET-013 至 API-SET-016。
import { syncAcceptChat } from "../platforms/agent-settings-impl";
import { addDays } from "date-fns";
import { and, eq, inArray, lt, ne } from "drizzle-orm";
import type { AcceptOwnershipResult, DeletionResult, OwnershipPreview, OwnershipTransferResult } from "@/contracts/settings";
import type { MemberContext, SessionContext } from "../auth/context";
import { audit } from "../core/audit";
import { randomToken, sha256 } from "../core/crypto";
import { sendEmail } from "../core/outbox";
import { db, schema } from "../db/client";
import { env } from "../env";
import { notAllowed, notFound, Problem } from "../http/problem";
import { inTzText } from "./data";

const TRANSFER_DAYS = 7;
const PURGE_DAYS = 30;
const m = schema.membership;
const t = schema.ownershipTransfer;

// ---------- 转让所有权 ----------

export async function requestTransfer(ctx: MemberContext, toMembershipId: string): Promise<OwnershipTransferResult> {
  const [target] = await db()
    .select({ membership: m, user: schema.user })
    .from(m)
    .innerJoin(schema.user, eq(schema.user.id, m.userId))
    .where(and(eq(m.id, toMembershipId), eq(m.merchantId, ctx.merchant.id)));
  if (!target) throw notFound("找不到这位成员。");
  if (target.user.id === ctx.merchant.ownerUserId) throw notAllowed("对方已经是账号所有者。", "already_owner");
  if (target.membership.role !== "admin" || target.membership.status !== "active") {
    throw notAllowed(`${target.user.name} 不是启用中的管理员。所有权只能转给启用的管理员，先在团队与权限里调整角色。`, "not_active_admin");
  }
  if (!target.user.twoFactorEnabled) {
    throw notAllowed(`${target.user.name} 还没有开启两步验证。请对方先在账号安全页开启，再发起转让。`, "two_factor_disabled");
  }
  const token = randomToken();
  const expiresAt = addDays(new Date(), TRANSFER_DAYS);
  const row = await db().transaction(async (tx) => {
    const superseded = await tx
      .update(t)
      .set({ status: "cancelled" })
      .where(and(eq(t.merchantId, ctx.merchant.id), eq(t.status, "pending")))
      .returning({ id: t.id });
    const [created] = await tx
      .insert(t)
      .values({ merchantId: ctx.merchant.id, fromUserId: ctx.user.id, toUserId: target.user.id, tokenHash: sha256(token), expiresAt })
      .returning();
    await sendEmail(
      {
        to: target.user.email,
        merchantId: ctx.merchant.id,
        template: "ownership_transfer",
        subject: `${ctx.user.name} 想把「${ctx.merchant.name}」的账号所有权转给你`,
        body: `${target.user.name}，你好：\n\n${ctx.user.name} 发起了「${ctx.merchant.name}」的所有权转让。确认后你将成为账号所有者，可以改套餐、改付款方式、转让所有权、删除商户；${ctx.user.name} 保留管理员身份。\n\n链接 ${TRANSFER_DAYS} 天内有效，需要用 ${target.user.email} 登录后确认。`,
        links: [{ label: "确认接受所有权", url: `${env().APP_BASE_URL}/ownership/${token}` }],
        refType: "ownership_transfer",
        refId: created.id,
      },
      tx,
    );
    await audit(
      ctx.actor,
      {
        module: "settings",
        action: "ownership_transfer_requested",
        summary: `发起所有权转让给 ${target.user.name}${superseded.length ? "（之前的转让链接作废）" : ""}`,
        targetType: "ownership_transfer",
        targetId: created.id,
        data: { to_membership_id: toMembershipId, superseded: superseded.length },
      },
      tx,
    );
    return created;
  });
  return { id: row.id, toName: target.user.name, expiresAt: expiresAt.toISOString() };
}

async function transferByToken(token: string) {
  const [row] = await db().select().from(t).where(eq(t.tokenHash, sha256(token)));
  return row ?? null;
}

function invalidState(row: typeof t.$inferSelect | null): "expired" | "used" | "revoked" | "invalid" | null {
  if (!row) return "invalid";
  if (row.status === "accepted") return "used";
  if (row.status === "cancelled") return "revoked";
  if (row.status === "expired" || row.expiresAt < new Date()) return "expired";
  return null;
}

async function activeAdmin(merchantId: string, userId: string) {
  const [row] = await db()
    .select({ id: m.id })
    .from(m)
    .innerJoin(schema.merchant, eq(schema.merchant.id, m.merchantId))
    .where(and(eq(m.merchantId, merchantId), eq(m.userId, userId), eq(m.role, "admin"), eq(m.status, "active"), eq(schema.merchant.status, "active")));
  return row ?? null;
}

/** PAGE-OWNERSHIP 打开时的状态；页面在服务端调用 */
export async function previewTransfer(token: string, userId: string): Promise<OwnershipPreview> {
  const row = await transferByToken(token);
  const [merchant] = row ? await db().select({ name: schema.merchant.name, timezone: schema.merchant.timezone }).from(schema.merchant).where(eq(schema.merchant.id, row.merchantId)) : [];
  const bad = invalidState(row);
  if (bad || !row) return { state: bad ?? "invalid", merchantName: merchant?.name ?? null };
  const users = await db().select({ id: schema.user.id, name: schema.user.name }).from(schema.user).where(inArray(schema.user.id, [row.fromUserId, row.toUserId]));
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "—";
  if (row.toUserId !== userId) return { state: "not_recipient", merchantName: merchant.name, toName: nameOf(row.toUserId) };
  if (!(await activeAdmin(row.merchantId, userId))) return { state: "not_allowed", merchantName: merchant.name };
  return { state: "ok", merchantName: merchant.name, timezone: merchant.timezone, fromName: nameOf(row.fromUserId), toName: nameOf(row.toUserId), expiresAt: row.expiresAt.toISOString() };
}

const EXPIRED_TEXT = {
  expired: "转让链接已过期（7 天有效），请所有者重新发起。",
  used: "这个转让已经确认过了。",
  revoked: "这个链接已作废：所有者之后又发起了新的转让，请用最新邮件里的链接。",
  invalid: "转让链接无效，请检查链接是否完整。",
} as const;

export async function acceptTransfer(ctx: SessionContext, token: string): Promise<AcceptOwnershipResult> {
  const row = await transferByToken(token);
  const bad = invalidState(row);
  if (bad || !row) throw new Problem("expired", { detail: EXPIRED_TEXT[bad ?? "invalid"], code: bad ?? "invalid" });
  if (row.toUserId !== ctx.user.id) {
    throw new Problem("forbidden", { detail: `当前登录的是 ${ctx.user.email}，这个转让不是发给你的。请退出后用受让账号登录。`, code: "not_recipient" });
  }
  const admin = await activeAdmin(row.merchantId, ctx.user.id);
  if (!admin) throw notAllowed("你已不是这个商户启用中的管理员，不能接受所有权。", "not_active_admin");
  return db().transaction(async (tx) => {
    const updated = await tx
      .update(t)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(and(eq(t.id, row.id), eq(t.status, "pending")))
      .returning({ id: t.id });
    if (updated.length === 0) throw new Problem("expired", { detail: EXPIRED_TEXT.used, code: "used" });
    const [merchant] = await tx.update(schema.merchant).set({ ownerUserId: ctx.user.id, updatedAt: new Date() }).where(eq(schema.merchant.id, row.merchantId)).returning();
    await tx.update(schema.session).set({ activeMerchantId: row.merchantId }).where(eq(schema.session.id, ctx.session.id));
    const [from] = await tx.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, row.fromUserId));
    await audit(
      { kind: "member", merchantId: row.merchantId, membershipId: admin.id, userId: ctx.user.id, name: ctx.user.name, requestId: ctx.requestId },
      { module: "settings", action: "ownership_transferred", summary: `${ctx.user.name} 接受所有权，成为账号所有者；${from?.name ?? "原所有者"} 保留管理员`, targetType: "ownership_transfer", targetId: row.id },
      tx,
    );
    return { merchantId: merchant.id, merchantName: merchant.name };
  });
}

/** 11.11 expire：由 invitation.expire 任务一并调用 */
export async function expireOwnershipTransfers(): Promise<number> {
  const rows = await db().update(t).set({ status: "expired" }).where(and(eq(t.status, "pending"), lt(t.expiresAt, new Date()))).returning({ id: t.id });
  return rows.length;
}

// ---------- 删除商户 ----------

export async function requestDeletion(ctx: MemberContext, confirmName: string): Promise<DeletionResult> {
  const merchant = ctx.merchant;
  if (merchant.status === "pending_deletion" && merchant.purgeAt) return { purgeAt: merchant.purgeAt.toISOString() };
  if (confirmName.trim() !== merchant.name) {
    throw new Problem("validation", { detail: `输入的名称与商户名「${merchant.name}」不一致，没有删除。`, code: "name_mismatch", extra: { fields: { confirmName: "名称不一致" } } });
  }
  const now = new Date();
  const purgeAt = addDays(now, PURGE_DAYS);
  // 11.6 disconnect：TikTok 店先关坐席接单（平台调用失败不阻断删除）
  const tiktokShops = await db()
    .select({ id: schema.shop.id })
    .from(schema.shop)
    .where(and(eq(schema.shop.merchantId, merchant.id), eq(schema.shop.platform, "tiktok"), eq(schema.shop.status, "connected")));
  for (const s of tiktokShops) await syncAcceptChat(s.id, false);
  await db().transaction(async (tx) => {
    const admins = await tx
      .select({ email: schema.user.email, name: schema.user.name })
      .from(m)
      .innerJoin(schema.user, eq(schema.user.id, m.userId))
      .where(and(eq(m.merchantId, merchant.id), eq(m.role, "admin"), eq(m.status, "active")));
    await tx.update(schema.merchant).set({ status: "pending_deletion", purgeAt, updatedAt: now }).where(eq(schema.merchant.id, merchant.id));
    // 解绑全部店铺（同 11.6 disconnect，保留数据）
    const shops = await tx
      .update(schema.shop)
      .set({ status: "disconnected", accessTokenEnc: null, refreshTokenEnc: null, accessExpiresAt: null, disconnectedAt: now, updatedAt: now })
      .where(and(eq(schema.shop.merchantId, merchant.id), ne(schema.shop.status, "disconnected")))
      .returning({ id: schema.shop.id });
    // 停用除所有者外的全部成员，并吊销他们在本商户的会话
    const disabled = await tx
      .update(m)
      .set({ status: "disabled", disabledAt: now, updatedAt: now })
      .where(and(eq(m.merchantId, merchant.id), ne(m.userId, merchant.ownerUserId), eq(m.status, "active")))
      .returning({ userId: m.userId });
    if (disabled.length) {
      await tx.delete(schema.session).where(and(inArray(schema.session.userId, disabled.map((d) => d.userId)), eq(schema.session.activeMerchantId, merchant.id)));
    }
    const purgeText = inTzText(purgeAt, merchant.timezone, "yyyy-MM-dd HH:mm");
    for (const admin of admins) {
      await sendEmail(
        {
          to: admin.email,
          merchantId: merchant.id,
          template: "merchant_deletion",
          subject: `「${merchant.name}」已申请删除，${purgeText} 清除数据`,
          body: `${admin.name}，你好：\n\n账号所有者 ${ctx.user.name} 申请删除商户「${merchant.name}」。全部店铺已断开，除所有者外的成员已停用。\n\n${purgeText}（${merchant.timezone}）之后清除全部业务数据，不能恢复；在此之前所有者可以在商户设置里撤销。`,
          refType: "merchant",
          refId: merchant.id,
        },
        tx,
      );
    }
    await audit(
      ctx.actor,
      {
        module: "settings",
        action: "merchant_deletion_requested",
        summary: `申请删除商户，${purgeText} 清除；断开 ${shops.length} 家店，停用 ${disabled.length} 名成员`,
        targetType: "merchant",
        targetId: merchant.id,
        data: { purge_at: purgeAt.toISOString(), shops: shops.length, members: disabled.length },
      },
      tx,
    );
  });
  return { purgeAt: purgeAt.toISOString() };
}

export async function cancelDeletion(ctx: MemberContext): Promise<{ ok: true }> {
  const merchant = ctx.merchant;
  if (merchant.status !== "pending_deletion") throw new Problem("conflict", { title: "商户不在待删除状态", detail: "商户没有申请删除，无需撤销。", code: "not_pending_deletion" });
  if (merchant.purgeAt && merchant.purgeAt <= new Date()) throw notAllowed("已过清除时间，不能撤销。", "purge_due");
  await db().transaction(async (tx) => {
    await tx.update(schema.merchant).set({ status: "active", purgeAt: null, updatedAt: new Date() }).where(eq(schema.merchant.id, merchant.id));
    await audit(ctx.actor, { module: "settings", action: "merchant_deletion_cancelled", summary: "撤销删除商户；成员保持停用，店铺需要重新授权", targetType: "merchant", targetId: merchant.id }, tx);
  });
  return { ok: true };
}
