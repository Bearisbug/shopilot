import { z } from "zod";
import { zPlatform, zUuid } from "./common";

// ── 请求 ──

export const CONV_VIEWS = ["queue", "ai", "mine", "team", "done"] as const;
export type ConvView = (typeof CONV_VIEWS)[number];

export const conversationsQuery = z.object({
  view: z.enum(CONV_VIEWS).default("queue"),
  platform: zPlatform.optional(),
  shopId: zUuid.optional(),
  cursor: z.string().optional(),
});
export type ConversationsQuery = z.infer<typeof conversationsQuery>;

export const conversationQuery = z.object({ before: zUuid.optional() });
export const versionBody = z.object({ version: z.number().int().min(1) });
export const assignBody = z.object({ toMembershipId: zUuid, withTickets: z.boolean().default(false), version: z.number().int().min(1) });
export const closeBody = z.object({ reason: z.string().trim().max(200).optional(), version: z.number().int().min(1) });
export const stageBody = z.object({ stage: z.enum(["presale", "insale", "aftersale", "unknown"]) });

export const OUT_TYPES = ["text", "image", "order_card", "logistics_card", "return_card", "coupon_card"] as const;
export type OutType = (typeof OUT_TYPES)[number];

export const sendBody = z
  .object({
    clientRequestId: z.string().min(8).max(80),
    type: z.enum(OUT_TYPES),
    text: z.string().trim().max(2000, "文字最多 2,000 字").optional(),
    fileId: zUuid.optional(),
    orderId: z.string().max(64).optional(),
    packageId: z.string().max(64).optional(),
    skuId: z.string().max(64).optional(),
    couponId: z.string().max(64).optional(),
    /** 只用于时间线显示 */
    couponTitle: z.string().max(200).optional(),
    translateTo: z.enum(["ms", "en", "th", "vi", "id", "tl", "zh"]).optional(),
    draftId: zUuid.optional(),
    disposition: z.enum(["sent", "edited_sent"]).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.type === "text" && !b.text) ctx.addIssue({ code: "custom", path: ["text"], message: "请输入要发送的文字" });
    if (b.type === "image" && !b.fileId) ctx.addIssue({ code: "custom", path: ["fileId"], message: "请先上传图片" });
    if (["order_card", "logistics_card", "return_card"].includes(b.type) && !b.orderId) ctx.addIssue({ code: "custom", path: ["orderId"], message: "请选择订单" });
    if (b.type === "return_card" && !b.skuId) ctx.addIssue({ code: "custom", path: ["skuId"], message: "请选择商品" });
    if (b.type === "coupon_card" && !b.couponId) ctx.addIssue({ code: "custom", path: ["couponId"], message: "请选择优惠券" });
  });
export type SendBody = z.infer<typeof sendBody>;

export const TRANSLATE_TARGETS = ["ms", "en", "th", "vi", "id", "tl", "zh"] as const;
export const translateBody = z.object({ text: z.string().trim().min(1).max(2000), target: z.enum(TRANSLATE_TARGETS) });

// ── 响应 ──

export type HandlingState = "bot" | "awaiting_human" | "human" | "closed";
export type Stage = "presale" | "insale" | "aftersale" | "unknown";
export type ShopRef = { id: string; name: string; platform: "shopee" | "tiktok"; market: string };
export type MemberRef = { id: string; name: string };
export type TicketChip = { id: string; number: string; type: string; dueAt: string | null; overdue: boolean };

export type ConversationListItem = {
  id: string;
  shop: ShopRef;
  buyerName: string;
  /** 平台给的买家头像；没有或加载失败时界面显示名字首字 */
  buyerAvatarUrl: string | null;
  preview: string;
  lastMessageAt: string | null;
  waitingSinceSec: number | null;
  pinned: boolean;
  overdue: boolean;
  handlingState: HandlingState;
  handoffReason: string | null;
  claimedBy: MemberRef | null;
  draftPending: boolean;
  stage: Stage;
  openTickets: TicketChip[];
};
export type ConversationCounts = Record<ConvView, number>;
export type ConversationList = { items: ConversationListItem[]; counts: ConversationCounts; nextCursor: string | null };

