// 商品卡片的商品信息：Shopee 单规格直接取价、多规格再取各规格价格；TikTok 取主图缩略图与各 SKU 价格区间；平台商品页链接按站点拼
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE = {
  DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/db",
  BETTER_AUTH_SECRET: "s".repeat(32),
  APP_BASE_URL: "http://127.0.0.1:3360",
  APP_ENCRYPTION_KEY: "k".repeat(44),
  SHOPEE_HOSTS: "sg=http://shopee.test",
  TIKTOK_API_HOST: "http://tiktok.test",
  TIKTOK_AUTH_HOST: "http://tiktok-auth.test",
};

const fetchMock = vi.fn();
const json = (body: unknown) => new Response(JSON.stringify(body));

async function load() {
  vi.resetModules();
  for (const [k, v] of Object.entries(BASE)) vi.stubEnv(k, v);
  const [shopee, tiktok, info] = await Promise.all([import("./shopee"), import("./tiktok"), import("@/server/products/info")]);
  return { shopee, tiktok, info };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const shopeeApp = { partnerId: "1", partnerKey: "k", host: "http://shopee.test" };
const shopeeShop = { shopId: "9", accessToken: "t" };
const tiktokApp = { appKey: "a", appSecret: "s" };
const tiktokShop = { accessToken: "t", cipher: "c" };

describe("Shopee 商品", () => {
  it("单规格：取标题、第一张图与现价，不调规格接口", async () => {
    const { shopee } = await load();
    fetchMock.mockResolvedValueOnce(json({ response: { item_list: [{ item_id: 5, item_name: "Towel", has_model: false, image: { image_url_list: ["https://img/1", "https://img/2"] }, price_info: [{ currency: "MYR", current_price: 45.9 }] }] } }));
    expect(await shopee.shopeeProduct(shopeeApp, shopeeShop, "5")).toEqual({ name: "Towel", imageUrl: "https://img/1", priceMin: "45.9", priceMax: "45.9", currency: "MYR" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("多规格：价格取各规格现价的最低与最高", async () => {
    const { shopee } = await load();
    fetchMock
      .mockResolvedValueOnce(json({ response: { item_list: [{ item_id: 5, item_name: "Tumbler", has_model: true, image: { image_url_list: [] } }] } }))
      .mockResolvedValueOnce(json({ response: { model: [{ price_info: [{ currency: "SGD", current_price: 19.9 }] }, { price_info: [{ currency: "SGD", current_price: 15.5 }] }] } }));
    expect(await shopee.shopeeProduct(shopeeApp, shopeeShop, "5")).toEqual({ name: "Tumbler", imageUrl: null, priceMin: "15.5", priceMax: "19.9", currency: "SGD" });
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/v2/product/get_model_list");
  });

  it("商品不存在返回 null", async () => {
    const { shopee } = await load();
    fetchMock.mockResolvedValueOnce(json({ response: { item_list: [] } }));
    expect(await shopee.shopeeProduct(shopeeApp, shopeeShop, "5")).toBeNull();
  });
});

describe("TikTok 商品", () => {
  it("取缩略图与各 SKU 价格区间", async () => {
    const { tiktok } = await load();
    fetchMock.mockResolvedValueOnce(json({ code: 0, data: { id: "17", title: "Socks", main_images: [{ urls: ["https://img/big"], thumb_urls: ["https://img/thumb"] }], skus: [{ price: { currency: "MYR", sale_price: "12.00" } }, { price: { currency: "MYR", sale_price: "9.50" } }] } }));
    expect(await tiktok.tiktokProduct(tiktokApp, tiktokShop, "17")).toEqual({ name: "Socks", imageUrl: "https://img/thumb", priceMin: "9.5", priceMax: "12", currency: "MYR" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/product/202309/products/17");
  });
});

describe("平台商品页链接", () => {
  it("Shopee 按站点域名拼，未知站点不给链接；TikTok 带站点参数", async () => {
    const { info } = await load();
    expect(info.productUrl({ platform: "shopee", market: "MY", externalShopId: "220001" }, "24580011001")).toBe("https://shopee.com.my/product/220001/24580011001");
    expect(info.productUrl({ platform: "shopee", market: "th", externalShopId: "1" }, "2")).toBe("https://shopee.co.th/product/1/2");
    expect(info.productUrl({ platform: "shopee", market: "XX", externalShopId: "1" }, "2")).toBeNull();
    expect(info.productUrl({ platform: "tiktok", market: "MY", externalShopId: "7000001" }, "1729")).toBe("https://shop.tiktok.com/view/product/1729?region=MY&locale=en");
    expect(info.productUrl({ platform: "tiktok", market: "MY", externalShopId: "7000001" }, "")).toBeNull();
  });
});
