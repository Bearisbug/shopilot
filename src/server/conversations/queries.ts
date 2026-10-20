// 会话读取：列表（API-CONV-001）、详情（API-CONV-002）、买家与订单（API-CONV-003）、商品卡信息（API-CONV-016）。全部经 visibleConversations 收窄（ADR-003）。
import { and, asc, desc, eq, gte, inArray, ne, notInArray, sql, type SQL } from "drizzle-orm";
import type { BuyerOrder, BuyerPanel, ConversationDetail, ConversationList, ConversationListItem, ConversationsQuery, DraftItem, MessageItem, ProductCardInfo, TicketChip } from "@/contracts/conversations";
import type { MemberContext } from "@/server/auth/context";
import { db, schema, type Executor } from "@/server/db/client";
import { Problem } from "@/server/http/problem";
import { afterSaleOpen } from "@/server/orders/status";
import { isReadOnlyShop, shopAppRegion } from "@/server/platforms/clients";
import { READ_ONLY_COMPOSER_NOTICE } from "@/server/platforms/readonly";
import { productCards } from "@/server/products/info";
import { displayPayload } from "./bundle";
import { isInHours, receptionContext } from "./hours";
import { viewCondition, visibleConversations, type ConvView } from "./scope";

const c = schema.conversation;
const PAGE = 30;
const MSG_PAGE = 50;
const REPLY_WINDOW_MS = 7 * 86400_000;

/** 置顶：待认领或处理中，且买家最后发言晚于本方最后发言 */
const pinnedSql = sql<boolean>`(${c.handlingState} in ('awaiting_human','human') and ${c.lastBuyerAt} is not null and (${c.lastAgentAt} is null or ${c.lastBuyerAt} > ${c.lastAgentAt}))`;

const PREVIEW_LABEL: Record<string, string> = {
  image: "[图片]",
  order_card: "[订单卡]",
  product_card: "[商品卡]",
  return_card: "[退货卡]",
  logistics_card: "[物流卡]",
  coupon_card: "[优惠券]",
  sticker: "[表情]",
  video: "[视频]",
  other: "[消息]",
};

/** 列表排序时间：没有消息的会话排在最前（与 desc 的 nulls first 一致） */
const sortAtSql = sql`coalesce(${c.lastMessageAt}, 'infinity'::timestamptz)`;
/** 键集游标里的排序时间：微秒精度的 ISO 字符串，避免经 JS Date 丢精度 */
const sortAtText = sql<string>`case when ${c.lastMessageAt} is null then 'infinity' else to_char(${c.lastMessageAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end`;

type ListCursor = { pinned: boolean; at: string; id: string };
const encodeCursor = (k: ListCursor) => Buffer.from(JSON.stringify([k.pinned, k.at, k.id])).toString("base64url");
function decodeCursor(cur?: string): ListCursor | null {
  if (!cur) return null;
  try {
    const [pinned, at, id] = JSON.parse(Buffer.from(cur, "base64url").toString("utf8")) as unknown[];
    if (typeof pinned === "boolean" && typeof at === "string" && (at === "infinity" || !Number.isNaN(Date.parse(at))) && typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) return { pinned, at, id };
  } catch {}
  throw new Problem("validation", { detail: "分页参数无效，请刷新后重试。" });
}

/** 五个视图的会话数：一次扫描按视图条件分别计数（工作台列表 3 秒、导航摘要 10 秒各调一次） */
export async function viewCounts(ctx: MemberContext, extra?: SQL): Promise<Record<ConvView, number>> {
  const n = (v: ConvView) => sql<number>`(count(*) filter (where ${viewCondition(ctx, v)}))::int`;
  const [r] = await db().select({ queue: n("queue"), ai: n("ai"), mine: n("mine"), team: n("team"), done: n("done") }).from(c).where(and(visibleConversations(ctx), extra));
  return r;
}

