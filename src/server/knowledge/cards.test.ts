// 经验卡管理（API-KB-029 至 API-KB-037）：建卡、列表筛选与未看数、改卡与版本冲突、回退、标为已看、下架与恢复、近 30 天效果、删除、补向量（需要数据库）。
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CardContent } from "@/contracts/cards";
import { can, permissionsFor, type Role } from "@/lib/permissions";

const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn<(...args: unknown[]) => Promise<null>>(async () => null) }));
vi.mock("@/server/jobs/boss", () => ({ enqueue }));

const card = (over: Partial<CardContent> = {}): CardContent => ({
  title: "摄像头接上电脑后软件识别不到",
  productIds: [],
  stage: "aftersale",
  markets: ["ALL"],
  tags: [],
  conditions: ["买家说设备已接上电脑", "电脑或配套软件找不到设备"],
  conditionMode: "all",
  steps: [
    { text: "问清电脑系统和连接方式", branches: [{ when: "急用", action: "handoff" }] },
    { text: "换线、换接口", branches: [] },
  ],
  tips: null,
  qaIds: [],
  ...over,
});

describe.skipIf(!process.env.DATABASE_URL)("经验卡管理（需要数据库）", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "shopilot-cards-test-"));
  process.env.DATA_DIR = dataDir;
  process.env.KNOWLEDGE_MODE = "stub";
  process.env.AI_MODE = "stub";
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { Problem } = await import("@/server/http/problem");
  const cards = await import("./cards");
  const store = await import("./card-store");
  const { retrieveCards } = await import("./card-retrieve");
  const { stubVector } = await import("./embed");
  type MemberContext = import("@/server/auth/context").MemberContext;

  const userIds: string[] = [];
  const merchantIds: string[] = [];
  let ctx: MemberContext;
  let shopId = "";
  let conversationId = "";

  async function problemOf(p: Promise<unknown>): Promise<InstanceType<typeof Problem>> {
    try {
      await p;
    } catch (e) {
      if (e instanceof Problem) return e;
      throw e;
    }
    throw new Error("没有抛出 Problem");
  }

  beforeAll(async () => {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: "卡管理测试", email: `${userId}@test.invalid` });
    userIds.push(userId);
    const res = await db().transaction((tx) => provisionMerchant(tx, { name: "卡管理测试", timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantIds.push(res.merchant.id);
    const role: Role = "admin";
    ctx = {
      requestId: "req_test",
      ip: "127.0.0.1",
      userAgent: null,
      user: { id: userId, name: "卡管理测试", email: `${userId}@test.invalid`, twoFactorEnabled: false },
      session: { id: "s", createdAt: new Date() },
      merchant: res.merchant,
      membership: { id: res.membership.id, role, status: "active" },
      isOwner: true,
      shopIds: null,
      twoFactorRequired: false,
      actor: { kind: "member", merchantId: res.merchant.id, membershipId: res.membership.id, userId, name: "卡管理测试", requestId: "req_test" },
      can: (p) => can(role, true, p),
      permissions: permissionsFor(role, true),
    };
    const [app] = await db()
      .insert(schema.platformApp)
      .values({ merchantId: ctx.merchant.id, platform: "tiktok", appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), region: "sg", status: "verified" })
      .returning();
    const caps = { chat: true, orders: true, piiMasked: false, productScope: true, cards: [], coupons: false, endSession: false, maxTextLength: 500 };
    const [shop] = await db()
      .insert(schema.shop)
      .values({ merchantId: ctx.merchant.id, platformAppId: app.id, platform: "tiktok", externalShopId: `s-${randomUUID()}`, shopCipher: "c", name: "TikTok MY", market: "MY", accessTokenEnc: encrypt("t"), refreshTokenEnc: encrypt("r"), accessExpiresAt: new Date(Date.now() + 86_400_000), capabilities: caps })
      .returning();
    shopId = shop.id;
    const [conv] = await db()
      .insert(schema.conversation)
      .values({ merchantId: ctx.merchant.id, shopId, platform: "tiktok", externalConversationId: `c-${randomUUID()}`, buyerExternalId: "b1", buyerName: "Buyer", handlingState: "human" })
      .returning();
    conversationId = conv.id;
  });

  afterAll(async () => {
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("建卡即发布、第 1 版；列表按阶段、通用产品、关键字筛选；改卡写第 2 版、旧版本号 409、内容没变不写新版本", async () => {
    const a = await cards.createCard(ctx, card());
    expect(a.card).toMatchObject({ status: "published", source: "member", version: 1, agentUnseen: false, embedded: true, lastAuthor: "member", createdByName: "卡管理测试" });
    await cards.createCard(ctx, card({ title: "售前：问兼容哪些电脑", stage: "presale", conditions: ["买家问兼容性"] }));

    expect((await cards.listCards(ctx, { limit: 30 })).counts).toEqual({ published: 2, archived: 0 });
    expect((await cards.listCards(ctx, { stage: "presale", limit: 30 })).items.map((x) => x.title)).toEqual(["售前：问兼容哪些电脑"]);
    expect((await cards.listCards(ctx, { productId: "none", limit: 30 })).items).toHaveLength(2);
    expect((await cards.listCards(ctx, { q: "配套软件", limit: 30 })).items.map((x) => x.id)).toEqual([a.card.id]);

    const same = await cards.updateCard(ctx, a.card.id, { version: 1, card: card() });
    expect(same.card.version).toBe(1);
    const b = await cards.updateCard(ctx, a.card.id, { version: 1, card: card({ tips: "每次只让买家做一步" }) });
    expect(b.card).toMatchObject({ version: 2, tips: "每次只让买家做一步" });
    const stale = await problemOf(cards.updateCard(ctx, a.card.id, { version: 1, card: card({ tips: "x" }) }));
    expect(stale).toMatchObject({ status: 409, code: "version_conflict" });
    const detail = await cards.getCard(ctx, a.card.id);
    expect(detail.versions.map((x) => [x.version, x.author, x.memberName])).toEqual([
      [2, "member", "卡管理测试"],
      [1, "member", "卡管理测试"],
    ]);
  });

  it("Agent 改过的卡算进未看数并能筛出；标为已看清掉标记、记看过的人；回退写新版本、清标记、内容回到旧版", async () => {
    const { card: a } = await cards.createCard(ctx, card({ title: "换货流程", conditions: ["买家要换货"] }));
    const row = await cards.loadCard(ctx.merchant.id, a.id);
    const agentRow = await db().transaction((tx) => store.writeCardVersion(tx, { row, content: card({ title: "换货流程", conditions: ["买家要换货"], tips: "Agent 补的提示" }), author: { kind: "agent" }, note: "补沟通提示" }));
    const list = await cards.listCards(ctx, { unseen: "1", limit: 30 });
    expect(list.items.map((x) => x.id)).toEqual([a.id]);
    expect(list.unseenCount).toBe(1);
    expect(list.items[0]).toMatchObject({ agentUnseen: true, lastAuthor: "agent", version: 2 });

    const seen = await cards.markCardSeen(ctx, a.id, agentRow.version);
    expect(seen.card.agentUnseen).toBe(false);
    expect((await cards.listCards(ctx, { limit: 30 })).unseenCount).toBe(0);
    const v2 = (await cards.getCard(ctx, a.id)).versions.find((x) => x.version === 2);
    expect(v2).toMatchObject({ author: "agent", note: "补沟通提示", seenByName: "卡管理测试" });

    // 再来一次 Agent 改动，直接回退到第 1 版
    const row2 = await cards.loadCard(ctx.merchant.id, a.id);
    await db().transaction((tx) => store.writeCardVersion(tx, { row: row2, content: card({ title: "换货流程", conditions: ["买家要换货"], tips: "第二次" }), author: { kind: "agent" } }));
    expect((await problemOf(cards.rollbackCard(ctx, a.id, { version: 3, toVersion: 3 }))).status).toBe(422);
    const back = await cards.rollbackCard(ctx, a.id, { version: 3, toVersion: 1 });
    expect(back.card).toMatchObject({ version: 4, agentUnseen: false, tips: null });
    const v4 = (await cards.getCard(ctx, a.id)).versions[0];
    expect(v4).toMatchObject({ version: 4, author: "member", note: "回退到第 1 版" });
  });

  it("下架后出稿检索取不到，恢复后又能取到；下架不写版本", async () => {
    const { card: a } = await cards.createCard(ctx, card({ title: "物流停滞怎么办", conditions: ["物流三天没更新"], stage: "insale" }));
    const vectors = [{ route: "original" as const, vec: stubVector("物流三天没更新") }];
    const found = async () => (await retrieveCards({ merchantId: ctx.merchant.id, market: "MY", stage: "insale", productIds: [], vectors })).candidates.map((x) => x.cardId);
    expect(await found()).toContain(a.id);
    const archived = await cards.archiveCard(ctx, a.id, 1);
    expect(archived.card).toMatchObject({ status: "archived", version: 1 });
    expect(await found()).not.toContain(a.id);
    expect((await problemOf(cards.archiveCard(ctx, a.id, 1))).code).toBe("invalid_state");
    await cards.restoreCard(ctx, a.id, 1);
    expect(await found()).toContain(a.id);
    expect((await cards.getCard(ctx, a.id)).versions).toHaveLength(1);
  });

  it("近 30 天效果：辅助模式草稿的处置、按卡转人工与建工单（含只写审计的转人工）、影子回复对比；30 天前的不算", async () => {
    const { card: a } = await cards.createCard(ctx, card({ title: "统计用卡", conditions: ["统计"] }));
    const base = { merchantId: ctx.merchant.id, conversationId, confidence: 0.9, model: "stub", latencyMs: 1, text: "好", cardId: a.id };
    const info = (action: "continue" | "handoff" | "ticket") => ({ version: 1, title: "统计用卡", step: 1, action, reason: "", ticketSummary: null });
    const [, , , shadow] = await db()
      .insert(schema.draft)
      .values([
        { ...base, mode: "assist", status: "sent", card: info("continue") },
        { ...base, mode: "assist", status: "edited_sent", card: info("continue") },
        { ...base, mode: "assist", status: "ignored", card: info("ticket") },
        { ...base, mode: "shadow", status: "shadow", card: info("handoff") },
        { ...base, mode: "assist", status: "sent", card: info("continue"), createdAt: new Date(Date.now() - 40 * 86400_000) },
      ])
      .returning();
    await db().insert(schema.draftReview).values({ merchantId: ctx.merchant.id, draftId: shadow.id, conversationId, kind: "shadow", draftStatus: "shadow", humanText: "好的", editClass: "polish", consistency: "same", model: "stub" });
    // 辅助、自动模式按卡转人工不存草稿，只写 handoff 审计：计入调用与转人工；别的原因、别的卡、30 天前的不算
    const handoff = (data: Record<string, unknown>, createdAt = new Date()) => ({ merchantId: ctx.merchant.id, actorSource: "system" as const, module: "workbench" as const, action: "handoff", summary: "转人工", targetType: "conversation", targetId: conversationId, data, createdAt });
    await db()
      .insert(schema.auditLog)
      .values([
        handoff({ reason: "card", mode: "assist", card_id: a.id, card_step: 1, card_action: "handoff" }),
        handoff({ reason: "card", mode: "auto", card_id: a.id, card_step: 2, card_action: "handoff" }),
        handoff({ reason: "low_confidence", mode: "assist" }),
        handoff({ reason: "card", mode: "assist", card_id: randomUUID() }),
        handoff({ reason: "card", mode: "assist", card_id: a.id }, new Date(Date.now() - 40 * 86400_000)),
      ]);
    const stats = (await cards.getCard(ctx, a.id)).card.stats;
    expect(stats).toEqual({ calls: 6, sent: 1, edited: 1, ignored: 1, handoffs: 4, shadowSame: 1, shadowPartial: 0, shadowDifferent: 0 });
  });

  it("删除：卡与版本一起删，草稿里的卡快照保留、卡 ID 置空；再删 404", async () => {
    const { card: a } = await cards.createCard(ctx, card({ title: "要删的卡", conditions: ["删"] }));
    const [d] = await db()
      .insert(schema.draft)
      .values({ merchantId: ctx.merchant.id, conversationId, mode: "assist", status: "sent", confidence: 0.9, model: "stub", latencyMs: 1, text: "好", cardId: a.id, card: { version: 1, title: "要删的卡", step: 1, action: "continue", reason: "", ticketSummary: null } })
      .returning();
    await cards.deleteCard(ctx, a.id);
    expect((await problemOf(cards.getCard(ctx, a.id))).status).toBe(404);
    expect(await db().select().from(schema.experienceCardVersion).where(eq(schema.experienceCardVersion.cardId, a.id))).toHaveLength(0);
    const [after] = await db().select().from(schema.draft).where(eq(schema.draft.id, d.id));
    expect(after).toMatchObject({ cardId: null, card: { title: "要删的卡" } });
    expect((await problemOf(cards.deleteCard(ctx, a.id))).status).toBe(404);
  });

  it("补向量：已发布卡的空向量由后台补上，已下架的不补", async () => {
    const { card: a } = await cards.createCard(ctx, card({ title: "补向量的卡", conditions: ["补向量"] }));
    const { card: b } = await cards.createCard(ctx, card({ title: "下架的卡", conditions: ["下架"] }));
    await cards.archiveCard(ctx, b.id, 1);
    await db()
      .update(schema.experienceCard)
      .set({ embedding: null, embeddingModel: null })
      .where(inArray(schema.experienceCard.id, [a.id, b.id]));
    const r = await cards.embedMissingCards();
    expect(r.embedded).toBeGreaterThanOrEqual(1);
    const rows = await db().select().from(schema.experienceCard).where(inArray(schema.experienceCard.id, [a.id, b.id]));
    expect(rows.find((x) => x.id === a.id)?.embedding).not.toBeNull();
    expect(rows.find((x) => x.id === b.id)?.embedding).toBeNull();
  });
});
