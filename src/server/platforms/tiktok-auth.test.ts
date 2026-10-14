// TikTok 卖家授权链接：生产走跨境店定制授权链接（模板里换入 Service ID），本机回退到模拟授权页
import { afterEach, describe, expect, it, vi } from "vitest";

const BASE = {
  DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/db",
  BETTER_AUTH_SECRET: "s".repeat(32),
  APP_BASE_URL: "http://127.0.0.1:3360",
  APP_ENCRYPTION_KEY: "k".repeat(44),
  SHOPEE_HOSTS: "sg=http://127.0.0.1:3360/mock/shopee/sg",
  TIKTOK_API_HOST: "http://127.0.0.1:3360/mock/tiktok/open-api",
  TIKTOK_AUTH_HOST: "http://127.0.0.1:3360/mock/tiktok/auth",
};

async function load(authorizeUrl: string | undefined) {
  vi.resetModules();
  for (const [k, v] of Object.entries(BASE)) vi.stubEnv(k, v);
  vi.stubEnv("TIKTOK_AUTHORIZE_URL", authorizeUrl ?? "");
  return import("./tiktok");
}

afterEach(() => vi.unstubAllEnvs());

describe("TikTok 授权链接", () => {
  it("模板里的 {service_id} 换成应用的 Service ID，并带上站点、state 与 app_key", async () => {
    const t = await load("https://seller.tiktokshopglobalselling.com/services/market/custom-authorize/{service_id}");
    const url = new URL(t.tiktokAuthUrl({ appKey: "abc123", appSecret: "x", serviceId: "7683000000000000001" }, "state-1", "MY"));
    expect(url.origin + url.pathname).toBe("https://seller.tiktokshopglobalselling.com/services/market/custom-authorize/7683000000000000001");
    expect(url.searchParams.get("shop_region")).toBe("MY");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("app_key")).toBe("abc123");
    expect(t.tiktokAuthorizeNeedsServiceId()).toBe(true);
  });

  it("没配模板时回退到 TIKTOK_AUTH_HOST/open/authorize，不要求 Service ID", async () => {
    const t = await load(undefined);
    const url = new URL(t.tiktokAuthUrl({ appKey: "mockttwiz01", appSecret: "x" }, "state-2", "TH"));
    expect(url.origin + url.pathname).toBe("http://127.0.0.1:3360/mock/tiktok/auth/open/authorize");
    expect(url.searchParams.get("app_key")).toBe("mockttwiz01");
    expect(url.searchParams.get("shop_region")).toBe("TH");
    expect(t.tiktokAuthorizeNeedsServiceId()).toBe(false);
  });
});