async function ticketChips(conversationIds: string[]): Promise<Map<string, TicketChip[]>> {
  const out = new Map<string, TicketChip[]>();
  if (conversationIds.length === 0) return out;
  const rows = await db()
    .select({ id: schema.ticket.id, number: schema.ticket.number, type: schema.ticket.type, dueAt: schema.ticket.dueAt, conversationId: schema.ticket.conversationId })
    .from(schema.ticket)
    .where(and(inArray(schema.ticket.conversationId, conversationIds), notInArray(schema.ticket.status, ["resolved", "closed", "void"])))
    .orderBy(asc(schema.ticket.dueAt));
  const now = Date.now();
  for (const r of rows) {
    const list = out.get(r.conversationId!) ?? [];
    list.push({ id: r.id, number: r.number, type: r.type, dueAt: r.dueAt?.toISOString() ?? null, overdue: !!r.dueAt && r.dueAt.getTime() < now });
    out.set(r.conversationId!, list);
  }
  return out;
}

/** 最早一条未被本方回复的买家消息时间（置顶会话的「已等」起点） */
async function waitingSince(ids: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (ids.length === 0) return out;
  const rows = await db()
    .select({ conversationId: schema.message.conversationId, at: sql<Date>`min(${schema.message.sentAt})` })
    .from(schema.message)
    .innerJoin(c, eq(c.id, schema.message.conversationId))
    .where(and(inArray(schema.message.conversationId, ids), eq(schema.message.senderRole, "buyer"), sql`${schema.message.sentAt} > coalesce(${c.lastAgentAt}, '-infinity'::timestamptz)`))
    .groupBy(schema.message.conversationId);
  for (const r of rows) out.set(r.conversationId, new Date(r.at));
  return out;
}

async function memberNames(ids: Array<string | null>): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (list.length === 0) return new Map();
  const rows = await db().select({ id: schema.membership.id, name: schema.user.name }).from(schema.membership).innerJoin(schema.user, eq(schema.user.id, schema.membership.userId)).where(inArray(schema.membership.id, list));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function listConversations(ctx: MemberContext, q: ConversationsQuery): Promise<ConversationList> {
  const filters: SQL[] = [];
  if (q.platform) filters.push(eq(c.platform, q.platform));
  if (q.shopId) filters.push(eq(c.shopId, q.shopId));
  const extra = filters.length ? and(...filters) : undefined;
  const counts = await viewCounts(ctx, extra);

  // 键集分页：按当前排序取上一页最后一行之后的行，顶部插入新会话不会让下一页重复
  const done = q.view === "done";
  const after = decodeCursor(q.cursor);
  const keyset = after
    ? done
      ? sql`(${sortAtSql}, ${c.id}) < (${after.at}::timestamptz, ${after.id}::uuid)`
      : sql`(${pinnedSql}, ${sortAtSql}, ${c.id}) < (${after.pinned}::boolean, ${after.at}::timestamptz, ${after.id}::uuid)`
    : undefined;
  const rows = await db()
    .select({ conv: c, shop: schema.shop, stage: schema.segment.stage, pinned: pinnedSql, sortAt: sortAtText })
    .from(c)
    .innerJoin(schema.shop, eq(schema.shop.id, c.shopId))
    .leftJoin(schema.segment, eq(schema.segment.id, c.currentSegmentId))
    .where(and(visibleConversations(ctx), viewCondition(ctx, q.view), extra, keyset))
    .orderBy(...(done ? [] : [desc(pinnedSql)]), desc(sortAtSql), desc(c.id))
    .limit(PAGE + 1);
  const page = rows.slice(0, PAGE);
  const ids = page.map((r) => r.conv.id);

  const lastMsgs = ids.length
    ? await db()
        .selectDistinctOn([schema.message.conversationId], { conversationId: schema.message.conversationId, type: schema.message.type, text: schema.message.text, senderRole: schema.message.senderRole })
        .from(schema.message)
        .where(and(inArray(schema.message.conversationId, ids), sql`${schema.message.senderRole} <> 'system'`))
        .orderBy(schema.message.conversationId, desc(schema.message.sentAt), desc(schema.message.createdAt))
    : [];
  const previewOf = new Map(lastMsgs.map((m) => [m.conversationId, `${m.senderRole === "buyer" ? "" : "我方："}${m.type === "text" ? (m.text ?? "") : PREVIEW_LABEL[m.type] ?? "[消息]"}`]));
  const drafts = ids.length
    ? await db().selectDistinct({ conversationId: schema.draft.conversationId }).from(schema.draft).where(and(inArray(schema.draft.conversationId, ids), eq(schema.draft.status, "generated")))
    : [];
  const draftSet = new Set(drafts.map((d) => d.conversationId));
  const waiting = await waitingSince(page.filter((r) => r.pinned).map((r) => r.conv.id));
  const tickets = await ticketChips(ids);
  const names = await memberNames(page.map((r) => r.conv.claimedBy));
  const rc = await receptionContext(ctx.merchant.id);
  const inHours = isInHours(rc, new Date());
  const now = Date.now();

  const items: ConversationListItem[] = page.map(({ conv, shop, stage, pinned }) => {
    const since = waiting.get(conv.id);
    const waitingSinceSec = pinned && since ? Math.max(0, Math.floor((now - since.getTime()) / 1000)) : null;
    return {
      id: conv.id,
      shop: { id: shop.id, name: shop.name, platform: shop.platform, market: shop.market },
      buyerName: conv.buyerName,
      buyerAvatarUrl: conv.buyerAvatarUrl,
      preview: previewOf.get(conv.id) ?? "",
      lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
      waitingSinceSec,
      pinned: Boolean(pinned),
      overdue: waitingSinceSec !== null && inHours && waitingSinceSec > rc.responseSlaMinutes * 60,
      handlingState: conv.handlingState,
      handoffReason: conv.handoffReason,
      claimedBy: conv.claimedBy ? { id: conv.claimedBy, name: names.get(conv.claimedBy) ?? "" } : null,
      draftPending: draftSet.has(conv.id),
      stage: (stage ?? "unknown") as ConversationListItem["stage"],
      openTickets: tickets.get(conv.id) ?? [],
    };
  });
  const last = page[page.length - 1];
  return { items, counts, nextCursor: rows.length > PAGE && last ? encodeCursor({ pinned: Boolean(last.pinned), at: last.sortAt, id: last.conv.id }) : null };
}

