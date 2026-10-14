import { z } from "zod";
import { zUuid } from "./common";

// 工单契约（DESIGN §8.7 API-TKT-001…008、§9.4）：前后端共用。

export const TICKET_TYPES = ["return_refund", "cancel_request", "logistics", "invoice", "stock", "handover", "internal"] as const;
export const TICKET_STATUSES = ["open", "in_progress", "waiting", "resolved", "closed", "void"] as const;
export const WAITING_ON = ["buyer", "platform", "internal"] as const;

export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type WaitingOn = (typeof WAITING_ON)[number];

export const zTicketType = z.enum(TICKET_TYPES);

export const TYPE_LABEL: Record<TicketType, string> = {
  return_refund: "退货退款",
  cancel_request: "取消申请",
  logistics: "物流异常",
  invoice: "开票",
  stock: "缺货 / 到货跟进",
  handover: "跨班交接",
  internal: "内部确认",
};
export const STATUS_LABEL: Record<TicketStatus, string> = { open: "待处理", in_progress: "处理中", waiting: "等待中", resolved: "已解决", closed: "已关闭", void: "已作废" };
export const WAITING_LABEL: Record<WaitingOn, string> = { buyer: "等买家", platform: "等平台", internal: "等内部" };
export const OPEN_TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "waiting"];

/** 「等待中 · 等买家」「处理中 · 待验货」「待处理」：等待中带等待对象，其余带与状态名不同的阶段 */
export function statusText(t: { status: TicketStatus; waitingOn?: WaitingOn | null; phase?: string | null }): string {
  const base = STATUS_LABEL[t.status];
  if (t.status === "waiting" && t.waitingOn) return `${base} · ${WAITING_LABEL[t.waitingOn]}`;
  if (t.phase && t.phase !== base && OPEN_TICKET_STATUSES.includes(t.status)) return `${base} · ${t.phase}`;
  return base;
}

const zIsoTime = z.iso.datetime({ offset: true, message: "时间格式不对" });

