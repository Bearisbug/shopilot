// 需要数据库：DATABASE_URL 未设置时跳过（set -a && . ./.env && set +a && pnpm exec vitest run src/server/inbound）。
// Shopee 聊天推送（code 10）：data.type=message 落一条消息；data.type=notification 是会话状态通知，不落消息，其中 mark_as_replied 排一次补拉（inbound.refetch）。
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/server/jobs/boss", () => ({ enqueue: vi.fn(async () => null) }));

describe.skipIf(!process.env.DATABASE_URL)("Shopee 聊天推送处理（code 10）", async () => {
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { processInbound } = await import("./process");

  const userIds: string[] = [];
  const merchantIds: string[] = [];
  const ctx = { merchantId: "", appId: "", shopId: "" };
  const SHOP = "1639084077";

  beforeAll(async () => {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: "Chat push", email: `${userId}@test.invalid` });
    userIds.push(userId);
    const { merchant } = await db().transaction((tx) => provisionMerchant(tx, { name: "Chat push", timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
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
        externalShopId: SHOP,
        name: "推送店",
        market: "PH",
        accessTokenEnc: encrypt("token"),
        refreshTokenEnc: encrypt("refresh"),
        accessExpiresAt: new Date(Date.now() + 86_400_000),
        capabilities: { chat: true, orders: true, piiMasked: false, productScope: true, cards: [], coupons: false, endSession: false, maxTextLength: 500 },
      })
      .returning();
    Object.assign(ctx, { merchantId: merchant.id, appId: app.id, shopId: shop.id });
  });

  afterAll(async () => {
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
  });

  async function run(data: Record<string, unknown>) {
    const [ev] = await db()
      .insert(schema.inboundEvent)
      .values({
        merchantId: ctx.merchantId,
        platformAppId: ctx.appId,
        platform: "shopee",
        externalEventId: randomUUID(),
        eventType: "shopee:10",
        payload: { code: 10, shop_id: Number(SHOP), timestamp: Math.floor(Date.now() / 1000), data },
      })
      .returning();
    await processInbound({ eventId: ev.id });
    const [after] = await db().select().from(schema.inboundEvent).where(eq(schema.inboundEvent.id, ev.id));
    return after;
  }

  const messageCount = async () => (await db().select({ id: schema.message.id }).from(schema.message).where(eq(schema.message.merchantId, ctx.merchantId))).length;

  it("notification（mark_as_replied）不落消息，按会话排补拉，事件记为 done", async () => {
    const { enqueue } = await import("@/server/jobs/boss");
    const before = await messageCount();
    const conv = "10162216384810179";
    const ev = await run({
      type: "notification",
      region: "PH",
      content: {
        type: "mark_as_replied",
        msg_id: 0,
        content: { conversation_id: conv, conversation_tag: "", conversation_filter_type: "unreplied", unreplied_sub_filter_type: "" },
        from_id: 0,
        user_id: 1639926979,
        timestamp: Math.floor(Date.now() / 1000),
        business_type: 0,
        conversation_id: conv,
      },
    });
    expect(ev.status).toBe("done");
    expect(await messageCount()).toBe(before);
    expect(enqueue).toHaveBeenCalledWith("inbound.refetch", { shopId: ctx.shopId, conversationId: conv }, { singletonKey: `${ctx.shopId}:${conv}`, startAfter: 10 });
  });

  it("其他会话通知仍记为 ignored", async () => {
    const ev = await run({ type: "notification", region: "PH", content: { type: "other_notice", conversation_id: "10162216384810180", timestamp: Math.floor(Date.now() / 1000) } });
    expect(ev.status).toBe("ignored");
  });

  it("message 照常落一条买家文字消息", async () => {
    const before = await messageCount();
    const ev = await run({
      type: "message",
      region: "PH",
      content: {
        message_id: `m-${randomUUID()}`,
        message_type: "text",
        content: { text: "Is this compatible with Mac?" },
        from_id: 555001,
        from_user_name: "buyer-ph",
        from_shop_id: 0,
        to_id: 1639926979,
        to_shop_id: Number(SHOP),
        conversation_id: "20000000000000001",
        created_timestamp: Math.floor(Date.now() / 1000),
      },
    });
    expect(ev.status).toBe("done");
    expect(await messageCount()).toBe(before + 1);
  });

  // 源自缺陷：常见问题记录（bundle_message）先于买家「找卖家客服」那句到达时，会话还没建，原来记为 ignored 丢掉
  it("常见问题记录先于买家消息到达：不丢，排补拉等会话建好后入库，事件记为 done", async () => {
    const { enqueue } = await import("@/server/jobs/boss");
    const before = await messageCount();
    const conv = "30000000000000001";
    const bundle = (id: string) => ({
      type: "message",
      region: "PH",
      content: {
        message_id: id,
        message_type: "bundle_message",
        content: { type: 1, messages: ["2442096651766497650", "2442096687428600177"], shopee_chatbot_replied: false },
        from_id: 555003,
        from_user_name: "buyer-faq",
        from_shop_id: 1543356295,
        to_id: 1639926979,
        to_shop_id: Number(SHOP),
        conversation_id: conv,
        created_timestamp: Math.floor(Date.now() / 1000),
      },
    });
    const ev = await run(bundle(`b-${randomUUID()}`));
    expect(ev).toMatchObject({ status: "done", error: "常见问题记录先于买家消息到达，排补拉" });
    expect(await messageCount()).toBe(before);
    expect(enqueue).toHaveBeenCalledWith("inbound.refetch", { shopId: ctx.shopId, conversationId: conv }, { singletonKey: `${ctx.shopId}:${conv}`, startAfter: 10 });

    // 会话已建时直接入库，并排 shopee.bundle 拉成员
    await run({
      type: "message",
      region: "PH",
      content: { message_id: `m-${randomUUID()}`, message_type: "faq_liveagent", content: { text: "Chat with shop staff" }, from_id: 555003, from_user_name: "buyer-faq", from_shop_id: 0, to_id: 1639926979, to_shop_id: Number(SHOP), conversation_id: conv, created_timestamp: Math.floor(Date.now() / 1000) },
    });
    const ev2 = await run(bundle(`b-${randomUUID()}`));
    expect(ev2.status).toBe("done");
    expect(await messageCount()).toBe(before + 2);
    expect(enqueue).toHaveBeenCalledWith("shopee.bundle", { messageId: expect.any(String) }, { singletonKey: expect.any(String) });
  });
});
