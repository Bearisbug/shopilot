// 工单接口服务（DESIGN §8.7 API-TKT-001…008、§10 工单行级可见性、§11.4 迁移表）。建单与改状态走 engine.ts，与平台事件建的工单同一口径。
import { TZDate } from "@date-fns/tz";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import {
  OPEN_TICKET_STATUSES,
  STATUS_LABEL,
  TYPE_LABEL,
  WAITING_LABEL,
  statusText,
  type BoardColumn,
  type CreateTicketBody,
  type PlatformFeedItem,
  type TicketBoard,
  type TicketDetail,
  type TicketEventItem,
  type TicketItem,
  type TicketList,
  type TicketListQuery,
  type TicketNextAction,
  type TicketStats,
  type TicketStatusBody,
  type TicketType,
  type WaitingOn,
} from "@/contracts/tickets";
import { inTz } from "@/lib/format";
import { platformStatusText } from "@/lib/ticket-text";
import { inScope, type MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { notify } from "@/server/core/notify";
import { visibleConversations } from "@/server/conversations/scope";
import { db, schema, type Executor } from "@/server/db/client";
import { forwardAvailability } from "@/server/feishu/forward";
import { Problem, conflict, notAllowed, notFound } from "@/server/http/problem";
import { createTicket, moveTicket, platformDriven, ticketTypeConfig, type TicketRow, type TicketStatus } from "./engine";
import { mapAfterSale } from "./platform";
import { visibleTickets } from "./scope";

const t = schema.ticket;
const OPEN_SQL = sql`${t.status} in ('open','in_progress','waiting')`;
const DONE_SQL = sql`${t.status} in ('resolved','closed')`;

/** 手动类合法迁移（§11.4）；等待中 → 等待中 只在等待对象变化时成立 */
const LEGAL: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_progress", "waiting", "resolved"],
  in_progress: ["waiting", "resolved"],
  waiting: ["waiting", "in_progress", "resolved"],
  resolved: [],
  closed: [],
  void: [],
};

type ItemRow = { t: TicketRow; shopName: string; market: string; assigneeName: string | null; externalOrderId: string | null };

function itemSelect() {
  return db()
    .select({ t: schema.ticket, shopName: schema.shop.name, market: schema.shop.market, assigneeName: schema.user.name, externalOrderId: schema.order.externalOrderId })
    .from(schema.ticket)
    .innerJoin(schema.shop, eq(schema.shop.id, schema.ticket.shopId))
    .leftJoin(schema.membership, eq(schema.membership.id, schema.ticket.assigneeId))
    .leftJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .leftJoin(schema.order, eq(schema.order.id, schema.ticket.orderId));
}

function toItem(r: ItemRow, now = Date.now()): TicketItem {
  const x = r.t;
  const open = OPEN_TICKET_STATUSES.includes(x.status);
  const remainingSec = x.dueAt && open ? Math.round((x.dueAt.getTime() - now) / 1000) : null;
  return {
    id: x.id,
    number: x.number,
    type: x.type,
    origin: x.origin,
    status: x.status,
    waitingOn: x.waitingOn,
    phase: x.phase,
    platformStatus: x.platformStatus,
    shop: { id: x.shopId, name: r.shopName, platform: x.platform, market: r.market },
    buyerName: x.buyerName,
    orderId: x.orderId,
    externalOrderId: r.externalOrderId,
    conversationId: x.conversationId,
    description: x.description,
    assignee: x.assigneeId && r.assigneeName ? { id: x.assigneeId, name: r.assigneeName } : null,
    dueAt: x.dueAt?.toISOString() ?? null,
    dueSource: x.dueSource,
    overdue: remainingSec !== null && remainingSec < 0,
    remainingSec,
    platformDriven: platformDriven(x),
    version: x.version,
    createdAt: x.createdAt.toISOString(),
    updatedAt: (x.updatedAt ?? x.createdAt).toISOString(),
    resolvedAt: x.resolvedAt?.toISOString() ?? null,
  };
}

export async function itemById(id: string): Promise<TicketItem> {
  const [r] = await itemSelect().where(eq(t.id, id)).limit(1);
  return toItem(r);
}

/** 列表范围：可见范围 + 「我的」 */
function scopeOf(ctx: MemberContext, q: Pick<TicketListQuery, "scope">): "mine" | "all" {
  if (ctx.membership.role === "agent") return "mine";
  return q.scope ?? "all";
}

function baseWhere(ctx: MemberContext, scope: "mine" | "all", q?: Pick<TicketListQuery, "type" | "platform">): SQL {
  const conds = [visibleTickets(ctx)];
  if (scope === "mine") conds.push(eq(t.assigneeId, ctx.membership.id));
  if (q && q.type !== "all") conds.push(eq(t.type, q.type));
  if (q && q.platform !== "all") conds.push(eq(t.platform, q.platform));
  return and(...conds)!;
}

const touched = sql`coalesce(${t.updatedAt}, ${t.createdAt}) desc`;
const listOrder = [sql`case when ${OPEN_SQL} then 0 else 1 end`, sql`${t.dueAt} asc nulls last`, touched, desc(t.id)];

