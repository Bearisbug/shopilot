// TikTok 聊天视频：大文件分块规则、Upload File Init → 分块 PUT → 202309 Send Message 的调用顺序与参数、错误映射
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformError, platformErrorText } from "./types";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("./http", () => ({ platformFetch: (...a: unknown[]) => fetchMock(...a) }));

const MB = 1024 * 1024;
const app = { appKey: "tt-app", appSecret: "secret" };
const shop = { accessToken: "at-1", cipher: "ROW_x" };
const video = (size: number) => ({ bytes: Buffer.alloc(size), filename: "clip.mov", mime: "video/quicktime" });

async function load() {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@127.0.0.1:5432/db");
  vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
  vi.stubEnv("APP_BASE_URL", "http://127.0.0.1:3360");
  vi.stubEnv("APP_ENCRYPTION_KEY", "k".repeat(44));
  vi.stubEnv("SHOPEE_HOSTS", "sg=http://127.0.0.1:3360/mock/shopee/sg");
  vi.stubEnv("TIKTOK_API_HOST", "http://tiktok.test");
  vi.stubEnv("TIKTOK_AUTH_HOST", "http://tiktok-auth.test");
  return import("./tiktok");
}

type Call = { url: URL; init: RequestInit; timeout: number | undefined };
const calls = (): Call[] => fetchMock.mock.calls.map(([, url, init, timeout]) => ({ url: new URL(String(url)), init: init as RequestInit, timeout: timeout as number | undefined }));

/** 平台：init 给上传地址，分块按 chunkReplies 依次回（默认最后一块给 resource_id），发送回 message_id 或 sendReply */
function platform(o: { chunkReplies?: Array<{ status: number; json: Record<string, unknown> }>; sendReply?: { status: number; json: Record<string, unknown> } } = {}) {
  const chunkReplies = [...(o.chunkReplies ?? [])];
  fetchMock.mockImplementation(async (_p: string, url: string, init: RequestInit) => {
    const u = new URL(url);
    if (u.pathname === "/open/202512/file/init") return { status: 200, json: { code: 0, data: { upload_url: "https://upload.tiktok.test/file/v1/upload?route=sg1", upload_token: "tok-1" } } };
    if (init.method === "PUT") {
      const next = chunkReplies.shift();
      if (next) return next;
      return { status: 200, json: { code: 0, data: { resource_id: "res-1" } } };
    }
    return o.sendReply ?? { status: 200, json: { code: 0, data: { message_id: "7699000000000000001" } } };
  });
}

describe("大文件分块（tiktokChunkRanges）", () => {
  it("默认 20 MB 一块，末块不足 5 MB 并进上一块；不足 5 MB 的文件一块", async () => {
    const { tiktokChunkRanges } = await load();
    expect(tiktokChunkRanges(MB)).toEqual([[0, MB]]);
    expect(tiktokChunkRanges(20 * MB)).toEqual([[0, 20 * MB]]);
    expect(tiktokChunkRanges(24 * MB)).toEqual([[0, 24 * MB]]);
    expect(tiktokChunkRanges(25 * MB)).toEqual([[0, 20 * MB], [20 * MB, 25 * MB]]);
    expect(tiktokChunkRanges(44 * MB)).toEqual([[0, 20 * MB], [20 * MB, 44 * MB]]);
    expect(tiktokChunkRanges(100 * MB)).toHaveLength(5);
    for (const size of [6 * MB, 33 * MB, 61 * MB + 7, 99 * MB]) {
      const r = tiktokChunkRanges(size);
      expect(r[0][0]).toBe(0);
      expect(r[r.length - 1][1]).toBe(size);
      for (let i = 1; i < r.length; i++) expect(r[i][0]).toBe(r[i - 1][1]);
      if (r.length > 1) for (const [a, b] of r) expect(b - a).toBeGreaterThanOrEqual(5 * MB);
      for (const [a, b] of r) expect(b - a).toBeLessThanOrEqual(25 * MB);
    }
  });
});

