// 订单在平台卖家后台的详情页（新标签页打开）。服务端与工作台共用，改格式只改这里。
// 格式未验证，按用户提供的真实网址校正。

export type SellerShop = {
  platform: "shopee" | "tiktok";
  market: string;
  externalShopId: string;
  /** 店铺所属应用的区域（platform_app.region）：Shopee 为 cn 时是中国卖家中心（CNSC） */
  appRegion: string | null;
  /** TikTok 店铺是否跨境（授权店铺接口的 seller_type）；不知道时按跨境 */
  crossBorder?: boolean;
};

/** Shopee 各站点卖家中心的主机 */
const SHOPEE_SELLER_HOST: Record<string, string> = {
  MY: "seller.shopee.com.my",
  SG: "seller.shopee.sg",
  TH: "seller.shopee.co.th",
  VN: "banhang.shopee.vn",
  PH: "seller.shopee.ph",
  ID: "seller.shopee.co.id",
  TW: "seller.shopee.tw",
  BR: "seller.shopee.com.br",
};

/**
 * Shopee：应用区域为 cn 走中国卖家中心，带店铺 ID 切到这家店再按订单号搜；其余走站点卖家中心按订单号搜，站点不认识时返回 null。
 * TikTok：跨境店走 Global Seller Center，本土店走站点卖家中心。
 */
export function sellerOrderUrl(shop: SellerShop, orderNo: string): string | null {
  if (!orderNo) return null;
  const no = encodeURIComponent(orderNo);
  const market = shop.market.toUpperCase();
  if (shop.platform === "shopee") {
    if (shop.appRegion === "cn") return `https://seller.shopee.cn/portal/sale/order?cnsc_shop_id=${encodeURIComponent(shop.externalShopId)}&keyword=${no}`;
    const host = SHOPEE_SELLER_HOST[market];
    return host ? `https://${host}/portal/sale/order?keyword=${no}` : null;
  }
  if (shop.crossBorder === false) return `https://seller-${market.toLowerCase()}.tiktok.com/order/detail?order_no=${no}`;
  return `https://seller.tiktokshopglobalselling.com/order/detail?order_no=${no}&shop_region=${market}`;
}
