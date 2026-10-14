// 模拟平台表（mock_ 前缀，DESIGN §7 末尾「模拟平台」ER）。Shopilot 业务代码不得读写这些表，只能经 HTTP。
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export type MockPlatform = "shopee" | "tiktok";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** 平台应用：Shopee partner（partner_id / partner_key）或 TikTok app（app_key / app_secret）。 */
export const mockApp = pgTable(
  "mock_app",
  {
    platform: text("platform").$type<MockPlatform>().notNull(),
    appKey: text("app_key").notNull(),
    name: text("name").notNull(),
    secret: text("secret").notNull(),
    pushKey: text("push_key"),
    /** Shopee 登记区域 cn / sg / br / sandbox；TikTok 为 global */
    region: text("region").notNull(),
    /** Shopee 主账号（授权页列出其名下店铺） */
    mainAccountId: text("main_account_id"),
    /** TikTok 应用登记的 redirect_url */
    redirectUrl: text("redirect_url"),
    /** Shopee 推送回调地址（set_app_push_config 写入） */
    callbackUrl: text("callback_url"),
    /** Shopee 已订阅的推送 code */
    pushCodes: jsonb("push_codes").$type<number[]>().notNull().default([]),
    /** Shopee 推送配置的其余字段（屏蔽店铺等），按 get_app_push_config 原样回读 */
    pushConfig: jsonb("push_config").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.platform, t.appKey] })],
);

export type ShopCapabilities = { chat: boolean };

/** TikTok 每类事件的 webhook 地址：{ "ORDER_STATUS_CHANGE": { address, create_time, update_time } } */
export type TiktokWebhookMap = Record<string, { address: string; create_time: number; update_time: number }>;

/** 店铺：一家店登记在一个应用下；auth_status 表示当前是否授权给该应用。 */
export const mockShop = pgTable(
  "mock_shop",
  {
    platform: text("platform").$type<MockPlatform>().notNull(),
    shopId: text("shop_id").notNull(),
    appKey: text("app_key").notNull(),
    name: text("name").notNull(),
    /** 站点：MY / SG / TH / VN / PH / CN … */
    region: text("region").notNull(),
    /** TikTok shop_cipher 与 shop code */
    cipher: text("cipher"),
    shopCode: text("shop_code"),
    /** Shopee 主账号 ID */
    mainAccountId: text("main_account_id"),
    /** TikTok 卖家 open_id 与名称 */
    sellerOpenId: text("seller_open_id"),
    sellerName: text("seller_name"),
    currency: text("currency").notNull(),
    authStatus: text("auth_status").$type<"authorized" | "unauthorized" | "deauthorized">().notNull().default("unauthorized"),
    authTime: ts("auth_time"),
    authExpiresAt: ts("auth_expires_at"),
    accessToken: text("access_token"),
    accessExpiresAt: ts("access_expires_at"),
    /** 刷新后旧 access_token 的宽限截止（Shopee 5 分钟） */
    prevAccessToken: text("prev_access_token"),
    prevAccessExpiresAt: ts("prev_access_expires_at"),
    refreshToken: text("refresh_token"),
    refreshExpiresAt: ts("refresh_expires_at"),
    capabilities: jsonb("capabilities").$type<ShopCapabilities>().notNull().default({ chat: true }),
    webhooks: jsonb("webhooks").$type<TiktokWebhookMap>().notNull().default({}),
    /** TikTok 客服坐席是否接单（agents/settings） */
    canAcceptChat: boolean("can_accept_chat").notNull().default(true),
    /** 店铺口径客服指标（account_health / performance 回读） */
    performance: jsonb("performance").$type<Record<string, number>>().notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.platform, t.shopId] }), index("mock_shop_app_idx").on(t.platform, t.appKey)],
);

