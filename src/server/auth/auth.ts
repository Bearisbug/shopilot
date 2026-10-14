// 认证（ADR-005）：Better Auth 管账号、密码、会话、两步验证；商户、成员、角色由本系统表实现。
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { env } from "../env";
import { sendEmail } from "../core/outbox";

const SEVEN_DAYS = 60 * 60 * 24 * 7;

/**
 * 新会话默认进入的商户：沿用本人上一个会话所在的商户（开关两步验证会换会话，不能把人切走）；
 * 没有或已失去该商户的启用身份时，取最近加入的启用成员身份所属的商户。
 */
async function defaultMerchantFor(userId: string): Promise<string | null> {
  const [last] = await db()
    .select({ merchantId: schema.membership.merchantId })
    .from(schema.session)
    .innerJoin(schema.membership, and(eq(schema.membership.merchantId, schema.session.activeMerchantId), eq(schema.membership.userId, userId)))
    .where(and(eq(schema.session.userId, userId), eq(schema.membership.status, "active")))
    .orderBy(desc(schema.session.updatedAt))
    .limit(1);
  if (last) return last.merchantId;
  const rows = await db()
    .select({ merchantId: schema.membership.merchantId })
    .from(schema.membership)
    .innerJoin(schema.merchant, eq(schema.merchant.id, schema.membership.merchantId))
    .where(and(eq(schema.membership.userId, userId), eq(schema.membership.status, "active")))
    .orderBy(desc(schema.membership.createdAt))
    .limit(1);
  return rows[0]?.merchantId ?? null;
}

function createAuth() {
  return betterAuth({
    appName: "Shopilot",
    secret: env().BETTER_AUTH_SECRET,
    baseURL: env().APP_BASE_URL,
    trustedOrigins: [env().APP_BASE_URL],
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification, twoFactor: schema.twoFactor },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        await sendEmail({
          to: user.email,
          template: "password_reset",
          subject: "重置你的 Shopilot 密码",
          body: `${user.name}，你好：\n\n点下面的链接设置新密码，30 分钟内有效，只能用一次。不是你本人操作可以忽略这封邮件。`,
          links: [{ label: "设置新密码", url: `${env().APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}` }],
        });
      },
    },
    session: {
      expiresIn: SEVEN_DAYS,
      updateAge: 60 * 60 * 24,
      additionalFields: { activeMerchantId: { type: "string", required: false, input: false } },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => ({ data: { ...session, activeMerchantId: await defaultMerchantFor(session.userId) } }),
        },
      },
    },
    rateLimit: { enabled: true, window: 60, max: 120, customRules: { "/sign-in/email": { window: 60, max: 30 } } },
    plugins: [twoFactor({ issuer: "Shopilot" }), nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { __shopilotAuth?: Auth };

export function auth(): Auth {
  if (!globalForAuth.__shopilotAuth) globalForAuth.__shopilotAuth = createAuth();
  return globalForAuth.__shopilotAuth;
}
