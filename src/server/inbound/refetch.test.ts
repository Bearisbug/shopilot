// Shopee 卖家后台回复的补拉（inbound.refetch）。数据库部分需要 DATABASE_URL，未设置时跳过
// （set -a && . ./.env && set +a && pnpm exec vitest run src/server/inbound）。平台接口 get_message 用替身返回固定一页。
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeShopeeMessage } from "@/server/platforms/shopee";
import { PlatformError, type NormalizedMessage } from "@/server/platforms/types";
import { sellerSideSince } from "./refetch";

vi.mock("@/server/jobs/boss", () => ({ enqueue: vi.fn(async () => null) }));
const page = vi.hoisted(() => ({ items: [] as unknown[], error: null as unknown }));
vi.mock("@/server/platforms/shopee", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/server/platforms/shopee")>();
  return {
    ...orig,
    shopeeMessages: vi.fn(async () => {
      if (page.error) throw page.error;
      return { items: page.items, nextOffset: null };
    }),
  };
});

const SHOP = "1639084088";
const BUYER = 555002;
const sec = (d: Date) => Math.floor(d.getTime() / 1000);
/** 整秒时刻：平台消息时间精确到秒，会话段从买家消息的时刻开始 */
const ago = (ms: number) => new Date(Math.floor((Date.now() - ms) / 1000) * 1000);

/** get_message 的一行（买家发或店铺发） */
function raw(conv: string, id: string, at: Date, from: "buyer" | "shop", text: string): Record<string, unknown> {
  return {
    message_id: id,
    conversation_id: conv,
    message_type: "text",
    content: { text },
    from_id: from === "buyer" ? BUYER : 900001,
    from_shop_id: from === "buyer" ? 0 : Number(SHOP),
    to_id: from === "buyer" ? 900001 : BUYER,
    to_shop_id: from === "buyer" ? Number(SHOP) : 0,
    from_user_name: from === "buyer" ? "buyer-ph" : "shop",
    to_user_name: from === "buyer" ? "shop" : "buyer-ph",
    created_timestamp: sec(at),
  };
}
const norm = (rows: Record<string, unknown>[]): NormalizedMessage[] => rows.map((r) => normalizeShopeeMessage(r, SHOP));

