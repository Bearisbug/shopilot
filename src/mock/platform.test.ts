// 模拟平台集成测试：连 shopilot_mock_test 库（同一 Postgres 容器，连接串由 DATABASE_URL 换库名得到）。
// 准备一次：docker exec shopilot-postgres-1 psql -U shopilot -c 'create database shopilot_mock_test'
//   再用一个只含 schema: ["src/mock/db/schema.ts"]、dbCredentials.url 指向该库的临时配置跑 drizzle-kit push --force。
// 运行：set -a && source .env && set +a && pnpm exec vitest run src/mock
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testDatabaseUrl, shopeeRequest, tiktokRequest } from "./testing";

process.env.DATABASE_URL = testDatabaseUrl();
const dataDir = mkdtempSync(path.join(tmpdir(), "mock-test-"));
process.env.DATA_DIR = dataDir;

const { closeMockDb } = await import("./db/client");
const { seedMock } = await import("./seed");
const { handleShopeeApi } = await import("./shopee/api");
const { handleTiktokApi } = await import("./tiktok/api");
const { confirmShopeeAuth } = await import("./shopee/authorize");
const { confirmTiktokAuth, tiktokTokenGet } = await import("./tiktok/authorize");
const { runSimAction } = await import("./sim/actions");
const { setFault } = await import("./faults");
const { shopeePushSign, tiktokWebhookSign } = await import("./signing");

type Received = { path: string; auth: string; body: string };
let server: Server;
let base = "";
const received: Received[] = [];

