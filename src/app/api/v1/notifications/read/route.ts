import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { readBody } from "@/contracts/notifications";
import { db, schema } from "@/server/db/client";
import { route } from "@/server/http/route";

const n = schema.notification;

// API-NOTIF-002
export const POST = route({
  auth: "member",
  body: readBody,
  handler: async ({ ctx, body }) => {
    const conds = [eq(n.membershipId, ctx.membership.id), isNull(n.readAt)];
    if ("ids" in body) conds.push(inArray(n.id, body.ids));
    await db().update(n).set({ readAt: new Date() }).where(and(...conds));
    const [u] = await db().select({ c: count() }).from(n).where(and(eq(n.membershipId, ctx.membership.id), isNull(n.readAt)));
    return { unread: u.c };
  },
});
