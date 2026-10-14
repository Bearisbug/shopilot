import { and, count, desc, eq, isNull, lt } from "drizzle-orm";
import { notificationsQuery, type NotificationList } from "@/contracts/notifications";
import { db, schema } from "@/server/db/client";
import { route } from "@/server/http/route";

const n = schema.notification;

// API-NOTIF-001
export const GET = route({
  auth: "member",
  query: notificationsQuery,
  handler: async ({ ctx, query }): Promise<NotificationList> => {
    const conds = [eq(n.membershipId, ctx.membership.id)];
    if (query.type !== "all") conds.push(eq(n.type, query.type));
    if (query.cursor) conds.push(lt(n.createdAt, new Date(query.cursor)));
    const rows = await db().select().from(n).where(and(...conds)).orderBy(desc(n.createdAt)).limit(31);
    const [u] = await db().select({ c: count() }).from(n).where(and(eq(n.membershipId, ctx.membership.id), isNull(n.readAt)));
    return {
      items: rows.slice(0, 30).map((r) => ({ id: r.id, type: r.type, event: r.event, title: r.title, body: r.body, link: r.link, createdAt: r.createdAt.toISOString(), readAt: r.readAt?.toISOString() ?? null })),
      unread: u.c,
      nextCursor: rows.length > 30 ? rows[29].createdAt.toISOString() : null,
    };
  },
});
