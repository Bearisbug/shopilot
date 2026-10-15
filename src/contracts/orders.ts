// 订单、售后、发票契约（DESIGN §8.6 API-ORD-001…008、API-INV-001…005；字段见 §9.4）。
import { z } from "zod";
import { zEmail, zPlatform } from "./common";

export const STATUS_GROUPS = ["unpaid", "to_ship", "shipped", "delivered", "completed", "cancelled", "in_cancel", "returning"] as const;
export type StatusGroup = (typeof STATUS_GROUPS)[number];

export const STATUS_GROUP_LABEL: Record<StatusGroup, string> = {
  unpaid: "待付款",
  to_ship: "待发货",
  shipped: "运输中",
  delivered: "已送达",
  completed: "已完成",
  cancelled: "已取消",
  in_cancel: "取消申请中",
  returning: "退货退款",
};

// ── 订单 ──

export const ordersQuery = z.object({
  platform: zPlatform.optional(),
  statusGroup: z.enum(STATUS_GROUPS).optional(),
  shopId: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  format: z.enum(["json", "csv"]).default("json"),
});
export type OrdersQuery = z.infer<typeof ordersQuery>;

export type ShopRef = { id: string; name: string; platform: "shopee" | "tiktok"; market: string };
export type OrderItemLine = { name: string; sku?: string; qty: number; unitPrice: string; image?: string };
export type TicketRef = { id: string; number: string; type: string; status: string; phase: string | null };

export type OrderListItem = {
  id: string;
  shop: ShopRef;
  externalOrderId: string;
  buyerName: string | null;
  statusGroup: StatusGroup;
  platformStatus: string;
  total: string;
  currency: string;
  items: OrderItemLine[];
  shipByAt: string | null;
  createdAt: string;
  updatedAt: string;
  tracking: { carrier: string | null; trackingNo: string | null; lastEvent: { at: string; text: string } | null } | null;
  afterSale: { id: string; kind: "return" | "cancel"; platformStatus: string; open: boolean } | null;
  openTicket: TicketRef | null;
};

export type AfterSalePending = {
  ticketId: string;
  number: string;
  type: "return_refund" | "cancel_request";
  status: "open" | "in_progress" | "waiting";
  waitingOn: "buyer" | "platform" | "internal" | null;
  phase: string | null;
  platformStatus: string | null;
  dueAt: string | null;
  overdue: boolean;
  buyerName: string | null;
  shop: ShopRef;
  orderId: string | null;
  externalOrderId: string | null;
  afterSaleId: string | null;
  afterSaleKind: "return" | "cancel" | null;
  amount: string | null;
  currency: string | null;
  itemsText: string | null;
  /** 卖家现在能处理（待审核、待验货、取消申请待处理）；false 时只能查看 */
  actionable: boolean;
};

export type SyncState = { shopId: string; name: string; platform: "shopee" | "tiktok"; market: string; lastSyncAt: string | null; pushOk: boolean };

export type OrderStats = { toShip: number; toShipDueToday: number; shipped: number; newToday: number; newTodayByPlatform: { shopee: number; tiktok: number } };

export type OrdersResponse = {
  items: OrderListItem[];
  nextCursor: string | null;
  afterSalesPending: AfterSalePending[];
  syncState: SyncState[];
  stats: OrderStats;
};

export type InvoiceSummary = {
  id: string;
  number: string;
  kind: "invoice" | "receipt";
  buyerName: string;
  amount: string;
  currency: string;
  chatStatus: "skipped" | "pending" | "sent" | "failed";
  chatError: string | null;
  emailStatus: "skipped" | "pending" | "sent" | "failed" | "bounced";
  emailError: string | null;
  emailTo: string | null;
  pdfUrl: string;
  imageUrl: string | null;
  createdAt: string;
};

export type OrderDetail = {
  order: OrderListItem & {
    recipient: { name?: string; phone?: string; address?: string; masked: boolean } | null;
    trackingEvents: Array<{ at: string; text: string }>;
    deadlines: Record<string, string> | null;
    syncedAt: string;
  };
  afterSales: AfterSaleSummary[];
  tickets: TicketRef[];
  invoices: InvoiceSummary[];
  /** 买家在本店最近的会话（当前成员可见时） */
  conversation: { id: string; handlingState: string; claimedByMe: boolean } | null;
  cancel: { allowed: boolean; reason: string | null };
};

export const syncBody = z.object({ shopId: z.string().uuid().optional() });
export type SyncResult = { jobIds: string[]; shopIds: string[] };

export const cancelOrderBody = z.object({ reason: z.literal("buyer_request"), conversationId: z.string().uuid().optional() });

