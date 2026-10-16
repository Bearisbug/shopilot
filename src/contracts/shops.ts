// 店铺与接入契约（DESIGN §8.3 API-SHOP-001…014、§9.2）。密钥字段只写不读：任何响应都不含 Partner Key、App Secret、token。
import { z } from "zod";
import { zPlatform } from "./common";

export type PlatformKey = z.infer<typeof zPlatform>;

export const MARKETS = ["MY", "TH", "VN", "PH", "SG", "ID", "TW", "BR", "OTHER"] as const;
export type Market = (typeof MARKETS)[number];
/** TikTok 授权页可选的站点（shop_region） */
export const TIKTOK_REGIONS = ["MY", "TH", "VN", "PH", "SG", "ID"] as const;

export const CONNECT_STEPS = ["platform", "guide", "credentials", "auth", "probe", "done"] as const;
export type ConnectStep = (typeof CONNECT_STEPS)[number];

// ---------- API-SHOP-001 / 002 接入草稿 ----------

export const draftBody = z
  .object({
    step: z.enum(CONNECT_STEPS).optional(),
    checklist: z.partialRecord(z.enum(["1", "2", "3", "4", "5"]), z.boolean()).optional(),
    initialMode: z.enum(["shadow", "off"]).optional(),
  })
  .refine((b) => b.step || b.checklist || b.initialMode, "没有要保存的内容");
export type DraftBody = z.infer<typeof draftBody>;

export type AppStatus = "unverified" | "verified" | "invalid";
export type CallbackState = "unset" | "set" | "already_ours" | "other_needs_confirm" | "failed";

export type ConnectDraft = {
  platform: PlatformKey;
  step: ConnectStep;
  checklist: Record<"1" | "2" | "3" | "4" | "5", boolean>;
  initialMode: "shadow" | "off";
  /** 本次接入已授权、尚未完成的店铺数 */
  pendingShops: number;
  app: null | {
    appKey: string;
    status: AppStatus;
    region: string | null;
    sandboxOnly: boolean;
    callbackState: CallbackState;
    keyExpiresAt: string | null;
    hasPushKey: boolean;
    /** TikTok Service ID；Shopee 恒为 null */
    serviceId: string | null;
    verifiedAt: string | null;
  };
  /** 回调与授权地址（填进平台控制台用） */
  urls: { redirect: string; redirectDomain: string; webhook: string };
  /** 该平台已接入（未断开）的店铺，授权页列站点用 */
  shops: Array<{ id: string; name: string; market: string; status: ShopStatus }>;
};

// ---------- API-SHOP-003 应用凭证 ----------

export const shopeeAppBody = z.object({
  partnerId: z.string().trim().regex(/^\d{1,12}$/, "Partner ID 是一串数字"),
  partnerKey: z.string().trim().min(1, "请填 Partner Key").max(200),
  pushKey: z.string().trim().max(200).optional(),
  keyExpiresAt: z.iso.date("日期格式应为 YYYY-MM-DD").optional(),
  overwriteCallback: z.boolean().optional(),
});
export const tiktokAppBody = z.object({
  appKey: z.string().trim().regex(/^[A-Za-z0-9]{4,40}$/, "App Key 由字母和数字组成"),
  /** 同一 App Key 已保存过 Secret 时可以不填，沿用已保存的 */
  appSecret: z.string().trim().max(200).optional(),
  serviceId: z.string().trim().regex(/^\d{6,30}$/, "Service ID 是一串数字，从 Partner Center 应用详情页复制"),
});
export type ShopeeAppBody = z.infer<typeof shopeeAppBody>;
export type TiktokAppBody = z.infer<typeof tiktokAppBody>;

export type RegionAttempt = { region: string; result: "ok" | "invalid_partner" | "wrong_key" | "error"; message?: string };

export type SaveAppResult = {
  status: AppStatus;
  region: string | null;
  sandboxOnly: boolean;
  callbackState: CallbackState;
  callbackCurrent?: string;
  /** Shopee：已授权给这个应用的店铺数（get_shops_by_partner） */
  authorizedShops?: number;
  attempts?: RegionAttempt[];
};

// ---------- API-SHOP-004 授权链接 ----------

export const authUrlBody = z.object({
  shopRegion: z.enum(TIKTOK_REGIONS).optional(),
  shopId: z.string().uuid().optional(),
});
export type AuthUrlResult = { url: string; expiresAt: string };

