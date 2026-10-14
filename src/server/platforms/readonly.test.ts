// 只读接入的写保护：只读应用的写接口在发请求前就被拦下（fetch 一次都不调），白名单读接口照常发出，普通应用不受影响
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

async function load() {
  vi.resetModules();
  for (const [k, v] of Object.entries(BASE)) vi.stubEnv(k, v);
  const [shopee, tiktok, readonly] = await Promise.all([import("./shopee"), import("./tiktok"), import("./readonly")]);
  return { shopee, tiktok, readonly };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const shopeeOk = () => new Response(JSON.stringify({ response: { shop_name: "S", region: "MY", expire_time: 0, message_id: 1, created_timestamp: 1 } }));
const tiktokOk = () => new Response(JSON.stringify({ code: 0, data: { orders: [], can_accept_chat: true } }));

const shopeeApp = (readOnly: boolean) => ({ partnerId: "1", partnerKey: "k", host: "http://shopee.test", readOnly });
const shopeeShop = { shopId: "9", accessToken: "t" };
const tiktokApp = (readOnly: boolean) => ({ appKey: "a", appSecret: "s", readOnly });
const tiktokShop = { accessToken: "t", cipher: "c" };

describe("Shopee 只读应用", () => {
  it("发消息在发请求前被拦下，错误可识别", async () => {
    const { shopee, readonly } = await load();
    await expect(shopee.shopeeSendText(shopeeApp(true), shopeeShop, "b1", "hi")).rejects.toBeInstanceOf(readonly.ReadOnlyPlatformError);
    await expect(shopee.shopeeSendText(shopeeApp(true), shopeeShop, "b1", "hi")).rejects.toThrow(readonly.READ_ONLY_TEXT);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("改推送配置、处理取消、刷新 token 都被拦下", async () => {
    const { shopee, readonly } = await load();
    await expect(shopee.shopeeSetPushConfig(shopeeApp(true), "http://x")).rejects.toBeInstanceOf(readonly.ReadOnlyPlatformError);
    await expect(shopee.shopeeHandleBuyerCancellation(shopeeApp(true), shopeeShop, "SN1", true)).rejects.toBeInstanceOf(readonly.ReadOnlyPlatformError);
    await expect(shopee.shopeeRefresh(shopeeApp(true), "9", "r")).rejects.toBeInstanceOf(readonly.ReadOnlyPlatformError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("白名单里的读接口照常发出", async () => {
    const { shopee } = await load();
    fetchMock.mockResolvedValue(shopeeOk());
    await shopee.shopeeShopInfo(shopeeApp(true), shopeeShop);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v2/shop/get_shop_info");
  });

  it("普通应用的写接口不受影响", async () => {
    const { shopee } = await load();
    fetchMock.mockResolvedValue(shopeeOk());
    await shopee.shopeeSendText(shopeeApp(false), shopeeShop, "b1", "hi");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v2/sellerchat/send_message");
  });
});

describe("TikTok 只读应用", () => {
  it("发消息、改坐席接单、注册 webhook、刷新 token 都被拦下", async () => {
    const { tiktok, readonly } = await load();
    await expect(tiktok.tiktokSendText(tiktokApp(true), tiktokShop, "c1", "hi")).rejects.toBeInstanceOf(readonly.ReadOnlyPlatformError);
    await expect(tiktok.tiktokSetAcceptChat(tiktokApp(true), tiktokShop, false)).rejects.toBeInstanceOf(readonly.ReadOnlyPlatformError);
    await expect(tiktok.tiktokRegisterWebhooks(tiktokApp(true), tiktokShop, "http://x")).rejects.toBeInstanceOf(readonly.ReadOnlyPlatformError);
    await expect(tiktok.tiktokRefresh(tiktokApp(true), "r")).rejects.toBeInstanceOf(readonly.ReadOnlyPlatformError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("按路径而不是按方法判定：POST 的订单搜索放行，同一路径的坐席设置 GET 放行、PUT 拦下", async () => {
    const { tiktok } = await load();
    fetchMock.mockImplementation(async () => tiktokOk());
    await tiktok.tiktokSearchOrders(tiktokApp(true), tiktokShop, {}, null);
    await tiktok.tiktokGetAcceptChat(tiktokApp(true), tiktokShop);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/order/202309/orders/search");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("普通应用的写接口不受影响", async () => {
    const { tiktok } = await load();
    fetchMock.mockImplementation(async () => tiktokOk());
    await tiktok.tiktokSetAcceptChat(tiktokApp(false), tiktokShop, true);
    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
  });
});

describe("白名单", () => {
  it("消息列表带会话 ID 的路径放行，发消息的路径拒绝", async () => {
    const { readonly } = await load();
    expect(readonly.tiktokReadAllowed("GET", "/customer_service/202309/conversations/abc/messages")).toBe(true);
    expect(readonly.tiktokReadAllowed("POST", "/customer_service/202606/conversations/abc/messages")).toBe(false);
    expect(readonly.shopeeReadAllowed("GET", "sellerchat/get_message")).toBe(true);
    expect(readonly.shopeeReadAllowed("POST", "sellerchat/send_message")).toBe(false);
  });

  it("商品卡片用的商品详情放行，改商品的路径拒绝", async () => {
    const { readonly } = await load();
    expect(readonly.shopeeReadAllowed("GET", "product/get_item_base_info")).toBe(true);
    expect(readonly.shopeeReadAllowed("GET", "product/get_model_list")).toBe(true);
    expect(readonly.shopeeReadAllowed("POST", "product/update_item")).toBe(false);
    expect(readonly.tiktokReadAllowed("GET", "/product/202309/products/1729592969712207008")).toBe(true);
    expect(readonly.tiktokReadAllowed("POST", "/product/202309/products/1729592969712207008/prices/update")).toBe(false);
  });
});
