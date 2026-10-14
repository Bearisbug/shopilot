import { z } from "zod";
import type { StatusGroup } from "./orders";
import type { PlatformKey } from "./shops";
import type { TicketStatus, TicketType, WaitingOn } from "./tickets";

// 全局搜索契约（DESIGN §8.10 API-SEARCH-001、REQ-SEARCH-001）：前后端共用。

export const SEARCH_TYPES = ["all", "conversation", "order", "ticket"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/** 每类最多返回的条数 */
export const SEARCH_LIMIT = 20;
/** 关键词最少字数（按字符计，不按 UTF-16 码元） */
export const SEARCH_MIN_CHARS = 2;

export const searchQuery = z.object({
  q: z
    .string()
    .trim()
    .refine((s) => Array.from(s).length >= SEARCH_MIN_CHARS, `至少输入 ${SEARCH_MIN_CHARS} 个字`)
    .refine((s) => Array.from(s).length <= 100, "关键词最多 100 个字"),
  type: z.enum(SEARCH_TYPES).default("all"),
});
export type SearchQuery = z.infer<typeof searchQuery>;

type ShopFields = { platform: PlatformKey; market: string; shopName: string };

/** 会话命中：match = buyer 是买家名、买家 ID 或平台会话 ID 命中；message 是某条消息正文命中 */
export type SearchConversationHit = ShopFields & {
  conversationId: string;
  match: "buyer" | "message";
  buyerName: string;
  buyerExternalId: string;
  /** 买家在该店的订单数（买家命中时给） */
  orderCount: number | null;
  message: { id: string; snippet: string; sentAt: string; fromBuyer: boolean } | null;
  lastMessageAt: string | null;
};

export type SearchOrderHit = ShopFields & {
  id: string;
  externalOrderId: string;
  buyerName: string | null;
  statusGroup: StatusGroup;
  total: string;
  currency: string;
  itemsText: string;
  createdAt: string;
};

export type SearchTicketHit = ShopFields & {
  id: string;
  number: string;
  type: TicketType;
  status: TicketStatus;
  waitingOn: WaitingOn | null;
  phase: string | null;
  buyerName: string | null;
  externalOrderId: string | null;
  dueAt: string | null;
};

export type SearchResponse = {
  q: string;
  conversations: SearchConversationHit[];
  orders: SearchOrderHit[];
  tickets: SearchTicketHit[];
  /** 命中总数（不受每类 20 条限制）；buyers + messages = conversations */
  counts: { buyers: number; messages: number; conversations: number; orders: number; tickets: number; all: number };
};
