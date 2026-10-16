import { and, count, eq, inArray, isNull, lte } from "drizzle-orm";
import type { NavSummary } from "@/contracts/nav";
import { db, schema } from "@/server/db/client";
import { route } from "@/server/http/route";
import { viewCondition, visibleConversations, type ConvView } from "@/server/conversations/scope";
import { countShopsNeedingAttention } from "@/server/shops/service";
import { OPEN_STATUSES, visibleTickets } from "@/server/tickets/scope";

// API-NAV-001
export const GET = route({
  auth: "member",
  allowTwoFactorPending: true,
  handler: async ({ ctx }): Promise<NavSummary> => {
    const views: ConvView[] = ["queue", "ai", "mine", "team", "done"];
    const counts = { queue: 0, ai: 0, mine: 0, team: 0, done: 0 };
    for (const v of views) {
      const [r] = await db().select({ n: count() }).from(schema.conversation).where(and(visibleConversations(ctx), viewCondition(ctx, v)));
      counts[v] = r.n;
    }
    const soon = new Date(Date.now() + 6 * 3600_000);
    const [tb] = await db()
      .select({ n: count() })
      .from(schema.ticket)
      .where(and(visibleTickets(ctx), inArray(schema.ticket.status, [...OPEN_STATUSES]), lte(schema.ticket.dueAt, soon)));
    const [un] = await db()
      .select({ n: count() })
      .from(schema.notification)
      .where(and(eq(schema.notification.membershipId, ctx.membership.id), isNull(schema.notification.readAt)));
    let shopsAttention = 0;
    if (ctx.can("shops.manage")) shopsAttention = await countShopsNeedingAttention(ctx.merchant.id);
    return { counts, ticketsBadge: tb.n, shopsAttention, unreadNotifications: un.n };
  },
});