/** 取成员可见的会话行；不可见或不存在一律 404（REQ-PERM-002） */
export async function loadVisible(ctx: MemberContext, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Problem("not-found");
  const [row] = await db().select().from(c).where(and(eq(c.id, id), visibleConversations(ctx))).limit(1);
  if (!row) throw new Problem("not-found");
  return row;
}

/**
 * 时间线一页（倒序，多取一条判断 hasMore）。游标是消息 id，按 (sent_at, id) 键集比较：
 * 平台时间戳只到秒，同一秒常有多条，只比 sent_at 会漏掉与分页边界同秒的消息。
 */
export async function messagePage(conversationId: string, before?: string, exec: Executor = db()) {
  const m = schema.message;
  const conds: SQL[] = [eq(m.conversationId, conversationId)];
  if (before) {
    const [pivot] = await exec.select({ id: m.id }).from(m).where(and(eq(m.id, before), eq(m.conversationId, conversationId))).limit(1);
    if (pivot) conds.push(sql`(${m.sentAt}, ${m.id}) < (select p.sent_at, p.id from message p where p.id = ${pivot.id})`);
  }
  return exec.select().from(m).where(and(...conds)).orderBy(desc(m.sentAt), desc(m.id)).limit(MSG_PAGE + 1);
}

/** 历史会话段（新的在前）与每段的消息数（不含系统事件） */
export async function segmentHistory(conversationId: string, exec: Executor = db()) {
  return exec
    .select({ seg: schema.segment, messages: sql<number>`count(${schema.message.id})::int` })
    .from(schema.segment)
    // 带上会话 ID 才能走消息的会话索引；只按 segment_id 关联会全表扫描消息
    .leftJoin(schema.message, and(eq(schema.message.conversationId, schema.segment.conversationId), eq(schema.message.segmentId, schema.segment.id), ne(schema.message.senderRole, "system")))
    .where(eq(schema.segment.conversationId, conversationId))
    .groupBy(schema.segment.id)
    .orderBy(desc(schema.segment.startedAt))
    .limit(20);
}

function toDraft(d: typeof schema.draft.$inferSelect, live: Set<string>): DraftItem {
  return {
    id: d.id,
    text: d.text,
    confidence: d.confidence,
    reason: d.reason,
    mode: d.mode,
    status: d.status,
    triggerMessageId: d.triggerMessageId,
    createdAt: d.createdAt.toISOString(),
    insufficient: d.insufficient,
    citations: (d.citations ?? []).map((c) => ({ documentId: c.documentId, name: c.name, available: live.has(c.documentId) })),
    translation: d.translation,
  };
}

