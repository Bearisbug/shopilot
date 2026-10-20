// 工作台「商品」页签的平台接口：Shopee 在售商品分页、基础信息与多规格补价补库存；TikTok 商品搜索分页；
// 发商品卡的请求体（Shopee item 的 item_id 按原始数字串写入，不丢精度；TikTok PRODUCT_CARD）
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
const calls = () => fetchMock.mock.calls.map(([u, init]) => ({ url: new URL(String(u)), body: typeof init?.body === "string" ? init.body : null }));

async function load() {
  vi.resetModules();
  for (const [k, v] of Object.entries(BASE)) vi.stubEnv(k, v);
  const [shopee, tiktok] = await Promise.all([import("./shopee"), import("./tiktok")]);
  return { shopee, tiktok };
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

describe("Shopee 商品目录", () => {
  it("在售商品按页取到没有下一页为止，只要 NORMAL", async () => {
    const { shopee } = await load();
    fetchMock
      .mockResolvedValueOnce(json({ response: { item: [{ item_id: 11 }, { item_id: 12 }], has_next_page: true, next_offset: 100 } }))
      .mockResolvedValueOnce(json({ response: { item: [{ item_id: 13 }], has_next_page: false } }));
    expect(await shopee.shopeeItemIds(shopeeApp, shopeeShop)).toEqual(["11", "12", "13"]);
    const [first, second] = calls();
    expect(first.url.pathname).toBe("/api/v2/product/get_item_list");
    expect(first.url.searchParams.get("item_status")).toBe("NORMAL");
    expect(first.url.searchParams.get("page_size")).toBe("100");
    expect(second.url.searchParams.get("offset")).toBe("100");
  });

  it("超过上限就不再翻页", async () => {
    const { shopee } = await load();
    fetchMock.mockResolvedValueOnce(json({ response: { item: [{ item_id: 1 }, { item_id: 2 }, { item_id: 3 }], has_next_page: true, next_offset: 3 } }));
    expect(await shopee.shopeeItemIds(shopeeApp, shopeeShop, 2)).toEqual(["1", "2"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("基础信息：单规格直接给价格与库存，多规格列进 withModels", async () => {
    const { shopee } = await load();
    fetchMock.mockResolvedValueOnce(
      json({
        response: {
          item_list: [
            { item_id: 11, item_name: "Towel", item_sku: "TW-01", has_model: false, image: { image_url_list: ["https://img/11"] }, price_info: [{ currency: "MYR", current_price: 45.9 }], stock_info_v2: { summary_info: { total_available_stock: 99 } } },
            { item_id: 12, item_name: "Tumbler", has_model: true, image: { image_url_list: [] } },
          ],
        },
      }),
    );
    const r = await shopee.shopeeItemsBase(shopeeApp, shopeeShop, ["11", "12"]);
    expect(r.withModels).toEqual(["12"]);
    expect(r.items).toEqual([
      { productId: "11", name: "Towel", imageUrl: "https://img/11", priceMin: "45.9", priceMax: "45.9", currency: "MYR", stock: 99, skus: ["TW-01"] },
      { productId: "12", name: "Tumbler", imageUrl: null, priceMin: null, priceMax: null, currency: null, stock: null, skus: [] },
    ]);
    expect(calls()[0].url.searchParams.get("item_id_list")).toBe("11,12");
  });

  it("基础信息每次最多 50 个", async () => {
    const { shopee } = await load();
    fetchMock.mockImplementation(async () => json({ response: { item_list: [] } }));
    await shopee.shopeeItemsBase(shopeeApp, shopeeShop, Array.from({ length: 120 }, (_, i) => String(i + 1)));
    expect(calls().map((c) => c.url.searchParams.get("item_id_list")!.split(",").length)).toEqual([50, 50, 20]);
  });

  it("多规格：价格取各规格现价区间，库存相加，列出规格 SKU", async () => {
    const { shopee } = await load();
    fetchMock.mockResolvedValueOnce(
      json({
        response: {
          model: [
            { model_sku: "TB-BLK", price_info: [{ currency: "SGD", current_price: 19.9 }], stock_info_v2: { summary_info: { total_available_stock: 5 } } },
            { model_sku: "TB-BLU", price_info: [{ currency: "SGD", current_price: 15.5 }], stock_info_v2: { summary_info: { total_available_stock: 7 } } },
          ],
        },
      }),
    );
    expect(await shopee.shopeeItemModels(shopeeApp, shopeeShop, "12")).toEqual({ priceMin: "15.5", priceMax: "19.9", currency: "SGD", stock: 12, skus: ["TB-BLK", "TB-BLU"] });
  });

  it("发商品卡：message_type item，item_id 按原始数字写入，超出安全整数也不丢精度", async () => {
    const { shopee } = await load();
    fetchMock.mockResolvedValueOnce(json({ response: { message_id: "m-1", created_timestamp: 1_700_000_000 } }));
    const big = "24580011001234567891";
    await shopee.shopeeSendItem(shopeeApp, shopeeShop, "123", big);
    const [c] = calls();
    expect(c.url.pathname).toBe("/api/v2/sellerchat/send_message");
    expect(c.body).toBe(`{"to_id":123,"message_type":"item","content":{"item_id":${big}}}`);
  });

  it("发商品卡：商品 ID 不是纯数字时不调平台", async () => {
    const { shopee } = await load();
    await expect(shopee.shopeeSendItem(shopeeApp, shopeeShop, "123", "12a")).rejects.toMatchObject({ kind: "param" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("TikTok 商品目录", () => {
  it("只搜在售商品，按页取，价格区间、库存之和、卖家 SKU", async () => {
    const { tiktok } = await load();
    fetchMock
      .mockResolvedValueOnce(
        json({
          code: 0,
          data: {
            products: [
              {
                id: "1729582718312380101",
                title: "Towel",
                skus: [
                  { seller_sku: "TW-G", price: { currency: "MYR", sale_price: "42.90" }, inventory: [{ quantity: 3 }, { quantity: 4 }] },
                  { seller_sku: "TW-B", price: { currency: "MYR", sale_price: "39.90" }, inventory: [{ quantity: 1 }] },
                ],
              },
            ],
            next_page_token: "p2",
          },
        }),
      )
      .mockResolvedValueOnce(json({ code: 0, data: { products: [{ id: "1729582718312380102", title: "Tumbler", skus: [] }], next_page_token: "" } }));
    const items = await tiktok.tiktokCatalog(tiktokApp, tiktokShop);
    expect(items).toEqual([
      { productId: "1729582718312380101", name: "Towel", imageUrl: null, priceMin: "39.9", priceMax: "42.9", currency: "MYR", stock: 8, skus: ["TW-G", "TW-B"] },
      { productId: "1729582718312380102", name: "Tumbler", imageUrl: null, priceMin: null, priceMax: null, currency: null, stock: null, skus: [] },
    ]);
    const [first, second] = calls();
    expect(first.url.pathname).toBe("/product/202502/products/search");
    expect(JSON.parse(first.body!)).toEqual({ status: "ACTIVATE" });
    expect(first.url.searchParams.has("page_token")).toBe(false);
    expect(second.url.searchParams.get("page_token")).toBe("p2");
  });

  it("发商品卡：PRODUCT_CARD，content 带 product_id", async () => {
    const { tiktok } = await load();
    fetchMock.mockResolvedValueOnce(json({ code: 0, data: { message_id: "m-2" } }));
    await tiktok.tiktokSendProductCard(tiktokApp, tiktokShop, "conv-1", "1729582718312380101");
    const [c] = calls();
    expect(c.url.pathname).toBe("/customer_service/202606/conversations/conv-1/messages");
    expect(JSON.parse(c.body!)).toEqual({ type: "PRODUCT_CARD", content: JSON.stringify({ product_id: "1729582718312380101" }) });
  });
});
