// 需要数据库：DATABASE_URL 未设置时跳过（set -a && . ./.env && set +a && pnpm exec vitest run src/server/ai）。
// 影子回复译文（REQ-AI-007）：出影子回复后排 draft.translate；任务只译影子回复里不是商户语言的，译文入库并经会话详情返回；翻译失败影子回复不受影响。
// 造的商户、账号在 afterAll 删除，AI 替身设定恢复原值；队列投递被替换，不进共用的 pg-boss。
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { can, permissionsFor } from "@/lib/permissions";

const { enqueue, failTranslate } = vi.hoisted(() => ({ enqueue: vi.fn<(...args: unknown[]) => Promise<null>>(async () => null), failTranslate: { on: false } }));
vi.mock("@/server/jobs/boss", () => ({ enqueue }));
// 替身翻译不会失败：打开 failTranslate 时让翻译请求按超时失败，其余照常走替身
vi.mock("@/server/ai/client", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/server/ai/client")>();
  const chat: typeof orig.chat = async (kind, messages, opts) => {
    if (kind === "translate" && failTranslate.on) throw new orig.AiError("timeout", "替身：翻译超时");
    return orig.chat(kind, messages, opts);
  };
  return { ...orig, chat };
});

describe.skipIf(!process.env.DATABASE_URL)("影子回复译文（需要数据库）", async () => {
  process.env.AI_MODE = "stub";
  process.env.KNOWLEDGE_MODE = "stub";
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { generateDraft } = await import("./draft");
  const { translateDraft } = await import("./translate");
  const { getConversation } = await import("@/server/conversations/queries");
  type MemberContext = import("@/server/auth/context").MemberContext;
  type Conv = typeof schema.conversation.$inferSelect;

  const userIds: string[] = [];
  const merchantIds: string[] = [];
  let savedAiStub: typeof schema.devAiStub.$inferSelect | undefined;
  let admin: MemberContext;
  let shopId = "";

  beforeAll(async () => {
    [savedAiStub] = await db().select().from(schema.devAiStub).where(eq(schema.devAiStub.id, 1));
    await db().insert(schema.devAiStub).values({ id: 1, next: "normal", sticky: false }).onConflictDoUpdate({ target: schema.devAiStub.id, set: { next: "normal", sticky: false } });
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: "译文测试管理员", email: `${userId}@test.invalid` });
    userIds.push(userId);
    const { merchant, membership } = await db().transaction((tx) => provisionMerchant(tx, { name: "影子译文测试", timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantIds.push(merchant.id);
    const [app] = await db()
      .insert(schema.platformApp)
      .values({ merchantId: merchant.id, platform: "shopee", appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), region: "sg", status: "verified" })
      .returning();
    const caps = { chat: true, orders: true, piiMasked: false, productScope: false, cards: [], coupons: false, endSession: false, maxTextLength: 500 };
    const [shop] = await db()
      .insert(schema.shop)
      .values({ merchantId: merchant.id, platformAppId: app.id, platform: "shopee", externalShopId: "my-1", name: "影子店", market: "MY", accessTokenEnc: encrypt("t"), refreshTokenEnc: encrypt("r"), accessExpiresAt: new Date(Date.now() + 86_400_000), capabilities: caps })
      .returning();
    shopId = shop.id;
    admin = {
      requestId: "req_test",
      ip: "127.0.0.1",
      userAgent: null,
      user: { id: userId, name: "译文测试管理员", email: `${userId}@test.invalid`, twoFactorEnabled: false },
      session: { id: "s", createdAt: new Date() },
      merchant,
      membership: { id: membership.id, role: "admin", status: "active" },
      isOwner: true,
      shopIds: null,
      twoFactorRequired: false,
      actor: { kind: "member", merchantId: merchant.id, membershipId: membership.id, userId, name: "译文测试管理员", requestId: "req_test" },
      can: (p) => can("admin", true, p),
      permissions: permissionsFor("admin", true),
    };
  });

  beforeEach(() => {
    enqueue.mockClear();
    failTranslate.on = false;
  });

  afterAll(async () => {
    const restore = savedAiStub ? { next: savedAiStub.next, sticky: savedAiStub.sticky, lastRequest: savedAiStub.lastRequest } : { next: "normal" as const, sticky: false, lastRequest: null };
    await db().insert(schema.devAiStub).values({ id: 1, ...restore }).onConflictDoUpdate({ target: schema.devAiStub.id, set: restore });
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
  });

  /** 待认领（影子模式）的会话，带一条 10 秒前到达的买家消息（出稿要等买家停手 6 秒） */
  async function shadowConversation(buyerText: string): Promise<{ conv: Conv; triggerId: string }> {
    const [conv] = await db()
      .insert(schema.conversation)
      .values({ merchantId: admin.merchant.id, shopId, platform: "shopee", externalConversationId: `c-${randomUUID()}`, buyerExternalId: "b1", buyerName: "Aisyah", handlingState: "awaiting_human", handoffReason: "shadow", lastBuyerAt: new Date() })
      .returning();
    const [seg] = await db().insert(schema.segment).values({ merchantId: admin.merchant.id, conversationId: conv.id, stage: "presale", startedAt: new Date() }).returning();
    await db().update(schema.conversation).set({ currentSegmentId: seg.id }).where(eq(schema.conversation.id, conv.id));
    const at = new Date(Date.now() - 10_000);
    const [m] = await db().insert(schema.message).values({ merchantId: admin.merchant.id, conversationId: conv.id, segmentId: seg.id, direction: "in", senderRole: "buyer", type: "text", text: buyerText, sentAt: at, createdAt: at }).returning();
    return { conv: { ...conv, currentSegmentId: seg.id }, triggerId: m.id };
  }

  async function insertDraft(conv: Conv, triggerId: string, text: string, mode: "shadow" | "assist") {
    const [d] = await db()
      .insert(schema.draft)
      .values({ merchantId: admin.merchant.id, conversationId: conv.id, segmentId: conv.currentSegmentId, triggerMessageId: triggerId, mode, text, confidence: 0.8, status: mode === "shadow" ? "shadow" : "generated", model: "test", latencyMs: 1 })
      .returning();
    return d;
  }

  const draftRow = async (id: string) => (await db().select().from(schema.draft).where(eq(schema.draft.id, id)))[0];

  it("出影子回复后排 draft.translate", async () => {
    const { conv } = await shadowConversation("Does it work with Mac?");
    await generateDraft({ conversationId: conv.id, mode: "shadow" });
    const [d] = await db().select().from(schema.draft).where(eq(schema.draft.conversationId, conv.id));
    expect(d).toMatchObject({ mode: "shadow", status: "shadow", translation: null });
    expect(enqueue).toHaveBeenCalledWith("draft.translate", { draftId: d.id });
    // AI 替身的出稿是中文，与商户语言相同：任务不译
    await translateDraft({ draftId: d.id });
    expect((await draftRow(d.id)).translation).toBeNull();
  });

  it("英文影子回复译成商户语言并入库，会话详情返回译文；助理草稿与已译过的不再译", async () => {
    const { conv, triggerId } = await shadowConversation("Does it work with Mac?");
    const shadow = await insertDraft(conv, triggerId, "Yes, it works with macOS 12 or later.", "shadow");
    await translateDraft({ draftId: shadow.id });
    expect((await draftRow(shadow.id)).translation).toBe("[译文] Yes, it works with macOS 12 or later.");
    const detail = await getConversation(admin, conv.id);
    expect(detail.shadowDrafts?.map((x) => [x.id, x.text, x.translation])).toEqual([[shadow.id, "Yes, it works with macOS 12 or later.", "[译文] Yes, it works with macOS 12 or later."]]);

    await db().update(schema.draft).set({ translation: "人工改过的译文" }).where(eq(schema.draft.id, shadow.id));
    await translateDraft({ draftId: shadow.id });
    expect((await draftRow(shadow.id)).translation).toBe("人工改过的译文");

    const assist = await insertDraft(conv, triggerId, "Hi! Yes, it does.", "assist");
    await translateDraft({ draftId: assist.id });
    expect((await draftRow(assist.id)).translation).toBeNull();
  });

  it("翻译失败：任务抛错交给队列重试，影子回复原样保留、没有译文", async () => {
    const { conv, triggerId } = await shadowConversation("Bila sampai?");
    const shadow = await insertDraft(conv, triggerId, "Barang akan sampai dalam 3 hari.", "shadow");
    failTranslate.on = true;
    await expect(translateDraft({ draftId: shadow.id })).rejects.toThrow("翻译超时");
    expect(await draftRow(shadow.id)).toMatchObject({ status: "shadow", text: "Barang akan sampai dalam 3 hari.", translation: null });
    const detail = await getConversation(admin, conv.id);
    expect(detail.shadowDrafts?.[0]).toMatchObject({ text: "Barang akan sampai dalam 3 hari.", translation: null });
  });
});
