// 需要数据库：DATABASE_URL 未设置时跳过（set -a && . ./.env && set +a && pnpm exec vitest run src/server/ai）。
// 出稿任务（§12.8、§16）：买家停手 6 秒才出稿，未满时延后重排；影子模式最后一条不是文字不出稿，开段不是文字时段内第一句文字出稿；
// 出稿请求带回复语言。
// 造的商户、账号在 afterAll 删除，AI 替身设定恢复原值；队列投递被替换，不进共用的 pg-boss。
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn<(...args: unknown[]) => Promise<null>>(async () => null) }));
vi.mock("@/server/jobs/boss", () => ({ enqueue }));

describe.skipIf(!process.env.DATABASE_URL)("出稿防抖与回复语言（需要数据库）", async () => {
  process.env.AI_MODE = "stub";
  process.env.KNOWLEDGE_MODE = "stub";
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { generateDraft } = await import("./draft");
  const { ingestMessage, runFollowUp } = await import("@/server/conversations/ingest");
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
    await db().insert(schema.user).values({ id: userId, name: "出稿测试管理员", email: `${userId}@test.invalid` });
    userIds.push(userId);
    const { merchant } = await db().transaction((tx) => provisionMerchant(tx, { name: "出稿防抖测试", timezone: "Asia/Bangkok", ownerUserId: userId }));
    merchantIds.push(merchant.id);
    merchantId = merchant.id;
    await db().update(schema.receptionSettings).set({ brandVoice: "请用亲切、专业的中文语气，称呼买家为「您」。" }).where(eq(schema.receptionSettings.merchantId, merchantId));
    const [app] = await db()
      .insert(schema.platformApp)
      .values({ merchantId, platform: "shopee", appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), region: "sg", status: "verified" })
      .returning();
    const caps = { chat: true, orders: true, piiMasked: false, productScope: false, cards: [], coupons: false, endSession: false, maxTextLength: 500 };
    const [shop] = await db()
      .insert(schema.shop)
      .values({ merchantId, platformAppId: app.id, platform: "shopee", externalShopId: "th-1", name: "泰国店", market: "TH", accessTokenEnc: encrypt("t"), refreshTokenEnc: encrypt("r"), accessExpiresAt: new Date(Date.now() + 86_400_000), capabilities: caps })
      .returning();
    shopId = shop.id;
  });

  beforeEach(() => enqueue.mockClear());

  afterAll(async () => {
    const restore = savedAiStub ? { next: savedAiStub.next, sticky: savedAiStub.sticky, lastRequest: savedAiStub.lastRequest } : { next: "normal" as const, sticky: false, lastRequest: null };
    await db().insert(schema.devAiStub).values({ id: 1, ...restore }).onConflictDoUpdate({ target: schema.devAiStub.id, set: restore });
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
  });

  async function conversation(state: "bot" | "awaiting_human"): Promise<Conv> {
    const [conv] = await db()
      .insert(schema.conversation)
      .values({ merchantId, shopId, platform: "shopee", externalConversationId: `c-${randomUUID()}`, buyerExternalId: "b1", buyerName: "Somchai", handlingState: state, handoffReason: state === "awaiting_human" ? "shadow" : null, lastBuyerAt: new Date() })
      .returning();
    const [seg] = await db().insert(schema.segment).values({ merchantId, conversationId: conv.id, stage: "presale", startedAt: new Date() }).returning();
    await db().update(schema.conversation).set({ currentSegmentId: seg.id }).where(eq(schema.conversation.id, conv.id));
    return { ...conv, currentSegmentId: seg.id };
  }

  /** 买家消息，secondsAgo 秒前到达 */
  async function buyer(conv: Conv, secondsAgo: number, m: { type: "text" | "image" | "product_card"; text?: string }) {
    const at = new Date(Date.now() - secondsAgo * 1000);
    await db().insert(schema.message).values({ merchantId, conversationId: conv.id, segmentId: conv.currentSegmentId, direction: "in", senderRole: "buyer", type: m.type, text: m.text ?? null, payload: {}, sentAt: at, createdAt: at });
  }

  const drafts = (conv: Conv) => db().select().from(schema.draft).where(eq(schema.draft.conversationId, conv.id));
  const lastPayload = async () => {
    const [row] = await db().select().from(schema.devAiStub).where(eq(schema.devAiStub.id, 1));
    return JSON.parse(row.lastRequest?.messages.find((m) => m.role === "user")?.content ?? "{}") as Record<string, unknown>;
  };

  it("最后一条买家消息到达不满 6 秒：不出稿，按剩余时间重排同会话的出稿任务", async () => {
    const conv = await conversation("awaiting_human");
    await buyer(conv, 2, { type: "text", text: "ใช้กับ iPad ได้ไหม" });
    await generateDraft({ conversationId: conv.id, mode: "shadow" });
    expect(await drafts(conv)).toEqual([]);
    expect(enqueue).toHaveBeenCalledTimes(1);
    const [name, data, opts] = enqueue.mock.calls[0] as [string, unknown, { singletonKey: string; startAfter: number }];
    expect(name).toBe("draft.generate");
    expect(data).toEqual({ conversationId: conv.id, mode: "shadow" });
    expect(opts.singletonKey).toBe(conv.id);
    expect(opts.startAfter).toBeGreaterThanOrEqual(3);
    expect(opts.startAfter).toBeLessThanOrEqual(5);
  });

  it("先发商品卡、2 秒后补文字：停手满 6 秒后按那句文字出影子回复", async () => {
    const conv = await conversation("awaiting_human");
    await buyer(conv, 9, { type: "product_card" });
    await buyer(conv, 7, { type: "text", text: "ตัวนี้ใช้กับ iPad ได้ไหมครับ" });
    await generateDraft({ conversationId: conv.id, mode: "shadow" });
    const [d] = await drafts(conv);
    expect(d).toMatchObject({ mode: "shadow", status: "shadow" });
    const [trigger] = await db().select().from(schema.message).where(eq(schema.message.id, d.triggerMessageId!));
    expect(trigger).toMatchObject({ type: "text", text: "ตัวนี้ใช้กับ iPad ได้ไหมครับ" });
    expect(enqueue.mock.calls.map((c) => c[0])).toEqual(["draft.translate"]);
  });

  it("影子模式最后一条不是文字：不出影子回复、不计用量、不排其他任务", async () => {
    const conv = await conversation("awaiting_human");
    await buyer(conv, 10, { type: "image" });
    const [before] = await db().select().from(schema.usagePeriod).where(eq(schema.usagePeriod.merchantId, merchantId));
    await generateDraft({ conversationId: conv.id, mode: "shadow" });
    expect(await drafts(conv)).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
    const [after] = await db().select().from(schema.usagePeriod).where(eq(schema.usagePeriod.merchantId, merchantId));
    expect(after?.draftsUsed).toBe(before?.draftsUsed);
  });

  it.each([7, 35])("影子模式开段是图片、%i 秒后补文字：第一句文字出一份影子回复，之后的文字不再出", async (gap) => {
    await db()
      .insert(schema.shopReception)
      .values({ shopId, merchantId, modeInHours: "shadow", modeOffHours: "shadow" })
      .onConflictDoUpdate({ target: schema.shopReception.shopId, set: { modeInHours: "shadow", modeOffHours: "shadow" } });
    const [shop] = await db().select().from(schema.shop).where(eq(schema.shop.id, shopId));
    const ext = `c-${randomUUID()}`;
    /** 走入站落库与提交后动作（出稿任务被替换成记录），再把消息的到达时间改成 secondsAgo 秒前 */
    const ingest = async (type: "text" | "image", text: string | null, secondsAgo: number) => {
      const at = new Date(Date.now() - secondsAgo * 1000);
      const m = { externalMessageId: `m-${randomUUID()}`, externalConversationId: ext, buyerExternalId: "b9", buyerName: "Somchai", fromBuyer: true, senderRole: "buyer" as const, type, text, translation: null, payload: {}, sentAt: at, affiliate: false, raw: {} };
      const res = await db().transaction((tx) => ingestMessage(tx, shop, m, { externalId: "b9", name: "Somchai", affiliate: false }));
      await runFollowUp(res.followUp);
      await db().update(schema.message).set({ createdAt: at }).where(eq(schema.message.id, res.messageId!));
      return res.conversationId!;
    };
    const draftJobs = () => enqueue.mock.calls.filter((c) => c[0] === "draft.generate");

    const convId = await ingest("image", null, gap + 10);
    expect(draftJobs()).toHaveLength(1);
    await generateDraft({ conversationId: convId, mode: "shadow" });
    const conv = { id: convId } as Conv;
    expect(await drafts(conv)).toEqual([]);

    enqueue.mockClear();
    await ingest("text", "ใช้กับ iPad ได้ไหม", 10);
    expect(draftJobs()).toEqual([["draft.generate", { conversationId: convId, mode: "shadow" }, { singletonKey: convId, startAfter: 6 }]]);
    await generateDraft({ conversationId: convId, mode: "shadow" });
    const [d] = await drafts(conv);
    expect(d).toMatchObject({ mode: "shadow", status: "shadow" });
    const [trigger] = await db().select().from(schema.message).where(eq(schema.message.id, d.triggerMessageId!));
    expect(trigger.text).toBe("ใช้กับ iPad ได้ไหม");

    enqueue.mockClear();
    await ingest("text", "ขอบคุณครับ", 8);
    expect(draftJobs()).toEqual([]);
    await generateDraft({ conversationId: convId, mode: "shadow" });
    expect(await drafts(conv)).toHaveLength(1);
  });

  it("辅助模式最后一条不是文字：照旧转人工「非文本消息」", async () => {
    const conv = await conversation("bot");
    await buyer(conv, 10, { type: "image" });
    await generateDraft({ conversationId: conv.id, mode: "assist" });
    expect(await drafts(conv)).toEqual([]);
    const [after] = await db().select().from(schema.conversation).where(eq(schema.conversation.id, conv.id));
    expect(after).toMatchObject({ handlingState: "awaiting_human", handoffReason: "non_text" });
  });

  it("出稿请求带 reply_language：按买家文字判定，品牌语气是中文也不变；判不出往前找，再判不出用站点默认", async () => {
    const thai = await conversation("awaiting_human");
    await buyer(thai, 30, { type: "text", text: "สรุปทำไม่ได้ใช่ไหม" });
    await generateDraft({ conversationId: thai.id, mode: "shadow" });
    let payload = await lastPayload();
    expect(payload).toMatchObject({ reply_language: "Thai", brand_voice: "请用亲切、专业的中文语气，称呼买家为「您」。" });

    const mixed = await conversation("awaiting_human");
    await buyer(mixed, 40, { type: "text", text: "Nếu ko có máy tính có sd được ko ạ" });
    await buyer(mixed, 20, { type: "text", text: "👍" });
    await generateDraft({ conversationId: mixed.id, mode: "shadow" });
    payload = await lastPayload();
    expect(payload.reply_language).toBe("Vietnamese");

    const digits = await conversation("awaiting_human");
    await buyer(digits, 20, { type: "text", text: "0812345678" });
    await generateDraft({ conversationId: digits.id, mode: "shadow" });
    payload = await lastPayload();
    expect(payload.reply_language).toBe("Thai");
  });
});