/** 草稿依据里仍存在（未删除）的资料 */
async function liveDocuments(merchantId: string, drafts: Array<typeof schema.draft.$inferSelect>): Promise<Set<string>> {
  const ids = [...new Set(drafts.flatMap((d) => (d.citations ?? []).map((c) => c.documentId)))];
  if (ids.length === 0) return new Set();
  const rows = await db()
    .select({ id: schema.knowledgeDocument.id })
    .from(schema.knowledgeDocument)
    .where(and(eq(schema.knowledgeDocument.merchantId, merchantId), inArray(schema.knowledgeDocument.id, ids), ne(schema.knowledgeDocument.status, "deleting")));
  return new Set(rows.map((r) => r.id));
}

export async function getConversation(ctx: MemberContext, id: string, before?: string): Promise<ConversationDetail> {
  const conv = await loadVisible(ctx, id);
  const [shop] = await db().select().from(schema.shop).where(eq(schema.shop.id, conv.shopId)).limit(1);
  const [seg] = conv.currentSegmentId ? await db().select().from(schema.segment).where(eq(schema.segment.id, conv.currentSegmentId)).limit(1) : [];

  const rows = await messagePage(conv.id, before);
  const page = rows.slice(0, MSG_PAGE).reverse();
  const names = await memberNames([...page.map((m) => m.sentBy), conv.claimedBy]);
  const messages: MessageItem[] = page.map((m) => ({
    id: m.id,
    direction: m.direction,
    senderRole: m.senderRole,
    senderName: m.senderRole === "buyer" ? conv.buyerName : m.senderRole === "ai" ? "AI" : m.senderRole === "agent" ? (m.sentBy ? (names.get(m.sentBy) ?? null) : null) : m.senderRole === "platform_human" ? "平台后台" : m.senderRole === "platform_bot" ? "平台自动回复" : null,
    type: m.type,
    text: m.text,
    originalText: m.originalText,
    translation: m.translation,
    translationSource: m.translationSource,
    payload: displayPayload(m),
    sendStatus: m.sendStatus,
    sendError: m.sendError,
    sentAt: m.sentAt.toISOString(),
    segmentId: m.segmentId,
  }));

  const [draft] = await db()
    .select()
    .from(schema.draft)
    .where(and(eq(schema.draft.conversationId, conv.id), eq(schema.draft.status, "generated")))
    .orderBy(desc(schema.draft.createdAt))
    .limit(1);
  const seeShadow = ctx.membership.role !== "agent";
  const shadow = seeShadow ? await db().select().from(schema.draft).where(and(eq(schema.draft.conversationId, conv.id), eq(schema.draft.status, "shadow"))).orderBy(asc(schema.draft.createdAt)) : null;
  const live = await liveDocuments(ctx.merchant.id, [...(draft ? [draft] : []), ...(shadow ?? [])]);

  const audits = await db()
    .select()
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.merchantId, ctx.merchant.id), eq(schema.auditLog.targetType, "conversation"), eq(schema.auditLog.targetId, conv.id)))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(30);
  const tickets = (await ticketChips([conv.id])).get(conv.id) ?? [];

  const pinned = (conv.handlingState === "awaiting_human" || conv.handlingState === "human") && !!conv.lastBuyerAt && (!conv.lastAgentAt || conv.lastBuyerAt > conv.lastAgentAt);
  const since = pinned ? (await waitingSince([conv.id])).get(conv.id) : undefined;
  const waitingSec = since ? Math.floor((Date.now() - since.getTime()) / 1000) : null;
  const rc = await receptionContext(ctx.merchant.id);
  const segs = await segmentHistory(conv.id);
  const segNames = await memberNames(segs.map((s) => s.seg.firstClaimedBy));
  const me = ctx.membership.id;
  const manager = ctx.can("wb.team");
  const open = conv.handlingState !== "closed";
  const shopOk = shop.status === "connected";
  const withinWindow = !!conv.lastBuyerAt && Date.now() - conv.lastBuyerAt.getTime() < REPLY_WINDOW_MS;
  const caps = shop.capabilities;
  const affiliate = conv.buyerKind === "affiliate";
  const readOnly = await isReadOnlyShop(shop);

  return {
    conversation: {
      id: conv.id,
      shop: { id: shop.id, name: shop.name, platform: shop.platform, market: shop.market, status: shop.status, readOnly, externalShopId: shop.externalShopId, appRegion: await shopAppRegion(shop) },
      buyerName: conv.buyerName,
      buyerAvatarUrl: conv.buyerAvatarUrl,
      buyerExternalId: conv.buyerExternalId,
      buyerKind: conv.buyerKind,
      buyerLanguage: conv.buyerLanguage,
      handlingState: conv.handlingState,
      handoffReason: conv.handoffReason,
      claimedBy: conv.claimedBy ? { id: conv.claimedBy, name: names.get(conv.claimedBy) ?? "" } : null,
      version: conv.version,
      pinned,
      waitingSinceSec: waitingSec,
      lastBuyerAt: conv.lastBuyerAt?.toISOString() ?? null,
      responseSlaMinutes: rc.responseSlaMinutes,
      overdue: waitingSec !== null && isInHours(rc, new Date()) && waitingSec > rc.responseSlaMinutes * 60,
      canReply: shopOk && withinWindow && !affiliate,
      replyBlockedReason: affiliate ? "达人会话只记录，不在这里回复。" : !shopOk ? "店铺授权已失效，管理员续期授权后才能发送。" : !withinWindow ? "买家最后发言已超过 7 天，平台不允许再发消息。" : null,
    },
    readOnlyNotice: readOnly ? READ_ONLY_COMPOSER_NOTICE : null,
    segment: seg ? { id: seg.id, stage: seg.stage, stageSource: seg.stageSource, stageBasis: seg.stageBasis, startedAt: seg.startedAt.toISOString() } : null,
    messages,
    products: await productCards(
      shop,
      page.filter((m) => m.type === "product_card").map((m) => String((m.payload as Record<string, unknown>).productId ?? "")),
    ),
    cardOrders: await cardOrders(conv.shopId, page),
    hasMore: rows.length > MSG_PAGE,
    draft: draft ? toDraft(draft, live) : null,
    shadowDrafts: shadow ? shadow.map((d) => toDraft(d, live)) : null,
    capabilities: {
      cards: caps.cards,
      productCard: caps.productScope ? { enabled: true } : { enabled: false, reason: "店铺没有授予商品读取权限，请管理员到「店铺与连接」续期授权。" },
      coupons: caps.coupons,
      endSession: readOnly ? false : caps.endSession,
      maxTextLength: caps.maxTextLength,
      image: true,
    },
    events: audits.map((a) => ({ at: a.createdAt.toISOString(), text: a.summary, actorName: a.actorName ?? "系统" })),
    openTickets: tickets,
    history: segs.map(({ seg: s, messages: n }) => ({ id: s.id, stage: s.stage, startedAt: s.startedAt.toISOString(), endedAt: s.endedAt?.toISOString() ?? null, endReason: s.endReason, claimedBy: s.firstClaimedBy ? (segNames.get(s.firstClaimedBy) ?? null) : null, messages: n })),
    permissions: {
      canClaim: ctx.can("wb.handle") && (conv.handlingState === "bot" || conv.handlingState === "awaiting_human" || (conv.handlingState === "human" && !conv.claimedBy)) && !affiliate,
      canUnclaim: ctx.can("wb.handle") && conv.handlingState === "human" && conv.claimedBy === me,
      canSend: ctx.can("wb.handle") && ((conv.handlingState === "human" && conv.claimedBy === me) || conv.handlingState === "bot" || conv.handlingState === "awaiting_human") && !affiliate,
      canTransfer: conv.handlingState === "human" && (conv.claimedBy === me || manager),
      canClose: open && (conv.claimedBy === me || manager),
      canChangeStage: open && !!seg && (conv.claimedBy === me || manager),
      canIgnoreDraft: !!draft && (ctx.membership.role !== "agent" || conv.handlingState !== "human" || conv.claimedBy === me),
    },
  };
}