describe("tiktokSendVideo", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("init 不带 shop_cipher、target_path 原样带占位；分块不签名、带 upload_token 与 shop_cipher；用 202309 版发 {vid}", async () => {
    const t = await load();
    platform({ chunkReplies: [{ status: 200, json: { code: 0, data: { part_id: "p1" } } }] });
    const r = await t.tiktokSendVideo(app, shop, "conv-1", video(30 * MB));
    expect(r.messageId).toBe("7699000000000000001");
    const [init, c1, c2, send] = calls();
    expect(calls()).toHaveLength(4);

    expect(init.url.pathname).toBe("/open/202512/file/init");
    expect(init.url.searchParams.has("shop_cipher")).toBe(false);
    expect(init.url.searchParams.get("sign")).toBeTruthy();
    expect((init.init.headers as Record<string, string>)["x-tts-access-token"]).toBe("at-1");
    expect(JSON.parse(String(init.init.body))).toEqual({
      file_size: 30 * MB,
      file_name: "clip.mov",
      total_chunk_count: 2,
      file_type: "video",
      target_path: "[POST]/customer_service/202309/conversations/{conversation_id}/messages",
    });

    for (const [i, c] of [c1, c2].entries()) {
      expect(c.init.method).toBe("PUT");
      expect(c.url.origin + c.url.pathname).toBe("https://upload.tiktok.test/file/v1/upload");
      expect(Object.fromEntries(c.url.searchParams)).toEqual({ route: "sg1", upload_token: "tok-1", chunk_num: String(i + 1), app_key: "tt-app", shop_cipher: "ROW_x" });
      expect(c.init.headers).toEqual({ "content-type": "video/quicktime", "x-tts-access-token": "at-1" });
      expect(c.timeout).toBe(60_000);
    }
    expect((c1.init.body as Uint8Array).byteLength).toBe(20 * MB);
    expect((c2.init.body as Uint8Array).byteLength).toBe(10 * MB);

    expect(send.url.pathname).toBe("/customer_service/202309/conversations/conv-1/messages");
    expect(send.url.searchParams.get("shop_cipher")).toBe("ROW_x");
    expect(JSON.parse(String(send.init.body))).toEqual({ type: "VIDEO", content: JSON.stringify({ vid: "res-1" }) });
  });

  it("分块被限流：等一下重发这一块，不重新 init", async () => {
    vi.useFakeTimers();
    const t = await load();
    platform({ chunkReplies: [{ status: 429, json: { code: 36009002, message: "rate limited" } }] });
    const p = t.tiktokSendVideo(app, shop, "conv-1", video(MB));
    await vi.runAllTimersAsync();
    await expect(p).resolves.toMatchObject({ messageId: "7699000000000000001" });
    expect(calls().map((c) => c.init.method === "PUT" ? `PUT ${c.url.searchParams.get("chunk_num")}` : c.url.pathname)).toEqual([
      "/open/202512/file/init",
      "PUT 1",
      "PUT 1",
      "/customer_service/202309/conversations/conv-1/messages",
    ]);
  });

  it("分块失败不发送；上传完没给 resource_id 报 no_resource_id", async () => {
    const t = await load();
    platform({ chunkReplies: [{ status: 500, json: { code: 36009003, message: "Internal error" } }] });
    const err = await t.tiktokSendVideo(app, shop, "conv-1", video(MB)).catch((e) => e);
    expect(err).toBeInstanceOf((await import("./types")).PlatformError);
    expect(err).toMatchObject({ code: "36009003", kind: "server" });
    expect(calls().some((c) => c.url.pathname.includes("/messages"))).toBe(false);

    fetchMock.mockReset();
    platform({ chunkReplies: [{ status: 200, json: { code: 0, data: { part_id: "p1" } } }] });
    await expect(t.tiktokSendVideo(app, shop, "conv-1", video(MB))).rejects.toMatchObject({ code: "no_resource_id", kind: "server" });
  });

  it("vid 不属于该卖家（45101001）：按参数错误给客服看平台原话", async () => {
    const t = await load();
    platform({ sendReply: { status: 200, json: { code: 45101001, message: "this video does not belong to this seller" } } });
    const err = (await t.tiktokSendVideo(app, shop, "conv-1", video(MB)).catch((e) => e)) as PlatformError;
    expect(err).toMatchObject({ code: "45101001", kind: "param" });
    expect(platformErrorText(err)).toBe("TikTok 返回错误（45101001）：this video does not belong to this seller");
  });

  it("只读接入：init 就被拦下，不发任何请求", async () => {
    const t = await load();
    platform();
    await expect(t.tiktokSendVideo({ ...app, readOnly: true }, shop, "conv-1", video(MB))).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
