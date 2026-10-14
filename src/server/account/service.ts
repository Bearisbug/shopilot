// 账号安全（REQ-AUTH-006、REQ-SET-002 个人偏好）：本人登录设备、退出设备、个人偏好。
import { and, desc, eq, gt, ne } from "drizzle-orm";
import type { PreferencesResult, RevokeResult, SessionList } from "@/contracts/account";
import type { MemberContext } from "../auth/context";
import { audit } from "../core/audit";
import { db, schema } from "../db/client";

const s = schema.session;

/** API-AUTH-009：本人全部未过期会话（与当前商户无关） */
export async function listSessions(ctx: MemberContext): Promise<SessionList> {
  const rows = await db()
    .select()
    .from(s)
    .where(and(eq(s.userId, ctx.user.id), gt(s.expiresAt, new Date())))
    .orderBy(desc(s.updatedAt));
  const items = rows.map((r) => ({
    id: r.id,
    ipAddress: r.ipAddress || null,
    userAgent: r.userAgent || null,
    createdAt: r.createdAt.toISOString(),
    lastActiveAt: r.updatedAt.toISOString(),
    current: r.id === ctx.session.id,
  }));
  return { items: [...items.filter((i) => i.current), ...items.filter((i) => !i.current)] };
}

/** API-AUTH-010：退出某设备 = 删除该会话行；退出其他设备 = 删除本人其他会话 */
export async function revokeSessions(ctx: MemberContext, body: { sessionId: string } | { others: true }): Promise<RevokeResult> {
  const where = "sessionId" in body ? and(eq(s.userId, ctx.user.id), eq(s.id, body.sessionId)) : and(eq(s.userId, ctx.user.id), ne(s.id, ctx.session.id));
  const rows = await db().delete(s).where(where).returning({ id: s.id });
  if (rows.length) {
    await audit(ctx.actor, {
      module: "auth",
      action: "sessions_revoked",
      summary: "sessionId" in body ? "退出 1 台登录设备" : `退出其他 ${rows.length} 台登录设备`,
      data: { count: rows.length },
    });
  }
  return { revoked: rows.length };
}

/** API-AUTH-011：个人偏好写在当前商户的成员身份上 */
export async function updatePreferences(ctx: MemberContext, body: { desktopNotify: boolean; sound: boolean }): Promise<PreferencesResult> {
  await db().update(schema.membership).set({ preferences: body, updatedAt: new Date() }).where(eq(schema.membership.id, ctx.membership.id));
  return { preferences: body };
}