type OrderRow = typeof schema.order.$inferSelect;
type AfterSaleRow = typeof schema.afterSale.$inferSelect;

function toBuyerOrder(o: OrderRow, sales: AfterSaleRow[]): BuyerOrder {
  return {
    id: o.id,
    externalOrderId: o.externalOrderId,
    status: o.platformStatus,
    statusGroup: o.statusGroup,
    total: o.totalAmount,
    currency: o.currency,
    items: o.items.map((i) => ({ name: i.name, sku: i.sku, skuId: i.skuId, qty: i.qty, unitPrice: i.unitPrice, image: i.image || undefined })),
    shipByAt: o.shipByAt?.toISOString() ?? null,
    createdAt: o.platformCreatedAt.toISOString(),
    tracking: o.tracking,
    recipient: o.recipient,
    afterSales: sales
      .filter((s) => s.externalOrderId === o.externalOrderId)
      .map((s) => ({ id: s.id, kind: s.kind, externalId: s.externalId, platformStatus: s.platformStatus, sellerDueAt: s.sellerDueAt?.toISOString() ?? null, reason: s.reason, open: afterSaleOpen(o.platform, s.kind, s.platformStatus) })),
  };
}

const ORDER_CARD_TYPES = new Set(["order_card", "logistics_card", "return_card"]);

