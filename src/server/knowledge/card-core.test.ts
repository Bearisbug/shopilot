// 经验卡地基：卡内容校验、载荷与用卡解析（不需要数据库）；写卡与版本、候选卡检索、模拟出稿与测试问答带卡（需要数据库）。
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { zCardContent, type CardContent } from "@/contracts/cards";
import { can, permissionsFor, type Role } from "@/lib/permissions";
import { parseModelOutput } from "@/server/ai/draft";
import { cardUsed, type CardOutcome } from "./card-retrieve";

const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn<(...args: unknown[]) => Promise<null>>(async () => null) }));
vi.mock("@/server/jobs/boss", () => ({ enqueue }));

const card = (over: Partial<CardContent> = {}): CardContent => ({
  title: "摄像头接上电脑后软件识别不到：帮买家恢复使用",
  productIds: [],
  stage: "aftersale",
  markets: ["ALL"],
  tags: [],
  conditions: ["买家说设备已接上电脑", "电脑或配套软件找不到设备"],
  conditionMode: "all",
  steps: [
    { text: "问清电脑系统和连接方式", branches: [{ when: "急用", action: "handoff" }] },
    { text: "换线、换接口", branches: [] },
    { text: "安装或更新配套软件", branches: [{ when: "保修", action: "ticket" }] },
  ],
  tips: "每次只让买家做一步",
  qaIds: [],
  ...over,
});

describe("卡内容校验", () => {
  it("至少一条调用条件、一个步骤；跳转要指向本卡的另一步", () => {
    expect(zCardContent.safeParse(card()).success).toBe(true);
    expect(zCardContent.safeParse(card({ conditions: [] })).success).toBe(false);
    expect(zCardContent.safeParse(card({ steps: [] })).success).toBe(false);
    const selfJump = card({ steps: [{ text: "一", branches: [{ when: "x", action: "goto", goto: 1 }] }, { text: "二", branches: [] }] });
    expect(zCardContent.safeParse(selfJump).error?.issues[0].path).toEqual(["steps", 0, "branches", 0, "goto"]);
    expect(zCardContent.safeParse(card({ steps: [{ text: "一", branches: [{ when: "x", action: "goto", goto: 2 }] }, { text: "二", branches: [] }] })).success).toBe(true);
    expect(zCardContent.parse({ ...card(), tips: "  " }).tips).toBeNull();
  });
});

describe("模型用卡的解析", () => {
  const outcome = { candidates: [{ key: "K1", cardId: "c1", version: 3, content: card(), distance: 0.2, active: false }] } as unknown as CardOutcome;

  it("编号不在候选里当没用卡；步号夹在 1 到最后一步；动作不认识按继续；只有建工单带说明", () => {
    const p = parseModelOutput({ reply: "好", confidence: 0.9, card: { id: "K1", step: 9, reason: "条件都成立", action: "ticket", ticket_summary: "换货" } });
    expect(cardUsed(outcome, p.card)).toEqual({ cardId: "c1", version: 3, title: card().title, step: 3, action: "ticket", reason: "条件都成立", ticketSummary: "换货" });
    expect(cardUsed(outcome, parseModelOutput({ card: { id: "K9", step: 1 } }).card)).toBeNull();
    expect(parseModelOutput({ card: { id: "K1", step: 1, action: "jump", ticket_summary: "x" } }).card).toEqual({ key: "K1", step: 1, reason: "", action: "continue", ticketSummary: null });
    expect(parseModelOutput({ card: null }).card).toBeNull();
    expect(parseModelOutput({ card: { id: "K1", step: 0 } }).card).toBeNull();
  });
});

