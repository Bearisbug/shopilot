// 只读接入的写保护：凭证借用自其他系统的应用（platform_app.read_only），平台请求只放行下列纯读接口，
// 其余在发出前就拒绝（默认拒绝）。按「方法 + 路径」判定：TikTok 的搜索类读接口是 POST，同一路径的 GET 与 PUT 又分读写。
// 拿不准是不是写操作的接口（含标已读）一律不放行；token 换取与刷新也在拒绝之列。
import { PlatformError, type PlatformName } from "./types";

export const READ_ONLY_TEXT = "只读接入的店铺不能写平台";
/** 界面上发送入口置灰的原因（会话回复、发到聊天） */
export const READ_ONLY_REPLY_REASON = "只读接入：消息从平台拉取，不能从 Shopilot 发送";
/** 界面上平台操作入口置灰的原因（售后、取消订单） */
export const READ_ONLY_ACTION_REASON = "只读接入：只能查看，不能从 Shopilot 操作平台";

export class ReadOnlyPlatformError extends PlatformError {
  constructor(platform: PlatformName, endpoint: string) {
    super(platform, "read_only", `${READ_ONLY_TEXT}（${endpoint}）`, "forbidden");
    this.name = "ReadOnlyPlatformError";
  }
}

/** Shopee：`/api/v2/` 之后的路径，读接口全是 GET */
const SHOPEE_READ: ReadonlyArray<string> = [
  "GET public/get_shops_by_partner",
  "GET push/get_app_push_config",
  "GET shop/get_shop_info",
  "GET account_health/get_shop_performance",
  "GET sellerchat/get_conversation_list",
  "GET sellerchat/get_message",
  "GET order/get_order_list",
  "GET order/get_order_detail",
  "GET logistics/get_tracking_info",
  "GET returns/get_return_list",
  "GET returns/get_return_detail",
  "GET product/get_item_base_info",
  "GET product/get_model_list",
];

/** TikTok：开放接口路径（不含主机与查询串）；路径里的 ID 段用 [^/]+ 匹配 */
const TIKTOK_READ: ReadonlyArray<[method: string, path: RegExp]> = [
  ["GET", /^\/authorization\/202309\/shops$/],
  ["GET", /^\/customer_service\/202309\/conversations$/],
  ["GET", /^\/customer_service\/202309\/conversations\/[^/]+\/messages$/],
  ["GET", /^\/customer_service\/202309\/agents\/settings$/],
  ["GET", /^\/customer_service\/202407\/performance$/],
  ["GET", /^\/event\/202309\/webhooks$/],
  ["GET", /^\/order\/202507\/orders$/],
  ["POST", /^\/order\/202309\/orders\/search$/],
  ["GET", /^\/fulfillment\/202309\/orders\/[^/]+\/tracking$/],
  ["POST", /^\/return_refund\/202602\/returns\/search$/],
  ["POST", /^\/return_refund\/202602\/cancellations\/search$/],
  ["GET", /^\/return_refund\/202309\/reject_reasons$/],
  ["POST", /^\/promotion\/202406\/coupons\/search$/],
  ["GET", /^\/product\/202309\/products\/[^/]+$/],
];

export const shopeeReadAllowed = (method: string, apiPath: string) => SHOPEE_READ.includes(`${method} ${apiPath}`);
export const tiktokReadAllowed = (method: string, path: string) => TIKTOK_READ.some(([m, re]) => m === method && re.test(path));

export function assertShopeeRead(method: string, apiPath: string) {
  if (!shopeeReadAllowed(method, apiPath)) throw new ReadOnlyPlatformError("shopee", `${method} ${apiPath}`);
}

export function assertTiktokRead(method: string, path: string) {
  if (!tiktokReadAllowed(method, path)) throw new ReadOnlyPlatformError("tiktok", `${method} ${path}`);
}