beforeAll(async () => {
  const { mockPool } = await import("./db/client");
  const ready = await mockPool()
    .query("select 1 from mock_app limit 1")
    .then(() => true)
    .catch(() => false);
  if (!ready) {
    throw new Error(
      "测试库 shopilot_mock_test 不可用或缺 mock_ 表：先 create database shopilot_mock_test，再用只指向 src/mock/db/schema.ts 的 drizzle-kit 配置 push 建表（见 platform.test.ts 文件头）",
    );
  }
  server = createServer((req: IncomingMessage, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ path: req.url ?? "", auth: String(req.headers.authorization ?? ""), body });
      res.writeHead(200).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(async () => {
  await closeMockDb();
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  received.length = 0;
  await seedMock({
    baseUrl: "http://127.0.0.1:3360",
    callbacks: { "1000101": `${base}/hook/shopee/1000101`, mockttdemo01: `${base}/hook/tiktok/mockttdemo01` },
  });
});

const DEMO_SHOPEE = { partnerId: "1000101", key: "mock-key-1000101" };
const DEMO_TT = { appKey: "mockttdemo01", secret: "mock-secret-demo01" };

async function json(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const waitFor = async (pred: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!pred() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
};

describe("Shopee 验签", () => {
  it("签名正确返回 response 外层", async () => {
    const r = await json(await handleShopeeApi(shopeeRequest({ region: "sg", path: "shop/get_shop_info", ...DEMO_SHOPEE, accessToken: "mock-at-220001", shopId: "220001" }), "sg", ["shop", "get_shop_info"]));
    expect(r.status).toBe(200);
    expect(r.body.error).toBe("");
    expect(r.body.shop_name).toBe("Demo Shopee MY");
  });

  it("签名错误返回 error_sign", async () => {
    const r = await json(await handleShopeeApi(shopeeRequest({ region: "sg", path: "shop/get_shop_info", partnerId: "1000101", key: "wrong-key", accessToken: "mock-at-220001", shopId: "220001" }), "sg", ["shop", "get_shop_info"]));
    expect(r.body).toMatchObject({ error: "error_sign", message: "Wrong sign." });
  });

  it("时间戳超过 5 分钟返回 Timestamp is expired.", async () => {
    const ts = Math.floor(Date.now() / 1000) - 400;
    const r = await json(await handleShopeeApi(shopeeRequest({ region: "sg", path: "public/get_shops_by_partner", ...DEMO_SHOPEE, ts }), "sg", ["public", "get_shops_by_partner"]));
    expect(r.body).toMatchObject({ error: "error_param", message: "Timestamp is expired." });
  });

  it("access_token 不对返回 invalid_acceess_token", async () => {
    const r = await json(await handleShopeeApi(shopeeRequest({ region: "sg", path: "shop/get_shop_info", ...DEMO_SHOPEE, accessToken: "nope", shopId: "220001" }), "sg", ["shop", "get_shop_info"]));
    expect(r.body.error).toBe("invalid_acceess_token");
  });
});

describe("Shopee 区域识别", () => {
  const call = (region: string, partnerId: string, key: string) =>
    handleShopeeApi(shopeeRequest({ region, path: "public/get_shops_by_partner", partnerId, key }), region, ["public", "get_shops_by_partner"]).then(json);

  it("应用只在登记区域通过，其余区域返回 invalid_partner_id", async () => {
    const results = await Promise.all(["cn", "sg", "br", "sandbox"].map((r) => call(r, "1000101", "mock-key-1000101")));
    expect(results.map((r) => r.body.error)).toEqual(["invalid_partner_id", "", "invalid_partner_id", "invalid_partner_id"]);
    const sg = results[1].body.authed_shop_list as Array<{ shop_id: number }>;
    expect(sg.map((s) => s.shop_id)).toEqual([220001, 220002]);
  });

  it("只在 sandbox 登记的应用只有 sandbox 通过", async () => {
    const results = await Promise.all(["cn", "sg", "br", "sandbox"].map((r) => call(r, "2001002", "mock-key-2001002")));
    expect(results.map((r) => r.body.error)).toEqual(["invalid_partner_id", "invalid_partner_id", "invalid_partner_id", ""]);
  });
});

describe("Shopee 授权换 token", () => {
  it("主账号授权 → token/get 返回 shop_id_list → 按店刷新得到店铺级 token", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const { shopeeApiSign } = await import("./signing");
    const params = { partner_id: "2001001", timestamp: ts, sign: shopeeApiSign("mock-key-2001001", "2001001", "/api/v2/shop/auth_partner", ts), redirect: "http://127.0.0.1:3360/api/v1/oauth/shopee/callback?state=s1" };
    const redirect = new URL(await confirmShopeeAuth("sg", params, "main"));
    expect(redirect.searchParams.get("main_account_id")).toBe("900100");
    expect(redirect.searchParams.get("state")).toBe("s1");
    const code = redirect.searchParams.get("code")!;

    const app = { partnerId: "2001001", key: "mock-key-2001001" };
    const tok = await json(await handleShopeeApi(shopeeRequest({ region: "sg", path: "auth/token/get", ...app, method: "POST", body: { code, partner_id: 2001001, main_account_id: 900100 } }), "sg", ["auth", "token", "get"]));
    expect(tok.body.error).toBe("");
    expect(tok.body.shop_id_list).toEqual([230001, 230002, 230003]);
    expect(tok.body.expire_in).toBe(14400);
    expect(tok.body).not.toHaveProperty("response");

    const reuse = await json(await handleShopeeApi(shopeeRequest({ region: "sg", path: "auth/token/get", ...app, method: "POST", body: { code, partner_id: 2001001, main_account_id: 900100 } }), "sg", ["auth", "token", "get"]));
    expect(reuse.body.error).toBe("invalid_code");

    const refreshed = await json(
      await handleShopeeApi(shopeeRequest({ region: "sg", path: "auth/access_token/get", ...app, method: "POST", body: { refresh_token: tok.body.refresh_token, partner_id: 2001001, shop_id: 230001 } }), "sg", ["auth", "access_token", "get"]),
    );
    expect(refreshed.body).toMatchObject({ error: "", shop_id: 230001, partner_id: 2001001 });
    expect(refreshed.body.access_token).not.toBe(tok.body.access_token);

    const info = await json(await handleShopeeApi(shopeeRequest({ region: "sg", path: "shop/get_shop_info", ...app, accessToken: String(refreshed.body.access_token), shopId: "230001" }), "sg", ["shop", "get_shop_info"]));
    expect(info.body.shop_name).toBe("Wizard Shopee MY");
    // 旧 token 在 5 分钟宽限内仍可用
    const old = await json(await handleShopeeApi(shopeeRequest({ region: "sg", path: "shop/get_shop_info", ...app, accessToken: String(tok.body.access_token), shopId: "230001" }), "sg", ["shop", "get_shop_info"]));
    expect(old.body.error).toBe("");

    // PH 店没有聊天权限
    const chat = await json(
      await handleShopeeApi(shopeeRequest({ region: "sg", path: "sellerchat/get_conversation_list", ...app, accessToken: String(tok.body.access_token), shopId: "230003", query: { direction: "latest", type: "all", page_size: "10" } }), "sg", [
        "sellerchat",
        "get_conversation_list",
      ]),
    );
    expect(chat.body.error).toBe("error_permission");
  });
});

describe("TikTok 验签与授权", () => {
  it("签名正确返回 code 0", async () => {
    const { req, apiPath } = tiktokRequest({ path: "/authorization/202309/shops", ...DEMO_TT, token: "mock-at-7000001" });
    const r = await json(await handleTiktokApi(req, apiPath));
    expect(r.body.code).toBe(0);
    expect((r.body.data as { shops: Array<{ cipher: string }> }).shops[0].cipher).toBe("ROW_demo_my");
  });

  it("签名错误返回 106001", async () => {
    const { req, apiPath } = tiktokRequest({ path: "/authorization/202309/shops", appKey: "mockttdemo01", secret: "bad", token: "mock-at-7000001" });
    expect((await json(await handleTiktokApi(req, apiPath))).body.code).toBe(106001);
  });

  it("时间戳超过 5 分钟返回 36009004", async () => {
    const { req, apiPath } = tiktokRequest({ path: "/authorization/202309/shops", ...DEMO_TT, token: "mock-at-7000001", ts: Math.floor(Date.now() / 1000) - 400 });
    const r = await json(await handleTiktokApi(req, apiPath));
    expect(r.body.code).toBe(36009004);
    expect(String(r.body.message)).toContain("5 minutes");
  });

  it("POST body 参与签名", async () => {
    const { req, apiPath } = tiktokRequest({ path: "/order/202309/orders/search", ...DEMO_TT, token: "mock-at-7000001", cipher: "ROW_demo_my", method: "POST", query: { page_size: "10" }, body: {} });
    const r = await json(await handleTiktokApi(req, apiPath));
    expect(r.body.code).toBe(0);
    expect((r.body.data as { total_count: number }).total_count).toBe(4);
  });

  it("token/get：App Secret 不对返回 36004004，正确则换到 token", async () => {
    const redirect = new URL(await confirmTiktokAuth("mockttwiz01", "MY", "st-1"));
    expect(redirect.pathname).toBe("/api/v1/oauth/tiktok/callback");
    const code = redirect.searchParams.get("code")!;
    const bad = await json(await tiktokTokenGet(new URLSearchParams({ app_key: "mockttwiz01", app_secret: "wrong", auth_code: code, grant_type: "authorized_code" })));
    expect(bad.body).toMatchObject({ code: 36004004, message: "Invalid app_secret." });
    const good = await json(await tiktokTokenGet(new URLSearchParams({ app_key: "mockttwiz01", app_secret: "mock-secret-wiz01", auth_code: code, grant_type: "authorized_code" })));
    expect(good.body.code).toBe(0);
    const data = good.body.data as { access_token: string; seller_base_region: string };
    expect(data.seller_base_region).toBe("MY");
    const { req, apiPath } = tiktokRequest({ path: "/authorization/202309/shops", appKey: "mockttwiz01", secret: "mock-secret-wiz01", token: data.access_token });
    const shops = (await json(await handleTiktokApi(req, apiPath))).body.data as { shops: Array<{ id: string }> };
    expect(shops.shops.map((s) => s.id)).toEqual(["7100001"]);
  });
});

describe("推送签名与 body", () => {
  it("Shopee 买家消息推 code 10，Authorization = HMAC(partner_key, URL|body)", async () => {
    const r = await runSimAction("buyer_message", { conversationId: "1871200300114510002", text: "Is the blue one available?" });
    expect(r.ok).toBe(true);
    const hit = received.find((x) => x.path === "/hook/shopee/1000101");
    expect(hit).toBeDefined();
    expect(hit!.auth).toBe(shopeePushSign("mock-key-1000101", `${base}/hook/shopee/1000101`, hit!.body));
    const body = JSON.parse(hit!.body);
    expect(body).toMatchObject({ code: 10, shop_id: 220001, data: { type: "message", content: { conversation_id: "1871200300114510002", message_type: "text", content: { text: "Is the blue one available?" }, from_id: 1170319002, to_shop_id: 220001 } } });
  });

  it("TikTok 同意退货：状态变 AWAITING_BUYER_SHIP 并发 webhook 12", async () => {
    const { req, apiPath } = tiktokRequest({ path: "/return_refund/202309/returns/4035318504086610102/approve", ...DEMO_TT, token: "mock-at-7000001", cipher: "ROW_demo_my", method: "POST", query: { idempotency_key: "k1" }, body: { decision: "APPROVE_RETURN" } });
    expect((await json(await handleTiktokApi(req, apiPath))).body.code).toBe(0);
    await waitFor(() => received.some((x) => x.body.includes('"type":12')));
    const hit = received.find((x) => x.body.includes('"type":12'))!;
    expect(hit.auth).toBe(tiktokWebhookSign("mock-secret-demo01", "mockttdemo01", hit.body));
    expect(JSON.parse(hit.body)).toMatchObject({ type: 12, shop_id: "7000001", data: { return_id: "4035318504086610102", return_status: "AWAITING_BUYER_SHIP", return_type: "RETURN_AND_REFUND" } });
  });

  it("Shopee 卖家取消订单：订单 CANCELLED 并推 code 3", async () => {
    const res = await json(
      await handleShopeeApi(shopeeRequest({ region: "sg", path: "order/cancel_order", ...DEMO_SHOPEE, method: "POST", accessToken: "mock-at-220002", shopId: "220002", body: { order_sn: "251011F8KD3S6E", cancel_reason: "CUSTOMER_REQUEST" } }), "sg", ["order", "cancel_order"]),
    );
    expect(res.body.error).toBe("");
    await waitFor(() => received.some((x) => x.body.includes('"code":3')));
    expect(JSON.parse(received.find((x) => x.body.includes('"code":3'))!.body)).toMatchObject({ code: 3, shop_id: 220002, data: { ordersn: "251011F8KD3S6E", status: "CANCELLED" } });
  });

  it("没配置回调的店不发推送", async () => {
    const r = await runSimAction("buyer_message", { conversationId: "7494560109732330301", text: "Xin chào" });
    expect(r.ok && r.pushes.length).toBe(0);
    // 接收器各用例共用，前一个用例晚到的推送也会落进来，只看有没有这个会话的推送
    expect(received.filter((x) => x.body.includes("7494560109732330301"))).toHaveLength(0);
  });
});

describe("Shopee 聊天视频", () => {
  it("upload_video → 处理中 → successful → send_message video；只传 vid 报 invalid_content", async () => {
    const auth = { ...DEMO_SHOPEE, accessToken: "mock-at-220001", shopId: "220001" };
    const call = (path: string, o: { method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown; form?: FormData }) =>
      handleShopeeApi(shopeeRequest({ region: "sg", path, ...auth, ...o }), "sg", path.split("/")).then(json);
    const form = new FormData();
    form.set("file", new Blob([Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(16)])], { type: "video/mp4" }), "clip.mp4");
    const response = (r: { body: Record<string, unknown> }) => r.body.response as Record<string, unknown>;
    const vid = String(response(await call("sellerchat/upload_video", { method: "POST", form })).vid);
    expect(vid).toMatch(/^[0-9a-f]{24}$/);
    expect(response(await call("sellerchat/get_video_upload_result", { query: { vid } })).status).toBe("reported");
    await new Promise((r) => setTimeout(r, 2100));
    const done = response(await call("sellerchat/get_video_upload_result", { query: { vid } }));
    expect(done).toMatchObject({ status: "successful", duration: 6000 });
    const send = (content: Record<string, unknown>) => call("sellerchat/send_message", { method: "POST", body: { to_id: 1170319004, message_type: "video", content } });
    expect((await send({ vid })).body.error).toBe("invalid_content");
    const ok = await send({ video_url: done.video, thumb_url: done.thumbnail, duration_seconds: 6, thumb_width: done.width, thumb_height: done.height });
    expect(ok.body.error).toBe("");
    expect(ok.body.response).toMatchObject({ message_type: "video" });
  });
});

describe("故障注入", () => {
  it("下一次发送消息失败，之后恢复", async () => {
    await setFault({ platform: "shopee", shopId: "220001", category: "send_message", mode: "once", kind: "error" });
    const send = () =>
      handleShopeeApi(shopeeRequest({ region: "sg", path: "sellerchat/send_message", ...DEMO_SHOPEE, method: "POST", accessToken: "mock-at-220001", shopId: "220001", body: { to_id: 1170319004, message_type: "text", content: { text: "Yes, it is quick-dry." } } }), "sg", [
        "sellerchat",
        "send_message",
      ]).then(json);
    const first = await send();
    expect(first).toMatchObject({ status: 500, body: { error: "error_server" } });
    const second = await send();
    expect(second.body.error).toBe("");
  });
});