// API-TKT-001
export const ticketListQuery = z.object({
  type: z.enum(["all", ...TICKET_TYPES]).default("all"),
  status: z.enum(["all", ...TICKET_STATUSES]).default("all"),
  platform: z.enum(["all", "shopee", "tiktok"]).default("all"),
  /** 不传时：员工为 mine，组长与管理员为 all；员工传 all 也只返回指派给自己的 */
  scope: z.enum(["mine", "all"]).optional(),
  view: z.enum(["list", "board"]).default("list"),
  format: z.enum(["json", "csv"]).default("json"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type TicketListQuery = z.infer<typeof ticketListQuery>;

// API-TKT-003
export const createTicketBody = z.object({
  type: zTicketType,
  shopId: zUuid,
  orderId: zUuid.optional(),
  afterSaleId: zUuid.optional(),
  conversationId: zUuid.optional(),
  assigneeId: zUuid.optional(),
  /** 仅商户时限类可填；不填按接待设置里该类型的商户时限 */
  dueAt: zIsoTime.optional(),
  note: z.string().trim().max(2000, "说明最多 2000 字").optional(),
});
export type CreateTicketBody = z.infer<typeof createTicketBody>;

// API-TKT-004
export const ticketStatusBody = z
  .object({
    status: z.enum(["in_progress", "waiting", "resolved"]),
    waitingOn: z.enum(WAITING_ON).optional(),
    version: z.number().int().min(1),
  })
  .refine((b) => b.status !== "waiting" || !!b.waitingOn, { message: "改为等待中时要选在等谁", path: ["waitingOn"] });
export type TicketStatusBody = z.infer<typeof ticketStatusBody>;

// API-TKT-005…008
export const ticketAssignBody = z.object({ assigneeId: zUuid });
export const ticketNoteBody = z.object({ text: z.string().trim().min(1, "备注不能为空").max(2000, "备注最多 2000 字") });
export const ticketVoidBody = z.object({ reason: z.string().trim().min(1, "请填写作废原因").max(200, "原因最多 200 字") });
export const ticketDueBody = z.object({ dueAt: zIsoTime });

// ── 响应 ──

export type TicketItem = {
  id: string;
  number: string;
  type: TicketType;
  origin: "platform" | "manual" | "rule";
  status: TicketStatus;
  waitingOn: WaitingOn | null;
  phase: string | null;
  platformStatus: string | null;
  shop: { id: string; name: string; platform: "shopee" | "tiktok"; market: string };
  buyerName: string | null;
  orderId: string | null;
  externalOrderId: string | null;
  conversationId: string | null;
  description: string | null;
  assignee: { id: string; name: string } | null;
  dueAt: string | null;
  dueSource: "platform" | "merchant" | null;
  overdue: boolean;
  /** dueAt − 现在，秒；已超时为负；无时限为 null */
  remainingSec: number | null;
  /** 状态只随平台事件变化（退货退款、取消申请且关联售后单） */
  platformDriven: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type TicketStats = {
  open: number;
  due6h: number;
  overdue: number;
  resolvedThisWeek: number;
  resolveMedianSec: number | null;
  /** 未结工单按时限来源拆分 */
  openPlatformDue: number;
  openMerchantDue: number;
  /** 6 小时内到期的前 3 个工单号 */
  due6hNumbers: string[];
  /** 超时最久的一张 */
  overdueOldest: { number: string; overdueSec: number } | null;
};

export type PlatformFeedItem = {
  id: string;
  at: string;
  ticketId: string;
  number: string;
  platform: "shopee" | "tiktok";
  shopName: string;
  kind: "created" | "moved";
  platformStatus: string | null;
  phase: string | null;
  dueAt: string | null;
};

export type TicketList = {
  scope: "mine" | "all";
  items: TicketItem[];
  nextCursor: string | null;
  stats: TicketStats;
  byType: Array<{ type: TicketType; count: number }>;
  platformFeed: PlatformFeedItem[];
};

export type BoardColumn = { count: number; items: TicketItem[] };
export type TicketBoard = {
  scope: "mine" | "all";
  columns: { open: BoardColumn; in_progress: BoardColumn; waiting: BoardColumn; resolved_today: BoardColumn };
  stats: TicketStats;
  autoCloseDays: number | null;
};

export type TicketEventItem = {
  id: string;
  type: "created" | "status" | "assign" | "note" | "platform_event" | "due_change" | "action" | "void";
  source: "page" | "system" | "webhook";
  actorName: string | null;
  at: string;
  title: string;
  detail: string | null;
};

export type TicketNextAction =
  | { kind: "status"; status: "in_progress" | "waiting" | "resolved"; waitingOn?: WaitingOn; label: string }
  | { kind: "platform"; code: string | null; label: string };

export type TicketDetail = {
  ticket: TicketItem & {
    manualStatusAllowed: boolean;
    phases: Array<{ label: string; state: "done" | "current" | "todo" }>;
    nextActions: TicketNextAction[];
    voidReason: string | null;
    closedAt: string | null;
    remind: { hoursBefore?: number; remainingPercent?: number };
  };
  events: TicketEventItem[];
  links: { conversationId?: string; orderId?: string; afterSaleId?: string };
  related: {
    conversation: { id: string; buyerName: string; handlingState: "bot" | "awaiting_human" | "human" | "closed"; claimedByName: string | null; lastMessageAt: string | null } | null;
    order: { id: string; externalOrderId: string; platformStatus: string; total: string; currency: string; itemsText: string } | null;
    afterSale: { id: string; kind: "return" | "cancel"; externalId: string; platformStatus: string; nextAction: string | null; sellerDueAt: string | null; dueField: string | null; reason: string | null } | null;
  };
  permissions: { canChangeStatus: boolean; canAssign: boolean; canVoid: boolean; canChangeDue: boolean; canNote: boolean };
};
