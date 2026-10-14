// 每个 /api/v1 请求的成员上下文：会话 → 当前商户 → 成员身份 → 负责店铺。权限每次从数据库计算，不缓存（DESIGN §16）。
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { Problem } from "../http/problem";
import type { Actor } from "../core/audit";
import { auth } from "./auth";
import { can, permissionsFor, type Permission, type Role } from "@/lib/permissions";
import { ipAllowed } from "./ip";

export type MemberContext = {
  requestId: string;
  ip: string;
  userAgent: string | null;
  user: { id: string; name: string; email: string; twoFactorEnabled: boolean };
  session: { id: string; createdAt: Date };
  merchant: typeof schema.merchant.$inferSelect;
  membership: { id: string; role: Role; status: "active" | "disabled" };
  isOwner: boolean;
  /** null = 全部店铺（管理员） */
  shopIds: string[] | null;
  twoFactorRequired: boolean;
  actor: Actor;
  can: (perm: Permission) => boolean;
  permissions: Permission[];
};

export type SessionContext = {
  requestId: string;
  ip: string;
  user: { id: string; name: string; email: string; twoFactorEnabled: boolean };
  session: { id: string; createdAt: Date; activeMerchantId: string | null };
};

export function requestIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "127.0.0.1";
}

export async function loadSession(req: Request, requestId: string): Promise<SessionContext> {
  const result = await auth().api.getSession({ headers: req.headers });
  if (!result) throw new Problem("unauthenticated");
  const s = result.session as typeof result.session & { activeMerchantId?: string | null };
  return {
    requestId,
    ip: requestIp(req),
    user: { id: result.user.id, name: result.user.name, email: result.user.email, twoFactorEnabled: Boolean((result.user as { twoFactorEnabled?: boolean }).twoFactorEnabled) },
    session: { id: s.id, createdAt: new Date(s.createdAt), activeMerchantId: s.activeMerchantId ?? null },
  };
}

async function revokeSession(sessionId: string) {
  await db().delete(schema.session).where(eq(schema.session.id, sessionId));
}

export async function loadMemberContext(req: Request, requestId: string): Promise<MemberContext> {
  const s = await loadSession(req, requestId);
  let merchantId = s.session.activeMerchantId;
  if (!merchantId) {
    const first = await db()
      .select({ merchantId: schema.membership.merchantId })
      .from(schema.membership)
      .where(and(eq(schema.membership.userId, s.user.id), eq(schema.membership.status, "active")))
      .limit(1);
    merchantId = first[0]?.merchantId ?? null;
    if (!merchantId) throw new Problem("forbidden", { detail: "这个账号还没有加入任何商户。", code: "no_merchant" });
    await db().update(schema.session).set({ activeMerchantId: merchantId }).where(eq(schema.session.id, s.session.id));
  }

  const rows = await db()
    .select({ membership: schema.membership, merchant: schema.merchant })
    .from(schema.membership)
    .innerJoin(schema.merchant, eq(schema.merchant.id, schema.membership.merchantId))
    .where(and(eq(schema.membership.userId, s.user.id), eq(schema.membership.merchantId, merchantId)))
    .limit(1);
  const row = rows[0];
  if (!row || row.membership.status !== "active" || row.merchant.status === "deleted") {
    await revokeSession(s.session.id);
    throw new Problem("unauthenticated", { detail: "你在这个商户的账号已被停用，请联系管理员。", code: "membership_disabled" });
  }
  const { membership, merchant } = row;
  const isOwner = merchant.ownerUserId === s.user.id;
  if (merchant.status === "pending_deletion" && !isOwner) {
    await revokeSession(s.session.id);
    throw new Problem("unauthenticated", { detail: "这个商户正在等待删除，暂时不能登录。", code: "merchant_pending_deletion" });
  }

  const policy = merchant.securityPolicy;
  if (Date.now() - s.session.createdAt.getTime() > policy.sessionMaxHours * 3600_000) {
    await revokeSession(s.session.id);
    throw new Problem("unauthenticated", { detail: `登录已超过商户规定的 ${policy.sessionMaxHours} 小时，请重新登录。`, code: "session_expired" });
  }
  if (policy.ipRestrictionOn && !ipAllowed(s.ip, policy.ipAllowlist)) {
    throw new Problem("ip-blocked", { detail: `当前 IP ${s.ip} 不在商户允许的范围内，请联系管理员。` });
  }

  const role = membership.role;
  let shopIds: string[] | null = null;
  if (role !== "admin") {
    const shops = await db().select({ shopId: schema.membershipShop.shopId }).from(schema.membershipShop).where(eq(schema.membershipShop.membershipId, membership.id));
    shopIds = shops.map((r) => r.shopId);
  }
  // 在线状态：最近 5 分钟有请求即在线；每分钟最多写一次
  if (!membership.lastSeenAt || Date.now() - membership.lastSeenAt.getTime() > 60_000) {
    await db().update(schema.membership).set({ lastSeenAt: new Date() }).where(eq(schema.membership.id, membership.id));
  }
  const twoFactorRequired = !s.user.twoFactorEnabled && (policy.requireTwoFactorAll || (policy.requireTwoFactorAdmins && role === "admin"));

  return {
    requestId,
    ip: s.ip,
    userAgent: req.headers.get("user-agent"),
    user: s.user,
    session: { id: s.session.id, createdAt: s.session.createdAt },
    merchant,
    membership: { id: membership.id, role, status: membership.status },
    isOwner,
    shopIds,
    twoFactorRequired,
    actor: { kind: "member", merchantId: merchant.id, membershipId: membership.id, userId: s.user.id, name: s.user.name, requestId },
    can: (perm) => can(role, isOwner, perm),
    permissions: permissionsFor(role, isOwner),
  };
}

/** 对象所在店铺是否在成员范围内 */
export function inScope(ctx: MemberContext, shopId: string): boolean {
  return ctx.shopIds === null || ctx.shopIds.includes(shopId);
}
