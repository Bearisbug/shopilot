// 需要数据库：DATABASE_URL 未设置时跳过（set -a && . ./.env && set +a && pnpm exec vitest run src/server/ai/draft-card.test.ts）。
// 出稿按经验卡推进（REQ-KB-012）：草稿记下卡与第几步，同段下一份从这一步接着走；分支转人工（原因 card）、建工单（辅助照常出稿，
// 自动先发回复再建「内部确认」工单并转人工）；影子只记录；下架的卡不进候选；没有卡时与原来一样。
// 造的商户、账号在 afterAll 删除，AI 替身设定恢复原值；队列投递被替换；自动模式发消息用替换的 fetch。
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardContent } from "@/contracts/cards";

const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn<(...args: unknown[]) => Promise<null>>(async () => null) }));
vi.mock("@/server/jobs/boss", () => ({ enqueue }));
// 出稿请求按调用截获（替身把「最后一次请求」存在共用的一行里）
const { draftRequests } = vi.hoisted(() => ({ draftRequests: [] as Array<Array<{ role: string; content: string }>> }));
vi.mock("@/server/ai/client", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/server/ai/client")>();
  return {
    ...m,
    chat: vi.fn(async (...args: Parameters<typeof m.chat>) => {
      if (args[0] === "draft") draftRequests.push(args[1] as Array<{ role: string; content: string }>);
      return m.chat(...args);
    }),
  };
});

const card = (title: string, over: Partial<CardContent> = {}): CardContent => ({
  title,
  productIds: [],
  stage: "any",
  markets: ["ALL"],
  tags: [],
  conditions: ["买家说摄像头接上电脑后识别不到"],
  conditionMode: "all",
  steps: [
    { text: "问清电脑系统和连接方式", branches: [{ when: "急用", action: "handoff" }] },
    { text: "换线、换接口", branches: [] },
    { text: "安装或更新配套软件", branches: [] },
  ],
  tips: null,
  qaIds: [],
  ...over,
});

