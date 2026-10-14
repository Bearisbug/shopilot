import { and, eq, gt } from "drizzle-orm";
import { forgotBody } from "@/contracts/auth";
import { auth } from "@/server/auth/auth";
import { db, schema } from "@/server/db/client";
import { env } from "@/server/env";
import { json, route } from "@/server/http/route";

// API-AUTH-004：无论邮箱是否存在都返回 202（防枚举）；同一邮箱 60 秒内只发一封
export const POST = route({
  auth: "public",
  body: forgotBody,
  handler: async ({ body }) => {
    const [recent] = await db()
      .select({ id: schema.emailOutbox.id })
      .from(schema.emailOutbox)
      .where(and(eq(schema.emailOutbox.toEmail, body.email), eq(schema.emailOutbox.template, "password_reset"), gt(schema.emailOutbox.createdAt, new Date(Date.now() - 60_000))))
      .limit(1);
    if (!recent) await auth().api.requestPasswordReset({ body: { email: body.email, redirectTo: `${env().APP_BASE_URL}/reset-password` } });
    return json({ ok: true }, 202);
  },
});
