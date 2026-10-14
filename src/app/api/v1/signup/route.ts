import { eq } from "drizzle-orm";
import { signupBody } from "@/contracts/auth";
import { auth } from "@/server/auth/auth";
import { audit } from "@/server/core/audit";
import { sendEmail } from "@/server/core/outbox";
import { db, schema } from "@/server/db/client";
import { env } from "@/server/env";
import { route, json } from "@/server/http/route";
import { Problem } from "@/server/http/problem";
import { provisionMerchant } from "@/server/merchants/provision";

// API-AUTH-001 注册商户：建账号（Better Auth）→ 开通商户 → 会话切到该商户
export const POST = route({
  auth: "public",
  body: signupBody,
  handler: async ({ body, req, requestId }) => {
    const [exists] = await db().select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, body.email));
    if (exists) throw new Problem("duplicate", { detail: "这个邮箱已经注册过，请直接登录。", code: "email_registered" });

    const res = await auth().api.signUpEmail({ body: { email: body.email, password: body.password, name: body.name }, headers: req.headers, asResponse: true });
    if (!res.ok) throw new Problem("validation", { detail: "账号创建失败，请检查邮箱和密码。" });
    const created = (await res.clone().json()) as { user: { id: string } };
    const userId = created.user.id;

    let result;
    try {
      result = await db().transaction(async (tx) => {
        const r = await provisionMerchant(tx, { name: body.merchantName, timezone: body.timezone, ownerUserId: userId, billingEmail: body.email });
        await tx.update(schema.session).set({ activeMerchantId: r.merchant.id }).where(eq(schema.session.userId, userId));
        await audit(
          { kind: "member", merchantId: r.merchant.id, membershipId: r.membership.id, userId, name: body.name, requestId },
          { module: "auth", action: "signup_completed", summary: `注册商户「${body.merchantName}」`, targetType: "merchant", targetId: r.merchant.id, data: { timezone: body.timezone } },
          tx,
        );
        return r;
      });
    } catch (e) {
      await db().delete(schema.user).where(eq(schema.user.id, userId));
      throw e;
    }

    await sendEmail({
      to: body.email,
      merchantId: result.merchant.id,
      template: "verify_email",
      subject: "确认你的 Shopilot 邮箱",
      body: `${body.name}，你好：\n\n商户「${body.merchantName}」已创建。点下面的链接确认邮箱；不确认也可以继续使用。`,
      links: [{ label: "确认邮箱", url: `${env().APP_BASE_URL}/login?verified=1` }],
    });

    const out = json({ user: { id: userId, email: body.email, name: body.name }, merchant: { id: result.merchant.id, name: result.merchant.name }, membership: { id: result.membership.id, role: "admin" } }, 201);
    for (const cookie of res.headers.getSetCookie()) out.headers.append("set-cookie", cookie);
    return out;
  },
});
