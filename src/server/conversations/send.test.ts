// 需要数据库：DATABASE_URL 未设置时跳过（set -a && . ./.env && set +a && pnpm exec vitest run src/server/conversations）。
// 只读接入的店照常落消息，平台请求被写保护拦下（fetch 一次都不调），消息记为发送失败；普通店照常发出。
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/jobs/boss", () => ({ enqueue: vi.fn(async () => null) }));

const fetchMock = vi.fn();

describe.skipIf(!process.env.DATABASE_URL)("出站发送（只读接入试发）", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "shopilot-send-test-"));
  process.env.DATA_DIR = dataDir;
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { READ_ONLY_SEND_FAILED } = await import("@/server/platforms/readonly");
  const { retryOutbound, sendOutbound } = await import("./send");

  type Conv = typeof schema.conversation.$inferSelect;
  const userIds: string[] = [];
  const merchantIds: string[] = [];
  const conv = {} as { shopeeRo: Conv; tiktokRo: Conv; shopee: Conv };
  const imageFile = { ro: "", normal: "" };

  const caps = { chat: true, orders: true, piiMasked: false, productScope: true, cards: [], coupons: false, endSession: false, maxTextLength: 500 };

  async function newMerchant(name: string) {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name, email: `${userId}@test.invalid` });
    userIds.push(userId);
    const { merchant } = await db().transaction((tx) => provisionMerchant(tx, { name, timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantIds.push(merchant.id);
    return merchant;
  }

  async function newConversation(merchantId: string, platform: "shopee" | "tiktok", readOnly: boolean): Promise<Conv> {
    const [app] = await db()
      .insert(schema.platformApp)
      .values({ merchantId, platform, appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), apiHost: platform === "shopee" ? "http://shopee.test" : null, region: "sg", status: "verified", readOnly })
      .returning();
    const [shop] = await db()
      .insert(schema.shop)
      .values({
        merchantId,
        platformAppId: app.id,
        platform,
        externalShopId: "9001",
        shopCipher: platform === "tiktok" ? "cipher" : null,
        name: `${platform} ${readOnly ? "只读" : "普通"}`,
        market: "MY",
        accessTokenEnc: encrypt("token"),
        refreshTokenEnc: encrypt("refresh"),
        accessExpiresAt: new Date(Date.now() + 86_400_000),
        capabilities: caps,
      })
      .returning();
    const [c] = await db()
      .insert(schema.conversation)
      .values({ merchantId, shopId: shop.id, platform, externalConversationId: `c-${randomUUID()}`, buyerExternalId: "123", buyerName: "Buyer", handlingState: "human" })
      .returning();
    return c;
  }

  async function newImage(merchantId: string) {
    const rel = `${randomUUID()}.png`;
    await writeFile(path.join(dataDir, rel), Buffer.from("89504e470d0a1a0a", "hex"));
    const [f] = await db().insert(schema.file).values({ merchantId, kind: "chat_image", path: rel, mime: "image/png", size: 8 }).returning();
    return f.id;
  }

  beforeAll(async () => {
    const ro = await newMerchant("Send RO");
    const normal = await newMerchant("Send Normal");
    conv.shopeeRo = await newConversation(ro.id, "shopee", true);
    conv.tiktokRo = await newConversation(ro.id, "tiktok", true);
    conv.shopee = await newConversation(normal.id, "shopee", false);
    imageFile.ro = await newImage(ro.id);
    imageFile.normal = await newImage(normal.id);
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
    await rm(dataDir, { recursive: true, force: true });
  });

  const send = (c: Conv, type: "text" | "image", fileId?: string) =>
    sendOutbound({ conversation: c, senderRole: "agent", sentBy: null, clientRequestId: randomUUID(), type, text: type === "text" ? "hello" : null, payload: fileId ? { fileId } : {} });

  for (const key of ["shopeeRo", "tiktokRo"] as const) {
    it(`${key === "shopeeRo" ? "Shopee" : "TikTok"} 只读店：文字与图片都落成失败消息，平台请求没有发出`, async () => {
      for (const out of [await send(conv[key], "text"), await send(conv[key], "image", imageFile.ro)]) {
        expect(out.error).toEqual({ kind: "platform", detail: READ_ONLY_SEND_FAILED, platformCode: "read_only" });
        expect(out.message.sendStatus).toBe("failed");
        expect(out.message.sendError).toBe(READ_ONLY_SEND_FAILED);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("只读店重试仍然失败，平台请求没有发出", async () => {
    const first = await send(conv.shopeeRo, "text");
    const again = await retryOutbound(conv.shopeeRo, first.message);
    expect(again.error?.detail).toBe(READ_ONLY_SEND_FAILED);
    expect(again.message.sendStatus).toBe("failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("普通店：文字与图片照常发到平台", async () => {
    let nextId = 777;
    fetchMock.mockImplementation(async (url: string) =>
      Response.json({ response: String(url).includes("upload_image") ? { url: "https://img.test/a.png", thumb_width: 1, thumb_height: 1 } : { message_id: nextId++, created_timestamp: 1_700_000_000 } }),
    );
    const text = await send(conv.shopee, "text");
    expect(text.error).toBeUndefined();
    expect(text.message).toMatchObject({ sendStatus: "sent", externalMessageId: "777" });
    const image = await send(conv.shopee, "image", imageFile.normal);
    expect(image.error).toBeUndefined();
    expect(image.message).toMatchObject({ sendStatus: "sent", payload: { url: "https://img.test/a.png" } });
    expect(fetchMock.mock.calls.map(([u]) => new URL(String(u)).pathname)).toEqual(["/api/v2/sellerchat/send_message", "/api/v2/sellerchat/upload_image", "/api/v2/sellerchat/send_message"]);
  });
});