describe("补拉页挑卖家侧消息", () => {
  const t0 = new Date("2026-10-16T08:00:00Z");
  const at = (s: number) => new Date(t0.getTime() + s * 1000);

  it("只取本段开始之后的卖家侧消息，按时间旧到新，不含买家消息", () => {
    // 平台给的页是新 → 旧
    const out = sellerSideSince(norm([raw("c", "s2", at(90), "shop", "second"), raw("c", "s1", at(60), "shop", "first"), raw("c", "b1", at(0), "buyer", "hi"), raw("c", "s0", at(-600), "shop", "old")]), t0);
    expect(out.map((m) => [m.externalMessageId, m.senderRole])).toEqual([
      ["s1", "agent"],
      ["s2", "agent"],
    ]);
  });

  it("与买家消息同一秒的店铺消息是自动回复，记 platform_bot；3 秒后的不是", () => {
    const out = sellerSideSince(norm([raw("c", "s3", at(3), "shop", "human"), raw("c", "a1", at(0), "shop", "Welcome!"), raw("c", "b1", at(0), "buyer", "hi")]), t0);
    expect(out.map((m) => [m.externalMessageId, m.senderRole])).toEqual([
      ["a1", "platform_bot"],
      ["s3", "agent"],
    ]);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("inbound.refetch 入库", async () => {
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { refetchConversation } = await import("./refetch");

  const userIds: string[] = [];
  const merchantIds: string[] = [];
  const ctx = { merchantId: "", shopId: "" };

  beforeAll(async () => {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: "Refetch", email: `${userId}@test.invalid` });
    userIds.push(userId);
    const { merchant } = await db().transaction((tx) => provisionMerchant(tx, { name: "Refetch", timezone: "Asia/Manila", ownerUserId: userId }));
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
        name: "补拉店",
        market: "PH",
        accessTokenEnc: encrypt("token"),
        refreshTokenEnc: encrypt("refresh"),
        accessExpiresAt: new Date(Date.now() + 86_400_000),
        capabilities: { chat: true, orders: true, piiMasked: false, productScope: true, cards: [], coupons: false, endSession: false, maxTextLength: 2000 },
      })
      .returning();
    Object.assign(ctx, { merchantId: merchant.id, shopId: shop.id });
  });

  afterAll(async () => {
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
  });

  beforeEach(() => {
    page.items = [];
    page.error = null;
  });

  /** AI 接待中的会话：本段从买家消息 b1（t0）开始，带一份未处置的草稿 */
  async function botConversation(t0: Date) {
    const ext = `conv-${randomUUID()}`;
    const [conv] = await db()
      .insert(schema.conversation)
      .values({ merchantId: ctx.merchantId, shopId: ctx.shopId, platform: "shopee", externalConversationId: ext, buyerExternalId: String(BUYER), buyerName: "buyer-ph", handlingState: "bot", lastMessageAt: t0, lastBuyerAt: t0 })
      .returning();
    const [seg] = await db().insert(schema.segment).values({ merchantId: ctx.merchantId, conversationId: conv.id, stage: "presale", startedAt: t0, firstBuyerAt: t0 }).returning();
    await db().update(schema.conversation).set({ currentSegmentId: seg.id }).where(eq(schema.conversation.id, conv.id));
    const [b1] = await db()
      .insert(schema.message)
      .values({ merchantId: ctx.merchantId, conversationId: conv.id, segmentId: seg.id, externalMessageId: `${ext}-b1`, direction: "in", senderRole: "buyer", type: "text", text: "hi", sentAt: t0 })
      .returning();
    const [draft] = await db()
      .insert(schema.draft)
      .values({ merchantId: ctx.merchantId, conversationId: conv.id, segmentId: seg.id, triggerMessageId: b1.id, mode: "assist", text: "草稿", confidence: 0.85, status: "generated", model: "stub", latencyMs: 1 })
      .returning();
    return { ext, convId: conv.id, segId: seg.id, draftId: draft.id };
  }

  const conversation = async (id: string) => (await db().select().from(schema.conversation).where(eq(schema.conversation.id, id)))[0];
  const messages = async (id: string) => db().select().from(schema.message).where(eq(schema.message.conversationId, id)).orderBy(schema.message.sentAt);
  const draftStatus = async (id: string) => (await db().select({ status: schema.draft.status }).from(schema.draft).where(eq(schema.draft.id, id)))[0].status;
  const refetch = (ext: string) => refetchConversation({ shopId: ctx.shopId, conversationId: ext });

  it("卖家后台回复入库为平台后台回复，会话转 human 并作废草稿；本段之前的消息和买家消息不入库", async () => {
    const t0 = ago(5 * 60_000);
    const c = await botConversation(t0);
    page.items = norm([
      raw(c.ext, `${c.ext}-r1`, new Date(t0.getTime() + 60_000), "shop", "Yes, in stock."),
      raw(c.ext, `${c.ext}-b1`, t0, "buyer", "hi"),
      raw(c.ext, `${c.ext}-old`, new Date(t0.getTime() - 3_600_000), "shop", "older reply"),
    ]);
    await refetch(c.ext);

    const conv = await conversation(c.convId);
    expect(conv).toMatchObject({ handlingState: "human", claimedBy: null, handoffReason: "platform_human", currentSegmentId: c.segId });
    expect(conv.lastAgentAt?.getTime()).toBe(t0.getTime() + 60_000);
    const msgs = await messages(c.convId);
    const reply = msgs.find((m) => m.externalMessageId === `${c.ext}-r1`);
    expect(reply).toMatchObject({ senderRole: "platform_human", direction: "out", text: "Yes, in stock.", segmentId: c.segId });
    expect(msgs.some((m) => m.externalMessageId === `${c.ext}-old`)).toBe(false);
    expect(msgs.filter((m) => m.senderRole === "buyer")).toHaveLength(1);
    expect(msgs.some((m) => m.senderRole === "system" && m.text === "平台侧已有人处理")).toBe(true);
    expect(await draftStatus(c.draftId)).toBe("superseded");
    const segs = await db().select().from(schema.segment).where(eq(schema.segment.conversationId, c.convId));
    expect(segs).toHaveLength(1);
  });

  it("同一会话补拉两次只入库一次", async () => {
    const t0 = ago(5 * 60_000);
    const c = await botConversation(t0);
    page.items = norm([raw(c.ext, `${c.ext}-r1`, new Date(t0.getTime() + 30_000), "shop", "once")]);
    await refetch(c.ext);
    await refetch(c.ext);
    expect((await messages(c.convId)).filter((m) => m.externalMessageId === `${c.ext}-r1`)).toHaveLength(1);
  });

  it("本方出站回声（按消息 ID，或 2 分钟内同文本、还在发送中）不算后台回复，会话不变", async () => {
    const t0 = ago(60_000);
    const c = await botConversation(t0);
    // AI 已发出、带平台消息 ID 的一条；员工刚点发送、平台还没回 ID 的一条
    await db().insert(schema.message).values([
      { merchantId: ctx.merchantId, conversationId: c.convId, segmentId: c.segId, externalMessageId: `${c.ext}-o1`, direction: "out", senderRole: "ai", type: "text", text: "AI reply", sendStatus: "sent", sentAt: new Date(t0.getTime() + 10_000) },
      { merchantId: ctx.merchantId, conversationId: c.convId, segmentId: c.segId, direction: "out", senderRole: "agent", type: "text", text: "Agent reply", clientRequestId: `req-${randomUUID()}`, sendStatus: "sending", sentAt: new Date() },
    ]);
    page.items = norm([raw(c.ext, `${c.ext}-o2`, new Date(), "shop", "Agent reply"), raw(c.ext, `${c.ext}-o1`, new Date(t0.getTime() + 10_000), "shop", "AI reply")]);
    await refetch(c.ext);

    expect(await conversation(c.convId)).toMatchObject({ handlingState: "bot", handoffReason: null });
    const msgs = await messages(c.convId);
    expect(msgs.filter((m) => m.senderRole === "platform_human")).toHaveLength(0);
    expect(msgs.filter((m) => m.direction === "out")).toHaveLength(2);
    expect(msgs.find((m) => m.text === "Agent reply")?.externalMessageId).toBe(`${c.ext}-o2`);
    expect(await draftStatus(c.draftId)).toBe("generated");
  });

  it("店铺自动回复记平台自动回复，会话仍由 AI 接待", async () => {
    const t0 = ago(60_000);
    const c = await botConversation(t0);
    page.items = norm([raw(c.ext, `${c.ext}-a1`, t0, "shop", "Welcome!"), raw(c.ext, `${c.ext}-b1`, t0, "buyer", "hi")]);
    await refetch(c.ext);

    expect(await conversation(c.convId)).toMatchObject({ handlingState: "bot", handoffReason: null });
    const auto = (await messages(c.convId)).find((m) => m.externalMessageId === `${c.ext}-a1`);
    expect(auto).toMatchObject({ senderRole: "platform_bot", direction: "out" });
    expect(await draftStatus(c.draftId)).toBe("generated");
  });

  it("补拉到的回复早于已入库的买家新消息时，会话的最近消息时间不往回退", async () => {
    const t0 = ago(5 * 60_000);
    const c = await botConversation(t0);
    const t2 = new Date(t0.getTime() + 120_000);
    await db().insert(schema.message).values({ merchantId: ctx.merchantId, conversationId: c.convId, segmentId: c.segId, externalMessageId: `${c.ext}-b2`, direction: "in", senderRole: "buyer", type: "text", text: "still there?", sentAt: t2 });
    await db().update(schema.conversation).set({ lastMessageAt: t2, lastBuyerAt: t2 }).where(eq(schema.conversation.id, c.convId));
    page.items = norm([raw(c.ext, `${c.ext}-b2`, t2, "buyer", "still there?"), raw(c.ext, `${c.ext}-r1`, new Date(t0.getTime() + 60_000), "shop", "reply")]);
    await refetch(c.ext);

    const conv = await conversation(c.convId);
    expect(conv.lastMessageAt?.getTime()).toBe(t2.getTime());
    expect(conv.handlingState).toBe("human");
  });

  it("会话不存在时不调平台；平台无权限只记日志，平台 5xx 抛出由队列重试", async () => {
    const { shopeeMessages } = await import("@/server/platforms/shopee");
    const calls = vi.mocked(shopeeMessages).mock.calls.length;
    await refetch(`conv-${randomUUID()}`);
    expect(vi.mocked(shopeeMessages).mock.calls.length).toBe(calls);

    const c = await botConversation(ago(60_000));
    page.error = new PlatformError("shopee", "error_permission", "no chat", "forbidden");
    await expect(refetch(c.ext)).resolves.toBeUndefined();
    page.error = new PlatformError("shopee", "error_server", "busy", "server", 500);
    await expect(refetch(c.ext)).rejects.toBeInstanceOf(PlatformError);
    expect((await conversation(c.convId)).handlingState).toBe("bot");
  });
});