export type MessageItem = {
  id: string;
  direction: "in" | "out";
  senderRole: "buyer" | "agent" | "ai" | "platform_human" | "platform_bot" | "system";
  senderName: string | null;
  type: "text" | "image" | "order_card" | "product_card" | "return_card" | "logistics_card" | "coupon_card" | "sticker" | "video" | "other";
  text: string | null;
  originalText: string | null;
  translation: string | null;
  translationSource: "platform" | "shopilot" | null;
  payload: Record<string, unknown>;
  sendStatus: "sending" | "sent" | "failed" | null;
  sendError: string | null;
  sentAt: string;
  segmentId: string | null;
};

/** 商品卡片：价格为店铺币种现价，多规格时 priceMin 与 priceMax 不同；url 为平台商品页 */
export type ProductCardInfo = { name: string | null; imageUrl: string | null; priceMin: string | null; priceMax: string | null; currency: string | null; url: string | null };

export type DraftItem = { id: string; text: string; confidence: number; reason: string | null; mode: "assist" | "auto" | "shadow"; status: string; triggerMessageId: string | null; createdAt: string };

export type ConversationDetail = {
  conversation: {
    id: string;
    /** readOnly：只读接入的店（消息从平台拉取，不能从 Shopilot 发送或操作平台） */
    shop: ShopRef & { status: "connected" | "auth_expired" | "disconnected"; readOnly: boolean };
    buyerName: string;
    buyerAvatarUrl: string | null;
    buyerExternalId: string;
    buyerKind: "buyer" | "affiliate";
    buyerLanguage: string | null;
    handlingState: HandlingState;
    handoffReason: string | null;
    claimedBy: MemberRef | null;
    version: number;
    pinned: boolean;
    waitingSinceSec: number | null;
    lastBuyerAt: string | null;
    responseSlaMinutes: number;
    overdue: boolean;
    /** 买家最后发言 7 天内才能发 */
    canReply: boolean;
    replyBlockedReason: string | null;
  };
  segment: { id: string; stage: Stage; stageSource: "auto" | "manual" | "keyword"; stageBasis: string | null; startedAt: string } | null;
  messages: MessageItem[];
  /** 本页商品卡片涉及的商品，键为平台商品 ID；信息还没取到时 name 等为 null，链接照常给 */
  products: Record<string, ProductCardInfo>;
  hasMore: boolean;
  draft: DraftItem | null;
  shadowDrafts: DraftItem[] | null;
  capabilities: { cards: string[]; productCard: { enabled: boolean; reason?: string }; coupons: boolean; endSession: boolean; maxTextLength: number; image: boolean };
  events: Array<{ at: string; text: string; actorName: string }>;
  openTickets: TicketChip[];
  history: Array<{ id: string; stage: Stage; startedAt: string; endedAt: string | null; endReason: string | null; claimedBy: string | null; messages: number }>;
  permissions: { canClaim: boolean; canSend: boolean; canTransfer: boolean; canClose: boolean; canChangeStage: boolean; canIgnoreDraft: boolean };
};

export type BuyerOrder = {
  id: string;
  externalOrderId: string;
  status: string;
  statusGroup: string;
  total: string;
  currency: string;
  items: Array<{ name: string; sku?: string; skuId?: string; qty: number; unitPrice: string }>;
  shipByAt: string | null;
  createdAt: string;
  tracking: { trackingNo?: string; carrier?: string; packageId?: string; events: Array<{ at: string; text: string }> } | null;
  recipient: { name?: string; phone?: string; address?: string; masked: boolean } | null;
  afterSales: Array<{ id: string; kind: "return" | "cancel"; externalId: string; platformStatus: string; sellerDueAt: string | null; reason: string | null; open: boolean }>;
};
export type BuyerPanel = {
  buyer: { name: string; externalId: string; language: string | null; avatarUrl: string | null };
  orders: BuyerOrder[];
  totals: { count180d: number; amount180d: string; currency: string | null };
  piiMasked: boolean;
  syncedAt: string | null;
};

export type SendResult = { message: MessageItem };
export type CouponOption = { couponId: string; title: string; discount: string; endsAt: string | null };
export type UploadedFile = { id: string; url: string; width: number | null; height: number | null };
