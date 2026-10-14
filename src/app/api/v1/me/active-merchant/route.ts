import { and, eq } from "drizzle-orm";
import { activeMerchantBody } from "@/contracts/auth";
import { db, schema } from "@/server/db/client";
import { loadMemberContext } from "@/server/auth/context";
import { route } from "@/server/http/route";
import { Problem } from "@/server/http/problem";
import { buildMe } from "@/server/merchants/me";

// API-AUTH-007
export const POST = route({
  auth: "session",
  body: activeMerchantBody,
  handler: async ({ ctx, body, req }) => {
    const [m] = await db()
      .select({ id: schema.membership.id })
      .from(schema.membership)
      .innerJoin(schema.merchant, eq(schema.merchant.id, schema.membership.merchantId))
      .where(and(eq(schema.membership.userId, ctx.user.id), eq(schema.membership.merchantId, body.merchantId), eq(schema.membership.status, "active"), eq(schema.merchant.status, "active")));
    if (!m) throw new Problem("forbidden", { detail: "你不是这个商户的启用成员。" });
    await db().update(schema.session).set({ activeMerchantId: body.merchantId }).where(eq(schema.session.id, ctx.session.id));
    return buildMe(await loadMemberContext(req, ctx.requestId));
  },
});
