// Shopee 常见问题记录（bundle_message）：归一化、成员解析、拉取任务、展开给飞书卡片、补拉窗口。
// 数据库部分需要 DATABASE_URL，未设置时跳过（set -a && . ./.env && set +a && pnpm exec vitest run src/server/conversations/bundle.test.ts）。
// 平台接口 get_message（按 ID 拉）用替身返回固定行。
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FaqRecord } from "@/contracts/conversations";
import { normalizeBundleMember, normalizeShopeeMessage } from "@/server/platforms/shopee";
import { PlatformError } from "@/server/platforms/types";
import { sellerSideSince } from "@/server/inbound/refetch";
import { displayPayload } from "./bundle";

const enqueued = vi.hoisted(() => [] as Array<{ name: string; data: unknown }>);
vi.mock("@/server/jobs/boss", () => ({ enqueue: vi.fn(async (name: string, data: unknown) => (enqueued.push({ name, data }), null)) }));
const byIds = vi.hoisted(() => ({ calls: [] as string[][], respond: ((() => []) as (ids: string[]) => unknown) }));
vi.mock("@/server/platforms/shopee", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/server/platforms/shopee")>();
  return {
    ...orig,
    shopeeMessagesByIds: vi.fn(async (_app: unknown, _shop: unknown, _conv: string, ids: string[]) => {
      byIds.calls.push(ids);
      const r = byIds.respond(ids);
      if (r instanceof Error) throw r;
      return r;
    }),
  };
});

const SHOP = "1605010448";
const BUYER = 1544188153;
const BUNDLE_ID = "2442096816306864497";
const MEMBER_IDS = ["2442096651766497650", "2442096687428600177", "2442096702647599474"];

/** 线上拉到的成员行形状（去掉了无关字段）：店铺这一侧是商店 AI 助手，另一侧是买家 */
function member(id: string, type: string, content: Record<string, unknown>, fromShop: boolean, ts: number): Record<string, unknown> {
  return { message_id: id, message_type: type, content, from_shop_id: fromShop ? Number(SHOP) : 1543356295, from_id: fromShop ? 1605957825 : BUYER, created_timestamp: ts };
}
const MEMBERS = [
  member(MEMBER_IDS[2], "faq_liveagent_prompt", { live_agent_text: [{ lang: "id", text: "" }, { lang: "en", text: "Our team will check." }] }, true, 1792490940),
  member(MEMBER_IDS[0], "extended_markdown", { text: "Welcome to OBSBOT.th" }, true, 1792490900),
  member(MEMBER_IDS[1], "text", { text: "แม่เหล็กมีขายแยกไหม", translation: { text: "磁铁单独卖吗？" } }, false, 1792490920),
];

describe("bundle_message 归一化", () => {
  it("只记成员 ID（原样数字串，不转 Number），状态 pending，算平台系统消息", () => {
    const m = normalizeShopeeMessage(
      { message_id: BUNDLE_ID, conversation_id: "c1", message_type: "bundle_message", content: { type: 1, messages: [...MEMBER_IDS, "x1"], shopee_chatbot_replied: false }, from_shop_id: 1543356295, from_id: BUYER, to_id: 1605957825, created_timestamp: 1792490963 },
      SHOP,
    );
    expect(m).toMatchObject({ senderRole: "system", fromBuyer: false, type: "other", payload: { platformType: "bundle_message", bundle: { ids: MEMBER_IDS, status: "pending" } } });
  });

  it("成员：买家文字带平台译文，助手回复取第一段非空，欢迎语、推荐商品、图片、其他类型", () => {
    expect(normalizeBundleMember(MEMBERS[2], SHOP)).toMatchObject({ id: MEMBER_IDS[1], role: "buyer", kind: "text", text: "แม่เหล็กมีขายแยกไหม", translation: "磁铁单独卖吗？" });
    expect(normalizeBundleMember(MEMBERS[0], SHOP)).toMatchObject({ role: "bot", kind: "text", text: "Our team will check.", translation: null });
    expect(normalizeBundleMember(MEMBERS[1], SHOP)).toMatchObject({ role: "bot", kind: "text", text: "Welcome to OBSBOT.th" });
    expect(normalizeBundleMember(member("9", "first_msg_item_rcmd", { title: { text: "Picked for you" }, item_card_v2s: [{}, {}, {}] }, true, 1), SHOP)).toMatchObject({ kind: "product_rcmd", count: 3, text: "Picked for you" });
    expect(normalizeBundleMember(member("9", "image", { url: "https://img/x" }, false, 1), SHOP)).toMatchObject({ role: "buyer", kind: "image", url: "https://img/x" });
    expect(normalizeBundleMember(member("9", "sticker", {}, false, 1), SHOP)).toMatchObject({ kind: "other", rawType: "sticker", text: null });
    // 时间按秒转 ISO
    expect(normalizeBundleMember(MEMBERS[2], SHOP).sentAt).toBe(new Date(1792490920 * 1000).toISOString());
  });

  it("译文与原文相同时不重复存", () => {
    expect(normalizeBundleMember(member("9", "text", { text: "ok", translation: { text: "ok" } }, false, 1), SHOP).translation).toBeNull();
  });
});

