// 飞书接口适配：自定义机器人签名（与 openssl 独立算出的值比对）、webhook 地址白名单、
// 应用接法的 token 按 App ID 缓存与鉴权失败换新一次、请求体形状、错误归类。fetch 全部替换，不出网。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeishuError, liveFeishu, parseWebhookUrl, resetFeishuTokens, stubFeishu, stubImageKey, stubImageSource, webhookSign } from "./client";

describe("自定义机器人签名", () => {
  it("timestamp + 换行 + 密钥 作 HMAC-SHA256 的 key，对空串签名再 base64", () => {
    // printf '' | openssl dgst -sha256 -hmac "$(printf '1599360473\ndemo-secret')" -binary | base64
    expect(webhookSign(1599360473, "demo-secret")).toBe("3/MaVZ8JLIy4TUG+7KSFJqvUkTKd+HWY8g+56DZWq8s=");
  });
});

describe("parseWebhookUrl", () => {
  it("只认飞书 / Lark 的 https 机器人地址", () => {
    expect(parseWebhookUrl(" https://open.feishu.cn/open-apis/bot/v2/hook/0f1e2d3c-aaaa-bbbb ")).toBe("https://open.feishu.cn/open-apis/bot/v2/hook/0f1e2d3c-aaaa-bbbb");
    expect(parseWebhookUrl("https://open.larksuite.com/open-apis/bot/v2/hook/abcdefgh12")).toBe("https://open.larksuite.com/open-apis/bot/v2/hook/abcdefgh12");
    for (const bad of [
      "http://open.feishu.cn/open-apis/bot/v2/hook/abcdefgh12",
      "https://open.feishu.cn.evil.com/open-apis/bot/v2/hook/abcdefgh12",
      "https://127.0.0.1/open-apis/bot/v2/hook/abcdefgh12",
      "https://open.feishu.cn:8443/open-apis/bot/v2/hook/abcdefgh12",
      "https://user:pw@open.feishu.cn/open-apis/bot/v2/hook/abcdefgh12",
      "https://open.feishu.cn/open-apis/im/v1/messages",
      "https://open.feishu.cn/open-apis/bot/v2/hook/abc",
      "not a url",
    ]) {
      expect(parseWebhookUrl(bad), bad).toBeNull();
    }
  });
});

type Call = { url: string; init: RequestInit };

function mockFetch(handler: (url: string, init: RequestInit) => unknown) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const body = handler(url, init);
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  return calls;
}

const APP = { appId: "cli_test0001", appSecret: "s1" };