export const OAUTH_REASONS = ["state_invalid", "secret_or_redirect_mismatch", "sub_account", "denied", "shop_limit", "platform_error"] as const;
export type OAuthReason = (typeof OAUTH_REASONS)[number];

// ---------- API-SHOP-006 / 007 检查并完成 ----------

export type BackfillState = { state: "pending" | "running" | "done" | "failed"; conversations: number; orders: number; error?: string };

export type ProbeShop = {
  shopId: string;
  name: string;
  market: string;
  status: ShopStatus;
  chat: { ok: boolean; reason?: string };
  orders: { ok: boolean; reason?: string };
  /** null = 近期没有订单，判断不了 */
  pii: { masked: boolean | null };
  productScope: boolean;
  zeroInbound7d: boolean;
  backfill: BackfillState;
};
export type ProbeResponse = { platform: PlatformKey; checkedAt: string; shops: ProbeShop[] };

export const completeBody = z.object({ initialMode: z.enum(["shadow", "off"]) });
export type CompleteResult = { shops: Array<{ id: string; name: string; modeInHours: string; modeOffHours: string }>; warnings: string[] };

// ---------- API-SHOP-008 / 009 店铺列表与详情 ----------

export type ShopStatus = "connected" | "auth_expired" | "disconnected";
export const SHOP_PERIODS = ["7d", "30d", "this_month", "last_month"] as const;
export type ShopPeriod = (typeof SHOP_PERIODS)[number];

export const shopsQuery = z.object({
  platform: z.enum(["all", "shopee", "tiktok"]).default("all"),
  status: z.enum(["all", "attention", "ok"]).default("all"),
  period: z.enum(SHOP_PERIODS).default("7d"),
});

/** 平台口径的客服指标；Shopee 只有当期值（currentOnly），TikTok 按所选周期 */
export type ShopMetric = {
  platformLabel: string;
  basis: string;
  responseRate: number | null;
  target?: number | null;
  responseTimeDays?: number | null;
  responseTimeMins?: number | null;
  satisfaction?: number | null;
  sessions?: number | null;
  nonResponded?: number | null;
  rating?: number | null;
  currentOnly?: boolean;
};

export type ShopIssue = { key: "auth_expired" | "zero_inbound" | "chat_unavailable" | "push_unsubscribed" | "metric_low" | "auth_expiring" | "backfill_failed" | "borrowed_token_expired"; text: string };

export type ShopRow = {
  id: string;
  platform: PlatformKey;
  name: string;
  market: string;
  status: ShopStatus;
  /** 只读接入：凭证借用自其他系统，消息靠拉取进来，不能从 Shopilot 发送或操作平台 */
  readOnly: boolean;
  authExpiresAt: string | null;
  modes: { inHours: string; offHours: string };
  lastInboundAt: string | null;
  zeroInbound7d: boolean;
  metrics: ShopMetric | null;
  metricsAt: string | null;
  issues: ShopIssue[];
  backfill: BackfillState;
  /** 能力表摘要：「需要你在平台后台处理」与行内提示用 */
  caps: { chat: boolean; piiMasked: boolean; productScope: boolean };
};

export type ShopEventRow = { id: string; shopId: string; shopName: string; kind: string; text: string; createdAt: string };

export type PlatformAppCard = {
  id: string;
  platform: PlatformKey;
  appKey: string;
  status: AppStatus;
  region: string | null;
  shopCount: number;
  authExpiresAt: string | null;
  keyExpiresAt: string | null;
  /** 本商户专属的推送地址（Shopee 推送回调、TikTok Webhook）；Shopee 校验凭证、TikTok 授权时也会自动设置到平台 */
  webhookUrl: string;
  /** Shopee 推送已订阅到 Shopilot；为 false 时应用卡给「重新校验」。TikTok 应用恒为 true */
  pushSubscribed: boolean;
};

export type ShopsResponse = {
  items: ShopRow[];
  apps: PlatformAppCard[];
  /** 近 7 天的连接事件（最多 10 条） */
  events: ShopEventRow[];
  summary: {
    total: number;
    byPlatform: { shopee: number; tiktok: number };
    authValid: number;
    attention: number;
    attentionText: string[];
    todayInbound: number;
    lastInbound: { at: string; shopName: string } | null;
    lowestRate: { value: number; shopName: string; platform: PlatformKey } | null;
    metricsAt: string | null;
  };
};

