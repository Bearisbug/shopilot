// 订单（DESIGN §8.6 API-ORD-001…004）：列表与导出、详情、手动同步、发货前取消。订单以平台为准，写操作成功后先回读镜像。
import { TZDate } from "@date-fns/tz";
import { addDays, format, startOfDay } from "date-fns";
import { and, asc, desc, eq, gt, ilike, inArray, max, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { AfterSalePending, AfterSaleSummary, InvoiceSummary, OrderDetail, OrderListItem, OrderStats, OrdersQuery, OrdersResponse, StatusGroup, SyncState, TicketRef } from "@/contracts/orders";
import { STATUS_GROUP_LABEL } from "@/contracts/orders";
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { visibleConversations } from "@/server/conversations/scope";
import { systemEvent } from "@/server/conversations/ingest";
import { db, schema, type Executor } from "@/server/db/client";
import { csv, json } from "@/server/http/route";
import { Problem } from "@/server/http/problem";
import { enqueue } from "@/server/jobs/boss";
import { isReadOnlyShop, withShop, type ShopRow } from "@/server/platforms/clients";
import { READ_ONLY_ACTION_REASON } from "@/server/platforms/readonly";
import { shopeeCancelOrder } from "@/server/platforms/shopee";
import { tiktokSellerCancel } from "@/server/platforms/tiktok";
import { syncAfterSaleTicket } from "@/server/tickets/platform";
import { syncAfterSale, syncOrders, type AfterSaleRow, type OrderRow } from "./mirror";
import { onPlatform } from "./platform-errors";
import { canSeeShop, scopedTickets, visibleOrders, visibleShops } from "./scope";
import { afterSaleOpen, PRE_SHIP } from "./status";

const o = schema.order;
const t = schema.ticket;
const OPEN_TICKET = ["open", "in_progress", "waiting"] as const;
const SYNC_COOLDOWN_SEC = 60;

type ShopLite = Pick<ShopRow, "id" | "name" | "platform" | "market">;
export const shopRef = (s: ShopLite) => ({ id: s.id, name: s.name, platform: s.platform, market: s.market });
export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
export const itemsText = (items: Array<{ name: string; qty: number }>) => items.map((i) => `${i.name} ×${i.qty}`).join("、");
export const ticketRef = (r: typeof t.$inferSelect): TicketRef => ({ id: r.id, number: r.number, type: r.type, status: r.status, phase: r.phase });

function lastEvent(events: Array<{ at: string; text: string }> | undefined) {
  if (!events?.length) return null;
  return events.reduce((a, b) => (new Date(b.at) > new Date(a.at) ? b : a));
}

function encodeCursor(ts: string, id: string) {
  return Buffer.from(`${ts}|${id}`).toString("base64url");
}
function decodeCursor(cursor: string): { ts: string; id: string } {
  const [ts, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (!ts || !id || Number.isNaN(new Date(ts).getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) throw new Problem("validation", { detail: "分页参数无效，请刷新后重试。" });
  return { ts, id };
}

const sortTs = sql`coalesce(${o.platformUpdatedAt}, ${o.platformCreatedAt})`;
const cursorTs = sql<string>`to_char(coalesce(${o.platformUpdatedAt}, ${o.platformCreatedAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** 一页订单的最近售后单与未结工单 */
async function decorate(rows: Array<{ o: OrderRow; s: ShopLite }>): Promise<OrderListItem[]> {
  if (rows.length === 0) return [];
  const orderIds = rows.map((r) => r.o.id);
  const afterSales = await db()
    .select()
    .from(schema.afterSale)
    .where(or(...rows.map((r) => and(eq(schema.afterSale.shopId, r.o.shopId), eq(schema.afterSale.externalOrderId, r.o.externalOrderId))))!)
    .orderBy(desc(schema.afterSale.updatedAt));
  const tickets = await db()
    .select()
    .from(t)
    .where(and(inArray(t.orderId, orderIds), inArray(t.status, [...OPEN_TICKET])))
    .orderBy(asc(t.createdAt));
  return rows.map(({ o: r, s }) => {
    const as = afterSales.find((a) => a.shopId === r.shopId && a.externalOrderId === r.externalOrderId) ?? null;
    const tk = tickets.find((x) => x.orderId === r.id) ?? null;
    return toListItem(r, s, as, tk);
  });
}

function toListItem(r: OrderRow, s: ShopLite, as: AfterSaleRow | null, tk: typeof t.$inferSelect | null): OrderListItem {
  const tr = r.tracking;
  return {
    id: r.id,
    shop: shopRef(s),
    externalOrderId: r.externalOrderId,
    buyerName: r.buyerName,
    statusGroup: r.statusGroup,
    platformStatus: r.platformStatus,
    total: r.totalAmount,
    currency: r.currency,
    items: r.items.map((i) => ({ name: i.name, sku: i.sku, qty: i.qty, unitPrice: i.unitPrice, image: i.image || undefined })),
    shipByAt: iso(r.shipByAt),
    createdAt: r.platformCreatedAt.toISOString(),
    updatedAt: (r.platformUpdatedAt ?? r.platformCreatedAt).toISOString(),
    tracking: tr ? { carrier: tr.carrier ?? null, trackingNo: tr.trackingNo ?? null, lastEvent: lastEvent(tr.events) } : null,
    afterSale: as ? { id: as.id, kind: as.kind, platformStatus: as.platformStatus, open: afterSaleOpen(as.platform, as.kind, as.platformStatus) } : null,
    openTicket: tk ? ticketRef(tk) : null,
  };
}

/** 卖家现在能处理的售后：取消申请待处理、退货待审核或待验货 */
export function sellerActionable(a: Pick<AfterSaleRow, "platform" | "kind" | "platformStatus">): boolean {
  if (a.kind === "cancel") return afterSaleOpen(a.platform, "cancel", a.platformStatus);
  if (a.platform === "tiktok") return a.platformStatus === "RETURN_OR_REFUND_REQUEST_PENDING" || a.platformStatus === "BUYER_SHIPPED_ITEM";
  return a.platformStatus === "REQUESTED" || a.platformStatus === "PROCESSING";
}

async function afterSalesPending(ctx: MemberContext): Promise<AfterSalePending[]> {
  const rows = await db()
    .select({ t, s: schema.shop, ord: schema.order, as: schema.afterSale })
    .from(t)
    .innerJoin(schema.shop, eq(schema.shop.id, t.shopId))
    .leftJoin(schema.order, eq(schema.order.id, t.orderId))
    .leftJoin(schema.afterSale, eq(schema.afterSale.id, t.afterSaleId))
    .where(and(scopedTickets(ctx), inArray(t.type, ["return_refund", "cancel_request"]), inArray(t.status, [...OPEN_TICKET])))
    .orderBy(sql`${t.dueAt} asc nulls last`, asc(t.createdAt))
    .limit(100);
  const now = Date.now();
  return rows.map(({ t: r, s, ord, as }) => ({
    ticketId: r.id,
    number: r.number,
    type: r.type as AfterSalePending["type"],
    status: r.status as AfterSalePending["status"],
    waitingOn: r.waitingOn,
    phase: r.phase,
    platformStatus: r.platformStatus,
    dueAt: iso(r.dueAt),
    overdue: !!r.dueAt && r.dueAt.getTime() < now,
    buyerName: r.buyerName ?? ord?.buyerName ?? null,
    shop: shopRef(s),
    orderId: ord?.id ?? null,
    externalOrderId: ord?.externalOrderId ?? as?.externalOrderId ?? null,
    afterSaleId: as?.id ?? null,
    afterSaleKind: as?.kind ?? null,
    amount: as?.amount ?? ord?.totalAmount ?? null,
    currency: as?.currency ?? ord?.currency ?? null,
    itemsText: ord ? itemsText(ord.items) : null,
    actionable: as ? sellerActionable(as) : false,
  }));
}

async function syncStates(ctx: MemberContext): Promise<SyncState[]> {
  const shops = await db()
    .select({ s: schema.shop, callbackState: schema.platformApp.callbackState })
    .from(schema.shop)
    .innerJoin(schema.platformApp, eq(schema.platformApp.id, schema.shop.platformAppId))
    .where(and(visibleShops(ctx), notInArray(schema.shop.status, ["disconnected"])))
    .orderBy(asc(schema.shop.platform), asc(schema.shop.name));
  if (shops.length === 0) return [];
  const ids = shops.map((x) => x.s.id);
  const last = await db().select({ shopId: o.shopId, at: max(o.syncedAt) }).from(o).where(inArray(o.shopId, ids)).groupBy(o.shopId);
  // TikTok 的 webhook 在授权时逐店登记：最近一次授权之后有「设置失败」即为推送异常
  const events = await db()
    .select({ shopId: schema.shopEvent.shopId, kind: schema.shopEvent.kind })
    .from(schema.shopEvent)
    .where(and(inArray(schema.shopEvent.shopId, ids), inArray(schema.shopEvent.kind, ["authorized", "reauthorized", "setup_failed"])))
    .orderBy(desc(schema.shopEvent.createdAt));
  return shops.map(({ s, callbackState }) => {
    const latest = events.find((e) => e.shopId === s.id);
    const pushOk = s.platform === "shopee" ? callbackState === "set" || callbackState === "already_ours" : latest?.kind !== "setup_failed";
    return { shopId: s.id, name: s.name, platform: s.platform, market: s.market, lastSyncAt: iso(last.find((l) => l.shopId === s.id)?.at ?? null), pushOk };
  });
}

async function orderStats(ctx: MemberContext): Promise<OrderStats> {
  const tz = ctx.merchant.timezone;
  const today = startOfDay(new TZDate(new Date(), tz));
  const tomorrow = addDays(today, 1);
  const [r] = await db()
    .select({
      toShip: sql<number>`count(*) filter (where ${o.statusGroup} = 'to_ship')::int`,
      toShipDueToday: sql<number>`count(*) filter (where ${o.statusGroup} = 'to_ship' and ${o.shipByAt} < ${tomorrow.toISOString()}::timestamptz)::int`,
      shipped: sql<number>`count(*) filter (where ${o.statusGroup} = 'shipped')::int`,
      newShopee: sql<number>`count(*) filter (where ${o.platformCreatedAt} >= ${today.toISOString()}::timestamptz and ${o.platform} = 'shopee')::int`,
      newTiktok: sql<number>`count(*) filter (where ${o.platformCreatedAt} >= ${today.toISOString()}::timestamptz and ${o.platform} = 'tiktok')::int`,
    })
    .from(o)
    .where(visibleOrders(ctx));
  return { toShip: r.toShip, toShipDueToday: r.toShipDueToday, shipped: r.shipped, newToday: r.newShopee + r.newTiktok, newTodayByPlatform: { shopee: r.newShopee, tiktok: r.newTiktok } };
}

/** API-ORD-001：列表、导出 CSV；售后待处理、同步状态、统计不随筛选变化 */
export async function listOrders(ctx: MemberContext, q: OrdersQuery): Promise<OrdersResponse | Response> {
  const where: SQL[] = [visibleOrders(ctx)];
  if (q.platform) where.push(eq(o.platform, q.platform));
  if (q.statusGroup) where.push(eq(o.statusGroup, q.statusGroup));
  if (q.shopId) where.push(eq(o.shopId, q.shopId));
  if (q.q) {
    const like = `%${likeEscape(q.q)}%`;
    where.push(or(ilike(o.externalOrderId, like), ilike(o.buyerName, like))!);
  }

  if (q.format === "csv") {
    const rows = await db()
      .select({ o, s: schema.shop })
      .from(o)
      .innerJoin(schema.shop, eq(schema.shop.id, o.shopId))
      .where(and(...where))
      .orderBy(desc(sortTs), desc(o.id))
      .limit(10_001);
    const tz = ctx.merchant.timezone;
    const at = (d: Date | null) => (d ? format(new TZDate(d, tz), "yyyy-MM-dd HH:mm") : "");
    return csv(`订单-${format(new TZDate(new Date(), tz), "yyyyMMdd")}.csv`, [
      ["订单号", "平台", "站点", "店铺", "买家", "商品", "金额", "币种", "状态", "平台状态", "最晚发货", "下单时间", "更新时间"],
      ...rows.map(({ o: r, s }) => [
        r.externalOrderId,
        s.platform === "shopee" ? "Shopee" : "TikTok",
        s.market,
        s.name,
        r.buyerName,
        itemsText(r.items),
        r.totalAmount,
        r.currency,
        STATUS_GROUP_LABEL[r.statusGroup as StatusGroup],
        r.platformStatus,
        at(r.shipByAt),
        at(r.platformCreatedAt),
        at(r.platformUpdatedAt ?? r.platformCreatedAt),
      ]),
    ]);
  }

  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    where.push(sql`(${sortTs}, ${o.id}) < (${c.ts}::timestamptz, ${c.id}::uuid)`);
  }
  const rows = await db()
    .select({ o, s: schema.shop, ts: cursorTs })
    .from(o)
    .innerJoin(schema.shop, eq(schema.shop.id, o.shopId))
    .where(and(...where))
    .orderBy(desc(sortTs), desc(o.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  const [items, pending, syncState, stats] = await Promise.all([decorate(page), afterSalesPending(ctx), syncStates(ctx), orderStats(ctx)]);
  return { items, nextCursor: rows.length > q.limit && last ? encodeCursor(last.ts, last.o.id) : null, afterSalesPending: pending, syncState, stats };
}

export async function loadOrder(ctx: MemberContext, id: string, ex: Executor = db()): Promise<{ order: OrderRow; shop: ShopRow }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Problem("not-found");
  const [row] = await ex.select({ o, s: schema.shop }).from(o).innerJoin(schema.shop, eq(schema.shop.id, o.shopId)).where(and(eq(o.id, id), visibleOrders(ctx))).limit(1);
  if (!row) throw new Problem("not-found", { detail: "找不到这张订单，或它不在你负责的店铺里。" });
  return { order: row.o, shop: row.s };
}

export function afterSaleSummary(a: AfterSaleRow): AfterSaleSummary {
  const raw = (a.raw ?? {}) as Record<string, unknown>;
  return {
    id: a.id,
    kind: a.kind,
    platform: a.platform,
    externalId: a.externalId,
    platformStatus: a.platformStatus,
    open: afterSaleOpen(a.platform, a.kind, a.platformStatus),
    actionable: sellerActionable(a),
    returnType: typeof raw.return_type === "string" ? raw.return_type : null,
    sellerDueAt: iso(a.sellerDueAt),
    updatedAt: iso(a.platformUpdatedAt ?? a.updatedAt),
  };
}

export function invoiceSummary(r: typeof schema.invoice.$inferSelect): InvoiceSummary {
  return {
    id: r.id,
    number: r.number,
    kind: r.kind,
    buyerName: r.fields.buyerName,
    amount: r.fields.total,
    currency: r.fields.currency,
    chatStatus: r.chatStatus,
    chatError: r.chatError,
    emailStatus: r.emailStatus,
    emailError: r.emailError,
    emailTo: r.emailTo,
    pdfUrl: `/api/v1/invoices/${r.id}/pdf`,
    imageUrl: r.imageFileId ? `/api/v1/files/${r.imageFileId}` : null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** 买家在该店最近的会话，限当前成员可见 */
export async function buyerConversationFor(ctx: MemberContext, shopId: string, buyerExternalId: string | null, ex: Executor = db()) {
  if (!buyerExternalId) return null;
  const [c] = await ex
    .select()
    .from(schema.conversation)
    .where(and(eq(schema.conversation.shopId, shopId), eq(schema.conversation.buyerExternalId, buyerExternalId), visibleConversations(ctx)))
    .orderBy(sql`${schema.conversation.lastMessageAt} desc nulls last`)
    .limit(1);
  return c ?? null;
}

function cancelGuard(order: OrderRow, shop: ShopRow, openCancel: boolean, readOnly: boolean): { allowed: boolean; reason: string | null } {
  if (readOnly) return { allowed: false, reason: READ_ONLY_ACTION_REASON };
  if (shop.status !== "connected") return { allowed: false, reason: "店铺授权已失效或已断开，续期授权后才能取消" };
  if (order.statusGroup === "cancelled") return { allowed: false, reason: "订单已取消" };
  if (openCancel) return { allowed: false, reason: "买家已申请取消，请在「处理取消申请」里同意或拒绝" };
  if (!PRE_SHIP[order.platform].has(order.platformStatus)) return { allowed: false, reason: `订单已发货或状态不允许取消（${order.platformStatus}），只能在发货前取消` };
  return { allowed: true, reason: null };
}

/** API-ORD-002：订单详情 + 售后单 + 关联工单 + 发票 */
export async function orderDetail(ctx: MemberContext, id: string): Promise<OrderDetail> {
  const { order, shop } = await loadOrder(ctx, id);
  const [afterSales, tickets, invoices, conv] = await Promise.all([
    db()
      .select()
      .from(schema.afterSale)
      .where(and(eq(schema.afterSale.shopId, order.shopId), eq(schema.afterSale.externalOrderId, order.externalOrderId)))
      .orderBy(desc(schema.afterSale.updatedAt)),
    db().select().from(t).where(and(eq(t.merchantId, ctx.merchant.id), eq(t.orderId, order.id))).orderBy(desc(t.createdAt)),
    db().select().from(schema.invoice).where(and(eq(schema.invoice.merchantId, ctx.merchant.id), eq(schema.invoice.orderId, order.id))).orderBy(desc(schema.invoice.createdAt)),
    buyerConversationFor(ctx, order.shopId, order.buyerExternalId),
  ]);
  const openTicket = tickets.find((x) => (OPEN_TICKET as readonly string[]).includes(x.status)) ?? null;
  const item = toListItem(order, shop, afterSales[0] ?? null, openTicket);
  const openCancel = afterSales.some((a) => a.kind === "cancel" && afterSaleOpen(a.platform, a.kind, a.platformStatus));
  return {
    order: { ...item, recipient: order.recipient ?? null, trackingEvents: [...(order.tracking?.events ?? [])].sort((a, b) => b.at.localeCompare(a.at)), deadlines: order.deadlines ?? null, syncedAt: order.syncedAt.toISOString() },
    afterSales: afterSales.map(afterSaleSummary),
    tickets: tickets.map(ticketRef),
    invoices: invoices.map(invoiceSummary),
    conversation: conv ? { id: conv.id, handlingState: conv.handlingState, claimedByMe: conv.claimedBy === ctx.membership.id && conv.handlingState === "human" } : null,
    cancel: cancelGuard(order, shop, openCancel, await isReadOnlyShop(shop)),
  };
}

/** API-ORD-003：手动同步。同店 60 秒内重复返回 429；排队中的同店任务不重复排（singletonKey = 店铺 ID） */
export async function requestSync(ctx: MemberContext, body: { shopId?: string }): Promise<Response> {
  const where: SQL[] = [visibleShops(ctx), eq(schema.shop.status, "connected")];
  if (body.shopId) {
    if (!canSeeShop(ctx, body.shopId)) throw new Problem("not-found");
    where.push(eq(schema.shop.id, body.shopId));
  }
  const shops = await db().select({ id: schema.shop.id, name: schema.shop.name }).from(schema.shop).where(and(...where));
  if (shops.length === 0) throw new Problem("not-allowed", { detail: body.shopId ? "这家店授权已失效或已断开，续期授权后才能同步。" : "没有可同步的已连接店铺。", code: "no_connected_shop" });
  const since = new Date(Date.now() - SYNC_COOLDOWN_SEC * 1000);
  const recent = await db()
    .select({ shopId: schema.auditLog.targetId, at: max(schema.auditLog.createdAt) })
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.merchantId, ctx.merchant.id),
        eq(schema.auditLog.action, "order_sync_requested"),
        eq(schema.auditLog.targetType, "shop"),
        inArray(schema.auditLog.targetId, shops.map((s) => s.id)),
        gt(schema.auditLog.createdAt, since),
      ),
    )
    .groupBy(schema.auditLog.targetId);
  const cooling = new Map(recent.map((r) => [r.shopId, r.at]));
  const due = shops.filter((s) => !cooling.has(s.id));
  if (due.length === 0) {
    const waits = recent.map((r) => SYNC_COOLDOWN_SEC - Math.floor((Date.now() - (r.at?.getTime() ?? Date.now())) / 1000));
    const retry = Math.max(1, Math.min(...waits));
    throw new Problem("rate-limited", { detail: `刚刚已经排过同步，${retry} 秒后可以再点。`, code: "sync_cooldown", headers: { "retry-after": String(retry) } });
  }
  const jobIds: string[] = [];
  for (const s of due) {
    const id = await enqueue("order.sync", { shopId: s.id, requestId: ctx.requestId }, { singletonKey: s.id });
    if (id) jobIds.push(id);
    await audit(ctx.actor, { module: "orders", action: "order_sync_requested", summary: `手动同步「${s.name}」的订单`, targetType: "shop", targetId: s.id });
  }
  return json({ jobIds, shopIds: due.map((s) => s.id) }, 202);
}

/** API-ORD-004：发货前取消订单（原因固定为买家要求）。平台成功后回读镜像，写会话时间线与审计 */
export async function cancelOrder(ctx: MemberContext, id: string, body: { reason: "buyer_request"; conversationId?: string }): Promise<OrderDetail> {
  const { order, shop } = await loadOrder(ctx, id);
  let conv: typeof schema.conversation.$inferSelect | null = null;
  if (body.conversationId) {
    const [c] = await db()
      .select()
      .from(schema.conversation)
      .where(and(eq(schema.conversation.id, body.conversationId), eq(schema.conversation.shopId, order.shopId), visibleConversations(ctx)))
      .limit(1);
    if (!c) throw new Problem("not-found", { detail: "找不到这个会话，或它不属于这张订单的店铺。" });
    conv = c;
  }
  const openCancelRows = await db()
    .select()
    .from(schema.afterSale)
    .where(and(eq(schema.afterSale.shopId, order.shopId), eq(schema.afterSale.externalOrderId, order.externalOrderId), eq(schema.afterSale.kind, "cancel")));
  const guard = cancelGuard(order, shop, openCancelRows.some((a) => afterSaleOpen(a.platform, "cancel", a.platformStatus)), await isReadOnlyShop(shop));
  if (!guard.allowed) throw new Problem("not-allowed", { detail: `${guard.reason}。`, code: "order_not_cancellable" });

  await db().transaction(async (tx) => {
    await tx.select({ id: o.id }).from(o).where(eq(o.id, order.id)).for("update");
    await onPlatform(() =>
      withShop(shop.id, async (c) => {
        // 先回读一次：镜像可能落后于平台（买家刚付款或已发货）
        const [fresh] = await syncOrders(c, [order.externalOrderId], tx);
        if (!fresh || !PRE_SHIP[shop.platform].has(fresh.platformStatus)) {
          throw new Problem("not-allowed", { detail: `订单已发货或状态不允许取消（${fresh?.platformStatus ?? "平台查不到"}），只能在发货前取消。`, code: "order_not_cancellable" });
        }
        if (c.platform === "shopee") {
          await shopeeCancelOrder(c.app, c.auth, order.externalOrderId, "CUSTOMER_REQUEST");
          await syncOrders(c, [order.externalOrderId], tx);
        } else {
          const { cancelId } = await tiktokSellerCancel(c.app, c.auth, order.externalOrderId, "seller_cancel_paid_reason_buyer_requested_cancellation");
          const [after] = await syncOrders(c, [order.externalOrderId], tx);
          const a = await syncAfterSale(c, "cancel", cancelId, tx);
          if (a) await syncAfterSaleTicket(tx, c.shop, a, after ?? null, ctx.actor);
        }
      }),
    );
    conv ??= await buyerConversationFor(ctx, order.shopId, order.buyerExternalId, tx);
    if (conv) await systemEvent(tx, conv, `订单 ${order.externalOrderId} 已取消（买家要求），由 ${ctx.user.name} 操作`, { kind: "order_cancelled", orderId: order.id });
    await audit(
      ctx.actor,
      { module: "orders", action: "order_cancelled", summary: `取消订单 ${order.externalOrderId}（买家要求）`, targetType: "order", targetId: order.id, data: { platform: shop.platform, conversation_id: conv?.id ?? null } },
      tx,
    );
  });
  return orderDetail(ctx, id);
}
