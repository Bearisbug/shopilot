import { describe, expect, it } from "vitest";
import { hmacHex, safeEqualHex, shopeeApiSign, shopeePushSign, tiktokApiSign, tiktokWebhookSign, timestampFresh } from "./signing";

describe("TikTok 签名（官方文档示例）", () => {
  it("API 签名：app_secret + path + 排序参数 + app_secret", () => {
    const sign = tiktokApiSign("e59af819cc", "/authorization/202309/shops", { app_key: "29a39d", timestamp: "1623812664" }, "");
    expect(sign).toBe("b596b73e0cc6de07ac26f036364178ab16b0a907af13d43f0a0cd2345f582dc8");
  });

  it("sign 与 access_token 不进基串", () => {
    const a = tiktokApiSign("s", "/p", { app_key: "k", timestamp: "1" }, "{}");
    const b = tiktokApiSign("s", "/p", { app_key: "k", timestamp: "1", sign: "x", access_token: "t" }, "{}");
    expect(a).toBe(b);
  });

  it("webhook：HMAC(app_secret, app_key + 原始 body)", () => {
    const body = '{"type":1,"tts_notification_id":"7380066284010030890","shop_id":"7495540735365777507","timestamp":1718305585,"data":{"is_on_hold_order":true,"order_id":"576653688135258178","order_status":"UNPAID","update_time":1718305585}}';
    expect(tiktokWebhookSign("123", "abcdef", body)).toBe("5dec0f11ec2f6783b8deee53c9ffbf8d024302f7c7e7fa55a35d17629031ac05");
  });
});

describe("Shopee 签名（官方文档基串）", () => {
  it("店铺级基串 = partner_id + path + timestamp + access_token + shop_id", () => {
    const key = "test-partner-key";
    const expected = hmacHex(key, "2001887/api/v2/shop/get_shop_info165571443159777174636562737266615546704c6d14701711");
    expect(shopeeApiSign(key, 2001887, "/api/v2/shop/get_shop_info", 1655714431, "59777174636562737266615546704c6d", 14701711)).toBe(expected);
  });

  it("公共接口基串 = partner_id + path + timestamp", () => {
    const key = "k";
    expect(shopeeApiSign(key, "2001887", "/api/v2/public/get_shops_by_partner", "1655714431")).toBe(hmacHex(key, "2001887/api/v2/public/get_shops_by_partner1655714431"));
  });

  it("推送：HMAC(push key, 回调 URL | 原始 body)", () => {
    expect(shopeePushSign("pk", "https://a.b/hook", '{"code":10}')).toBe(hmacHex("pk", 'https://a.b/hook|{"code":10}'));
  });
});

describe("时间戳与比较", () => {
  it("5 分钟内有效", () => {
    const now = 1_700_000_000;
    expect(timestampFresh(now - 299, now)).toBe(true);
    expect(timestampFresh(now - 301, now)).toBe(false);
    expect(timestampFresh("abc", now)).toBe(false);
  });

  it("十六进制比较不区分大小写、长度不同不相等", () => {
    expect(safeEqualHex("ABCD", "abcd")).toBe(true);
    expect(safeEqualHex("abcd", "abc")).toBe(false);
  });
});
