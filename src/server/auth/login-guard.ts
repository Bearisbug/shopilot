// 登录锁定与登录记录（REQ-AUTH-002）：同一邮箱 15 分钟内失败 10 次即锁 15 分钟。
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db/client";
import { ipAllowed } from "./ip";

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;

type Reason = "bad_password" | "unknown_email" | "locked" | "ip_blocked" | "disabled" | "two_factor_failed";

export async function recordLogin(input: { email: string; userId?: string | null; merchantId?: string | null; result: "success" | "failure"; reason?: Reason; ip: string; userAgent: string | null }) {
  await db().insert(schema.loginEvent).values({
    email: input.email.toLowerCase(),
    userId: input.userId ?? null,
    merchantId: input.merchantId ?? null,
    result: input.result,
    reason: input.reason,
    ip: input.ip,
    userAgent: input.userAgent,
  });
}

/** 返回锁定剩余秒数；未锁定返回 0 */
export async function lockRemainingSeconds(email: string): Promise<number> {
  const since = new Date(Date.now() - WINDOW_MS);
  const rows = await db()
    .select({ createdAt: schema.loginEvent.createdAt })
    .from(schema.loginEvent)
    .where(
      and(
        eq(schema.loginEvent.email, email.toLowerCase()),
        eq(schema.loginEvent.result, "failure"),
        inArray(schema.loginEvent.reason, ["bad_password", "unknown_email"]),
        gt(schema.loginEvent.createdAt, since),
      ),
    )
    .orderBy(sql`${schema.loginEvent.createdAt} desc`)
    .limit(MAX_FAILURES);
  if (rows.length < MAX_FAILURES) return 0;
  const oldest = rows[rows.length - 1].createdAt.getTime();
  return Math.max(1, Math.ceil((oldest + WINDOW_MS - Date.now()) / 1000));
}

export async function userIdByEmail(email: string): Promise<string | null> {
  const [u] = await db().select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email.toLowerCase())).limit(1);
  return u?.id ?? null;
}

/** 登录记录挂在当前默认商户上，便于商户的「登录记录」查询 */
export async function merchantIdsOf(userId: string): Promise<string[]> {
  const rows = await db().select({ m: schema.membership.merchantId }).from(schema.membership).where(eq(schema.membership.userId, userId));
  return rows.map((r) => r.m);
}

/**
 * 登录成功后按商户策略检查（DESIGN §10 免列说明）：账号在所有商户都被停用 → disabled；
 * 新会话所在商户开了 IP 白名单且来源 IP 不在内 → ip_blocked。拦下时删掉刚建的会话。
 */
export async function postLoginGate(userId: string, ip: string): Promise<{ reason: "disabled" | "ip_blocked"; merchantId: string | null } | null> {
  const memberships = await db().select({ status: schema.membership.status, merchantId: schema.membership.merchantId }).from(schema.membership).where(eq(schema.membership.userId, userId));
  const [session] = await db().select().from(schema.session).where(eq(schema.session.userId, userId)).orderBy(desc(schema.session.createdAt)).limit(1);
  const drop = async () => {
    if (session) await db().delete(schema.session).where(eq(schema.session.id, session.id));
  };
  if (memberships.length > 0 && memberships.every((m) => m.status === "disabled")) {
    await drop();
    return { reason: "disabled", merchantId: memberships[0].merchantId };
  }
  const merchantId = session?.activeMerchantId ?? null;
  if (!merchantId) return null;
  const [m] = await db().select({ policy: schema.merchant.securityPolicy }).from(schema.merchant).where(eq(schema.merchant.id, merchantId)).limit(1);
  if (m?.policy.ipRestrictionOn && !ipAllowed(ip, m.policy.ipAllowlist)) {
    await drop();
    return { reason: "ip_blocked", merchantId };
  }
  return null;
}
