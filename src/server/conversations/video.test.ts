// 需要数据库：DATABASE_URL 未设置时跳过（set -a && . ./.env && set +a && pnpm exec vitest run src/server/conversations）。
// Shopee 聊天视频：先落「发送中」并排 message.video_send，Worker 里上传 → 等平台处理 → 发送；时间线地址拼成 Shopee CDN。
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const enqueue = vi.fn(async () => null);
vi.mock("@/server/jobs/boss", () => ({ enqueue }));

const fetchMock = vi.fn();

describe.skipIf(!process.env.DATABASE_URL)("出站视频（Shopee）", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "shopilot-video-test-"));
  process.env.DATA_DIR = dataDir;
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { deliverQueuedVideo, retryOutbound, sendOutbound, shopeeVideoMedia } = await import("./send");

  type Conv = typeof schema.conversation.$inferSelect;
  const userIds: string[] = [];
  const merchantIds: string[] = [];
  let conv: Conv;
  let videoId = "";

  beforeAll(async () => {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: "Video", email: `${userId}@test.invalid` });
    userIds.push(userId);
    const { merchant } = await db().transaction((tx) => provisionMerchant(tx, { name: "Video", timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantIds.push(merchant.id);
    const [app] = await db()
      .insert(schema.platformApp)
      .values({ merchantId: merchant.id, platform: "shopee", appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), apiHost: "http://shopee.test", region: "sg", status: "verified" })
      .returning();
    const [shop] = await db()
      .insert(schema.shop)
      .values({
        merchantId: merchant.id,
        platformAppId: app.id,
        platform: "shopee",
        externalShopId: "9001",
        name: "Shopee MY",
        market: "MY",
        accessTokenEnc: encrypt("token"),
        refreshTokenEnc: encrypt("refresh"),
        accessExpiresAt: new Date(Date.now() + 86_400_000),
        capabilities: { chat: true, orders: true, piiMasked: false, productScope: true, cards: [], coupons: false, endSession: false, maxTextLength: 500 },
      })
      .returning();
    [conv] = await db()
      .insert(schema.conversation)
      .values({ merchantId: merchant.id, shopId: shop.id, platform: "shopee", externalConversationId: `c-${randomUUID()}`, buyerExternalId: "123", buyerName: "Buyer", handlingState: "human" })
      .returning();
    const rel = `${randomUUID()}.mp4`;
    await writeFile(path.join(dataDir, rel), Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(16)]));
    const [f] = await db().insert(schema.file).values({ merchantId: merchant.id, kind: "chat_video", path: rel, mime: "video/mp4", size: 28 }).returning();
    videoId = f.id;
  });

  beforeEach(() => {
    fetchMock.mockReset();
    enqueue.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
    await rm(dataDir, { recursive: true, force: true });
  });

  const sendVideo = () => sendOutbound({ conversation: conv, senderRole: "agent", sentBy: null, clientRequestId: randomUUID(), type: "video", payload: { fileId: videoId, url: `/api/v1/files/${videoId}` } });

  /** 平台：上传给 vid，处理结果按 statuses 依次返回，发送给 message_id */
  function platform(statuses: string[]) {
    const results = [...statuses];
    fetchMock.mockImplementation(async (url: string) => {
      const p = new URL(String(url)).pathname;
      if (p.endsWith("upload_video")) return Response.json({ response: { vid: "vid-1" } });
      if (p.endsWith("get_video_upload_result")) {
        const status = results.shift() ?? "successful";
        return Response.json({ response: status === "successful" ? { status, video: "api/v4/11110120/mms/abc.mp4", thumbnail: "abc_cover", duration: 6400, width: 720, height: 1280, size: 6_200_000 } : { status } });
      }
      return Response.json({ response: { message_id: "990001", created_timestamp: 1_700_000_000 } });
    });
  }

  it("发送先落「发送中」并排队，不在请求里调平台", async () => {
    const out = await sendVideo();
    expect(out.error).toBeUndefined();
    expect(out.message).toMatchObject({ type: "video", sendStatus: "sending" });
    expect(enqueue).toHaveBeenCalledWith("message.video_send", { messageId: out.message.id }, { singletonKey: out.message.id });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Worker 上传、等处理完成后用处理结果发送，时间线地址换成 Shopee CDN", async () => {
    platform(["successful"]);
    const { message } = await sendVideo();
    await deliverQueuedVideo({ messageId: message.id });
    const calls = fetchMock.mock.calls.map(([u, init]) => ({ path: new URL(String(u)).pathname, body: init?.body }));
    expect(calls.map((c) => c.path)).toEqual(["/api/v2/sellerchat/upload_video", "/api/v2/sellerchat/get_video_upload_result", "/api/v2/sellerchat/send_message"]);
    expect(JSON.parse(String(calls[2].body))).toEqual({
      to_id: 123,
      message_type: "video",
      content: { video_url: "api/v4/11110120/mms/abc.mp4", thumb_url: "abc_cover", duration_seconds: 6, thumb_width: 720, thumb_height: 1280 },
    });
    const [row] = await db().select().from(schema.message).where(inArray(schema.message.id, [message.id]));
    expect(row).toMatchObject({ sendStatus: "sent", externalMessageId: "990001" });
    expect(row.payload).toMatchObject({
      fileId: videoId,
      url: "https://cvf.shopee.com.my/file/api/v4/11110120/mms/abc.mp4",
      cover: "https://cf.shopee.com.my/file/abc_cover",
      width: 720,
      height: 1280,
      duration: 6,
    });
  });

  it("平台处理失败：消息记为失败；重试重新排队", async () => {
    platform(["failed"]);
    const { message } = await sendVideo();
    await deliverQueuedVideo({ messageId: message.id });
    const [failed] = await db().select().from(schema.message).where(inArray(schema.message.id, [message.id]));
    expect(failed.sendStatus).toBe("failed");
    expect(failed.sendError).toContain("video_process_failed");
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("send_message"))).toBe(false);
    enqueue.mockClear();
    const again = await retryOutbound(conv, failed);
    expect(again.message.sendStatus).toBe("sending");
    expect(enqueue).toHaveBeenCalledWith("message.video_send", { messageId: message.id }, { singletonKey: message.id });
  });

  it("不在「发送中」的消息不再发", async () => {
    platform(["successful"]);
    const { message } = await sendVideo();
    await deliverQueuedVideo({ messageId: message.id });
    fetchMock.mockClear();
    await deliverQueuedVideo({ messageId: message.id });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("完整地址原样用；站点不认识时不拼地址", () => {
    const v = { video: "http://127.0.0.1:3361/mock/files/x", thumbnail: "", durationMs: 0, width: 0, height: 0 };
    expect(shopeeVideoMedia(v, "MY")).toMatchObject({ url: "http://127.0.0.1:3361/mock/files/x" });
    expect(shopeeVideoMedia({ ...v, video: "api/v4/x.mp4" }, "XX").url).toBeUndefined();
  });
});
