// 需要数据库：DATABASE_URL 未设置时跳过（set -a && . ./.env && set +a && pnpm exec vitest run src/server/dashboard）。
// 人工首响中位（DESIGN §3）只算工作时间内开始的会话段：看板与团队页（API-TEAM-001）用同一组样本。
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MemberContext } from "@/server/auth/context";

describe.skipIf(!process.env.DATABASE_URL)("人工首响中位：看板与团队页同口径", async () => {
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { dashboard } = await import("./service");
  const { listMembers } = await import("@/server/team/service");

  const userId = `test-${randomUUID()}`;
  let merchantId = "";
  let membershipId = "";
  let ctx: MemberContext;
  const ago = (sec: number) => new Date(Date.now() - sec * 1000);

  beforeAll(async () => {
    await db().insert(schema.user).values({ id: userId, name: "首响测试", email: `${userId}@test.invalid` });
    const { merchant, membership } = await db().transaction((tx) => provisionMerchant(tx, { name: "First Reply", timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantId = merchant.id;
    membershipId = membership.id;
    const [app] = await db()
      .insert(schema.platformApp)
      .values({ merchantId, platform: "shopee", appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), apiHost: "http://shopee.test", region: "sg", status: "verified" })
      .returning();
    const [shop] = await db()
      .insert(schema.shop)
      .values({ merchantId, platformAppId: app.id, platform: "shopee", externalShopId: "9001", name: "Shopee MY", market: "MY", capabilities: { chat: true, orders: true, piiMasked: false, productScope: true, cards: [], coupons: false, endSession: false, maxTextLength: 500 } })
      .returning();
    // 两段都由本人首个认领并回复：工作时间内开始的等 60 秒，工作时间外开始的等 100 秒
    for (const s of [
      { startSec: 120, replySec: 60, inHours: true },
      { startSec: 110, replySec: 10, inHours: false },
    ]) {
      const [conv] = await db()
        .insert(schema.conversation)
        .values({ merchantId, shopId: shop.id, platform: "shopee", externalConversationId: `c-${randomUUID()}`, buyerExternalId: "b", buyerName: "Buyer", handlingState: "human", claimedBy: membershipId })
        .returning();
      await db()
        .insert(schema.segment)
        .values({ merchantId, conversationId: conv.id, stage: "presale", startedAt: ago(s.startSec), firstBuyerAt: ago(s.startSec), firstHumanReplyAt: ago(s.replySec), firstReplyInHours: s.inHours, humanReplied: true, firstClaimedBy: membershipId });
    }
    ctx = { merchant, membership: { id: membershipId, role: "admin", status: "active" }, shopIds: null } as unknown as MemberContext;
  });

  afterAll(async () => {
    if (merchantId) await db().delete(schema.merchant).where(inArray(schema.merchant.id, [merchantId]));
    await db().delete(schema.user).where(inArray(schema.user.id, [userId]));
    await pool().end();
  });

  it("工作时间外开始的段不进首响样本，看板与团队页都是 60 秒", async () => {
    const d = await dashboard(ctx, "7d");
    expect(d.kpis).toMatchObject({ segments: 2, firstReplySamples: 1, firstReplyMedianSec: 60 });
    expect(d.people).toEqual([expect.objectContaining({ membershipId, segments: 2, firstReplyMedianSec: 60 })]);

    const t = await listMembers(ctx, { role: "all", status: "all", period: "week" });
    expect(t.stats.firstReplyMedianSec).toBe(60);
    expect(t.members.find((m) => m.membershipId === membershipId)?.handled).toMatchObject({ segments: 2, firstReplyMedianSec: 60 });
  });
});