export type ShopCapabilitiesView = {
  chat: boolean;
  chatReason?: string;
  orders: boolean;
  ordersReason?: string;
  piiMasked: boolean;
  productScope: boolean;
  cards: string[];
  coupons: boolean;
  endSession: boolean;
  maxTextLength: number;
};

export type ShopDetail = ShopRow & {
  appKey: string;
  externalShopId: string;
  mainAccountId: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  capabilities: ShopCapabilitiesView;
  events: Array<{ id: string; kind: string; text: string; createdAt: string }>;
};

// ---------- API-SHOP-010 检查连接 ----------

export const diagnoseBody = z.object({ shopIds: z.array(z.string().uuid()).max(200).optional() });
export type DiagnoseCheck = { key: "shop_info" | "conversations" | "orders" | "push_config"; ok: boolean; reason?: string; fixLink?: string };
export type DiagnoseResult = { checkedAt: string; results: Array<{ shopId: string; name: string; platform: PlatformKey; market: string; checks: DiagnoseCheck[] }> };

// ---------- API-SHOP-011 更新应用密钥 ----------

export const shopeeRotateBody = z.object({ partnerKey: z.string().trim().min(1, "请填新的 Partner Key").max(200), pushKey: z.string().trim().max(200).optional() });
export const tiktokRotateBody = z.object({ appSecret: z.string().trim().min(1, "请填新的 App Secret").max(200) });

// ---------- API-SHOP-012 / 013 断开与撤销授权 ----------

export const disconnectBody = z.object({ keepHistory: z.boolean() });
export type DisconnectResult = { closedConversations: number; deletedConversations: number; deletedOrders: number; warnings: string[] };

// ---------- API-SHOP-014 远程协助 ----------

export const ASSIST_STEPS = [
  { value: "shopee-1", platform: "shopee", label: "Shopee · 第 1 项 注册开发者账号" },
  { value: "shopee-2", platform: "shopee", label: "Shopee · 第 2 项 创建应用" },
  { value: "shopee-3", platform: "shopee", label: "Shopee · 第 3 项 申请上线（Go Live）" },
  { value: "shopee-4", platform: "shopee", label: "Shopee · 第 4 项 确认聊天权限" },
  { value: "shopee-5", platform: "shopee", label: "Shopee · 第 5 项 开 IP 白名单" },
  { value: "shopee-creds", platform: "shopee", label: "Shopee · 填应用凭证" },
  { value: "shopee-auth", platform: "shopee", label: "Shopee · 授权店铺" },
  { value: "tiktok-1", platform: "tiktok", label: "TikTok Shop · 第 1 项 注册卖家开发者" },
  { value: "tiktok-2", platform: "tiktok", label: "TikTok Shop · 第 2 项 创建 Custom app" },
  { value: "tiktok-3", platform: "tiktok", label: "TikTok Shop · 第 3 项 打开 Enable API" },
  { value: "tiktok-4", platform: "tiktok", label: "TikTok Shop · 第 4 项 申请客服接口" },
  { value: "tiktok-5", platform: "tiktok", label: "TikTok Shop · 第 5 项 安全审核表" },
  { value: "tiktok-creds", platform: "tiktok", label: "TikTok Shop · 填应用凭证" },
  { value: "tiktok-auth", platform: "tiktok", label: "TikTok Shop · 授权店铺" },
] as const;

export const assistBody = z
  .object({
    platform: zPlatform,
    stuckStep: z.enum(ASSIST_STEPS.map((s) => s.value) as [string, ...string[]]),
    slot: z.string().trim().min(1, "请选一个时段").max(60),
    contactChannel: z.enum(["phone", "email"]),
    contact: z.string().trim().min(3, "请填联系方式").max(120),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((b, ctx) => {
    if (!b.stuckStep.startsWith(b.platform)) ctx.addIssue({ code: "custom", path: ["stuckStep"], message: "卡住的步骤和平台不一致" });
    if (b.contactChannel === "email" && !z.email().safeParse(b.contact).success) ctx.addIssue({ code: "custom", path: ["contact"], message: "邮箱格式不对" });
    if (b.contactChannel === "phone" && !/^\+?[\d\s-]{6,20}$/.test(b.contact)) ctx.addIssue({ code: "custom", path: ["contact"], message: "电话只填数字，可带国家区号，如 +60 12 345 6789" });
  });
export type AssistBody = z.infer<typeof assistBody>;
