// 需要数据库：DATABASE_URL 未设置时跳过（set -a && . ./.env && set +a && pnpm exec vitest run src/server/conversations）。
// 发送带预译文（API-CONV-007 translatedText）：带了就直接发它、不再同步翻译；没带照旧在请求里翻译。原文都记在 originalText。
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { can, permissionsFor } from "@/lib/permissions";

const { enqueue, translateText } = vi.hoisted(() => ({
  enqueue: vi.fn(async () => null),
  translateText: vi.fn(async (text: string, target: string) => `[${target}] ${text}`),
}));
vi.mock("@/server/jobs/boss", () => ({ enqueue }));
vi.mock("@/server/ai/translate", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/server/ai/translate")>()), translateText }));

const fetchMock = vi.fn();

describe.skipIf(!process.env.DATABASE_URL)("发送带预译文（需要数据库）", async () => {
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { sendMessage } = await import("./actions");
  type MemberContext = import("@/server/auth/context").MemberContext;

  const userIds: string[] = [];
  const merchantIds: string[] = [];
  let admin: MemberContext;
  let convId = "";

  beforeAll(async () => {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: "预译文测试", email: `${userId}@test.invalid` });
    userIds.push(userId);
    const { merchant, membership } = await db().transaction((tx) => provisionMerchant(tx, { name: "预译文测试", timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
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
        externalShopId: "9002",
        name: "Shopee VN",
        market: "VN",
        accessTokenEnc: encrypt("token"),
        refreshTokenEnc: encrypt("refresh"),
        accessExpiresAt: new Date(Date.now() + 86_400_000),
        capabilities: { chat: true, orders: true, piiMasked: false, productScope: false, cards: [], coupons: false, endSession: false, maxTextLength: 500 },
      })
      .returning();
    const [conv] = await db()
      .insert(schema.conversation)
      .values({ merchantId: merchant.id, shopId: shop.id, platform: "shopee", externalConversationId: `c-${randomUUID()}`, buyerExternalId: "456", buyerName: "Buyer", handlingState: "human", claimedBy: membership.id, lastBuyerAt: new Date() })
      .returning();
    convId = conv.id;
    admin = {
      requestId: "req_test",
      ip: "127.0.0.1",
      userAgent: null,
      user: { id: userId, name: "预译文测试", email: `${userId}@test.invalid`, twoFactorEnabled: false },
      session: { id: "s", createdAt: new Date() },
      merchant,
      membership: { id: membership.id, role: "admin", status: "active" },
      isOwner: true,
      shopIds: null,
      twoFactorRequired: false,
      actor: { kind: "member", merchantId: merchant.id, membershipId: membership.id, userId, name: "预译文测试", requestId: "req_test" },
      can: (p) => can("admin", true, p),
      permissions: permissionsFor("admin", true),
    };
  });

  beforeEach(() => {
    translateText.mockClear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => Response.json({ response: { message_id: `m-${randomUUID()}`, created_timestamp: 1_700_000_000 } }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
  });

  const sentText = () => JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body)).content.text as string;
  const row = async (id: string) => (await db().select().from(schema.message).where(eq(schema.message.id, id)))[0];

  it("带预译文：不调翻译，平台收到的就是预译文，原文记在 originalText", async () => {
    const m = await sendMessage(admin, convId, { clientRequestId: `req-${randomUUID()}`, type: "text", text: "你好，请稍等", translateTo: "vi", translatedText: "Xin chào, vui lòng đợi" });
    expect(translateText).not.toHaveBeenCalled();
    expect(sentText()).toBe("Xin chào, vui lòng đợi");
    expect(await row(m.id)).toMatchObject({ text: "Xin chào, vui lòng đợi", originalText: "你好，请稍等", sendStatus: "sent" });
  });

  it("没带预译文：照旧在请求里翻译", async () => {
    const m = await sendMessage(admin, convId, { clientRequestId: `req-${randomUUID()}`, type: "text", text: "好的", translateTo: "vi" });
    expect(translateText).toHaveBeenCalledWith("好的", "vi");
    expect(sentText()).toBe("[vi] 好的");
    expect(await row(m.id)).toMatchObject({ text: "[vi] 好的", originalText: "好的" });
  });

  it("预译文超过店铺字数上限：422，不发给平台", async () => {
    await expect(sendMessage(admin, convId, { clientRequestId: `req-${randomUUID()}`, type: "text", text: "长", translateTo: "vi", translatedText: "x".repeat(501) })).rejects.toMatchObject({ type: "validation" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