describe.skipIf(!process.env.DATABASE_URL)("经验卡地基（需要数据库）", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "shopilot-card-test-"));
  process.env.DATA_DIR = dataDir;
  process.env.KNOWLEDGE_MODE = "stub";
  process.env.AI_MODE = "stub";
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const store = await import("./card-store");
  const { retrieveCards, PROPOSAL_CARD_ID } = await import("./card-retrieve");
  const { stubVector } = await import("./embed");
  const { simulateDraft } = await import("@/server/ai/simulate");
  const { askKnowledge } = await import("./ask");
  type MemberContext = import("@/server/auth/context").MemberContext;

  const userIds: string[] = [];
  const merchantIds: string[] = [];
  let ctx: MemberContext;
  let shopId = "";
  let savedAiStub: typeof schema.devAiStub.$inferSelect | undefined;

  beforeAll(async () => {
    [savedAiStub] = await db().select().from(schema.devAiStub).where(eq(schema.devAiStub.id, 1));
    await db().insert(schema.devAiStub).values({ id: 1, next: "normal", sticky: false }).onConflictDoUpdate({ target: schema.devAiStub.id, set: { next: "normal", sticky: false } });
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: "卡测试", email: `${userId}@test.invalid` });
    userIds.push(userId);
    const res = await db().transaction((tx) => provisionMerchant(tx, { name: "卡测试", timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantIds.push(res.merchant.id);
    const role: Role = "admin";
    ctx = {
      requestId: "req_test",
      ip: "127.0.0.1",
      userAgent: null,
      user: { id: userId, name: "卡测试", email: `${userId}@test.invalid`, twoFactorEnabled: false },
      session: { id: "s", createdAt: new Date() },
      merchant: res.merchant,
      membership: { id: res.membership.id, role, status: "active" },
      isOwner: true,
      shopIds: null,
      twoFactorRequired: false,
      actor: { kind: "member", merchantId: res.merchant.id, membershipId: res.membership.id, userId, name: "卡测试", requestId: "req_test" },
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
  });

  afterAll(async () => {
    const restoreAi = savedAiStub ? { next: savedAiStub.next, sticky: savedAiStub.sticky, lastRequest: savedAiStub.lastRequest } : { next: "normal" as const, sticky: false, lastRequest: null };
    await db().insert(schema.devAiStub).values({ id: 1, ...restoreAi }).onConflictDoUpdate({ target: schema.devAiStub.id, set: restoreAi });
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
    await rm(dataDir, { recursive: true, force: true });
  });

  const writeCard = async (content: CardContent) => db().transaction(async (tx) => store.insertCard(tx, { merchantId: ctx.merchant.id, content, author: { kind: "member", memberId: ctx.membership.id }, vec: await store.tryEmbedCard(content) }));

  it("建卡写第 1 版并向量化；写新版本递增、Agent 写的标还没人看过、旧版本号 409；标题条件不变不重算向量", async () => {
    const row = await writeCard(card());
    expect(row).toMatchObject({ version: 1, status: "published", source: "member", agentUnseen: false });
    const expected = stubVector(store.cardEmbedText(card()));
    expect(row.embedding?.every((x, i) => Math.abs(x - expected[i]) < 1e-6)).toBe(true);
    const changed = card({ tips: "先安抚" });
    expect(store.needsEmbed(row, changed)).toBe(false);
    expect(store.needsEmbed(row, card({ conditions: ["买家说连不上"] }))).toBe(true);
    const v2 = await db().transaction((tx) => store.writeCardVersion(tx, { row, content: changed, author: { kind: "agent" }, note: "补沟通提示" }));
    expect(v2).toMatchObject({ version: 2, agentUnseen: true, tips: "先安抚", updatedBy: null });
    await expect(db().transaction((tx) => store.writeCardVersion(tx, { row, content: changed, author: { kind: "member", memberId: ctx.membership.id } }))).rejects.toMatchObject({ code: "version_conflict" });
    const v3 = await db().transaction((tx) => store.writeCardVersion(tx, { row: v2, content: card(), author: { kind: "member", memberId: ctx.membership.id }, note: "回退到第 1 版" }));
    expect(v3.agentUnseen).toBe(false);
    const versions = await db().select().from(schema.experienceCardVersion).where(eq(schema.experienceCardVersion.cardId, row.id));
    expect(versions.map((v) => [v.version, v.author, v.note]).sort()).toEqual([
      [1, "member", null],
      [2, "agent", "补沟通提示"],
      [3, "member", "回退到第 1 版"],
    ]);
  });

  it("候选卡：按站点与阶段过滤、取最近的 3 张；正在用的卡一定带上；拟发布的新卡排第一、编号 K1", async () => {
    const th = await writeCard(card({ title: "泰国站专用：摄像头识别不到", markets: ["TH"] }));
    const presale = await writeCard(card({ title: "售前：问摄像头兼容哪些电脑", stage: "presale" }));
    const q = "摄像头接上电脑后软件识别不到";
    const vectors = [{ route: "original" as const, vec: stubVector(q) }];
    const base = { merchantId: ctx.merchant.id, market: "MY", stage: "aftersale", productIds: [], vectors };
    const r = await retrieveCards(base);
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates.map((x) => x.cardId)).not.toContain(th.id);
    expect(r.candidates.map((x) => x.cardId)).not.toContain(presale.id);
    expect(r.candidates.map((x) => x.key)).toEqual(r.candidates.map((_, i) => `K${i + 1}`));

    const withActive = await retrieveCards({ ...base, market: "TH", vectors: [], active: { cardId: th.id, step: 2 } });
    expect(withActive.candidates).toMatchObject([{ cardId: th.id, active: true }]);
    expect(withActive.activeStep).toBe(2);

    const proposal = await retrieveCards({ ...base, override: { content: card({ title: "拟发布：换货流程" }) } });
    expect(proposal.candidates[0]).toMatchObject({ key: "K1", cardId: PROPOSAL_CARD_ID, version: 0 });
    expect(proposal.candidates[0].content.title).toBe("拟发布：换货流程");
  });

  it("模拟出稿：拟发布的新卡被用到；买家说「急用」时按第 1 步的分支转人工；不写草稿", async () => {
    const conversation = [{ from: "buyer", type: "text", text: "摄像头接上电脑后识别不到，我急用", at: "2026-10-21 10:00" }];
    const before = await db().select().from(schema.draft).where(eq(schema.draft.merchantId, ctx.merchant.id));
    const r = await simulateDraft({ merchantId: ctx.merchant.id, shopId, stage: "aftersale", productIds: [], conversation, question: conversation[0].text, override: { content: card({ title: "拟发布：识别不到" }) } });
    expect(r.card).toMatchObject({ cardId: PROPOSAL_CARD_ID, title: "拟发布：识别不到", step: 1, action: "handoff" });
    expect(r).toMatchObject({ handoff: true, handoffReason: "card" });
    expect(await db().select().from(schema.draft).where(eq(schema.draft.merchantId, ctx.merchant.id))).toHaveLength(before.length);
  });

  it("测试问答带未保存的卡：结果里有用到的卡；改已有卡时用卡的 ID", async () => {
    const r = await askKnowledge(ctx, { question: "摄像头接上电脑后软件识别不到", stage: "aftersale", card: card({ title: "写卡时测试" }) });
    expect(r.card).toMatchObject({ cardId: PROPOSAL_CARD_ID, title: "写卡时测试", step: 1, action: "continue" });
    const existing = await writeCard(card({ title: "已有卡" }));
    const r2 = await askKnowledge(ctx, { question: "摄像头接上电脑后软件识别不到", stage: "aftersale", card: card({ title: "已有卡（改）" }), cardId: existing.id });
    expect(r2.card).toMatchObject({ cardId: existing.id, title: "已有卡（改）" });
  });
});