// ── 售后 ──

export type AfterSaleSummary = {
  id: string;
  kind: "return" | "cancel";
  platform: "shopee" | "tiktok";
  externalId: string;
  platformStatus: string;
  open: boolean;
  /** 卖家现在能处理（取消申请待处理、退货待审核或待验货） */
  actionable: boolean;
  returnType: string | null;
  sellerDueAt: string | null;
  updatedAt: string | null;
};

export const RETURN_DECISIONS = ["approve_return", "reject_return", "approve_received", "reject_received", "confirm_refund", "dispute"] as const;
export type ReturnDecision = (typeof RETURN_DECISIONS)[number];

export type AfterSaleAction = { decision: ReturnDecision | "accept" | "reject"; allowed: boolean; reason: string | null; needsReason: boolean };

export type AfterSaleDetail = AfterSaleSummary & {
  nextAction: string | null;
  dueField: string | null;
  reason: string | null;
  amount: string | null;
  currency: string | null;
  evidence: string[];
  arbitrationStatus: string | null;
  order: { id: string | null; externalOrderId: string; buyerName: string | null; items: OrderItemLine[]; total: string | null; currency: string | null; platformStatus: string | null; shipByAt: string | null };
  shop: ShopRef;
  ticket: (TicketRef & { dueAt: string | null; dueSource: string | null; overdue: boolean }) | null;
  conversationId: string | null;
  actions: AfterSaleAction[];
};

export const cancellationDecisionBody = z.object({ decision: z.enum(["accept", "reject"]), reason: z.string().trim().max(200).optional() });
export const returnDecisionBody = z.object({
  decision: z.enum(RETURN_DECISIONS),
  reasonCode: z.string().trim().max(200).optional(),
  comment: z.string().trim().max(500).optional(),
});
export type RejectReasons = { items: Array<{ code: string; text: string }> };

/** Shopee 发起争议的原因：取自 Shopee 开放平台 Data Definition「ReturnDisputeReasonId」（docs/platform-api/raw/shopee/guides.json） */
export const SHOPEE_DISPUTE_REASONS = [
  { code: "2", text: "拒绝这次退货申请" },
  { code: "44", text: "和买家协商不成" },
  { code: "41", text: "已发货且有发货凭证" },
  { code: "42", text: "发出的商品与买家订购的一致" },
  { code: "43", text: "发出的商品完好可用" },
  { code: "46", text: "没有收到退回的商品" },
  { code: "47", text: "退回的商品有物理损坏" },
  { code: "48", text: "退回的商品缺件（数量或配件）" },
  { code: "49", text: "退回的商品不是原商品" },
  { code: "56", text: "退回的商品已被使用" },
] as const;

// ── 发票 ──

export const extractBody = z.object({ conversationId: z.string().uuid(), orderId: z.string().uuid().optional() });
export type ExtractResult = { fields: { buyerName?: string; address?: string; email?: string; taxId?: string }; confidence: number };

const money2 = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "金额最多两位小数");

export const invoiceFieldsBody = z.object({
  buyerName: z.string().trim().min(1, "请填写抬头").max(200),
  address: z.string().trim().min(1, "请填写地址").max(500),
  email: z.union([zEmail, z.literal("")]).optional(),
  taxId: z.string().trim().max(60).optional(),
  items: z
    .array(z.object({ name: z.string().trim().min(1).max(200), sku: z.string().trim().max(200).optional(), qty: z.number().int().min(1).max(100_000), unitPrice: money2 }))
    .min(1, "至少一行商品")
    .max(50),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "币种是三位大写字母"),
  notes: z.string().trim().max(500).optional(),
});

export const createInvoiceBody = z.object({
  kind: z.enum(["invoice", "receipt"]),
  conversationId: z.string().uuid().optional(),
  orderId: z.string().uuid(),
  fields: invoiceFieldsBody,
  sendToChat: z.boolean(),
  sendEmail: z.boolean(),
});
export type CreateInvoiceBody = z.infer<typeof createInvoiceBody>;
export type CreateInvoiceResult = { invoice: InvoiceSummary };

export const invoicesQuery = z.object({
  kind: z.enum(["invoice", "receipt"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type InvoiceListItem = InvoiceSummary & {
  orderId: string | null;
  externalOrderId: string | null;
  conversationId: string | null;
  shop: ShopRef;
  ticket: { id: string; number: string } | null;
};
export type InvoicesResponse = { items: InvoiceListItem[]; nextCursor: string | null; stats: { thisMonth: number; total: number } };

export const resendInvoiceBody = z.object({ email: z.union([zEmail, z.literal("")]).optional() });