/** 本页卡片消息引用的订单：同店按平台订单号取订单镜像，只读库，不调平台 */
async function cardOrders(shopId: string, page: Array<{ type: string; payload: unknown }>): Promise<BuyerOrder[]> {
  const ids = [...new Set(page.filter((m) => ORDER_CARD_TYPES.has(m.type)).map((m) => (m.payload as Record<string, unknown> | null)?.orderId).filter((x): x is string => typeof x === "string" && x !== ""))];
  if (!ids.length) return [];
  const rows = await db().select().from(schema.order).where(and(eq(schema.order.shopId, shopId), inArray(schema.order.externalOrderId, ids)));
  return rows.map((o) => toBuyerOrder(o, []));
}

/** 商品卡片的商品信息（API-CONV-016）：前端对「获取中」的卡片轮询；只认这个会话里出现过的商品卡 */
export async function getProductCards(ctx: MemberContext, id: string, ids: string[]): Promise<{ products: Record<string, ProductCardInfo> }> {
  const conv = await loadVisible(ctx, id);
  const productId = sql<string>`${schema.message.payload}->>'productId'`;
  const own = await db()
    .selectDistinct({ productId })
    .from(schema.message)
    .where(and(eq(schema.message.conversationId, conv.id), eq(schema.message.type, "product_card"), inArray(productId, ids)));
  const [shop] = await db().select().from(schema.shop).where(eq(schema.shop.id, conv.shopId)).limit(1);
  return { products: await productCards(shop, own.map((r) => r.productId)) };
}

export async function getBuyerPanel(ctx: MemberContext, id: string): Promise<BuyerPanel> {
  const conv = await loadVisible(ctx, id);
  const since = new Date(Date.now() - 180 * 86400_000);
  const orders = await db()
    .select()
    .from(schema.order)
    .where(and(eq(schema.order.shopId, conv.shopId), eq(schema.order.buyerExternalId, conv.buyerExternalId), gte(schema.order.platformCreatedAt, since)))
    .orderBy(desc(schema.order.platformCreatedAt))
    .limit(50);
  const sales = orders.length
    ? await db()
        .select()
        .from(schema.afterSale)
        .where(and(eq(schema.afterSale.shopId, conv.shopId), inArray(schema.afterSale.externalOrderId, orders.map((o) => o.externalOrderId))))
    : [];
  const totalAmount = orders.filter((o) => o.statusGroup !== "cancelled").reduce((s, o) => s + Number(o.totalAmount), 0);
  const currencies = [...new Set(orders.map((o) => o.currency))];
  return {
    buyer: { name: conv.buyerName, externalId: conv.buyerExternalId, language: conv.buyerLanguage, avatarUrl: conv.buyerAvatarUrl },
    orders: orders.map((o) => toBuyerOrder(o, sales)),
    totals: { count180d: orders.length, amount180d: totalAmount.toFixed(2), currency: currencies.length === 1 ? currencies[0] : null },
    piiMasked: orders.some((o) => o.recipient?.masked),
    syncedAt: orders.reduce<Date | null>((m, o) => (!m || o.syncedAt > m ? o.syncedAt : m), null)?.toISOString() ?? null,
  };
}

