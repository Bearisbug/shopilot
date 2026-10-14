import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { shopeeSign, tiktokSign, verifyShopeePush, verifyTiktokWebhook } from "./signing";

const hmac = (k: string, m: string) => createHmac("sha256", k).update(m).digest("hex");

describe("平台签名（与官方文档一致）", () => {
  it("TikTok API 签名：官方示例值", () => {
    expect(tiktokSign("e59af819cc", "/authorization/202309/shops", { app_key: "29a39d", timestamp: "1623812664" }, "")).toBe("b596b73e0cc6de07ac26f036364178ab16b0a907af13d43f0a0cd2345f582dc8");
  });
  it("TikTok：sign 与 access_token 不进基串", () => {
    expect(tiktokSign("s", "/p", { app_key: "k", timestamp: "1", sign: "x", access_token: "t" }, "{}")).toBe(tiktokSign("s", "/p", { app_key: "k", timestamp: "1" }, "{}"));
  });
  it("TikTok webhook：官方示例值", () => {
    const body = '{"type":1,"tts_notification_id":"7380066284010030890","shop_id":"7495540735365777507","timestamp":1718305585,"data":{"is_on_hold_order":true,"order_id":"576653688135258178","order_status":"UNPAID","update_time":1718305585}}';
    expect(verifyTiktokWebhook("123", "abcdef", body, "5dec0f11ec2f6783b8deee53c9ffbf8d024302f7c7e7fa55a35d17629031ac05")).toBe(true);
    expect(verifyTiktokWebhook("123", "abcdef", body + " ", "5dec0f11ec2f6783b8deee53c9ffbf8d024302f7c7e7fa55a35d17629031ac05")).toBe(false);
    expect(verifyTiktokWebhook("123", "abcdef", body, null)).toBe(false);
  });
  it("Shopee 店铺级与公共接口基串", () => {
    expect(shopeeSign("key", "2001887", "/api/v2/shop/get_shop_info", 1655714431, "tok", "14701711")).toBe(hmac("key", "2001887/api/v2/shop/get_shop_info1655714431tok14701711"));
    expect(shopeeSign("key", "2001887", "/api/v2/public/get_shops_by_partner", 1655714431)).toBe(hmac("key", "2001887/api/v2/public/get_shops_by_partner1655714431"));
  });
  it("Shopee 推送：HMAC(push key, 回调 URL | 原始 body)，大小写不敏感", () => {
    const url = "http://127.0.0.1:3360/api/webhooks/shopee/abc";
    const body = '{"code":10}';
    const sig = hmac("pk", `${url}|${body}`);
    expect(verifyShopeePush("pk", url, body, sig.toUpperCase())).toBe(true);
    expect(verifyShopeePush("pk", url + "x", body, sig)).toBe(false);
  });
});