describe("工作台显示", () => {
  const row = (createdAt: Date, payload: Record<string, unknown>) => ({ senderRole: "system" as const, payload, createdAt });
  it("拉取中超过 10 分钟（含上线前入库、没有 bundle 字段的）按 failed 给；新的原样给", () => {
    const now = Date.now();
    const pending = { platformType: "bundle_message", bundle: { ids: ["1"], status: "pending" } };
    expect((displayPayload(row(new Date(now - 60_000), pending), now).bundle as FaqRecord).status).toBe("pending");
    expect((displayPayload(row(new Date(now - 11 * 60_000), pending), now).bundle as FaqRecord).status).toBe("failed");
    expect((displayPayload(row(new Date(now - 11 * 60_000), { platformType: "bundle_message" }), now).bundle as FaqRecord).status).toBe("failed");
    expect(displayPayload(row(new Date(now - 11 * 60_000), { platformType: "notification" }), now)).toEqual({ platformType: "notification" });
  });
});

describe("补拉窗口", () => {
  const t0 = new Date("2026-10-19T08:32:42Z");
  const raw = (id: string, type: string, at: Date, fromShop: boolean, content: Record<string, unknown>) =>
    normalizeShopeeMessage({ message_id: id, conversation_id: "c", message_type: type, content, from_shop_id: fromShop ? Number(SHOP) : 0, from_id: fromShop ? 1 : BUYER, to_id: fromShop ? BUYER : 1, created_timestamp: Math.floor(at.getTime() / 1000) }, SHOP);
  it("常见问题记录早于本段开始 2 分钟内也补进来；更早的、以及普通卖家消息照旧只取本段之后", () => {
    const out = sellerSideSince(
      [
        raw("b-new", "bundle_message", new Date(t0.getTime() + 1000), false, { messages: ["1"] }),
        raw("b-near", "bundle_message", new Date(t0.getTime() - 60_000), false, { messages: ["2"] }),
        raw("b-old", "bundle_message", new Date(t0.getTime() - 300_000), false, { messages: ["3"] }),
        raw("s-old", "text", new Date(t0.getTime() - 60_000), true, { text: "old" }),
      ],
      t0,
    );
    expect(out.map((m) => m.externalMessageId)).toEqual(["b-near", "b-new"]);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("shopee.bundle 拉取与展开", async () => {
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { fillBundle, waitForBundles } = await import("./bundle");
  const { ingestMessage } = await import("./ingest");
  const { expandFaq, meaningful } = await import("@/server/feishu/content");

  const userIds: string[] = [];
  const merchantIds: string[] = [];
  const ctx = { merchantId: "", shopId: "", shop: null as unknown as typeof schema.shop.$inferSelect };

  beforeAll(async () => {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: "Bundle", email: `${userId}@test.invalid` });
    userIds.push(userId);
    const { merchant } = await db().transaction((tx) => provisionMerchant(tx, { name: "Bundle", timezone: "Asia/Bangkok", ownerUserId: userId }));
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
        name: "常见问题店",
        market: "TH",
        accessTokenEnc: encrypt("token"),
        refreshTokenEnc: encrypt("refresh"),
        accessExpiresAt: new Date(Date.now() + 86_400_000),
        capabilities: { chat: true, orders: true, piiMasked: false, productScope: true, cards: [], coupons: false, endSession: false, maxTextLength: 2000 },
      })
      .returning();
    Object.assign(ctx, { merchantId: merchant.id, shopId: shop.id, shop });
  });

  afterAll(async () => {
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
  });

  beforeEach(() => {
    enqueued.length = 0;
    byIds.calls = [];
    byIds.respond = () => MEMBERS;
  });

  /** 人工处理中的会话，本段从买家「找卖家客服」那句开始 */
  async function conversation() {
    const ext = `conv-${randomUUID()}`;
    const t0 = new Date(1792490962 * 1000);
    const [conv] = await db()
      .insert(schema.conversation)
      .values({ merchantId: ctx.merchantId, shopId: ctx.shopId, platform: "shopee", externalConversationId: ext, buyerExternalId: String(BUYER), buyerName: "nungning", handlingState: "awaiting_human", lastMessageAt: t0, lastBuyerAt: t0 })
      .returning();
    const [seg] = await db().insert(schema.segment).values({ merchantId: ctx.merchantId, conversationId: conv.id, stage: "presale", startedAt: t0, firstBuyerAt: t0 }).returning();
    await db().update(schema.conversation).set({ currentSegmentId: seg.id }).where(eq(schema.conversation.id, conv.id));
    await db()
      .insert(schema.message)
      .values({ merchantId: ctx.merchantId, conversationId: conv.id, segmentId: seg.id, externalMessageId: `${ext}-faq`, direction: "in", senderRole: "buyer", type: "text", text: "แชทกับเจ้าหน้าที่ของร้านค้า", sentAt: t0 });
    return { ext, convId: conv.id, segId: seg.id };
  }

  const bundleMessage = (ext: string, ids: string[] | null) =>
    normalizeShopeeMessage(
      { message_id: BUNDLE_ID, conversation_id: ext, message_type: "bundle_message", content: ids ? { type: 1, messages: ids } : {}, from_shop_id: 1543356295, from_id: BUYER, to_id: 1605957825, created_timestamp: 1792490963 },
      SHOP,
    );
  const load = async (id: string) => (await db().select().from(schema.message).where(eq(schema.message.id, id)))[0];

  it("入库时带 followUp.bundle，排 shopee.bundle；会话还没建时不入库（由补拉接手）", async () => {
    const c = await conversation();
    const res = await db().transaction((tx) => ingestMessage(tx, ctx.shop, bundleMessage(c.ext, MEMBER_IDS), null));
    expect(res).toMatchObject({ status: "done", followUp: { bundle: true, messageId: res.messageId } });
    const orphan = await db().transaction((tx) => ingestMessage(tx, ctx.shop, bundleMessage(`missing-${randomUUID()}`, MEMBER_IDS), null));
    expect(orphan.status).toBe("ignored");
    expect(orphan.conversationId).toBeUndefined();
  });

  it("拉到成员：按时间旧到新写回 items，状态 ok；再跑不重复拉", async () => {
    const c = await conversation();
    const res = await db().transaction((tx) => ingestMessage(tx, ctx.shop, bundleMessage(c.ext, MEMBER_IDS), null));
    const rec = await fillBundle({ messageId: res.messageId });
    expect(byIds.calls).toEqual([MEMBER_IDS]);
    expect(rec).toMatchObject({ status: "ok", ids: MEMBER_IDS });
    expect(rec!.items!.map((x) => [x.role, x.text])).toEqual([
      ["bot", "Welcome to OBSBOT.th"],
      ["buyer", "แม่เหล็กมีขายแยกไหม"],
      ["bot", "Our team will check."],
    ]);
    const saved = (await load(res.messageId!)).payload as Record<string, unknown>;
    expect(saved).toMatchObject({ platformType: "bundle_message", bundle: { status: "ok" } });
    await fillBundle({ messageId: res.messageId });
    expect(byIds.calls).toHaveLength(1);
  });

  it("上线前入库、没有成员 ID 的：先按自己的 ID 拉回原始行取成员 ID", async () => {
    const c = await conversation();
    const res = await db().transaction((tx) => ingestMessage(tx, ctx.shop, bundleMessage(c.ext, null), null));
    // 模拟上线前的形状：payload 只有 platformType
    await db().update(schema.message).set({ payload: { platformType: "bundle_message" } }).where(eq(schema.message.id, res.messageId!));
    byIds.respond = (ids) => (ids[0] === BUNDLE_ID ? [{ message_id: BUNDLE_ID, message_type: "bundle_message", content: { type: 1, messages: MEMBER_IDS } }] : MEMBERS);
    const rec = await fillBundle({ messageId: res.messageId });
    expect(byIds.calls).toEqual([[BUNDLE_ID], MEMBER_IDS]);
    expect(rec).toMatchObject({ status: "ok", ids: MEMBER_IDS });
  });

  it("参数错这类重试也不会好的记 failed；超时、5xx 抛出由队列重试，状态仍是 pending", async () => {
    const c = await conversation();
    const res = await db().transaction((tx) => ingestMessage(tx, ctx.shop, bundleMessage(c.ext, MEMBER_IDS), null));
    byIds.respond = () => new PlatformError("shopee", "http_504", "gateway timeout", "server", 504);
    await expect(fillBundle({ messageId: res.messageId })).rejects.toThrow("gateway timeout");
    expect(((await load(res.messageId!)).payload as { bundle: FaqRecord }).bundle.status).toBe("pending");
    byIds.respond = () => new PlatformError("shopee", "param_error", "Error or loss in request parameter.", "param", 491);
    const rec = await fillBundle({ messageId: res.messageId });
    expect(rec).toMatchObject({ status: "failed", error: "Error or loss in request parameter." });
  });

  it("平台一条成员都没给时记 failed", async () => {
    const c = await conversation();
    const res = await db().transaction((tx) => ingestMessage(tx, ctx.shop, bundleMessage(c.ext, MEMBER_IDS), null));
    byIds.respond = () => [];
    expect(await fillBundle({ messageId: res.messageId })).toMatchObject({ status: "failed" });
  });

  it("飞书卡片：拉到的记录展开成买家与 Shopee AI 的逐条发言，买家原话带译文；没拉到的不展开", async () => {
    const c = await conversation();
    const res = await db().transaction((tx) => ingestMessage(tx, ctx.shop, bundleMessage(c.ext, MEMBER_IDS), null));
    await fillBundle({ messageId: res.messageId });
    const rows = await db().select().from(schema.message).where(eq(schema.message.conversationId, c.convId)).orderBy(schema.message.sentAt);
    const lines = expandFaq(rows).filter(meaningful);
    expect(lines.map((m) => [m.senderRole, (m.payload as { faqBot?: boolean } | null)?.faqBot ?? false, m.text, m.translation])).toEqual([
      ["buyer", false, "แชทกับเจ้าหน้าที่ของร้านค้า", null],
      ["platform_bot", true, "Welcome to OBSBOT.th", null],
      ["buyer", false, "แม่เหล็กมีขายแยกไหม", "磁铁单独卖吗？"],
      ["platform_bot", true, "Our team will check.", null],
    ]);
    const pending = { ...rows.find((r) => r.id === res.messageId)!, payload: { platformType: "bundle_message", bundle: { ids: MEMBER_IDS, status: "pending" } } };
    expect(expandFaq([pending]).filter(meaningful)).toHaveLength(0);
  });

  it("没有拉取中的记录时不等待", async () => {
    const c = await conversation();
    const started = Date.now();
    await waitForBundles(c.convId, 3000);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
