// 需要数据库：DATABASE_URL 未设置时跳过（set -a && . ./.env && set +a && pnpm exec vitest run src/server/products）。
// 商品卡信息：入库预取（去重、跳过新鲜缓存）、打开会话时当场补齐有时长上限、「获取中」与「取不到」分开返回。
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { enqueue, shopeeProduct } = vi.hoisted(() => ({ enqueue: vi.fn(async () => null), shopeeProduct: vi.fn() }));
vi.mock("@/server/jobs/boss", () => ({ enqueue }));
vi.mock("@/server/platforms/shopee", async (orig) => ({ ...(await orig<typeof import("@/server/platforms/shopee")>()), shopeeProduct }));

describe.skipIf(!process.env.DATABASE_URL)("商品卡信息", async () => {
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { PlatformError } = await import("@/server/platforms/types");
  const { backfillConversation } = await import("@/server/conversations/ingest");
  const { prefetchProducts, productCards } = await import("./info");

  type Shop = typeof schema.shop.$inferSelect;
  const userIds: string[] = [];
  const merchantIds: string[] = [];
  const shop = {} as { scoped: Shop; plain: Shop };
  const detail = (name: string) => ({ name, imageUrl: `https://img.test/${name}.jpg`, priceMin: "10.00", priceMax: null, currency: "MYR" });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const cached = (s: Shop, productId: string) =>
    db().select().from(schema.productInfo).where(and(eq(schema.productInfo.shopId, s.id), eq(schema.productInfo.externalProductId, productId)));
  const fetchCalls = () => (enqueue.mock.calls as unknown as Array<[string, { productId: string }, { singletonKey: string; singletonSeconds: number }]>).filter((c) => c[0] === "product.fetch");

  async function newShop(merchantId: string, appId: string, productScope: boolean): Promise<Shop> {
    const [s] = await db()
      .insert(schema.shop)
      .values({
        merchantId,
        platformAppId: appId,
        platform: "shopee",
        externalShopId: productScope ? "9001" : "9002",
        name: productScope ? "有商品权限" : "无商品权限",
        market: "MY",
        accessTokenEnc: encrypt("token"),
        refreshTokenEnc: encrypt("refresh"),
        accessExpiresAt: new Date(Date.now() + 86_400_000),
        capabilities: { chat: true, orders: true, piiMasked: false, productScope, cards: [], coupons: false, endSession: false, maxTextLength: 500 },
      })
      .returning();
    return s;
  }

  beforeAll(async () => {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: "Product", email: `${userId}@test.invalid` });
    userIds.push(userId);
    const { merchant } = await db().transaction((tx) => provisionMerchant(tx, { name: "Product", timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantIds.push(merchant.id);
    const [app] = await db()
      .insert(schema.platformApp)
      .values({ merchantId: merchant.id, platform: "shopee", appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), apiHost: "http://shopee.test", region: "sg", status: "verified" })
      .returning();
    shop.scoped = await newShop(merchant.id, app.id, true);
    shop.plain = await newShop(merchant.id, app.id, false);
    await db()
      .insert(schema.order)
      .values({
        merchantId: merchant.id,
        shopId: shop.plain.id,
        platform: "shopee",
        externalOrderId: "o-1",
        platformStatus: "COMPLETED",
        statusGroup: "completed",
        totalAmount: "20.00",
        currency: "MYR",
        items: [{ name: "订单里的商品", productId: "ordered", qty: 2, unitPrice: "10.00", image: "https://img.test/ordered.jpg" }],
        platformCreatedAt: new Date(),
      });
  });

  beforeEach(() => {
    enqueue.mockClear();
    shopeeProduct.mockReset();
  });

  afterAll(async () => {
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
  });

  it("入库预取：同一商品只排一次，跳过新鲜缓存，过期的重排", async () => {
    const s = shop.plain;
    await db()
      .insert(schema.productInfo)
      .values([
        { merchantId: s.merchantId, shopId: s.id, externalProductId: "fresh", status: "ok", name: "新鲜", fetchedAt: new Date() },
        { merchantId: s.merchantId, shopId: s.id, externalProductId: "stale", status: "ok", name: "过期", fetchedAt: new Date(Date.now() - 2 * 86_400_000) },
      ]);
    expect(await prefetchProducts(s.id, ["fresh", "stale", "new", "new", ""])).toBe(2);
    expect(fetchCalls().map((c) => c[1].productId)).toEqual(["stale", "new"]);
    expect(fetchCalls()[0][2]).toEqual({ singletonKey: `${s.id}:stale`, singletonSeconds: 60 });
  });

  it("历史回补落库时预取会话里的商品卡，重复的商品只排一次", async () => {
    const msg = (id: string, productId: string) => ({
      externalMessageId: id,
      externalConversationId: `c-${randomUUID()}`,
      buyerExternalId: "b1",
      buyerName: "Buyer",
      fromBuyer: true,
      senderRole: "buyer" as const,
      type: "product_card" as const,
      text: null,
      translation: null,
      payload: { productId },
      sentAt: new Date(),
      affiliate: false,
      raw: null,
    });
    const conv = { externalConversationId: `c-${randomUUID()}`, buyerExternalId: "b1", buyerName: "Buyer", affiliate: false };
    const a = msg(randomUUID(), "card-1");
    const b = msg(randomUUID(), "card-1");
    await db().transaction((tx) => backfillConversation(tx, shop.plain, conv, [{ ...a, externalConversationId: conv.externalConversationId }, { ...b, externalConversationId: conv.externalConversationId }]));
    expect(fetchCalls().map((c) => c[1].productId)).toEqual(["card-1"]);
  });

  it("没有商品权限的店当场从订单补齐：订单里有的返回名称图片，没有的返回取不到", async () => {
    const r = await productCards(shop.plain, ["ordered", "never"]);
    expect(r.ordered).toMatchObject({ state: "ok", name: "订单里的商品", imageUrl: "https://img.test/ordered.jpg", priceMin: "10.00" });
    expect(r.never).toMatchObject({ state: "unavailable", name: null, url: expect.stringContaining("/never") });
    expect(fetchCalls()).toHaveLength(0);
  });

  it("调平台的商品最多等预算时长：等到的直接返回，没等到的返回获取中并排队，取完后写进缓存", async () => {
    shopeeProduct.mockImplementation(async (_app: unknown, _auth: unknown, id: string) => {
      if (id === "slow") await sleep(800);
      return detail(id);
    });
    const started = Date.now();
    const r = await productCards(shop.scoped, ["fast", "slow"], 200);
    expect(Date.now() - started).toBeLessThan(600);
    expect(r.fast).toMatchObject({ state: "ok", name: "fast", imageUrl: "https://img.test/fast.jpg" });
    expect(r.slow).toMatchObject({ state: "loading", name: null });
    expect(fetchCalls().map((c) => c[1].productId)).toEqual(["slow"]);

    await sleep(900);
    const again = await productCards(shop.scoped, ["slow"], 200);
    expect(again.slow).toMatchObject({ state: "ok", name: "slow" });
    expect(shopeeProduct).toHaveBeenCalledTimes(2);
  });

  it("平台临时出错时这次返回取不到、不写缓存，60 秒内的轮询不再重复调平台", async () => {
    shopeeProduct.mockRejectedValue(new PlatformError("shopee", "error_server", "boom", "server", 500));
    const r = await productCards(shop.scoped, ["flaky"]);
    expect(r.flaky.state).toBe("unavailable");
    const again = await productCards(shop.scoped, ["flaky"]);
    expect(again.flaky.state).toBe("unavailable");
    expect(shopeeProduct).toHaveBeenCalledTimes(1);
    expect(await cached(shop.scoped, "flaky")).toHaveLength(0);
  });

  it("平台说商品不存在时改从订单借用，订单里也没有就记为取不到", async () => {
    shopeeProduct.mockRejectedValue(new PlatformError("shopee", "error_item_not_found", "not found", "not_found"));
    const r = await productCards(shop.scoped, ["gone"]);
    expect(r.gone.state).toBe("unavailable");
    expect((await cached(shop.scoped, "gone"))[0]).toMatchObject({ status: "unavailable" });
  });
});
