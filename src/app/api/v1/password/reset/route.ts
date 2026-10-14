import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { resetBody } from "@/contracts/auth";
import { auth } from "@/server/auth/auth";
import { db, schema } from "@/server/db/client";
import { route } from "@/server/http/route";
import { Problem } from "@/server/http/problem";

const USED_PREFIX = "reset-password-used:";

// API-AUTH-005：令牌一次性、30 分钟；成功后吊销该账号全部会话（Better Auth revokeSessionsOnPasswordReset）。
// Better Auth 用完即删令牌，区分「已用过」靠成功时另记一条 reset-password-used 行。
export const POST = route({
  auth: "public",
  body: resetBody,
  handler: async ({ body }) => {
    const v = schema.verification;
    const [pending] = await db().select().from(v).where(eq(v.identifier, `reset-password:${body.token}`)).limit(1);
    if (!pending) {
      const [used] = await db().select({ id: v.id }).from(v).where(eq(v.identifier, `${USED_PREFIX}${body.token}`)).limit(1);
      throw used
        ? new Problem("expired", { detail: "这个重置链接已经用过了。如需再次修改密码，请重新申请。", code: "used" })
        : new Problem("expired", { detail: "重置链接无效，请重新申请。", code: "invalid" });
    }
    if (pending.expiresAt < new Date()) throw new Problem("expired", { detail: "重置链接已超过 30 分钟，请重新申请。", code: "expired" });
    const res = await auth().api.resetPassword({ body: { token: body.token, newPassword: body.newPassword }, asResponse: true });
    if (!res.ok) throw new Problem("expired", { detail: "重置链接已失效，请重新申请。", code: "expired" });
    await db().insert(v).values({ id: randomUUID(), identifier: `${USED_PREFIX}${body.token}`, value: pending.value, expiresAt: new Date(Date.now() + 30 * 86_400_000) });
    return { ok: true };
  },
});
