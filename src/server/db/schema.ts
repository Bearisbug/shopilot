// Shopilot 业务库结构。字段定义以 docs/DESIGN.md §9 数据字典为准；改字段先改设计文档。
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import type { KnowledgeMarket } from "../../contracts/knowledge";
import type { QuickReplyVariant } from "../../contracts/reception";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const id = () => uuid("id").primaryKey().$defaultFn(() => uuidv7());
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at");
const merchantRef = () => uuid("merchant_id").notNull().references(() => merchant.id, { onDelete: "cascade" });

// ---------- Better Auth（账号、会话、凭据、两步验证） ----------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    activeMerchantId: uuid("active_merchant_id"),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const twoFactor = pgTable("two_factor", {
  id: text("id").primaryKey(),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  verified: boolean("verified").default(true),
  failedVerificationCount: integer("failed_verification_count").default(0),
  lockedUntil: ts("locked_until"),
});

// ---------- 租户与成员 ----------

export type SecurityPolicy = {
  requireTwoFactorAdmins: boolean;
  requireTwoFactorAll: boolean;
  sessionMaxHours: 8 | 12 | 24 | 168;
  ipRestrictionOn: boolean;
  ipAllowlist: string[];
};

export const merchant = pgTable("merchant", {
  id: id(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull(),
  language: text("language").notNull().default("zh-CN"),
  billingEmail: text("billing_email"),
  ownerUserId: text("owner_user_id").notNull().references(() => user.id),
  status: text("status", { enum: ["active", "pending_deletion", "deleted"] }).notNull().default("active"),
  purgeAt: ts("purge_at"),
  securityPolicy: jsonb("security_policy").$type<SecurityPolicy>().notNull(),
  retentionDays: integer("retention_days").notNull().default(365),
  ticketAutoCloseDays: integer("ticket_auto_close_days").default(7),
  invoiceInfo: jsonb("invoice_info").$type<{ companyName: string; taxId?: string; address: string; email: string } | null>(),
  lastPurgeAt: ts("last_purge_at"),
  /** 推送地址里的商户专属码：`/api/webhooks/{platform}/<webhook_key>`，接入一开始就能把地址填进平台后台 */
  webhookKey: text("webhook_key")
    .notNull()
    .unique()
    .default(sql`replace(gen_random_uuid()::text, '-', '')`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const membership = pgTable(
  "membership",
  {
    id: id(),
    merchantId: merchantRef(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["admin", "lead", "agent"] }).notNull(),
    status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
    preferences: jsonb("preferences").$type<{ desktopNotify: boolean; sound: boolean }>().notNull().default({ desktopNotify: false, sound: true }),
    disabledAt: ts("disabled_at"),
    lastSeenAt: ts("last_seen_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("membership_merchant_user_uq").on(t.merchantId, t.userId)],
);

export const membershipShop = pgTable(
  "membership_shop",
  {
    membershipId: uuid("membership_id").notNull().references(() => membership.id, { onDelete: "cascade" }),
    shopId: uuid("shop_id").notNull().references(() => shop.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.membershipId, t.shopId] })],
);

export const invitation = pgTable(
  "invitation",
  {
    id: id(),
    merchantId: merchantRef(),
    email: text("email").notNull(),
    role: text("role", { enum: ["admin", "lead", "agent"] }).notNull(),
    shopIds: jsonb("shop_ids").$type<string[]>().notNull().default([]),
    tokenHash: text("token_hash").notNull().unique(),
    status: text("status", { enum: ["pending", "accepted", "revoked", "expired"] }).notNull().default("pending"),
    expiresAt: ts("expires_at").notNull(),
    invitedBy: uuid("invited_by").references(() => membership.id, { onDelete: "set null" }),
    acceptedAt: ts("accepted_at"),
    createdAt: createdAt(),
  },
  (t) => [index("invitation_merchant_idx").on(t.merchantId, t.status)],
);

export const loginEvent = pgTable(
  "login_event",
  {
    id: id(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    merchantId: uuid("merchant_id").references(() => merchant.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    result: text("result", { enum: ["success", "failure"] }).notNull(),
    reason: text("reason", { enum: ["bad_password", "unknown_email", "locked", "ip_blocked", "disabled", "two_factor_failed"] }),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("login_event_email_idx").on(t.email, t.createdAt), index("login_event_merchant_idx").on(t.merchantId, t.createdAt)],
);

export const ownershipTransfer = pgTable("ownership_transfer", {
  id: id(),
  merchantId: merchantRef(),
  fromUserId: text("from_user_id").notNull().references(() => user.id),
  toUserId: text("to_user_id").notNull().references(() => user.id),
  tokenHash: text("token_hash").notNull().unique(),
  status: text("status", { enum: ["pending", "accepted", "cancelled", "expired"] }).notNull().default("pending"),
  expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"),
  createdAt: createdAt(),
});

// ---------- 平台接入 ----------

export type Platform = "shopee" | "tiktok";
export type ReceptionMode = "off" | "shadow" | "assist" | "auto";

export const platformApp = pgTable(
  "platform_app",
  {
    id: id(),
    merchantId: merchantRef(),
    platform: text("platform", { enum: ["shopee", "tiktok"] }).notNull(),
    appKey: text("app_key").notNull(),
    secretEnc: text("secret_enc").notNull(),
    pushKeyEnc: text("push_key_enc"),
    /** TikTok：Partner Center 应用详情里的 Service ID，拼卖家授权链接用 */
    serviceId: text("service_id"),
    /** 只读接入：凭证借用自其他系统（如现网 Obsbot v2），Shopilot 对这个应用只调读接口，不刷新 token、不改平台设置 */
    readOnly: boolean("read_only").notNull().default(false),
    keyExpiresAt: date("key_expires_at"),
    apiHost: text("api_host"),
    region: text("region"),
    status: text("status", { enum: ["unverified", "verified", "invalid"] }).notNull().default("unverified"),
    callbackState: text("callback_state", { enum: ["unset", "set", "already_ours", "other_needs_confirm", "failed"] }).notNull().default("unset"),
    callbackCurrent: text("callback_current"),
    verifiedAt: ts("verified_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("platform_app_merchant_platform_uq").on(t.merchantId, t.platform)],
);

export const connectDraft = pgTable(
  "connect_draft",
  {
    id: id(),
    merchantId: merchantRef(),
    platform: text("platform", { enum: ["shopee", "tiktok"] }).notNull(),
    step: text("step", { enum: ["platform", "guide", "credentials", "auth", "probe", "done"] }).notNull().default("platform"),
    checklist: jsonb("checklist").$type<Record<string, boolean>>().notNull().default({}),
    initialMode: text("initial_mode", { enum: ["shadow", "off"] }).notNull().default("shadow"),
    /** 本次接入已授权、尚未「完成接入」的店铺（检查页与 API-SHOP-007 的范围） */
    shopIds: jsonb("shop_ids").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("connect_draft_merchant_platform_uq").on(t.merchantId, t.platform)],
);

export const oauthState = pgTable("oauth_state", {
  id: text("id").primaryKey(),
  merchantId: merchantRef(),
  membershipId: uuid("membership_id").notNull().references(() => membership.id, { onDelete: "cascade" }),
  platform: text("platform", { enum: ["shopee", "tiktok"] }).notNull(),
  shopId: uuid("shop_id"),
  shopRegion: text("shop_region"),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  result: jsonb("result").$type<{ ok: boolean; reason?: string; shopIds?: string[]; renewed?: number; codeHash?: string }>(),
  createdAt: createdAt(),
});

export type ShopCapabilities = {
  chat: boolean;
  chatReason?: string;
  orders: boolean;
  ordersReason?: string;
  piiMasked: boolean;
  productScope: boolean;
  cards: Array<"order_card" | "logistics_card" | "return_card" | "product_card">;
  coupons: boolean;
  endSession: boolean;
  maxTextLength: number;
};

export const shop = pgTable(
  "shop",
  {
    id: id(),
    merchantId: merchantRef(),
    platformAppId: uuid("platform_app_id").notNull().references(() => platformApp.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: ["shopee", "tiktok"] }).notNull(),
    externalShopId: text("external_shop_id").notNull(),
    shopCipher: text("shop_cipher"),
    name: text("name").notNull(),
    market: text("market").notNull(),
    mainAccountId: text("main_account_id"),
    status: text("status", { enum: ["connected", "auth_expired", "disconnected"] }).notNull().default("connected"),
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    accessExpiresAt: ts("access_expires_at"),
    authExpiresAt: ts("auth_expires_at"),
    authRemindedAt: jsonb("auth_reminded_at").$type<string[]>().notNull().default([]),
    capabilities: jsonb("capabilities").$type<ShopCapabilities>().notNull(),
    lastInboundAt: ts("last_inbound_at"),
    /** 只读接入店的拉取游标：inbound.poll 已处理到的最新消息时间 */
    pullCursorAt: ts("pull_cursor_at"),
    backfill: jsonb("backfill").$type<{ state: "pending" | "running" | "done" | "failed"; conversations: number; orders: number; error?: string }>().notNull().default({ state: "pending", conversations: 0, orders: 0 }),
    metrics: jsonb("metrics").$type<Record<string, unknown> | null>(),
    metricsAt: ts("metrics_at"),
    connectedAt: ts("connected_at"),
    disconnectedAt: ts("disconnected_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("shop_app_external_uq").on(t.platformAppId, t.externalShopId), index("shop_merchant_idx").on(t.merchantId)],
);

export const shopReception = pgTable("shop_reception", {
  shopId: uuid("shop_id").primaryKey().references(() => shop.id, { onDelete: "cascade" }),
  merchantId: merchantRef(),
  modeInHours: text("mode_in_hours", { enum: ["off", "shadow", "assist", "auto"] }).notNull().default("off"),
  modeOffHours: text("mode_off_hours", { enum: ["off", "shadow", "assist", "auto"] }).notNull().default("off"),
  updatedAt: updatedAt(),
});

export const shopEvent = pgTable(
  "shop_event",
  {
    id: id(),
    merchantId: merchantRef(),
    shopId: uuid("shop_id").notNull().references(() => shop.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    text: text("text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("shop_event_shop_idx").on(t.shopId, t.createdAt)],
);

export const assistRequest = pgTable("assist_request", {
  id: id(),
  merchantId: merchantRef(),
  platform: text("platform", { enum: ["shopee", "tiktok"] }).notNull(),
  stuckStep: text("stuck_step").notNull(),
  slot: text("slot").notNull(),
  contactChannel: text("contact_channel").notNull(),
  contact: text("contact").notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => membership.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const inboundEvent = pgTable(
  "inbound_event",
  {
    id: id(),
    merchantId: uuid("merchant_id").references(() => merchant.id, { onDelete: "cascade" }),
    platformAppId: uuid("platform_app_id").notNull().references(() => platformApp.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: ["shopee", "tiktok"] }).notNull(),
    shopId: uuid("shop_id"),
    externalEventId: text("external_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status", { enum: ["queued", "processing", "done", "ignored", "failed"] }).notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    leaseUntil: ts("lease_until"),
    receivedAt: ts("received_at").notNull().defaultNow(),
    processedAt: ts("processed_at"),
  },
  (t) => [uniqueIndex("inbound_event_app_ext_uq").on(t.platformAppId, t.externalEventId), index("inbound_event_status_idx").on(t.status, t.receivedAt)],
);

// ---------- 会话 ----------

export type HandlingState = "bot" | "awaiting_human" | "human" | "closed";
export type Stage = "presale" | "insale" | "aftersale" | "unknown";

export const conversation = pgTable(
  "conversation",
  {
    id: id(),
    merchantId: merchantRef(),
    shopId: uuid("shop_id").notNull().references(() => shop.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: ["shopee", "tiktok"] }).notNull(),
    externalConversationId: text("external_conversation_id").notNull(),
    buyerExternalId: text("buyer_external_id").notNull(),
    buyerName: text("buyer_name").notNull(),
    buyerKind: text("buyer_kind", { enum: ["buyer", "affiliate"] }).notNull().default("buyer"),
    buyerLanguage: text("buyer_language"),
    /** 平台给的买家头像地址（Shopee 会话列表 to_avatar、TikTok 参与者 avatar）；TikTok 的是带过期参数的 CDN 链接，每次拉到会话或消息时刷新 */
    buyerAvatarUrl: text("buyer_avatar_url"),
    handlingState: text("handling_state", { enum: ["bot", "awaiting_human", "human", "closed"] }).notNull(),
    claimedBy: uuid("claimed_by").references(() => membership.id, { onDelete: "set null" }),
    claimedAt: ts("claimed_at"),
    handoffReason: text("handoff_reason"),
    currentSegmentId: uuid("current_segment_id"),
    externalSessionId: text("external_session_id"),
    lastMessageAt: ts("last_message_at"),
    lastBuyerAt: ts("last_buyer_at"),
    lastAgentAt: ts("last_agent_at"),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("conversation_shop_ext_uq").on(t.shopId, t.externalConversationId),
    index("conversation_merchant_state_idx").on(t.merchantId, t.handlingState, t.lastMessageAt),
    index("conversation_buyer_idx").on(t.shopId, t.buyerExternalId),
  ],
);

/** 商品卡片用的商品信息缓存：按店铺 + 平台商品 ID，24 小时内复用；取不到（无商品权限、商品已删、接口失败）记 unavailable，同样 24 小时后再试 */
export const productInfo = pgTable(
  "product_info",
  {
    id: id(),
    merchantId: merchantRef(),
    shopId: uuid("shop_id").notNull().references(() => shop.id, { onDelete: "cascade" }),
    externalProductId: text("external_product_id").notNull(),
    status: text("status", { enum: ["ok", "unavailable"] }).notNull(),
    /** platform：平台商品接口；order：没有商品权限时借用本店订单里同一商品的名称、图片、单价 */
    source: text("source", { enum: ["platform", "order"] }).notNull().default("platform"),
    name: text("name"),
    imageUrl: text("image_url"),
    priceMin: text("price_min"),
    priceMax: text("price_max"),
    currency: text("currency"),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("product_info_shop_product_uq").on(t.shopId, t.externalProductId)],
);

export const segment = pgTable(
  "segment",
  {
    id: id(),
    merchantId: merchantRef(),
    conversationId: uuid("conversation_id").notNull().references(() => conversation.id, { onDelete: "cascade" }),
    stage: text("stage", { enum: ["presale", "insale", "aftersale", "unknown"] }).notNull(),
    stageSource: text("stage_source", { enum: ["auto", "manual", "keyword"] }).notNull().default("auto"),
    stageBasis: text("stage_basis"),
    startedAt: ts("started_at").notNull(),
    endedAt: ts("ended_at"),
    endReason: text("end_reason", { enum: ["resolved", "idle", "backfill", "shop_disconnected"] }),
    firstClaimedBy: uuid("first_claimed_by").references(() => membership.id, { onDelete: "set null" }),
    firstBuyerAt: ts("first_buyer_at"),
    firstHumanReplyAt: ts("first_human_reply_at"),
    firstReplyInHours: boolean("first_reply_in_hours"),
    /** 开段时该店的当前接待模式（看板 AI 接待段 = assist / auto）；为空是迁移 0010 推断不了的旧段 */
    openMode: text("open_mode", { enum: ["off", "shadow", "assist", "auto"] }),
    handedOff: boolean("handed_off").notNull().default(false),
    /** 本段转人工（11.1 handoff）的时刻；人工首响在 AI 回过买家的段从这里起算 */
    handedOffAt: ts("handed_off_at"),
    aiReplied: boolean("ai_replied").notNull().default(false),
    humanReplied: boolean("human_replied").notNull().default(false),
    aiResolved: boolean("ai_resolved").notNull().default(false),
    backfilled: boolean("backfilled").notNull().default(false),
    remindedAt: ts("reminded_at"),
    handoverTicketed: boolean("handover_ticketed").notNull().default(false),
    /** 看板「问题提取」：AI 写的一句中文问题总结与归到的问题类别；提取时刻早于段内最后一条买家消息时会重新提取 */
    issueSummary: text("issue_summary"),
    issueCategoryId: uuid("issue_category_id").references(() => issueCategory.id, { onDelete: "set null" }),
    issueExtractedAt: ts("issue_extracted_at"),
  },
  (t) => [index("segment_conversation_idx").on(t.conversationId), index("segment_merchant_started_idx").on(t.merchantId, t.startedAt)],
);

/** 看板问题类别：商户内名称唯一；内置「其他」不能改名、删除，删除别的类别时其中会话段归到「其他」 */
export const issueCategory = pgTable(
  "issue_category",
  {
    id: id(),
    merchantId: merchantRef(),
    name: text("name").notNull(),
    builtin: boolean("builtin").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("issue_category_name_uq").on(t.merchantId, t.name), uniqueIndex("issue_category_builtin_uq").on(t.merchantId).where(sql`builtin`)],
);

export type MessagePayload = {
  orderId?: string;
  packageId?: string;
  skuId?: string;
  productId?: string;
  productName?: string;
  couponId?: string;
  couponTitle?: string;
  fileId?: string;
  url?: string;
  width?: number;
  height?: number;
  [k: string]: unknown;
};

export const message = pgTable(
  "message",
  {
    id: id(),
    merchantId: merchantRef(),
    conversationId: uuid("conversation_id").notNull().references(() => conversation.id, { onDelete: "cascade" }),
    segmentId: uuid("segment_id").references(() => segment.id, { onDelete: "set null" }),
    externalMessageId: text("external_message_id"),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    senderRole: text("sender_role", { enum: ["buyer", "agent", "ai", "platform_human", "platform_bot", "system"] }).notNull(),
    sentBy: uuid("sent_by").references(() => membership.id, { onDelete: "set null" }),
    type: text("type", { enum: ["text", "image", "order_card", "product_card", "return_card", "logistics_card", "coupon_card", "sticker", "video", "other"] }).notNull(),
    text: text("text"),
    originalText: text("original_text"),
    translation: text("translation"),
    translationSource: text("translation_source", { enum: ["platform", "shopilot"] }),
    payload: jsonb("payload").$type<MessagePayload>(),
    clientRequestId: text("client_request_id"),
    sendStatus: text("send_status", { enum: ["sending", "sent", "failed"] }),
    sendError: text("send_error"),
    sentAt: ts("sent_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("message_client_req_uq").on(t.conversationId, t.clientRequestId),
    uniqueIndex("message_external_uq").on(t.conversationId, t.externalMessageId),
    index("message_conversation_sent_idx").on(t.conversationId, t.sentAt),
    // 全局搜索按正文 ILIKE（API-SEARCH-001）；需要 pg_trgm 扩展（迁移首行创建）
    index("message_text_trgm_idx").using("gin", sql`${t.text} gin_trgm_ops`),
  ],
);

/** 检索快照（DESIGN §9.3 draft.retrieval）；同一路重试时 routes 里先记失败的混合检索，再记纯向量重试 */
export type DraftRetrieval = {
  rewrittenQuery: string | null;
  routes: Array<{ kind: "rewritten" | "original"; mode: "hybrid" | "vector_only"; latencyMs: number; error?: string; hits: Array<{ chunkId: string; documentId: string; score: number }> }>;
  merged: Array<{ n: number; chunkId: string; documentId: string }>;
  degraded: boolean;
  degradedReason?: string;
  latencyMs: number;
  /** 问答检索：两路命中（余弦距离）与合并后的编号；问答排在资料前面 */
  qa?: { latencyMs: number; error?: string; productIds: string[]; hits: Array<{ route: "rewritten" | "original"; qaId: string; distance: number }>; merged: Array<{ n: number; qaId: string }> };
};
/** 依据：资料（documentId）或问答（kind = qa、qaId，name 取第一个问法）；没有 kind 的旧行都是资料 */
export type DraftCitation = { n: number; kind?: "document" | "qa"; documentId?: string; qaId?: string; name: string };

export const draft = pgTable(
  "draft",
  {
    id: id(),
    merchantId: merchantRef(),
    conversationId: uuid("conversation_id").notNull().references(() => conversation.id, { onDelete: "cascade" }),
    segmentId: uuid("segment_id").references(() => segment.id, { onDelete: "set null" }),
    triggerMessageId: uuid("trigger_message_id").references(() => message.id, { onDelete: "set null" }),
    mode: text("mode", { enum: ["shadow", "assist", "auto"] }).notNull(),
    text: text("text").notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2, mode: "number" }).notNull(),
    handoff: boolean("handoff").notNull().default(false),
    reason: text("reason"),
    status: text("status", { enum: ["generated", "shadow", "sent", "edited_sent", "ignored", "failed", "expired", "superseded"] }).notNull(),
    disposedBy: uuid("disposed_by").references(() => membership.id, { onDelete: "set null" }),
    disposedAt: ts("disposed_at"),
    sentMessageId: uuid("sent_message_id"),
    editDistance: integer("edit_distance"),
    model: text("model").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    /** 模型判定订单事实与资料片段都不足以回答（RULE-KB-003） */
    insufficient: boolean("insufficient").notNull().default(false),
    /** 检索快照：商户有对该店可用的资料时写入，只存分块 ID 与分数 */
    retrieval: jsonb("retrieval").$type<DraftRetrieval | null>(),
    /** 依据：模型声明用到、且在合并结果里的资料，name 是出稿时的文件名快照 */
    citations: jsonb("citations").$type<DraftCitation[] | null>(),
    /** 影子回复的商户语言译文（draft.translate 写入）；不需要译或翻译失败时为空 */
    translation: text("translation"),
    createdAt: createdAt(),
  },
  (t) => [index("draft_conversation_idx").on(t.conversationId, t.createdAt), index("draft_merchant_created_idx").on(t.merchantId, t.createdAt)],
);

export const file = pgTable("file", {
  id: id(),
  merchantId: merchantRef(),
  kind: text("kind", { enum: ["chat_image", "chat_video", "invoice_pdf", "invoice_png", "export_zip", "invoice_logo", "knowledge_source"] }).notNull(),
  path: text("path").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  width: integer("width"),
  height: integer("height"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

// ---------- 订单、售后、发票 ----------

/** image：商品图地址；补图任务取过但平台没给图时记为空串，不再重取 */
/** sku 是规格名（如 Black）；sellerSku 是卖家 SKU 原文（物料编码），对应产品清单的 code */
export type OrderItem = { name: string; sku?: string; sellerSku?: string; productId?: string; skuId?: string; qty: number; unitPrice: string; image?: string };
/** 付款信息（开票用）：shippingFee 买家付的运费（Shopee 订单详情不给，缺省）；paidAt 付款时间 ISO */
export type OrderPayment = { shippingFee?: string; method?: string; paidAt?: string };

export const order = pgTable(
  "order",
  {
    id: id(),
    merchantId: merchantRef(),
    shopId: uuid("shop_id").notNull().references(() => shop.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: ["shopee", "tiktok"] }).notNull(),
    externalOrderId: text("external_order_id").notNull(),
    buyerExternalId: text("buyer_external_id"),
    buyerName: text("buyer_name"),
    platformStatus: text("platform_status").notNull(),
    statusGroup: text("status_group", { enum: ["unpaid", "to_ship", "shipped", "delivered", "completed", "cancelled", "in_cancel", "returning"] }).notNull(),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    items: jsonb("items").$type<OrderItem[]>().notNull().default([]),
    shipByAt: ts("ship_by_at"),
    recipient: jsonb("recipient").$type<{ name?: string; phone?: string; address?: string; masked: boolean } | null>(),
    tracking: jsonb("tracking").$type<{ trackingNo?: string; carrier?: string; packageId?: string; events: Array<{ at: string; text: string }> } | null>(),
    deadlines: jsonb("deadlines").$type<Record<string, string> | null>(),
    payment: jsonb("payment").$type<OrderPayment | null>(),
    platformCreatedAt: ts("platform_created_at").notNull(),
    platformUpdatedAt: ts("platform_updated_at"),
    syncedAt: ts("synced_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("order_shop_ext_uq").on(t.shopId, t.externalOrderId),
    index("order_buyer_idx").on(t.shopId, t.buyerExternalId),
    index("order_merchant_created_idx").on(t.merchantId, t.platformCreatedAt),
  ],
);

export const afterSale = pgTable(
  "after_sale",
  {
    id: id(),
    merchantId: merchantRef(),
    shopId: uuid("shop_id").notNull().references(() => shop.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: ["shopee", "tiktok"] }).notNull(),
    kind: text("kind", { enum: ["return", "cancel"] }).notNull(),
    externalId: text("external_id").notNull(),
    externalOrderId: text("external_order_id").notNull(),
    orderId: uuid("order_id").references(() => order.id, { onDelete: "set null" }),
    buyerExternalId: text("buyer_external_id"),
    platformStatus: text("platform_status").notNull(),
    nextAction: text("next_action"),
    sellerDueAt: ts("seller_due_at"),
    dueField: text("due_field"),
    reason: text("reason"),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    currency: text("currency"),
    raw: jsonb("raw"),
    platformUpdatedAt: ts("platform_updated_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("after_sale_shop_kind_ext_uq").on(t.shopId, t.kind, t.externalId), index("after_sale_order_idx").on(t.shopId, t.externalOrderId)],
);

/** 开具时的卖方快照（开票资料合并后的值） */
export type InvoiceSeller = {
  legalName?: string;
  registrationNo?: string;
  taxIdLabel?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  notes?: string;
  logoFileId?: string;
};

/** subtotal 商品小计；tax 税额；total 含税合计。shipping 起的字段是开具时的金额快照，早期记录没有 */
export type InvoiceFields = {
  buyerName: string;
  address: string;
  email?: string;
  taxId?: string;
  items: Array<{ name: string; sku?: string; qty: number; unitPrice: string }>;
  currency: string;
  subtotal: string;
  tax: string;
  total: string;
  notes?: string;
  shipping?: string;
  discount?: string;
  fees?: string;
  taxName?: string;
  taxRate?: string;
  taxInclusive?: boolean;
  amountPaid?: string;
  paidAt?: string;
  paymentMethod?: string;
  seller?: InvoiceSeller;
};

export const invoice = pgTable(
  "invoice",
  {
    id: id(),
    merchantId: merchantRef(),
    shopId: uuid("shop_id").notNull().references(() => shop.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["invoice", "receipt"] }).notNull(),
    number: text("number").notNull(),
    orderId: uuid("order_id").references(() => order.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id").references(() => conversation.id, { onDelete: "set null" }),
    fields: jsonb("fields").$type<InvoiceFields>().notNull(),
    pdfFileId: uuid("pdf_file_id"),
    imageFileId: uuid("image_file_id"),
    chatStatus: text("chat_status", { enum: ["skipped", "pending", "sent", "failed"] }).notNull(),
    chatError: text("chat_error"),
    chatMessageId: uuid("chat_message_id"),
    emailStatus: text("email_status", { enum: ["skipped", "pending", "sent", "failed", "bounced"] }).notNull(),
    emailError: text("email_error"),
    emailTo: text("email_to"),
    createdBy: uuid("created_by").references(() => membership.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("invoice_merchant_number_uq").on(t.merchantId, t.number)],
);

/** 开票资料（卖方信息）：shop_id 为空是商户默认，非空是按店覆盖；覆盖行里为空的字段沿用商户默认 */
export const invoiceProfile = pgTable(
  "invoice_profile",
  {
    id: id(),
    merchantId: merchantRef(),
    shopId: uuid("shop_id").references(() => shop.id, { onDelete: "cascade" }),
    legalName: text("legal_name"),
    registrationNo: text("registration_no"),
    taxIdLabel: text("tax_id_label"),
    taxId: text("tax_id"),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    notes: text("notes"),
    logoFileId: uuid("logo_file_id"),
    taxName: text("tax_name"),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }),
    pricesIncludeTax: boolean("prices_include_tax"),
    updatedBy: uuid("updated_by").references(() => membership.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("invoice_profile_default_uq").on(t.merchantId).where(sql`shop_id is null`), uniqueIndex("invoice_profile_shop_uq").on(t.shopId)],
);

export const sequence = pgTable(
  "sequence",
  {
    merchantId: merchantRef(),
    key: text("key").notNull(),
    next: integer("next").notNull(),
  },
  (t) => [primaryKey({ columns: [t.merchantId, t.key] })],
);

// ---------- 工单 ----------

export type TicketType = "return_refund" | "cancel_request" | "logistics" | "invoice" | "stock" | "handover" | "internal";

export const ticket = pgTable(
  "ticket",
  {
    id: id(),
    merchantId: merchantRef(),
    number: text("number").notNull(),
    type: text("type", { enum: ["return_refund", "cancel_request", "logistics", "invoice", "stock", "handover", "internal"] }).notNull(),
    origin: text("origin", { enum: ["platform", "manual", "rule"] }).notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    shopId: uuid("shop_id").notNull().references(() => shop.id, { onDelete: "cascade" }),
    platform: text("platform", { enum: ["shopee", "tiktok"] }).notNull(),
    orderId: uuid("order_id").references(() => order.id, { onDelete: "set null" }),
    afterSaleId: uuid("after_sale_id").references(() => afterSale.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id").references(() => conversation.id, { onDelete: "set null" }),
    buyerName: text("buyer_name"),
    status: text("status", { enum: ["open", "in_progress", "waiting", "resolved", "closed", "void"] }).notNull().default("open"),
    waitingOn: text("waiting_on", { enum: ["buyer", "platform", "internal"] }),
    phase: text("phase"),
    platformStatus: text("platform_status"),
    assigneeId: uuid("assignee_id").references(() => membership.id, { onDelete: "set null" }),
    dueAt: ts("due_at"),
    dueSource: text("due_source", { enum: ["platform", "merchant"] }),
    remindersSent: jsonb("reminders_sent").$type<string[]>().notNull().default([]),
    description: text("description"),
    resolvedAt: ts("resolved_at"),
    closedAt: ts("closed_at"),
    voidReason: text("void_reason"),
    createdBy: uuid("created_by").references(() => membership.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("ticket_merchant_number_uq").on(t.merchantId, t.number),
    uniqueIndex("ticket_open_dedupe_uq").on(t.merchantId, t.dedupeKey).where(sql`status not in ('resolved','closed','void')`),
    index("ticket_merchant_status_idx").on(t.merchantId, t.status, t.dueAt),
    index("ticket_assignee_idx").on(t.assigneeId, t.status),
  ],
);

export const ticketEvent = pgTable(
  "ticket_event",
  {
    id: id(),
    merchantId: merchantRef(),
    ticketId: uuid("ticket_id").notNull().references(() => ticket.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["created", "status", "assign", "note", "platform_event", "due_change", "action", "void", "feishu"] }).notNull(),
    actorId: uuid("actor_id").references(() => membership.id, { onDelete: "set null" }),
    source: text("source", { enum: ["page", "system", "webhook"] }).notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("ticket_event_ticket_idx").on(t.ticketId, t.createdAt)],
);

// ---------- 配置 ----------

export type Schedule = Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", { on: boolean; start: string; end: string }>;

export const receptionSettings = pgTable("reception_settings", {
  merchantId: uuid("merchant_id").primaryKey().references(() => merchant.id, { onDelete: "cascade" }),
  schedule: jsonb("schedule").$type<Schedule>().notNull(),
  holidays: jsonb("holidays").$type<string[]>().notNull().default([]),
  handoffKeywords: jsonb("handoff_keywords").$type<string[]>().notNull(),
  confidenceThreshold: numeric("confidence_threshold", { precision: 3, scale: 2, mode: "number" }).notNull().default(0.6),
  unclaimedRemindMinutes: integer("unclaimed_remind_minutes").default(10),
  responseSlaMinutes: integer("response_sla_minutes").notNull().default(15),
  brandVoice: text("brand_voice"),
  updatedAt: updatedAt(),
});

export const promptTemplate = pgTable(
  "prompt_template",
  {
    merchantId: merchantRef(),
    stage: text("stage", { enum: ["presale", "insale", "aftersale"] }).notNull(),
    text: text("text").notNull().default(""),
    versions: jsonb("versions").$type<Array<{ savedAt: string; text: string }>>().notNull().default([]),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.merchantId, t.stage] })],
);

export const quickReply = pgTable("quick_reply", {
  id: id(),
  merchantId: merchantRef(),
  title: text("title").notNull(),
  stage: text("stage", { enum: ["presale", "insale", "aftersale", "any"] }).notNull(),
  /** 默认版本：没有对应语言版本时插入，发送前照常翻译 */
  text: text("text").notNull(),
  /** 语言版本：会话的发送目标语言命中时插入这一版，本条不再翻译（REQ-CONV-009） */
  variants: jsonb("variants").$type<QuickReplyVariant[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type MerchantDue = { hours?: number; businessDays?: number; afterShiftStartMinutes?: number; days?: number };

export const ticketTypeConfig = pgTable(
  "ticket_type_config",
  {
    merchantId: merchantRef(),
    type: text("type", { enum: ["return_refund", "cancel_request", "logistics", "invoice", "stock", "handover", "internal"] }).notNull(),
    autoCreate: boolean("auto_create").notNull().default(true),
    merchantDue: jsonb("merchant_due").$type<MerchantDue | null>(),
    defaultAssignee: text("default_assignee", { enum: ["claimer", "shop_lead", "creator"] }).notNull(),
    remind: jsonb("remind").$type<{ hoursBefore?: number; remainingPercent?: number }>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.merchantId, t.type] })],
);

// ---------- 计量与账单 ----------

export const subscription = pgTable("subscription", {
  merchantId: uuid("merchant_id").primaryKey().references(() => merchant.id, { onDelete: "cascade" }),
  planCode: text("plan_code", { enum: ["basic", "growth", "pro", "enterprise"] }).notNull(),
  cycle: text("cycle", { enum: ["monthly", "yearly"] }).notNull().default("monthly"),
  pendingCycle: text("pending_cycle", { enum: ["monthly", "yearly"] }),
  pendingPlanCode: text("pending_plan_code", { enum: ["basic", "growth", "pro", "enterprise"] }),
  periodStart: ts("period_start").notNull(),
  periodEnd: ts("period_end").notNull(),
  autoRenew: boolean("auto_renew").notNull().default(true),
  paymentMethod: jsonb("payment_method").$type<{ brand: string; last4: string; expiry: string; mockFail: boolean } | null>(),
  overagePolicy: text("overage_policy", { enum: ["stop", "continue"] }).notNull().default("stop"),
  overageBudget: numeric("overage_budget", { precision: 10, scale: 2 }),
  alertConfig: jsonb("alert_config").$type<{ thresholds: number[]; recipients: string[]; email: boolean; inApp: boolean }>().notNull(),
  status: text("status", { enum: ["active", "readonly"] }).notNull().default("active"),
  updatedAt: updatedAt(),
});

export const usagePeriod = pgTable(
  "usage_period",
  {
    id: id(),
    merchantId: merchantRef(),
    periodStart: ts("period_start").notNull(),
    periodEnd: ts("period_end").notNull(),
    draftsUsed: integer("drafts_used").notNull().default(0),
    quota: integer("quota").notNull(),
    topupQuota: integer("topup_quota").notNull().default(0),
    alertsSent: jsonb("alerts_sent").$type<number[]>().notNull().default([]),
  },
  (t) => [uniqueIndex("usage_period_merchant_start_uq").on(t.merchantId, t.periodStart)],
);

export const billingStatement = pgTable("billing_statement", {
  id: id(),
  merchantId: merchantRef(),
  kind: text("kind", { enum: ["subscription", "topup", "overage"] }).notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  status: text("status", { enum: ["paid", "failed"] }).notNull(),
  invoiceInfo: jsonb("invoice_info").$type<{ companyName: string; taxId?: string; address: string; email: string } | null>(),
  createdAt: createdAt(),
});

export const salesLead = pgTable("sales_lead", {
  id: id(),
  merchantId: merchantRef(),
  contactName: text("contact_name").notNull(),
  contact: text("contact").notNull(),
  note: text("note"),
  snapshot: jsonb("snapshot"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

// ---------- 运营 ----------

export const notification = pgTable(
  "notification",
  {
    id: id(),
    merchantId: merchantRef(),
    membershipId: uuid("membership_id").notNull().references(() => membership.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["conversation", "ticket", "shop", "usage", "team"] }).notNull(),
    event: text("event").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    dedupeKey: text("dedupe_key").notNull(),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notification_member_idx").on(t.membershipId, t.createdAt), index("notification_dedupe_idx").on(t.membershipId, t.dedupeKey, t.createdAt)],
);

export const notificationRule = pgTable(
  "notification_rule",
  {
    merchantId: merchantRef(),
    event: text("event").notNull(),
    inApp: boolean("in_app").notNull().default(true),
    email: boolean("email").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.merchantId, t.event] })],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    merchantId: uuid("merchant_id").references(() => merchant.id, { onDelete: "cascade" }),
    actorMembershipId: uuid("actor_membership_id"),
    actorUserId: text("actor_user_id"),
    actorName: text("actor_name"),
    actorSource: text("actor_source", { enum: ["page", "system", "webhook"] }).notNull(),
    module: text("module", { enum: ["workbench", "tickets", "orders", "shops", "team", "reception", "billing", "settings", "auth"] }).notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    summary: text("summary").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    requestId: text("request_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_merchant_created_idx").on(t.merchantId, t.createdAt),
    index("audit_merchant_action_idx").on(t.merchantId, t.action, t.createdAt),
    index("audit_target_idx").on(t.targetType, t.targetId),
  ],
);

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: id(),
    merchantId: uuid("merchant_id").references(() => merchant.id, { onDelete: "cascade" }),
    toEmail: text("to_email").notNull(),
    template: text("template").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    links: jsonb("links").$type<Array<{ label: string; url: string }>>().notNull().default([]),
    attachments: jsonb("attachments").$type<Array<{ fileId: string; name: string }>>().notNull().default([]),
    status: text("status", { enum: ["queued", "delivered", "bounced"] }).notNull().default("delivered"),
    refType: text("ref_type"),
    refId: text("ref_id"),
    createdAt: createdAt(),
  },
  (t) => [index("email_outbox_created_idx").on(t.createdAt)],
);

export const exportJob = pgTable("export_job", {
  id: id(),
  merchantId: merchantRef(),
  status: text("status", { enum: ["queued", "running", "done", "failed", "expired"] }).notNull().default("queued"),
  fileId: uuid("file_id"),
  error: text("error"),
  requestedBy: uuid("requested_by"),
  expiresAt: ts("expires_at"),
  createdAt: createdAt(),
  finishedAt: ts("finished_at"),
});

// ---------- 知识库（DESIGN §9.6） ----------

/** 每商户一个检索服务实例，首次入库时创建；instance_name = sp-<商户 ID 去连字符后的后 12 位> */
export const knowledgeIndex = pgTable("knowledge_index", {
  merchantId: uuid("merchant_id")
    .primaryKey()
    .references(() => merchant.id, { onDelete: "cascade" }),
  instanceName: text("instance_name").notNull().unique(),
  createdAt: createdAt(),
});

export const knowledgeCategory = pgTable(
  "knowledge_category",
  {
    id: id(),
    merchantId: merchantRef(),
    name: text("name").notNull(),
    builtin: boolean("builtin").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("knowledge_category_name_uq").on(t.merchantId, t.name), uniqueIndex("knowledge_category_builtin_uq").on(t.merchantId).where(sql`builtin`)],
);

export const knowledgeDocument = pgTable(
  "knowledge_document",
  {
    id: id(),
    merchantId: merchantRef(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => knowledgeCategory.id),
    /** 原文件（file.kind = knowledge_source） */
    fileId: uuid("file_id").notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    markets: jsonb("markets").$type<KnowledgeMarket[]>().notNull().default(["ALL"]),
    status: text("status", { enum: ["queued", "processing", "ready", "failed", "deleting"] }).notNull().default("queued"),
    aiEnabled: boolean("ai_enabled").notNull().default(true),
    failureReason: text("failure_reason"),
    uploadedBy: uuid("uploaded_by").references(() => membership.id, { onDelete: "set null" }),
    readyAt: ts("ready_at"),
    /** 整理成问答（API-KB-015）：状态、生成的候选数、失败原因、完成时间 */
    qaExtractStatus: text("qa_extract_status", { enum: ["idle", "running", "done", "failed"] }).notNull().default("idle"),
    qaExtractCount: integer("qa_extract_count").notNull().default(0),
    qaExtractError: text("qa_extract_error"),
    qaExtractedAt: ts("qa_extracted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("knowledge_document_sha_uq").on(t.merchantId, t.sha256).where(sql`status <> 'deleting'`),
    index("knowledge_document_merchant_idx").on(t.merchantId, t.status),
    index("knowledge_document_category_idx").on(t.categoryId),
  ],
);

export const knowledgePart = pgTable(
  "knowledge_part",
  {
    id: id(),
    merchantId: merchantRef(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocument.id, { onDelete: "cascade" }),
    partNo: integer("part_no").notNull(),
    pageFrom: integer("page_from"),
    pageTo: integer("page_to"),
    /** 检索服务里的条目名 <资料 ID>/<条目号>.<扩展名>；重传沿用同一个名字 */
    itemKey: text("item_key").notNull().unique(),
    status: text("status", { enum: ["pending", "indexing", "indexed", "failed"] }).notNull().default("pending"),
    retries: integer("retries").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("knowledge_part_document_uq").on(t.documentId, t.partNo)],
);

export const knowledgeChunk = pgTable(
  "knowledge_chunk",
  {
    id: id(),
    merchantId: merchantRef(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocument.id, { onDelete: "cascade" }),
    partId: uuid("part_id")
      .notNull()
      .references(() => knowledgePart.id, { onDelete: "cascade" }),
    no: integer("no").notNull(),
    /** 检索服务给的分块 ID，用来把检索结果对回分块 */
    remoteId: text("remote_id").notNull(),
    text: text("text").notNull(),
  },
  (t) => [uniqueIndex("knowledge_chunk_document_no_uq").on(t.documentId, t.no), index("knowledge_chunk_remote_idx").on(t.merchantId, t.remoteId)],
);

// ---------- 产品清单与问答 ----------

/** 产品清单：官方产品名称与物料编码一一对应；平台商品按卖家 SKU = code 对应到产品 */
export const product = pgTable(
  "product",
  {
    id: id(),
    merchantId: merchantRef(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("product_merchant_code_uq").on(t.merchantId, t.code)],
);

/** 平台商品的卖家 SKU 与产品的对应：拉商品目录时写入，产品清单变更时按 sku = code 重算 product_id */
export const productListing = pgTable(
  "product_listing",
  {
    id: id(),
    merchantId: merchantRef(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shop.id, { onDelete: "cascade" }),
    externalProductId: text("external_product_id").notNull(),
    sku: text("sku").notNull(),
    productId: uuid("product_id").references(() => product.id, { onDelete: "set null" }),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("product_listing_uq").on(t.shopId, t.externalProductId, t.sku), index("product_listing_merchant_sku_idx").on(t.merchantId, t.sku)],
);

export const QA_EMBED_DIMS = 1024;

/** 问答：手写的保存即发布；资料整理出的先是待审核候选，审核通过才发布（只有 published 参与检索） */
export const knowledgeQa = pgTable(
  "knowledge_qa",
  {
    id: id(),
    merchantId: merchantRef(),
    questions: text("questions").array().notNull(),
    answer: text("answer").notNull(),
    /** 空数组 = 通用，适用全部产品 */
    productIds: uuid("product_ids").array().notNull().default(sql`'{}'::uuid[]`),
    stage: text("stage", { enum: ["presale", "insale", "aftersale", "any"] }).notNull(),
    markets: jsonb("markets").$type<KnowledgeMarket[]>().notNull().default(["ALL"]),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    status: text("status", { enum: ["pending", "published", "rejected", "archived"] }).notNull(),
    source: text("source", { enum: ["manual", "import"] }).notNull(),
    sourceDocumentId: uuid("source_document_id").references(() => knowledgeDocument.id, { onDelete: "set null" }),
    sourceExcerpt: text("source_excerpt"),
    duplicateOf: uuid("duplicate_of"),
    rejectReason: text("reject_reason"),
    embedding: vector("embedding", { dimensions: QA_EMBED_DIMS }),
    embeddingModel: text("embedding_model"),
    createdBy: uuid("created_by").references(() => membership.id, { onDelete: "set null" }),
    reviewedBy: uuid("reviewed_by").references(() => membership.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    publishedAt: ts("published_at"),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("knowledge_qa_merchant_status_idx").on(t.merchantId, t.status),
    index("knowledge_qa_document_idx").on(t.sourceDocumentId),
    index("knowledge_qa_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

// ---------- 飞书推送 ----------

/** 每商户一条：接法（飞书应用 / 群自定义机器人）、应用凭证、最近一次校验结果与两个推送开关 */
export const feishuIntegration = pgTable("feishu_integration", {
  merchantId: uuid("merchant_id")
    .primaryKey()
    .references(() => merchant.id, { onDelete: "cascade" }),
  method: text("method", { enum: ["app", "webhook"] }).notNull(),
  appId: text("app_id"),
  appSecretEnc: text("app_secret_enc"),
  /** 应用接法：换 tenant_access_token 通过为 verified；之后发卡鉴权失败改为 invalid */
  status: text("status", { enum: ["verified", "invalid"] }).notNull().default("verified"),
  verifiedAt: ts("verified_at"),
  notifyUnclaimed: boolean("notify_unclaimed").notNull().default(true),
  notifyOverdue: boolean("notify_overdue").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** 推送目标群：shop_id 为空是默认群，否则是该店另指定的群；应用接法存 chat_id，自定义机器人存 webhook 与签名密钥密文 */
export const feishuTarget = pgTable(
  "feishu_target",
  {
    id: id(),
    merchantId: merchantRef(),
    shopId: uuid("shop_id").references(() => shop.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["app_chat", "webhook"] }).notNull(),
    /** 群名：应用接法取飞书返回的群名，自定义机器人由管理员填写 */
    name: text("name").notNull(),
    chatId: text("chat_id"),
    webhookEnc: text("webhook_enc"),
    secretEnc: text("secret_enc"),
    /** webhook 地址末 4 位，界面上区分不同机器人用 */
    webhookHint: text("webhook_hint"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("feishu_target_default_uq").on(t.merchantId).where(sql`${t.shopId} is null`),
    uniqueIndex("feishu_target_shop_uq").on(t.shopId).where(sql`${t.shopId} is not null`),
  ],
);

/** 飞书卡片投递记录（发件箱）：先落库再入队 feishu.send；同一会话段同一卡种只有一行，处理人每次取消认领另起一行 */
export const feishuDelivery = pgTable(
  "feishu_delivery",
  {
    id: id(),
    merchantId: merchantRef(),
    conversationId: uuid("conversation_id").references(() => conversation.id, { onDelete: "cascade" }),
    segmentId: uuid("segment_id").references(() => segment.id, { onDelete: "cascade" }),
    /** 工单转发卡：转发的工单 */
    ticketId: uuid("ticket_id").references(() => ticket.id, { onDelete: "cascade" }),
    /** unclaimed 待认领卡，overdue 待认领超时卡，test 设置页的测试卡片，ticket 工单详情页手动转发的工单卡 */
    kind: text("kind", { enum: ["unclaimed", "overdue", "test", "ticket"] }).notNull(),
    /** 同段同卡种的序号：处理人取消认领时取本段最大值 + 1，其余触发都是 0（INV-FEISHU-003） */
    seq: integer("seq").notNull().default(0),
    targetId: uuid("target_id").references(() => feishuTarget.id, { onDelete: "set null" }),
    /** 应用接法下转发时选的群（不一定是设过的推送群）；有值时按它发，不看 target_id */
    chatId: text("chat_id"),
    targetName: text("target_name"),
    /** 手动转发的成员 */
    actorId: uuid("actor_id").references(() => membership.id, { onDelete: "set null" }),
    status: text("status", { enum: ["queued", "sent", "failed", "skipped"] }).notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    /** 应用接法发出的消息 ID；自定义机器人不返回 */
    messageId: text("message_id"),
    /** 发出（或准备发出）的卡片 JSON；重试时沿用，不重新生成总结与译文 */
    card: jsonb("card").$type<Record<string, unknown> | null>(),
    /** 由发送替身记下（FEISHU_MODE=stub），没有真的发到飞书 */
    stub: boolean("stub").notNull().default(false),
    error: text("error"),
    createdAt: createdAt(),
    sentAt: ts("sent_at"),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("feishu_delivery_segment_kind_seq_uq").on(t.segmentId, t.kind, t.seq).where(sql`${t.segmentId} is not null`),
    index("feishu_delivery_merchant_created_idx").on(t.merchantId, t.createdAt),
    index("feishu_delivery_ticket_idx").on(t.ticketId),
  ],
);

export const idempotencyKey = pgTable(
  "idempotency_key",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull(),
    key: text("key").notNull(),
    route: text("route").notNull(),
    requestHash: text("request_hash").notNull(),
    status: integer("status"),
    response: jsonb("response"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("idempotency_key_uq").on(t.merchantId, t.route, t.key)],
);

export const devAiStub = pgTable("dev_ai_stub", {
  id: integer("id").primaryKey().default(1),
  next: text("next", { enum: ["normal", "low_confidence", "handoff", "invalid_json", "timeout", "insufficient"] }).notNull().default("normal"),
  sticky: boolean("sticky").notNull().default(false),
  lastRequest: jsonb("last_request").$type<{ kind: string; at: string; model: string; system: string; messages: Array<{ role: string; content: string }> } | null>(),
  updatedAt: updatedAt(),
});

/** 检索替身（KNOWLEDGE_MODE=stub，API-MOCK-010）：下一次检索或入库的表现，与最近几次检索请求 */
export type KnowledgeStubQuery = { at: string; instance: string; query: string; retrievalType: "hybrid" | "vector"; maxResults: number };
export const devKnowledgeStub = pgTable("dev_knowledge_stub", {
  id: integer("id").primaryKey().default(1),
  next: text("next", { enum: ["normal", "no_vector", "timeout", "error", "ingest_error"] }).notNull().default("normal"),
  sticky: boolean("sticky").notNull().default(false),
  lastQuery: jsonb("last_query").$type<KnowledgeStubQuery[] | null>(),
  updatedAt: updatedAt(),
});
