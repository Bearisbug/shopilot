// 平台适配器的归一化类型（ADR-004）：Shopilot 领域代码只认这些类型，平台原始字段保留在 raw。
export type PlatformName = "shopee" | "tiktok";

export type AppCreds = {
  platform: PlatformName;
  appKey: string; // Shopee partner_id / TikTok app_key
  secret: string; // Shopee partner_key / TikTok app_secret
  pushKey?: string | null;
  apiHost?: string | null; // Shopee：识别出的区域主机
};

export type ShopAuth = {
  externalShopId: string;
  shopCipher?: string | null;
  accessToken: string;
  refreshToken?: string | null;
};

export type TokenGrant = {
  shops: Array<{ externalShopId: string; name?: string; market?: string; cipher?: string; mainAccountId?: string; authExpiresAt?: Date | null }>;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  /** 整个授权的到期（TikTok refresh_token_expire_in）；Shopee 按店给在 shops[].authExpiresAt */
  authExpiresAt: Date | null;
  grantedScopes?: string[];
  sellerName?: string;
};

export type NormalizedMessage = {
  externalMessageId: string;
  externalConversationId: string;
  buyerExternalId: string | null;
  buyerName: string | null;
  fromBuyer: boolean;
  senderRole: "buyer" | "agent" | "platform_human" | "platform_bot" | "system";
  type: "text" | "image" | "order_card" | "product_card" | "return_card" | "logistics_card" | "coupon_card" | "sticker" | "video" | "other";
  text: string | null;
  translation: string | null;
  payload: Record<string, unknown>;
  sentAt: Date;
  affiliate: boolean;
  /** 买家发的消息带的头像地址（TikTok sender.avatar）；平台不给时为空 */
  buyerAvatarUrl?: string | null;
  raw: unknown;
};

/** 商品卡片用的商品信息：价格为店铺币种的现价，多规格时为最低与最高 */
export type ProductDetail = { name: string; imageUrl: string | null; priceMin: string | null; priceMax: string | null; currency: string | null };

export type NormalizedOrder = {
  externalOrderId: string;
  buyerExternalId: string | null;
  buyerName: string | null;
  platformStatus: string;
  totalAmount: string;
  currency: string;
  items: Array<{ name: string; sku?: string; productId?: string; skuId?: string; qty: number; unitPrice: string; image?: string }>;
  shipByAt: Date | null;
  recipient: { name?: string; phone?: string; address?: string; masked: boolean } | null;
  tracking: { trackingNo?: string; carrier?: string; packageId?: string; events: Array<{ at: string; text: string }> } | null;
  deadlines: Record<string, string> | null;
  payment: { shippingFee?: string; method?: string; paidAt?: string } | null;
  createdAt: Date;
  updatedAt: Date | null;
  buyerRequestedCancel?: boolean;
};

export type NormalizedAfterSale = {
  kind: "return" | "cancel";
  externalId: string;
  externalOrderId: string;
  buyerExternalId?: string | null;
  platformStatus: string;
  nextAction: string | null;
  sellerDueAt: Date | null;
  dueField: string | null;
  reason: string | null;
  amount: string | null;
  currency: string | null;
  arbitrationStatus?: string | null;
  returnType?: string | null;
  updatedAt: Date | null;
  raw: unknown;
};

export type ProbeResult = {
  name?: string;
  market?: string;
  chat: { ok: boolean; reason?: string };
  orders: { ok: boolean; reason?: string };
  piiMasked: boolean;
  productScope: boolean;
};

export class PlatformError extends Error {
  readonly platform: PlatformName;
  readonly code: string;
  readonly kind: "auth" | "forbidden" | "not_found" | "param" | "state" | "server" | "timeout" | "network";
  readonly httpStatus: number;
  constructor(platform: PlatformName, code: string, message: string, kind: PlatformError["kind"], httpStatus = 200) {
    super(message);
    this.platform = platform;
    this.code = code;
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

/** 平台错误转成给用户看的中文（problem detail） */
export function platformErrorText(e: PlatformError): string {
  const name = e.platform === "shopee" ? "Shopee" : "TikTok";
  if (e.kind === "timeout") return `${name} 10 秒内没有响应，结果未知，请先刷新确认再决定是否重试。`;
  if (e.kind === "network") return `连不上 ${name} 开放平台，请稍后重试。`;
  if (e.kind === "auth") return `${name} 授权失效或凭证不对（${e.code}），请到「店铺与连接」续期授权或更新密钥。`;
  if (e.code === "read_only") return e.message;
  if (e.kind === "forbidden") return `${name} 不允许这次操作（${e.code}）：${e.message}`;
  if (e.kind === "state") return `${name} 拒绝：当前状态不允许这个操作（${e.code}）。`;
  if (e.kind === "not_found") return `${name} 上找不到这条记录（${e.code}）。`;
  return `${name} 返回错误（${e.code}）：${e.message}`;
}
