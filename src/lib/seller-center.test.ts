import { describe, expect, it } from "vitest";
import { sellerOrderUrl } from "./seller-center";

describe("sellerOrderUrl", () => {
  it("Shopee 中国卖家中心（应用区域 cn）带店铺 ID 与订单号", () => {
    expect(sellerOrderUrl({ platform: "shopee", market: "TH", externalShopId: "1605010448", appRegion: "cn" }, "2410150ABCDEF")).toBe(
      "https://seller.shopee.cn/portal/sale/order?cnsc_shop_id=1605010448&keyword=2410150ABCDEF",
    );
  });

  it("其他 Shopee 走站点卖家中心，站点不认识时没有链接", () => {
    expect(sellerOrderUrl({ platform: "shopee", market: "my", externalShopId: "220001", appRegion: "sg" }, "2410150ABCDEF")).toBe("https://seller.shopee.com.my/portal/sale/order?keyword=2410150ABCDEF");
    expect(sellerOrderUrl({ platform: "shopee", market: "VN", externalShopId: "1", appRegion: "sg" }, "X1")).toBe("https://banhang.shopee.vn/portal/sale/order?keyword=X1");
    expect(sellerOrderUrl({ platform: "shopee", market: "XX", externalShopId: "1", appRegion: "sg" }, "X1")).toBeNull();
  });

  it("TikTok 默认按跨境走 Global Seller Center，本土店走站点卖家中心", () => {
    const shop = { platform: "tiktok" as const, market: "MY", externalShopId: "7000001", appRegion: "global" };
    expect(sellerOrderUrl(shop, "577000000000000001")).toBe("https://seller.tiktokshopglobalselling.com/order/detail?order_no=577000000000000001&shop_region=MY");
    expect(sellerOrderUrl({ ...shop, crossBorder: false }, "577000000000000001")).toBe("https://seller-my.tiktok.com/order/detail?order_no=577000000000000001");
  });

  it("订单号做 URL 编码，空订单号没有链接", () => {
    expect(sellerOrderUrl({ platform: "shopee", market: "SG", externalShopId: "1", appRegion: "sg" }, "A&B 1")).toBe("https://seller.shopee.sg/portal/sale/order?keyword=A%26B%201");
    expect(sellerOrderUrl({ platform: "tiktok", market: "MY", externalShopId: "1", appRegion: null }, "")).toBeNull();
  });
});
