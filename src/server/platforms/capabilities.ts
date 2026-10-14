// 店铺能力表（DESIGN §9.2 capabilities）：接入检查、续期、种子共用同一份默认值。
import type { ShopCapabilities } from "@/server/db/schema";

/**
 * REQ-CONV-005：两个平台都能发文字与图片；TikTok 会话另可发订单卡、物流卡、退货退款卡、优惠券卡并结束会话。
 * 商品卡按 productScope 置灰（TikTok 未授予商品读取权限）。
 */
export function capabilitiesFor(
  platform: "shopee" | "tiktok",
  probe: { chat: boolean; chatReason?: string; orders: boolean; ordersReason?: string; piiMasked: boolean; productScope: boolean },
): ShopCapabilities {
  const common = { ...probe, maxTextLength: 2000 };
  if (platform === "shopee") return { ...common, cards: [], coupons: false, endSession: false };
  return { ...common, cards: ["order_card", "logistics_card", "return_card", "product_card"], coupons: true, endSession: true };
}