describe("liveFeishu（应用接法）", () => {
  beforeEach(() => resetFeishuTokens());
  afterEach(() => vi.unstubAllGlobals());

  it("token 按 App ID 缓存；发卡用 receive_id_type=chat_id、msg_type=interactive、content 为卡片 JSON 字符串", async () => {
    let tokenCalls = 0;
    const calls = mockFetch((url) => {
      if (url.endsWith("/auth/v3/tenant_access_token/internal")) return { code: 0, tenant_access_token: `t-${++tokenCalls}`, expire: 7200 };
      return { code: 0, data: { message_id: "om_1" } };
    });
    const card = { schema: "2.0", header: { title: { content: "x" } } };
    expect(await liveFeishu.sendToChat(APP, "oc_1", card)).toBe("om_1");
    expect(await liveFeishu.sendToChat(APP, "oc_1", card)).toBe("om_1");
    expect(tokenCalls).toBe(1);
    const send = calls.filter((c) => c.url.includes("/im/v1/messages"));
    expect(send[0].url).toBe("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id");
    expect(new Headers(send[0].init.headers).get("authorization")).toBe("Bearer t-1");
    expect(JSON.parse(String(send[0].init.body))).toEqual({ receive_id: "oc_1", msg_type: "interactive", content: JSON.stringify(card) });
    // 另一个 App ID 另换 token
    await liveFeishu.sendToChat({ appId: "cli_test0002", appSecret: "s2" }, "oc_1", card);
    expect(tokenCalls).toBe(2);
  });

  it("token 失效时换新一次再发", async () => {
    let tokenCalls = 0;
    let sends = 0;
    mockFetch((url, init) => {
      if (url.endsWith("/tenant_access_token/internal")) return { code: 0, tenant_access_token: `t-${++tokenCalls}`, expire: 7200 };
      sends++;
      return new Headers(init.headers).get("authorization") === "Bearer t-1" ? { code: 99991663, msg: "Invalid access token for authorization" } : { code: 0, data: { message_id: "om_2" } };
    });
    expect(await liveFeishu.sendToChat(APP, "oc_1", {})).toBe("om_2");
    expect(tokenCalls).toBe(2);
    expect(sends).toBe(2);
  });

  it("凭证不对归为 credentials；机器人不在群里归为 not_in_chat、不可重试；限流可重试", async () => {
    mockFetch(() => ({ code: 10014, msg: "app secret invalid" }));
    await expect(liveFeishu.verifyApp(APP)).rejects.toMatchObject({ kind: "credentials", code: 10014 });

    resetFeishuTokens();
    mockFetch((url) => (url.includes("tenant_access_token") ? { code: 0, tenant_access_token: "t", expire: 7200 } : { code: 230002, msg: "Bot is not in the chat" }));
    const e = await liveFeishu.sendToChat(APP, "oc_x", {}).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(FeishuError);
    expect((e as FeishuError).kind).toBe("not_in_chat");
    expect((e as FeishuError).retryable).toBe(false);
    expect(new FeishuError("rate_limited", 11232, "x").retryable).toBe(true);
  });

  it("列群翻页取全", async () => {
    mockFetch((url) => {
      if (url.includes("tenant_access_token")) return { code: 0, tenant_access_token: "t", expire: 7200 };
      if (!url.includes("page_token")) return { code: 0, data: { items: [{ chat_id: "oc_1", name: "Obsbot 客服群" }], has_more: true, page_token: "p2" } };
      return { code: 0, data: { items: [{ chat_id: "oc_2", name: "" }], has_more: false } };
    });
    expect(await liveFeishu.listChats(APP)).toEqual([
      { chatId: "oc_1", name: "Obsbot 客服群" },
      { chatId: "oc_2", name: "oc_2" },
    ]);
  });

  it("上传图片：multipart，image_type=message，返回 image_key", async () => {
    const calls = mockFetch((url) => (url.includes("tenant_access_token") ? { code: 0, tenant_access_token: "t", expire: 7200 } : { code: 0, data: { image_key: "img_v3_1" } }));
    expect(await liveFeishu.uploadImage(APP, { bytes: Buffer.from([1, 2, 3]), mime: "image/png", name: "a.png" })).toBe("img_v3_1");
    const up = calls.find((c) => c.url.endsWith("/im/v1/images"))!;
    const form = up.init.body as FormData;
    expect(form.get("image_type")).toBe("message");
    expect((form.get("image") as File).type).toBe("image/png");
  });
});

describe("liveFeishu（群自定义机器人）", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("请求体带秒级 timestamp、签名与 card；签名不对报 signature", async () => {
    const calls = mockFetch(() => ({ code: 0, msg: "success", data: {} }));
    const url = "https://open.feishu.cn/open-apis/bot/v2/hook/abcdefgh12";
    await liveFeishu.sendWebhook(url, "sec", { schema: "2.0" });
    const body = JSON.parse(String(calls[0].init.body)) as { timestamp: string; sign: string; msg_type: string; card: unknown };
    expect(calls[0].url).toBe(url);
    expect(body.msg_type).toBe("interactive");
    expect(body.card).toEqual({ schema: "2.0" });
    expect(body.sign).toBe(webhookSign(Number(body.timestamp), "sec"));
    expect(Math.abs(Number(body.timestamp) - Date.now() / 1000)).toBeLessThan(5);

    mockFetch(() => ({ code: 19021, msg: "sign match fail or timestamp is not within one hour from current time" }));
    await expect(liveFeishu.sendWebhook(url, "wrong", {})).rejects.toMatchObject({ kind: "signature", code: 19021 });
  });

  it("不是飞书机器人地址时不发请求", async () => {
    const calls = mockFetch(() => ({ code: 0 }));
    await expect(liveFeishu.sendWebhook("https://evil.example/hook", "s", {})).rejects.toMatchObject({ kind: "bad_request" });
    expect(calls).toHaveLength(0);
  });
});

describe("发送替身", () => {
  it("约定的失败输入；图片 key 带回原图地址", async () => {
    await expect(stubFeishu.verifyApp({ appId: "cli_x", appSecret: "bad-secret" })).rejects.toMatchObject({ kind: "credentials" });
    await expect(stubFeishu.sendWebhook("https://open.feishu.cn/open-apis/bot/v2/hook/badbadbad1", "s", {})).rejects.toMatchObject({ kind: "signature" });
    await expect(stubFeishu.sendToChat({ appId: "cli_x", appSecret: "ok" }, "oc_stub_gone", {})).rejects.toMatchObject({ kind: "not_in_chat" });
    expect(await stubFeishu.sendToChat({ appId: "cli_x", appSecret: "ok" }, "oc_stub_service", {})).toMatch(/^om_stub_/);
    const key = stubImageKey({ url: "https://cf.shopee.sg/file/abc" });
    expect(stubImageSource(key)).toBe("https://cf.shopee.sg/file/abc");
  });
});
