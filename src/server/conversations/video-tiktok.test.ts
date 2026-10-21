// 需要数据库：DATABASE_URL 未设置时跳过（set -a && . ./.env && set +a && pnpm exec vitest run src/server/conversations）。
// TikTok 聊天视频：与 Shopee 同走 message.video_send；Worker 里 Upload File Init → 分块上传 → 202309 Send Message，时间线留本地文件地址；
// 上传耗时长，平台回声晚于 2 分钟也要认成本方出站。
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const enqueue = vi.fn(async () => null);
vi.mock("@/server/jobs/boss", () => ({ enqueue }));

const fetchMock = vi.fn();

describe.skipIf(!process.env.DATABASE_URL)("出站视频（TikTok）", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "shopilot-ttvideo-test-"));
  process.env.DATA_DIR = dataDir;
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { deliverQueuedVideo, sendOutbound } = await import("./send");
  const { ingestMessage } = await import("./ingest");

  type Conv = typeof schema.conversation.$inferSelect;
  const userIds: string[] = [];
  const merchantIds: string[] = [];
  let shop: typeof schema.shop.$inferSelect;
  let conv: Conv;
  let videoId = "";

  beforeAll(async () => {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: "TT Video", email: `${userId}@test.invalid` });
    userIds.push(userId);
    const { merchant } = await db().transaction((tx) => provisionMerchant(tx, { name: "TT Video", timezone: "Asia/Bangkok", ownerUserId: userId }));
    merchantIds.push(merchant.id);
    const [app] = await db()
      .insert(schema.platformApp)
      .values({ merchantId: merchant.id, platform: "tiktok", appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), status: "verified" })
      .returning();
    [shop] = await db()
      .insert(schema.shop)
      .values({
        merchantId: merchant.id,
        platformAppId: app.id,
        platform: "tiktok",
        externalShopId: `tt-${randomUUID()}`,
        shopCipher: "ROW_tt",
        name: "TikTok TH",
        market: "TH",
        accessTokenEnc: encrypt("token"),
        refreshTokenEnc: encrypt("refresh"),
        accessExpiresAt: new Date(Date.now() + 86_400_000),
        capabilities: { chat: true, orders: true, piiMasked: false, productScope: true, cards: [], coupons: false, endSession: false, maxTextLength: 2000 },
      })
      .returning();
    [conv] = await db()
      .insert(schema.conversation)
      .values({ merchantId: merchant.id, shopId: shop.id, platform: "tiktok", externalConversationId: `c-${randomUUID()}`, buyerExternalId: "b-1", buyerName: "Buyer", handlingState: "human" })
      .returning();
    const rel = `${randomUUID()}.mov`;
    await writeFile(path.join(dataDir, rel), Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypqt  "), Buffer.alloc(16)]));
    const [f] = await db().insert(schema.file).values({ merchantId: merchant.id, kind: "chat_video", path: rel, mime: "video/quicktime", size: 28 }).returning();
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

  function platform() {
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      const p = new URL(String(url)).pathname;
      if (p.endsWith("/open/202512/file/init")) return Response.json({ code: 0, data: { upload_url: "https://upload.tiktok.test/file/v1/upload", upload_token: "tok-1" } });
      if (init.method === "PUT") return Response.json({ code: 0, data: { resource_id: "res-1" } });
      return Response.json({ code: 0, data: { message_id: "7699022621192635912" } });
    });
  }

  it("先落「发送中」排 message.video_send；Worker 里上传后用 202309 版发出，时间线保留本地文件地址", async () => {
    platform();
    const out = await sendVideo();
    expect(out.message).toMatchObject({ type: "video", sendStatus: "sending" });
    expect(enqueue).toHaveBeenCalledWith("message.video_send", { messageId: out.message.id }, { singletonKey: out.message.id });
    expect(fetchMock).not.toHaveBeenCalled();

    await deliverQueuedVideo({ messageId: out.message.id });
    const calls = fetchMock.mock.calls.map(([u, init]) => `${(init as RequestInit).method} ${new URL(String(u)).pathname.replace(/^\/mock\/tiktok\/open-api/, "")}`);
    expect(calls).toEqual(["POST /open/202512/file/init", "PUT /file/v1/upload", `POST /customer_service/202309/conversations/${conv.externalConversationId}/messages`]);
    const [put] = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit).method === "PUT");
    expect(((put[1] as RequestInit).headers as Record<string, string>)["content-type"]).toBe("video/quicktime");
    const [row] = await db().select().from(schema.message).where(eq(schema.message.id, out.message.id));
    expect(row).toMatchObject({ sendStatus: "sent", externalMessageId: "7699022621192635912" });
    expect(row.payload).toEqual({ fileId: videoId, url: `/api/v1/files/${videoId}` });
  });

  it("平台拒绝（vid 不属于该卖家）：消息记为失败，带平台原话", async () => {
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      const p = new URL(String(url)).pathname;
      if (p.endsWith("/file/init")) return Response.json({ code: 0, data: { upload_url: "https://upload.tiktok.test/file/v1/upload", upload_token: "tok-1" } });
      if (init.method === "PUT") return Response.json({ code: 0, data: { resource_id: "res-1" } });
      return Response.json({ code: 45101001, message: "this video does not belong to this seller" });
    });
    const { message } = await sendVideo();
    await deliverQueuedVideo({ messageId: message.id });
    const [row] = await db().select().from(schema.message).where(eq(schema.message.id, message.id));
    expect(row.sendStatus).toBe("failed");
    expect(row.sendError).toBe("TikTok 返回错误（45101001）：this video does not belong to this seller");
  });

  it("上传期间平台回声（入队 5 分钟后才到）认成本方出站：不新增消息，平台消息 ID 记到这条上", async () => {
    const { message } = await sendVideo();
    await db().update(schema.message).set({ createdAt: new Date(Date.now() - 5 * 60_000) }).where(eq(schema.message.id, message.id));
    const echo = {
      externalMessageId: `echo-${randomUUID()}`,
      externalConversationId: conv.externalConversationId,
      buyerExternalId: null,
      buyerName: null,
      fromBuyer: false,
      senderRole: "agent" as const,
      type: "video" as const,
      text: null,
      translation: null,
      payload: { url: "https://v16.tiktokcdn.test/video.mp4" },
      sentAt: new Date(),
      affiliate: false,
      raw: {},
    };
    const res = await db().transaction((tx) => ingestMessage(tx, shop, echo, null));
    expect(res).toMatchObject({ status: "ignored", reason: "本方出站回声" });
    const rows = await db().select().from(schema.message).where(eq(schema.message.conversationId, conv.id));
    expect(rows.filter((r) => r.externalMessageId === echo.externalMessageId).map((r) => r.id)).toEqual([message.id]);
  });
});
