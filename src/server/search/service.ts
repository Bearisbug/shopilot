// 全局搜索（DESIGN §8.10 API-SEARCH-001、REQ-SEARCH-001）：会话按买家名、买家 ID、平台会话 ID 与消息正文，订单按平台订单号与买家名，
// 工单按工单号、买家名与关联订单号。可见范围复用各模块的 scope（§10 行级表「搜索结果」）。
import { and, count, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import type { SearchConversationHit, SearchOrderHit, SearchQuery, SearchResponse, SearchTicketHit } from "@/contracts/search";
import { SEARCH_LIMIT } from "@/contracts/search";
import type { MemberContext } from "@/server/auth/context";
import { visibleConversations } from "@/server/conversations/scope";
import { db, schema } from "@/server/db/client";
import { visibleOrders } from "@/server/orders/scope";
import { itemsText } from "@/server/orders/service";
import { visibleTickets } from "@/server/tickets/scope";

const c = schema.conversation;
const m = schema.message;
const o = schema.order;
const t = schema.ticket;
const s = schema.shop;

const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;

/** 消息正文里命中处前后各取一段，超出用省略号 */
export function snippet(text: string, q: string, around = 28): string {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  const flat = chars.join("");
  const at = flat.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return chars.slice(0, around * 2).join("") + (chars.length > around * 2 ? "…" : "");
  const startChar = Array.from(flat.slice(0, at)).length;
  const qLen = Array.from(q).length;
  const from = Math.max(0, startChar - around);
  const to = Math.min(chars.length, startChar + qLen + around);
  return `${from > 0 ? "…" : ""}${chars.slice(from, to).join("")}${to < chars.length ? "…" : ""}`;
}

async function buyerHits(ctx: MemberContext, pattern: string) {
  const where = and(visibleConversations(ctx), or(ilike(c.buyerName, pattern), ilike(c.buyerExternalId, pattern), ilike(c.externalConversationId, pattern)));
  const orderCount = sql<number>`(select count(*)::int from ${o} where ${o.shopId} = ${c.shopId} and ${o.buyerExternalId} = ${c.buyerExternalId})`;
  const rows = await db()
    .select({ c, shopName: s.name, market: s.market, orderCount })
    .from(c)
    .innerJoin(s, eq(s.id, c.shopId))
    .where(where)
    .orderBy(sql`${c.lastMessageAt} desc nulls last`, desc(c.id))
    .limit(SEARCH_LIMIT);
  const [total] = await db().select({ n: count() }).from(c).where(where);
  const items: SearchConversationHit[] = rows.map((r) => ({
    conversationId: r.c.id,
    match: "buyer",
    buyerName: r.c.buyerName,
    buyerExternalId: r.c.buyerExternalId,
    platform: r.c.platform,
    market: r.market,
    shopName: r.shopName,
    orderCount: r.orderCount,
    message: null,
    lastMessageAt: r.c.lastMessageAt?.toISOString() ?? null,
  }));
  return { items, total: total.n };
}

async function messageHits(ctx: MemberContext, q: string, pattern: string) {
  const where = and(visibleConversations(ctx), ne(m.senderRole, "system"), ilike(m.text, pattern));
  const rows = await db()
    .select({ m, c, shopName: s.name, market: s.market })
    .from(m)
    .innerJoin(c, eq(c.id, m.conversationId))
    .innerJoin(s, eq(s.id, c.shopId))
    .where(where)
    .orderBy(desc(m.sentAt), desc(m.id))
    .limit(SEARCH_LIMIT);
  const [total] = await db().select({ n: count() }).from(m).innerJoin(c, eq(c.id, m.conversationId)).where(where);
  const items: SearchConversationHit[] = rows.map((r) => ({
    conversationId: r.c.id,
    match: "message",
    buyerName: r.c.buyerName,
    buyerExternalId: r.c.buyerExternalId,
    platform: r.c.platform,
    market: r.market,
    shopName: r.shopName,
    orderCount: null,
    message: { id: r.m.id, snippet: snippet(r.m.text ?? "", q), sentAt: r.m.sentAt.toISOString(), fromBuyer: r.m.senderRole === "buyer" },
    lastMessageAt: r.c.lastMessageAt?.toISOString() ?? null,
  }));
  return { items, total: total.n };
}

async function orderHits(ctx: MemberContext, pattern: string) {
  const where = and(visibleOrders(ctx), or(ilike(o.externalOrderId, pattern), ilike(o.buyerName, pattern)));
  const rows = await db()
    .select({ o, shopName: s.name, market: s.market })
    .from(o)
    .innerJoin(s, eq(s.id, o.shopId))
    .where(where)
    .orderBy(desc(o.platformCreatedAt), desc(o.id))
    .limit(SEARCH_LIMIT);
  const [total] = await db().select({ n: count() }).from(o).where(where);
  const items: SearchOrderHit[] = rows.map((r) => ({
    id: r.o.id,
    externalOrderId: r.o.externalOrderId,
    buyerName: r.o.buyerName,
    platform: r.o.platform,
    market: r.market,
    shopName: r.shopName,
    statusGroup: r.o.statusGroup,
    total: r.o.totalAmount,
    currency: r.o.currency,
    itemsText: itemsText(r.o.items),
    createdAt: r.o.platformCreatedAt.toISOString(),
  }));
  return { items, total: total.n };
}

async function ticketHits(ctx: MemberContext, pattern: string) {
  const where = and(visibleTickets(ctx), or(ilike(t.number, pattern), ilike(t.buyerName, pattern), ilike(o.externalOrderId, pattern)));
  const rows = await db()
    .select({ t, shopName: s.name, market: s.market, externalOrderId: o.externalOrderId })
    .from(t)
    .innerJoin(s, eq(s.id, t.shopId))
    .leftJoin(o, eq(o.id, t.orderId))
    .where(where)
    .orderBy(desc(t.createdAt), desc(t.id))
    .limit(SEARCH_LIMIT);
  const [total] = await db().select({ n: count() }).from(t).leftJoin(o, eq(o.id, t.orderId)).where(where);
  const items: SearchTicketHit[] = rows.map((r) => ({
    id: r.t.id,
    number: r.t.number,
    type: r.t.type,
    status: r.t.status,
    waitingOn: r.t.waitingOn,
    phase: r.t.phase,
    buyerName: r.t.buyerName,
    externalOrderId: r.externalOrderId,
    platform: r.t.platform,
    market: r.market,
    shopName: r.shopName,
    dueAt: r.t.dueAt?.toISOString() ?? null,
  }));
  return { items, total: total.n };
}

const none = { items: [], total: 0 };

export async function search(ctx: MemberContext, query: SearchQuery): Promise<SearchResponse> {
  const q = query.q;
  const pattern = likePattern(q);
  const want = (k: "conversation" | "order" | "ticket") => query.type === "all" || query.type === k;
  const [buyers, messages, orders, tickets] = await Promise.all([
    want("conversation") ? buyerHits(ctx, pattern) : none,
    want("conversation") ? messageHits(ctx, q, pattern) : none,
    want("order") ? orderHits(ctx, pattern) : none,
    want("ticket") ? ticketHits(ctx, pattern) : none,
  ]);
  const conversations = buyers.total + messages.total;
  return {
    q,
    conversations: [...buyers.items, ...messages.items],
    orders: orders.items,
    tickets: tickets.items,
    counts: { buyers: buyers.total, messages: messages.total, conversations, orders: orders.total, tickets: tickets.total, all: conversations + orders.total + tickets.total },
  };
}