/** 一次性授权码：Shopee auth_partner / TikTok authorize 产生，token/get 消费。 */
export const mockAuthCode = pgTable("mock_auth_code", {
  code: text("code").primaryKey(),
  platform: text("platform").$type<MockPlatform>().notNull(),
  appKey: text("app_key").notNull(),
  shopIds: jsonb("shop_ids").$type<string[]>().notNull(),
  mainAccountId: text("main_account_id"),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** 买家会话。Shopee conversation_id 为数字串；TikTok 为字母数字串。 */
export const mockBuyerThread = pgTable(
  "mock_buyer_thread",
  {
    conversationId: text("conversation_id").primaryKey(),
    platform: text("platform").$type<MockPlatform>().notNull(),
    shopId: text("shop_id").notNull(),
    /** Shopee user_id；TikTok 订单侧 user_id */
    buyerId: text("buyer_id").notNull(),
    /** TikTok im_user_id（聊天侧）；Shopee 与 buyer_id 相同 */
    buyerImId: text("buyer_im_id").notNull(),
    buyerName: text("buyer_name").notNull(),
    buyerAvatar: text("buyer_avatar"),
    language: text("language").notNull(),
    canSend: boolean("can_send").notNull().default(true),
    /** 卖家侧未读数 */
    unreadCount: integer("unread_count").notNull().default(0),
    /** TikTok 当前会话段 ID 与状态（end session 用） */
    sessionId: text("session_id"),
    sessionOpen: boolean("session_open").notNull().default(true),
    /** 模拟器「新建买家」建出的会话在买家发第一条消息前为 false，平台接口不列出 */
    started: boolean("started").notNull().default(true),
    lastMessageAt: ts("last_message_at").notNull().defaultNow(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("mock_thread_shop_idx").on(t.platform, t.shopId)],
);

/** 消息。type 为平台原值（Shopee message_type 小写；TikTok type 大写），content 为平台原样结构。 */
export const mockMessage = pgTable(
  "mock_message",
  {
    seq: bigserial("seq", { mode: "number" }).notNull(),
    messageId: text("message_id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    platform: text("platform").$type<MockPlatform>().notNull(),
    shopId: text("shop_id").notNull(),
    /** buyer / seller / system / robot */
    sender: text("sender").$type<"buyer" | "seller" | "system" | "robot">().notNull(),
    type: text("type").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    sourceContent: jsonb("source_content").$type<Record<string, unknown>>(),
    isVisible: boolean("is_visible").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("mock_message_conv_idx").on(t.conversationId, t.seq)],
);

export type MockOrderItem = {
  itemId: string;
  skuId: string;
  name: string;
  skuName: string;
  qty: number;
  price: string;
  originalPrice: string;
  /** 每件一个行 ID（TikTok 一件一行；Shopee 取第一个作 order_item_id） */
  lineItemIds: string[];
};

export type MockTrackingEvent = { time: number; description: string; status: string };

/** 订单。status 为平台原值；deadlines 为平台截止字段（秒级时间戳）。 */
export const mockOrder = pgTable(
  "mock_order",
  {
    orderId: text("order_id").primaryKey(),
    platform: text("platform").$type<MockPlatform>().notNull(),
    shopId: text("shop_id").notNull(),
    buyerId: text("buyer_id").notNull(),
    buyerName: text("buyer_name").notNull(),
    status: text("status").notNull(),
    /** 进入 IN_CANCEL 前的状态，拒绝取消时回到它 */
    prevStatus: text("prev_status"),
    currency: text("currency").notNull(),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
    shippingFee: numeric("shipping_fee", { precision: 14, scale: 2 }).notNull().default("0"),
    items: jsonb("items").$type<MockOrderItem[]>().notNull(),
    recipient: jsonb("recipient").$type<{ name: string; phone: string; fullAddress: string; city: string; region: string; zipcode: string }>().notNull(),
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    packageNumber: text("package_number"),
    /** Shopee 包裹 logistics_status 覆盖值（物流异常时写入） */
    logisticsStatus: text("logistics_status"),
    tracking: jsonb("tracking").$type<MockTrackingEvent[]>().notNull().default([]),
    /** 平台截止字段（秒）：Shopee ship_by_date；TikTok rts_sla_time、shipping_due_time … */
    deadlines: jsonb("deadlines").$type<Record<string, number>>().notNull().default({}),
    /** 已发生的时间点（秒）：paid、rts、collection、delivery、cancel、request_cancel */
    times: jsonb("times").$type<Record<string, number>>().notNull().default({}),
    buyerMessage: text("buyer_message").notNull().default(""),
    paymentMethod: text("payment_method").notNull().default(""),
    cancelBy: text("cancel_by"),
    cancelReason: text("cancel_reason"),
    buyerCancelReason: text("buyer_cancel_reason"),
    createTime: ts("create_time").notNull().defaultNow(),
    payTime: ts("pay_time"),
    updateTime: ts("update_time").notNull().defaultNow(),
  },
  (t) => [index("mock_order_shop_idx").on(t.platform, t.shopId, t.updateTime)],
);

export type TiktokNextAction = { action: string; deadline: number };
export type MockAfterSaleRecord = { event: string; description: string; role: string; create_time: number; note?: string; reason_text?: string };

/** 售后单：Shopee 退货（return_sn）；TikTok 退货（return_id）与取消（cancel_id）。 */
export const mockAfterSale = pgTable(
  "mock_after_sale",
  {
    id: text("id").primaryKey(),
    platform: text("platform").$type<MockPlatform>().notNull(),
    shopId: text("shop_id").notNull(),
    orderId: text("order_id").notNull(),
    kind: text("kind").$type<"return" | "cancel">().notNull(),
    status: text("status").notNull(),
    /** TikTok return_type / cancel_type；Shopee return_solution 文本 */
    subtype: text("subtype").notNull(),
    reason: text("reason").notNull(),
    reasonText: text("reason_text").notNull().default(""),
    currency: text("currency").notNull(),
    refundAmount: numeric("refund_amount", { precision: 14, scale: 2 }).notNull(),
    items: jsonb("items").$type<MockOrderItem[]>().notNull(),
    /** Shopee：due_date / return_seller_due_date / return_ship_due_date / seller_evidence_deadline */
    deadlines: jsonb("deadlines").$type<Record<string, number>>().notNull().default({}),
    /** TikTok seller_next_action_response */
    nextActions: jsonb("next_actions").$type<TiktokNextAction[]>().notNull().default([]),
    arbitrationStatus: text("arbitration_status"),
    role: text("role").notNull().default("BUYER"),
    returnTrackingNumber: text("return_tracking_number"),
    returnCarrier: text("return_carrier"),
    records: jsonb("records").$type<MockAfterSaleRecord[]>().notNull().default([]),
    /** 平台专有的其余字段（seller_proof、dispute、logistics_status 等） */
    extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
    createTime: ts("create_time").notNull().defaultNow(),
    updateTime: ts("update_time").notNull().defaultNow(),
  },
  (t) => [index("mock_after_sale_shop_idx").on(t.platform, t.shopId, t.updateTime), index("mock_after_sale_order_idx").on(t.orderId)],
);

/** 优惠券（TikTok promotion）。 */
export const mockCoupon = pgTable("mock_coupon", {
  couponId: text("coupon_id").primaryKey(),
  platform: text("platform").$type<MockPlatform>().notNull(),
  shopId: text("shop_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  /** 平台原样结构（discount、threshold、display_type…） */
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull(),
  startTime: ts("start_time").notNull(),
  endTime: ts("end_time").notNull(),
});

/** 推送日志：每次推送（含重发）一行。 */
export const mockPushLog = pgTable(
  "mock_push_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    platform: text("platform").$type<MockPlatform>().notNull(),
    appKey: text("app_key").notNull(),
    shopId: text("shop_id"),
    /** Shopee code 或 TikTok type */
    event: integer("event").notNull(),
    targetUrl: text("target_url").notNull(),
    /** 原始 body 文本（重发时原样再发） */
    rawBody: text("raw_body").notNull(),
    body: jsonb("body").$type<Record<string, unknown>>().notNull(),
    summary: text("summary").notNull(),
    httpStatus: integer("http_status"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    resendOf: uuid("resend_of"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("mock_push_log_created_idx").on(t.createdAt)],
);

/** 上传的图片：存到 ${DATA_DIR}/mock-uploads/，经 /mock/files/{id} 读取。 */
export const mockUpload = pgTable("mock_upload", {
  id: text("id").primaryKey(),
  platform: text("platform").$type<MockPlatform>().notNull(),
  shopId: text("shop_id"),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type FaultCategory = "send_message" | "order_read" | "after_sale_write";

/** 故障注入：按店按接口类别让下一次（once）或持续（sticky）调用失败（error）或延迟 12 秒（timeout）。 */
export const mockFault = pgTable(
  "mock_fault",
  {
    platform: text("platform").$type<MockPlatform>().notNull(),
    shopId: text("shop_id").notNull(),
    category: text("category").$type<FaultCategory>().notNull(),
    kind: text("kind").$type<"error" | "timeout">().notNull(),
    mode: text("mode").$type<"once" | "sticky">().notNull(),
    hits: integer("hits").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.platform, t.shopId, t.category] })],
);