describe.skipIf(!process.env.DATABASE_URL)("出稿按经验卡推进（需要数据库）", async () => {
  process.env.AI_MODE = "stub";
  process.env.KNOWLEDGE_MODE = "stub";
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { generateDraft } = await import("./draft");
  const store = await import("@/server/knowledge/card-store");
  type Conv = typeof schema.conversation.$inferSelect;

  const userIds: string[] = [];
  const merchantIds: string[] = [];
  let savedAiStub: typeof schema.devAiStub.$inferSelect | undefined;
  let merchantId = "";
  let shopId = "";

  beforeAll(async () => {
    [savedAiStub] = await db().select().from(schema.devAiStub).where(eq(schema.devAiStub.id, 1));
    await db().insert(schema.devAiStub).values({ id: 1, next: "normal", sticky: false }).onConflictDoUpdate({ target: schema.devAiStub.id, set: { next: "normal", sticky: false } });
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: "用卡测试管理员", email: `${userId}@test.invalid` });
    userIds.push(userId);
    const { merchant } = await db().transaction((tx) => provisionMerchant(tx, { name: "用卡测试", timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantIds.push(merchant.id);
    merchantId = merchant.id;
    const [app] = await db()
      .insert(schema.platformApp)
      .values({ merchantId, platform: "shopee", appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), apiHost: "http://shopee.test", region: "sg", status: "verified" })
      .returning();
    const caps = { chat: true, orders: true, piiMasked: false, productScope: false, cards: [], coupons: false, endSession: false, maxTextLength: 500 };
    const [shop] = await db()
      .insert(schema.shop)
      .values({ merchantId, platformAppId: app.id, platform: "shopee", externalShopId: "9001", name: "马来店", market: "MY", accessTokenEnc: encrypt("t"), refreshTokenEnc: encrypt("r"), accessExpiresAt: new Date(Date.now() + 86_400_000), capabilities: caps })
      .returning();
    shopId = shop.id;
  });

  beforeEach(async () => {
    enqueue.mockClear();
    // 每个用例只留自己建的卡：之前的一律下架
    await db().update(schema.experienceCard).set({ status: "archived" }).where(eq(schema.experienceCard.merchantId, merchantId));
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    const restore = savedAiStub ? { next: savedAiStub.next, sticky: savedAiStub.sticky, lastRequest: savedAiStub.lastRequest } : { next: "normal" as const, sticky: false, lastRequest: null };
    await db().insert(schema.devAiStub).values({ id: 1, ...restore }).onConflictDoUpdate({ target: schema.devAiStub.id, set: restore });
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
  });

  const writeCard = async (content: CardContent) => db().transaction(async (tx) => store.insertCard(tx, { merchantId, content, author: { kind: "agent" }, vec: await store.tryEmbedCard(content) }));

  async function conversation(state: "bot" | "awaiting_human"): Promise<Conv> {
    const [conv] = await db()
      .insert(schema.conversation)
      .values({ merchantId, shopId, platform: "shopee", externalConversationId: `c-${randomUUID()}`, buyerExternalId: "123", buyerName: "Aisyah", handlingState: state, handoffReason: state === "awaiting_human" ? "shadow" : null, lastBuyerAt: new Date() })
      .returning();
    const [seg] = await db().insert(schema.segment).values({ merchantId, conversationId: conv.id, stage: "aftersale", startedAt: new Date() }).returning();
    await db().update(schema.conversation).set({ currentSegmentId: seg.id }).where(eq(schema.conversation.id, conv.id));
    return { ...conv, currentSegmentId: seg.id };
  }

  /** 买家文字，10 秒前到达（已过 6 秒防抖） */
  async function buyer(conv: Conv, text: string) {
    const at = new Date(Date.now() - 10_000);
    await db().insert(schema.message).values({ merchantId, conversationId: conv.id, segmentId: conv.currentSegmentId, direction: "in", senderRole: "buyer", type: "text", text, payload: {}, sentAt: at, createdAt: at });
  }

  const drafts = (conv: Conv) => db().select().from(schema.draft).where(eq(schema.draft.conversationId, conv.id)).orderBy(schema.draft.createdAt);
  const lastPayload = () => JSON.parse(draftRequests.at(-1)?.find((m) => m.role === "user")?.content ?? "{}") as Record<string, unknown>;
  const convOf = async (conv: Conv) => (await db().select().from(schema.conversation).where(eq(schema.conversation.id, conv.id)))[0];

  it("没有已发布的卡：载荷不带 cards，草稿 card 为空，照常出稿", async () => {
    const conv = await conversation("bot");
    await buyer(conv, "摄像头接上电脑后识别不到");
    await generateDraft({ conversationId: conv.id, mode: "assist" });
    const [d] = await drafts(conv);
    expect(d).toMatchObject({ status: "generated", cardId: null, card: null });
    expect(lastPayload()).not.toHaveProperty("cards");
  });

  it("辅助模式：草稿记下卡与第 1 步；同段下一条消息带 active_card，从这一步接着走到第 2 步", async () => {
    const c = await writeCard(card("摄像头识别不到：帮买家恢复使用"));
    const conv = await conversation("bot");
    await buyer(conv, "摄像头接上电脑后识别不到");
    await generateDraft({ conversationId: conv.id, mode: "assist" });
    const [d1] = await drafts(conv);
    expect(d1).toMatchObject({ status: "generated", cardId: c.id, card: { version: 1, title: "摄像头识别不到：帮买家恢复使用", step: 1, action: "continue" } });
    const p1 = lastPayload() as { cards: Array<{ id: string; steps: Array<{ n: number; branches: Array<{ then: string }> }> }> };
    expect(p1.cards[0]).toMatchObject({ id: "K1", steps: [{ n: 1, branches: [{ then: "转人工" }] }, { n: 2 }, { n: 3 }] });
    const [evt] = await db()
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.targetId, d1.id), eq(schema.auditLog.action, "draft_generated")));
    expect(evt.data).toMatchObject({ card_id: c.id, card_step: 1, card_action: "continue" });

    await buyer(conv, "Windows 11，用 USB 线连的");
    await generateDraft({ conversationId: conv.id, mode: "assist" });
    expect(lastPayload()).toMatchObject({ active_card: { id: "K1", step: 1 } });
    const all = await drafts(conv);
    expect(all.at(-1)).toMatchObject({ cardId: c.id, card: { step: 2, action: "continue" } });
  });

  it("买家说出分支条件里的词：按卡转人工，原因「经验卡要求转人工」，不存草稿", async () => {
    const c = await writeCard(card("摄像头识别不到：急用就转人工"));
    const conv = await conversation("bot");
    await buyer(conv, "摄像头接上电脑后识别不到，我急用");
    await generateDraft({ conversationId: conv.id, mode: "assist" });
    expect(await drafts(conv)).toEqual([]);
    expect(await convOf(conv)).toMatchObject({ handlingState: "awaiting_human", handoffReason: "card" });
    const [evt] = await db()
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.targetId, conv.id), eq(schema.auditLog.action, "handoff")));
    expect(evt.data).toMatchObject({ reason: "card", card_id: c.id, card_action: "handoff" });
  });

  it("影子模式：只记录用到的卡与分支动作，会话仍待认领、不建工单", async () => {
    const c = await writeCard(card("摄像头识别不到：影子"));
    const conv = await conversation("awaiting_human");
    await buyer(conv, "摄像头接上电脑后识别不到，我急用");
    await generateDraft({ conversationId: conv.id, mode: "shadow" });
    const [d] = await drafts(conv);
    expect(d).toMatchObject({ status: "shadow", cardId: c.id, card: { step: 1, action: "handoff" } });
    expect(await convOf(conv)).toMatchObject({ handlingState: "awaiting_human", handoffReason: "shadow" });
    expect(await db().select().from(schema.ticket).where(eq(schema.ticket.conversationId, conv.id))).toEqual([]);
  });

  it("建工单分支：辅助模式照常出草稿；自动模式先发回复，再建「内部确认」工单并转人工", async () => {
    const ticketCard = card("摄像头识别不到：在保修期内换货", {
      steps: [{ text: "确认在保修期内", branches: [{ when: "保修", action: "ticket" }] }, { text: "建换货工单", branches: [] }],
    });
    const c = await writeCard(ticketCard);

    const assist = await conversation("bot");
    await buyer(assist, "摄像头接上电脑后识别不到，还在保修期吗");
    await generateDraft({ conversationId: assist.id, mode: "assist" });
    const [d] = await drafts(assist);
    expect(d).toMatchObject({ status: "generated", cardId: c.id, card: { action: "ticket", ticketSummary: "替身：保修" } });
    expect(await convOf(assist)).toMatchObject({ handlingState: "bot" });

    const fetchMock = vi.fn(async () => Response.json({ response: { message_id: 4242, created_timestamp: Math.floor(Date.now() / 1000) } }));
    vi.stubGlobal("fetch", fetchMock);
    const auto = await conversation("bot");
    await buyer(auto, "摄像头接上电脑后识别不到，还在保修期吗");
    await generateDraft({ conversationId: auto.id, mode: "auto" });
    vi.unstubAllGlobals();
    const [sent] = await drafts(auto);
    expect(sent).toMatchObject({ status: "sent", cardId: c.id, card: { action: "ticket" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [t] = await db().select().from(schema.ticket).where(eq(schema.ticket.conversationId, auto.id));
    expect(t).toMatchObject({ type: "internal", origin: "rule", dedupeKey: `card:${auto.currentSegmentId}:${c.id}`, description: "摄像头识别不到：在保修期内换货：替身：保修", buyerName: "Aisyah" });
    expect(await convOf(auto)).toMatchObject({ handlingState: "awaiting_human", handoffReason: "card" });
    // 已发过回复，转人工时不再发安抚句
    const aiMsgs = await db()
      .select()
      .from(schema.message)
      .where(and(eq(schema.message.conversationId, auto.id), eq(schema.message.senderRole, "ai")));
    expect(aiMsgs).toHaveLength(1);
  });

  it("卡下架后不再进候选：草稿 card 为空", async () => {
    const c = await writeCard(card("摄像头识别不到：将下架"));
    await db().update(schema.experienceCard).set({ status: "archived" }).where(eq(schema.experienceCard.id, c.id));
    const conv = await conversation("bot");
    await buyer(conv, "摄像头接上电脑后识别不到");
    await generateDraft({ conversationId: conv.id, mode: "assist" });
    const [d] = await drafts(conv);
    expect(d).toMatchObject({ status: "generated", cardId: null, card: null });
  });
});