function encodeCursor(offset: number) {
  return Buffer.from(String(offset)).toString("base64url");
}
function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, "base64url").toString());
  if (!Number.isInteger(n) || n < 0) throw new Problem("validation", { detail: "分页游标无效，请从第一页重新加载。" });
  return n;
}

function localStarts(tz: string, now: Date) {
  const local = new TZDate(now.getTime(), tz);
  const today = new TZDate(local.getFullYear(), local.getMonth(), local.getDate(), 0, 0, 0, tz);
  const dow = (local.getDay() + 6) % 7; // 周一为 0
  const week = new TZDate(local.getFullYear(), local.getMonth(), local.getDate() - dow, 0, 0, 0, tz);
  return { today: new Date(today.getTime()), week: new Date(week.getTime()) };
}

async function stats(ctx: MemberContext, scope: "mine" | "all"): Promise<TicketStats> {
  const now = new Date();
  const soon = new Date(now.getTime() + 6 * 3600_000);
  const { week } = localStarts(ctx.merchant.timezone, now);
  const where = baseWhere(ctx, scope);
  const resolvedWeek = sql`${DONE_SQL} and ${t.resolvedAt} >= ${week}`;
  const [s] = await db()
    .select({
      open: sql<number>`count(*) filter (where ${OPEN_SQL})::int`,
      openPlatform: sql<number>`count(*) filter (where ${OPEN_SQL} and ${t.dueSource} = 'platform')::int`,
      openMerchant: sql<number>`count(*) filter (where ${OPEN_SQL} and ${t.dueSource} = 'merchant')::int`,
      due6h: sql<number>`count(*) filter (where ${OPEN_SQL} and ${t.dueAt} > ${now} and ${t.dueAt} <= ${soon})::int`,
      overdue: sql<number>`count(*) filter (where ${OPEN_SQL} and ${t.dueAt} < ${now})::int`,
      resolvedWeek: sql<number>`count(*) filter (where ${resolvedWeek})::int`,
      median: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${t.resolvedAt} - ${t.createdAt}))) filter (where ${resolvedWeek})`,
    })
    .from(t)
    .where(where);
  const dueSoon = await db()
    .select({ number: t.number })
    .from(t)
    .where(and(where, OPEN_SQL, sql`${t.dueAt} > ${now} and ${t.dueAt} <= ${soon}`))
    .orderBy(asc(t.dueAt))
    .limit(3);
  const [oldest] = await db()
    .select({ number: t.number, dueAt: t.dueAt })
    .from(t)
    .where(and(where, OPEN_SQL, sql`${t.dueAt} < ${now}`))
    .orderBy(asc(t.dueAt))
    .limit(1);
  return {
    open: s.open,
    due6h: s.due6h,
    overdue: s.overdue,
    resolvedThisWeek: s.resolvedWeek,
    resolveMedianSec: s.median === null ? null : Math.round(Number(s.median)),
    openPlatformDue: s.openPlatform,
    openMerchantDue: s.openMerchant,
    due6hNumbers: dueSoon.map((r) => r.number),
    overdueOldest: oldest?.dueAt ? { number: oldest.number, overdueSec: Math.round((now.getTime() - oldest.dueAt.getTime()) / 1000) } : null,
  };
}

// ---------- API-TKT-001 ----------

export async function listTickets(ctx: MemberContext, q: TicketListQuery): Promise<TicketList> {
  const scope = scopeOf(ctx, q);
  const where = and(baseWhere(ctx, scope, q), q.status !== "all" ? eq(t.status, q.status) : undefined)!;
  const offset = decodeCursor(q.cursor);
  const rows = await itemSelect().where(where).orderBy(...listOrder).limit(q.limit + 1).offset(offset);
  const now = Date.now();
  const items = rows.slice(0, q.limit).map((r) => toItem(r, now));

  const base = baseWhere(ctx, scope);
  const byType = await db()
    .select({ type: t.type, count: sql<number>`count(*)::int` })
    .from(t)
    .where(and(base, OPEN_SQL))
    .groupBy(t.type);
  const feedRows = await db()
    .select({ e: schema.ticketEvent, number: t.number, platform: t.platform, shopName: schema.shop.name })
    .from(schema.ticketEvent)
    .innerJoin(t, eq(t.id, schema.ticketEvent.ticketId))
    .innerJoin(schema.shop, eq(schema.shop.id, t.shopId))
    .where(and(base, eq(t.origin, "platform"), inArray(schema.ticketEvent.type, ["created", "platform_event"])))
    .orderBy(desc(schema.ticketEvent.createdAt))
    .limit(6);
  const platformFeed: PlatformFeedItem[] = feedRows.map((r) => {
    const d = r.e.data as { platformStatus?: string | null; phase?: string | null; dueAt?: string | null };
    return {
      id: r.e.id,
      at: r.e.createdAt.toISOString(),
      ticketId: r.e.ticketId,
      number: r.number,
      platform: r.platform,
      shopName: r.shopName,
      kind: r.e.type === "created" ? "created" : "moved",
      platformStatus: d.platformStatus ?? null,
      phase: d.phase ?? null,
      dueAt: d.dueAt ?? null,
    };
  });
  return {
    scope,
    items,
    nextCursor: rows.length > q.limit ? encodeCursor(offset + q.limit) : null,
    stats: await stats(ctx, scope),
    byType: byType.map((b) => ({ type: b.type, count: b.count })).sort((a, b) => b.count - a.count),
    platformFeed,
  };
}

export async function boardTickets(ctx: MemberContext, q: TicketListQuery): Promise<TicketBoard> {
  const scope = scopeOf(ctx, q);
  const base = baseWhere(ctx, scope, q);
  const { today } = localStarts(ctx.merchant.timezone, new Date());
  const now = Date.now();
  const PER_COLUMN = 10;
  const column = async (cond: SQL, order: SQL[]): Promise<BoardColumn> => {
    const [c] = await db().select({ n: sql<number>`count(*)::int` }).from(t).where(and(base, cond));
    const rows = await itemSelect().where(and(base, cond)).orderBy(...order).limit(PER_COLUMN);
    return { count: c.n, items: rows.map((r) => toItem(r, now)) };
  };
  const byDue = [sql`${t.dueAt} asc nulls last`, touched];
  const [open, inProgress, waiting, resolvedToday] = await Promise.all([
    column(eq(t.status, "open"), byDue),
    column(eq(t.status, "in_progress"), byDue),
    column(eq(t.status, "waiting"), byDue),
    column(sql`${t.status} = 'resolved' and ${t.resolvedAt} >= ${today}`, [desc(t.resolvedAt)]),
  ]);
  return {
    scope,
    columns: { open, in_progress: inProgress, waiting, resolved_today: resolvedToday },
    stats: await stats(ctx, scope),
    autoCloseDays: ctx.merchant.ticketAutoCloseDays,
  };
}

/** CSV：同一组筛选，最多 10,000 行（超出时 csv() 返回 422） */
export async function exportRows(ctx: MemberContext, q: TicketListQuery): Promise<Array<Array<string | number | null>>> {
  const scope = scopeOf(ctx, q);
  const where = and(baseWhere(ctx, scope, q), q.status !== "all" ? eq(t.status, q.status) : undefined)!;
  const rows = await itemSelect().where(where).orderBy(...listOrder).limit(10_001);
  const tz = ctx.merchant.timezone;
  const fmt = (iso: string | null) => (iso ? inTz(iso, tz, "yyyy-MM-dd HH:mm") : null);
  const now = Date.now();
  return [
    ["工单号", "类型", "来源", "状态", "等待对象", "阶段", "平台原始状态", "平台", "店铺", "买家", "订单号", "负责人", "时限", "时限来源", "超时", "说明", "创建时间", "更新时间"],
    ...rows.map((r) => {
      const i = toItem(r, now);
      return [
        i.number,
        TYPE_LABEL[i.type],
        i.origin === "platform" ? "平台事件" : i.origin === "rule" ? "规则" : "手动",
        STATUS_LABEL[i.status],
        i.waitingOn ? WAITING_LABEL[i.waitingOn] : null,
        i.phase,
        i.platformStatus,
        i.shop.platform === "shopee" ? "Shopee" : "TikTok",
        i.shop.name,
        i.buyerName,
        i.externalOrderId,
        i.assignee?.name ?? null,
        fmt(i.dueAt),
        i.dueSource === "platform" ? "平台截止" : i.dueSource === "merchant" ? "商户时限" : null,
        i.overdue ? "是" : "否",
        i.description,
        fmt(i.createdAt),
        fmt(i.updatedAt),
      ];
    }),
  ];
}

// ---------- API-TKT-002 ----------

const FLOWS: Record<string, string[]> = {
  "tiktok:return_refund": ["待审核", "等买家寄回", "待验货", "退款完成"],
  "tiktok:cancel_request": ["待处理", "已取消"],
  "shopee:return_refund": ["待处理", "等买家寄回", "平台判定中", "已退款"],
  "shopee:cancel_request": ["待处理", "已取消"],
};

function phaseSteps(x: TicketRow): TicketDetail["ticket"]["phases"] {
  if (x.status === "void") return [{ label: "已作废", state: "current" }];
  const done = x.status === "resolved" || x.status === "closed";
  let steps: string[];
  let cur: number;
  if (platformDriven(x)) {
    steps = [...(FLOWS[`${x.platform}:${x.type}`] ?? ["待处理", "已解决"])];
    if (done) {
      cur = steps.length - 1;
      if (x.phase) steps[cur] = x.phase;
    } else {
      cur = x.phase ? steps.indexOf(x.phase) : -1;
      if (cur < 0) {
        cur = x.status === "open" ? 0 : x.status === "waiting" ? 1 : Math.min(2, steps.length - 2);
        if (x.phase) steps[cur] = x.phase;
      }
    }
  } else {
    steps = ["待处理", "处理中", x.status === "closed" ? "已关闭" : "已解决"];
    cur = x.status === "open" ? 0 : done ? 2 : 1;
    if (x.status === "waiting") steps[1] = statusText(x);
  }
  return steps.map((label, i) => ({ label, state: i < cur || (done && i === cur) ? "done" : i === cur ? "current" : "todo" }));
}

function nextActions(x: TicketRow, afterSaleNext: string | null): TicketNextAction[] {
  if (!OPEN_TICKET_STATUSES.includes(x.status)) return [];
  if (platformDriven(x)) return [{ kind: "platform", code: afterSaleNext, label: "处理申请" }];
  const out: TicketNextAction[] = [];
  if (x.status !== "in_progress") out.push({ kind: "status", status: "in_progress", label: x.status === "waiting" ? "恢复处理" : "开始处理" });
  for (const w of ["buyer", "platform", "internal"] as WaitingOn[]) {
    if (!(x.status === "waiting" && x.waitingOn === w)) out.push({ kind: "status", status: "waiting", waitingOn: w, label: `等待中 · ${WAITING_LABEL[w]}` });
  }
  out.push({ kind: "status", status: "resolved", label: "标为已解决" });
  return out;
}

async function memberNames(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const rows = await db()
    .select({ id: schema.membership.id, name: schema.user.name })
    .from(schema.membership)
    .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .where(inArray(schema.membership.id, uniq));
  return new Map(rows.map((r) => [r.id, r.name]));
}

type DeliveryState = { status: "queued" | "sent" | "failed" | "skipped"; error: string | null };

/** 转发卡发送状态：发出前写「发送中」，没发出写原因，发出后不写 */
function deliveryText(state: DeliveryState | undefined): string | null {
  if (!state || state.status === "sent") return null;
  if (state.status === "queued") return "发送中";
  return `没有发出：${state.error ?? "原因未知"}`;
}

function eventText(e: typeof schema.ticketEvent.$inferSelect, actor: string | null, names: Map<string, string>, x: TicketRow, tz: string, deliveries: Map<string, DeliveryState> = new Map()): { title: string; detail: string | null } {
  const d = e.data as Record<string, unknown>;
  const fmt = (v: unknown) => (typeof v === "string" ? inTz(v, tz) : "无");
  const who = actor ?? (e.source === "webhook" ? "平台" : "系统");
  const st = (s: unknown, w?: unknown, p?: unknown) => (typeof s === "string" ? statusText({ status: s as TicketStatus, waitingOn: (w as WaitingOn) ?? null, phase: (p as string) ?? null }) : "");
  switch (e.type) {
    case "created": {
      const assignee = typeof d.assigneeId === "string" ? names.get(d.assigneeId) : null;
      const title = e.source === "page" ? `${who} 建单 ${x.number}` : x.origin === "platform" ? `平台事件建单 ${x.number}${d.platformStatus ? ` · ${platformStatusText(x.platform, String(d.platformStatus))}` : ""}` : `系统建单 ${x.number}`;
      const parts = [assignee ? `指派 ${assignee}` : "未指派", st(d.status, null, d.phase), d.dueAt ? `截止 ${fmt(d.dueAt)}` : null];
      return { title, detail: parts.filter(Boolean).join(" · ") };
    }
    case "status":
      if (d.to === "closed") return { title: "自动关闭", detail: typeof d.autoCloseDays === "number" ? `已解决超过 ${d.autoCloseDays} 天` : null };
      return { title: `${who} 改为 ${st(d.to, d.waitingOn, d.phase)}`, detail: `${st(d.from, d.fromWaitingOn)} → ${st(d.to, d.waitingOn, d.phase)}` };
    case "platform_event":
      return {
        title: `平台事件 · ${typeof d.phase === "string" && d.phase ? d.phase : typeof d.platformStatus === "string" ? platformStatusText(x.platform, d.platformStatus) : "状态更新"}`,
        detail: [st(d.to, d.waitingOn, d.phase), typeof d.platformStatus === "string" ? platformStatusText(x.platform, d.platformStatus) : null, d.dueAt ? `截止 ${fmt(d.dueAt)}` : "无平台截止"].filter(Boolean).join(" · "),
      };
    case "assign": {
      const to = typeof d.to === "string" ? (names.get(d.to) ?? "—") : "—";
      const from = typeof d.from === "string" ? (names.get(d.from) ?? "—") : "无";
      if (d.reason === "member_disabled") return { title: `${from} 被停用，系统改派给 ${to}`, detail: `原负责人 ${from}` };
      return { title: `${who} 改派给 ${to}`, detail: `原负责人 ${from}` };
    }
    case "note":
      return { title: `${who} 加备注`, detail: typeof d.text === "string" ? d.text : null };
    case "due_change":
      return { title: `${who} 改时限`, detail: `${fmt(d.from)} → ${fmt(d.to)}` };
    case "void":
      return { title: `${who} 作废工单`, detail: typeof d.reason === "string" ? `原因：${d.reason}` : null };
    case "action": {
      const label = typeof d.label === "string" ? d.label : "处理售后";
      const reason = typeof d.reasonText === "string" ? d.reasonText : typeof d.reason === "string" ? d.reason : typeof d.reasonCode === "string" ? d.reasonCode : null;
      const detail = [reason ? `原因：${reason}` : null, typeof d.comment === "string" ? `备注：${d.comment}` : null].filter(Boolean).join(" · ");
      return { title: typeof d.text === "string" ? d.text : `${who} ${label}`, detail: typeof d.detail === "string" ? d.detail : detail || null };
    }
    case "feishu": {
      const state = typeof d.deliveryId === "string" ? deliveries.get(d.deliveryId) : undefined;
      const detail = [typeof d.note === "string" && d.note ? `备注：${d.note}` : null, deliveryText(state)].filter(Boolean).join(" · ");
      return { title: `${who} 转发到飞书 · ${typeof d.targetName === "string" ? d.targetName : "飞书群"}`, detail: detail || null };
    }
  }
}

export async function loadVisible(ctx: MemberContext, id: string, ex: Executor = db(), lock = false): Promise<TicketRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  const q = ex.select().from(t).where(and(eq(t.id, id), visibleTickets(ctx)));
  const [row] = lock ? await q.for("update") : await q;
  if (!row) throw notFound("找不到这张工单，或它不在你的可见范围内。");
  return row;
}

export async function getTicket(ctx: MemberContext, id: string): Promise<TicketDetail> {
  const x = await loadVisible(ctx, id);
  const item = await itemById(x.id);
  const tz = ctx.merchant.timezone;

  const evRows = await db()
    .select({ e: schema.ticketEvent, actorName: schema.user.name })
    .from(schema.ticketEvent)
    .leftJoin(schema.membership, eq(schema.membership.id, schema.ticketEvent.actorId))
    .leftJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .where(and(eq(schema.ticketEvent.ticketId, x.id), eq(schema.ticketEvent.merchantId, ctx.merchant.id)))
    .orderBy(asc(schema.ticketEvent.createdAt), asc(schema.ticketEvent.id));
  const ids: string[] = [];
  for (const r of evRows) {
    const d = r.e.data as Record<string, unknown>;
    for (const k of ["assigneeId", "from", "to"]) if (typeof d[k] === "string" && /^[0-9a-f-]{36}$/i.test(d[k] as string)) ids.push(d[k] as string);
  }
  const names = await memberNames(ids);
  const deliveryRows = evRows.some((r) => r.e.type === "feishu")
    ? await db()
        .select({ id: schema.feishuDelivery.id, status: schema.feishuDelivery.status, error: schema.feishuDelivery.error })
        .from(schema.feishuDelivery)
        .where(and(eq(schema.feishuDelivery.ticketId, x.id), eq(schema.feishuDelivery.merchantId, ctx.merchant.id)))
    : [];
  const deliveries = new Map(deliveryRows.map((r) => [r.id, { status: r.status, error: r.error }]));
  const events: TicketEventItem[] = evRows.map((r) => ({ id: r.e.id, type: r.e.type, source: r.e.source, actorName: r.actorName, at: r.e.createdAt.toISOString(), ...eventText(r.e, r.actorName, names, x, tz, deliveries) }));

  let conversation: TicketDetail["related"]["conversation"] = null;
  if (x.conversationId) {
    const [c] = await db()
      .select({ id: schema.conversation.id, buyerName: schema.conversation.buyerName, handlingState: schema.conversation.handlingState, claimedBy: schema.conversation.claimedBy, lastMessageAt: schema.conversation.lastMessageAt })
      .from(schema.conversation)
      .where(and(eq(schema.conversation.id, x.conversationId), eq(schema.conversation.merchantId, ctx.merchant.id)));
    if (c) {
      const n = c.claimedBy ? await memberNames([c.claimedBy]) : new Map<string, string>();
      conversation = { id: c.id, buyerName: c.buyerName, handlingState: c.handlingState, claimedByName: c.claimedBy ? (n.get(c.claimedBy) ?? null) : null, lastMessageAt: c.lastMessageAt?.toISOString() ?? null };
    }
  }
  let order: TicketDetail["related"]["order"] = null;
  if (x.orderId) {
    const [o] = await db().select().from(schema.order).where(and(eq(schema.order.id, x.orderId), eq(schema.order.merchantId, ctx.merchant.id)));
    if (o) order = { id: o.id, externalOrderId: o.externalOrderId, platformStatus: o.platformStatus, total: o.totalAmount, currency: o.currency, itemsText: o.items.map((i) => `${i.name} ×${i.qty}`).join("、") };
  }
  let afterSale: TicketDetail["related"]["afterSale"] = null;
  if (x.afterSaleId) {
    const [a] = await db().select().from(schema.afterSale).where(and(eq(schema.afterSale.id, x.afterSaleId), eq(schema.afterSale.merchantId, ctx.merchant.id)));
    if (a) afterSale = { id: a.id, kind: a.kind, externalId: a.externalId, platformStatus: a.platformStatus, nextAction: a.nextAction, sellerDueAt: a.sellerDueAt?.toISOString() ?? null, dueField: a.dueField, reason: a.reason };
  }

  const cfg = await ticketTypeConfig(db(), ctx.merchant.id, x.type);
  const open = OPEN_TICKET_STATUSES.includes(x.status);
  const manualStatusAllowed = open && !platformDriven(x);
  const manage = ctx.can("tickets.manage");
  return {
    ticket: { ...item, manualStatusAllowed, phases: phaseSteps(x), nextActions: nextActions(x, afterSale?.nextAction ?? null), voidReason: x.voidReason, closedAt: x.closedAt?.toISOString() ?? null, remind: cfg.remind },
    events,
    links: { conversationId: x.conversationId ?? undefined, orderId: x.orderId ?? undefined, afterSaleId: x.afterSaleId ?? undefined },
    related: { conversation, order, afterSale },
    permissions: {
      canChangeStatus: manualStatusAllowed && ctx.can("tickets.own"),
      canAssign: manage && open,
      canVoid: manage && open,
      canChangeDue: manage && open && x.dueSource !== "platform",
      canNote: ctx.can("tickets.own"),
    },
    feishu: await forwardAvailability(ctx.merchant.id),
  };
}

// ---------- 负责人校验 ----------

async function assertAssignable(ex: Executor, merchantId: string, shopId: string, membershipId: string): Promise<{ id: string; name: string }> {
  const [m] = await ex
    .select({ id: schema.membership.id, role: schema.membership.role, name: schema.user.name })
    .from(schema.membership)
    .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .where(and(eq(schema.membership.id, membershipId), eq(schema.membership.merchantId, merchantId), eq(schema.membership.status, "active")));
  if (!m) throw new Problem("validation", { detail: "所选负责人不存在或已停用。", code: "assignee_not_in_shop", extra: { fields: { assigneeId: "负责人不存在或已停用" } } });
  if (m.role !== "admin") {
    const [link] = await ex
      .select({ id: schema.membershipShop.membershipId })
      .from(schema.membershipShop)
      .where(and(eq(schema.membershipShop.membershipId, m.id), eq(schema.membershipShop.shopId, shopId)));
    if (!link) throw new Problem("validation", { detail: `${m.name} 不负责这家店，不能指派。`, code: "assignee_not_in_shop", extra: { fields: { assigneeId: "这位成员不负责这家店" } } });
  }
  return { id: m.id, name: m.name };
}

// ---------- API-TKT-003 ----------

const KIND_OF: Partial<Record<TicketType, "return" | "cancel">> = { return_refund: "return", cancel_request: "cancel" };

export async function createManualTicket(ctx: MemberContext, body: CreateTicketBody): Promise<TicketItem> {
  const merchantId = ctx.merchant.id;
  const [shop] = await db().select().from(schema.shop).where(and(eq(schema.shop.id, body.shopId), eq(schema.shop.merchantId, merchantId)));
  if (!shop || !inScope(ctx, shop.id)) throw notFound("找不到这家店，或它不在你的负责范围内。");

  let assigneeId: string | undefined;
  if (ctx.membership.role === "agent") {
    if (body.assigneeId && body.assigneeId !== ctx.membership.id) throw new Problem("forbidden", { detail: "员工建的工单只能由自己负责，不能指定他人。", code: "assignee_not_allowed" });
    assigneeId = ctx.membership.id;
  } else if (body.assigneeId) {
    assigneeId = (await assertAssignable(db(), merchantId, shop.id, body.assigneeId)).id;
  }

  let afterSale: typeof schema.afterSale.$inferSelect | null = null;
  if (body.afterSaleId) {
    const [a] = await db().select().from(schema.afterSale).where(and(eq(schema.afterSale.id, body.afterSaleId), eq(schema.afterSale.merchantId, merchantId)));
    if (!a) throw notFound("找不到这张售后单。");
    if (a.shopId !== shop.id) throw new Problem("validation", { detail: "售后单不属于所选店铺。", extra: { fields: { afterSaleId: "售后单不属于这家店" } } });
    afterSale = a;
  }
  let order: typeof schema.order.$inferSelect | null = null;
  const orderId = body.orderId ?? afterSale?.orderId ?? undefined;
  if (orderId) {
    const [o] = await db().select().from(schema.order).where(and(eq(schema.order.id, orderId), eq(schema.order.merchantId, merchantId)));
    if (!o) throw notFound("找不到这张订单。");
    if (o.shopId !== shop.id) throw new Problem("validation", { detail: "订单不属于所选店铺。", extra: { fields: { orderId: "订单不属于这家店" } } });
    if (afterSale && afterSale.externalOrderId !== o.externalOrderId) throw new Problem("validation", { detail: "售后单与所选订单不对应。", extra: { fields: { afterSaleId: "售后单不属于这张订单" } } });
    order = o;
  }
  // 退货退款、取消申请：没指定售后单时取该订单最近一张同类售后单，与平台事件建的工单同一去重键
  const kind = KIND_OF[body.type];
  if (kind && afterSale && afterSale.kind !== kind) throw new Problem("validation", { detail: `所选售后单不是${TYPE_LABEL[body.type]}。`, extra: { fields: { afterSaleId: "售后单类别与工单类型不一致" } } });
  if (kind && !afterSale && order) {
    const [a] = await db()
      .select()
      .from(schema.afterSale)
      .where(and(eq(schema.afterSale.shopId, shop.id), eq(schema.afterSale.externalOrderId, order.externalOrderId), eq(schema.afterSale.kind, kind)))
      .orderBy(desc(schema.afterSale.updatedAt))
      .limit(1);
    afterSale = a ?? null;
  }
  const linked = kind && afterSale ? afterSale : null;

  let conv: { id: string; buyerName: string; claimedBy: string | null } | null = null;
  if (body.conversationId) {
    const [c] = await db()
      .select({ id: schema.conversation.id, buyerName: schema.conversation.buyerName, claimedBy: schema.conversation.claimedBy, shopId: schema.conversation.shopId })
      .from(schema.conversation)
      .where(and(eq(schema.conversation.id, body.conversationId), visibleConversations(ctx)));
    if (!c) throw notFound("找不到这个会话。");
    if (c.shopId !== shop.id) throw new Problem("validation", { detail: "会话不属于所选店铺。", extra: { fields: { conversationId: "会话不属于这家店" } } });
    conv = c;
  }

  let mapped: ReturnType<typeof mapAfterSale> | null = null;
  let dueAt: Date | null = null;
  let dueSource: "platform" | "merchant" | null = null;
  if (linked) {
    if (body.dueAt) throw new Problem("validation", { detail: "这类工单的时限读平台截止字段，不能手动设置。", code: "due_not_editable", extra: { fields: { dueAt: "平台截止，不可改" } } });
    mapped = mapAfterSale(linked);
    if (mapped.status === "resolved") throw notAllowed(`这张售后单在平台已结束（${linked.platformStatus}），不需要再建工单。`, "after_sale_closed");
    // Shopee 取消申请没有平台截止：商户 24 小时且不晚于最晚发货（同 platform.ts）
    if (shop.platform === "shopee" && linked.kind === "cancel") {
      const merchant24 = new Date(Date.now() + 24 * 3600_000);
      const cap = order?.shipByAt ?? null;
      dueAt = cap && cap < merchant24 ? cap : merchant24;
      dueSource = cap && cap < merchant24 ? "platform" : "merchant";
    }
  } else if (body.dueAt) {
    dueAt = new Date(body.dueAt);
    if (dueAt.getTime() <= Date.now()) throw new Problem("validation", { detail: "时限要晚于现在。", extra: { fields: { dueAt: "时限要晚于现在" } } });
    dueSource = "merchant";
  }

  const dedupeKey = linked ? `${linked.kind}:${linked.externalId}` : order ? `${body.type}:${order.externalOrderId}` : `${body.type}:manual:${uuidv7()}`;

  const result = await db().transaction(async (tx) =>
    createTicket(
      tx,
      {
        merchantId,
        type: body.type,
        origin: "manual",
        dedupeKey,
        shopId: shop.id,
        platform: shop.platform,
        orderId: order?.id ?? null,
        afterSaleId: afterSale?.id ?? null,
        conversationId: conv?.id ?? null,
        buyerName: conv?.buyerName ?? order?.buyerName ?? null,
        status: mapped?.status,
        waitingOn: mapped?.waitingOn ?? null,
        phase: mapped?.phase ?? null,
        platformStatus: linked?.platformStatus ?? null,
        platformDueAt: mapped?.dueAt ?? null,
        dueAt,
        dueSource,
        description: body.note || null,
        assigneeId: assigneeId ?? null,
        createdBy: ctx.membership.id,
        claimerId: conv?.claimedBy ?? null,
      },
      ctx.actor,
    ),
  );
  if (!result.ticket) throw notAllowed("这类工单没有开启建单。", "type_disabled");
  if (!result.created) {
    const ex = result.ticket;
    throw new Problem("duplicate", {
      title: "已有同一工单",
      detail: `${ex.number} 还没结束，不能重复建。`,
      code: "ticket_duplicate",
      extra: { existingTicketId: ex.id, existingId: ex.id, number: ex.number },
    });
  }
  return itemById(result.ticket.id);
}

// ---------- API-TKT-004 ----------

export async function changeStatus(ctx: MemberContext, id: string, body: TicketStatusBody): Promise<TicketItem> {
  await db().transaction(async (tx) => {
    const row = await loadVisible(ctx, id, tx, true);
    if (platformDriven(row)) throw notAllowed("平台类工单的状态只随平台事件变化；到订单页处理售后后会自动推进。", "platform_driven");
    const waitingOn = body.status === "waiting" ? body.waitingOn! : null;
    if (row.status === body.status && row.waitingOn === waitingOn) return;
    if (!LEGAL[row.status].includes(body.status)) throw notAllowed(`${STATUS_LABEL[row.status]}的工单不能改为${STATUS_LABEL[body.status]}。`, "illegal_transition");
    if (row.version !== body.version) {
      throw conflict("工单已被他人更新，已刷新为最新状态。", { current: { status: row.status, waitingOn: row.waitingOn, version: row.version } }, "version_mismatch");
    }
    const next = await moveTicket(tx, row, { status: body.status, waitingOn }, ctx.actor);
    if (body.status !== "resolved") {
      await audit(
        ctx.actor,
        { module: "tickets", action: "ticket_status_changed", summary: `${row.number} 改为 ${statusText(next)}`, targetType: "ticket", targetId: row.id, data: { from: row.status, to: next.status, waitingOn } },
        tx,
      );
    }
  });
  return itemById(id);
}

// ---------- API-TKT-005 ----------

export async function assignTicket(ctx: MemberContext, id: string, assigneeId: string): Promise<TicketItem> {
  await db().transaction(async (tx) => {
    const row = await loadVisible(ctx, id, tx, true);
    if (row.assigneeId === assigneeId) return;
    const target = await assertAssignable(tx, ctx.merchant.id, row.shopId, assigneeId);
    await tx.update(t).set({ assigneeId: target.id, version: row.version + 1, updatedAt: new Date() }).where(eq(t.id, row.id));
    await tx.insert(schema.ticketEvent).values({ merchantId: row.merchantId, ticketId: row.id, type: "assign", actorId: ctx.membership.id, source: "page", data: { from: row.assigneeId, to: target.id } });
    await audit(ctx.actor, { module: "tickets", action: "ticket_reassigned", summary: `${row.number} 改派给 ${target.name}`, targetType: "ticket", targetId: row.id, data: { from: row.assigneeId, to: target.id } }, tx);
    if (target.id !== ctx.membership.id) {
      await notify(
        {
          merchantId: row.merchantId,
          membershipIds: [target.id],
          event: "ticket_assigned",
          title: `工单 ${row.number} ${TYPE_LABEL[row.type]} 改派给你`,
          body: [row.buyerName, `${ctx.actor.kind === "member" ? ctx.actor.name : ""} 改派`].filter(Boolean).join(" · "),
          link: `/tickets/${row.id}`,
          dedupeKey: `ticket_assigned:${row.id}:${target.id}`,
        },
        tx,
      );
    }
  });
  return itemById(id);
}

// ---------- API-TKT-006 ----------

export async function addNote(ctx: MemberContext, id: string, text: string): Promise<TicketEventItem> {
  return db().transaction(async (tx) => {
    const row = await loadVisible(ctx, id, tx);
    const [e] = await tx.insert(schema.ticketEvent).values({ merchantId: row.merchantId, ticketId: row.id, type: "note", actorId: ctx.membership.id, source: "page", data: { text } }).returning();
    await tx.update(t).set({ updatedAt: new Date() }).where(eq(t.id, row.id));
    await audit(ctx.actor, { module: "tickets", action: "ticket_note_added", summary: `${row.number} 加备注`, targetType: "ticket", targetId: row.id, data: { length: text.length } }, tx);
    const name = ctx.actor.kind === "member" ? ctx.actor.name : null;
    return { id: e.id, type: "note", source: "page", actorName: name, at: e.createdAt.toISOString(), title: `${name ?? "成员"} 加备注`, detail: text };
  });
}

// ---------- API-TKT-007 ----------

export async function voidTicket(ctx: MemberContext, id: string, reason: string): Promise<TicketItem> {
  await db().transaction(async (tx) => {
    const row = await loadVisible(ctx, id, tx, true);
    if (row.status === "void") return;
    if (row.status === "resolved" || row.status === "closed") throw notAllowed(`${STATUS_LABEL[row.status]}的工单不能作废。`, "ticket_finished");
    await tx.update(t).set({ status: "void", waitingOn: null, voidReason: reason, version: row.version + 1, updatedAt: new Date() }).where(eq(t.id, row.id));
    await tx.insert(schema.ticketEvent).values({ merchantId: row.merchantId, ticketId: row.id, type: "void", actorId: ctx.membership.id, source: "page", data: { from: row.status, reason } });
    await audit(ctx.actor, { module: "tickets", action: "ticket_voided", summary: `${row.number} 作废：${reason}`, targetType: "ticket", targetId: row.id, data: { from: row.status, reason } }, tx);
  });
  return itemById(id);
}

// ---------- API-TKT-008 ----------

export async function changeDue(ctx: MemberContext, id: string, dueAtIso: string): Promise<TicketItem> {
  const dueAt = new Date(dueAtIso);
  await db().transaction(async (tx) => {
    const row = await loadVisible(ctx, id, tx, true);
    if (row.dueSource === "platform") throw notAllowed("这张工单的时限来自平台截止字段，不能改。", "platform_due");
    if (!OPEN_TICKET_STATUSES.includes(row.status)) throw notAllowed(`${STATUS_LABEL[row.status]}的工单不用再改时限。`, "ticket_finished");
    if (row.dueAt?.getTime() === dueAt.getTime()) return;
    if (dueAt.getTime() <= Date.now()) throw new Problem("validation", { detail: "时限要晚于现在。", extra: { fields: { dueAt: "时限要晚于现在" } } });
    await tx.update(t).set({ dueAt, dueSource: "merchant", remindersSent: [], version: row.version + 1, updatedAt: new Date() }).where(eq(t.id, row.id));
    await tx.insert(schema.ticketEvent).values({ merchantId: row.merchantId, ticketId: row.id, type: "due_change", actorId: ctx.membership.id, source: "page", data: { from: row.dueAt?.toISOString() ?? null, to: dueAt.toISOString() } });
    await audit(
      ctx.actor,
      { module: "tickets", action: "ticket_due_changed", summary: `${row.number} 时限改为 ${inTz(dueAt, ctx.merchant.timezone)}`, targetType: "ticket", targetId: row.id, data: { from: row.dueAt?.toISOString() ?? null, to: dueAt.toISOString() } },
      tx,
    );
  });
  return itemById(id);
}
