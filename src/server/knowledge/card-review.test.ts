// 按卡定时体检（需要数据库，AI_MODE=stub）：挑卡的条件与排序、同一天不重复建；体检任务的快照与证据；无需更新、改卡直接生效、
// 原样发送的用例变差就复测没通过；RULE-KB-007 三道闸各自把改动挡进待审核并写明原因、并发时合计不越过上限；待审核的发布到这张卡；
// 卡抽屉的体检记录；列表按类型筛选；会话学习挑段不被体检任务挡住；买家数据删除时去掉原样发送的回归用例。
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { zCardContent, type CardAction, type CardContent } from "@/contracts/cards";
import { can, permissionsFor } from "@/lib/permissions";

const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn<(...args: unknown[]) => Promise<null>>(async () => null) }));
vi.mock("@/server/jobs/boss", () => ({ enqueue }));

const card = (title: string, condition: string, over: Partial<CardContent> = {}): CardContent => ({
  title,
  productIds: [],
  stage: "aftersale",
  markets: ["ALL"],
  tags: [],
  conditions: [condition],
  conditionMode: "all",
  steps: [{ text: "问清电脑系统和连接方式", branches: [] }],
  tips: null,
  qaIds: [],
  ...over,
});

describe.skipIf(!process.env.DATABASE_URL)("按卡定时体检（需要数据库）", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "shopilot-card-review-test-"));
  process.env.DATA_DIR = dataDir;
  process.env.KNOWLEDGE_MODE = "stub";
  process.env.AI_MODE = "stub";
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const review = await import("./card-review");
  const gate = await import("./agent-apply");
  const job = await import("./learning-analyze");
  const svc = await import("./learning");
  const cards = await import("./cards");
  const forget = await import("./learning-forget");
  const store = await import("./card-store");
  type MemberContext = import("@/server/auth/context").MemberContext;
  type CardRow = typeof schema.experienceCard.$inferSelect;
  type DraftStatus = typeof schema.draft.$inferInsert.status;

  const userIds: string[] = [];
  const merchantIds: string[] = [];
  let savedAiStub: typeof schema.devAiStub.$inferSelect | undefined;
  const now = Date.now();
  const at = (minAgo: number) => new Date(now - minAgo * 60_000);
  const DAY_MIN = 24 * 60;

  /** 每个用例一个商户：挑卡按商户排前 10、每天的上限按商户数，互不干扰 */
  async function setup(): Promise<{ ctx: MemberContext; shopId: string }> {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: "体检测试", email: `${userId}@test.invalid` });
    userIds.push(userId);
    const res = await db().transaction((tx) => provisionMerchant(tx, { name: "体检测试", timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantIds.push(res.merchant.id);
    const ctx: MemberContext = {
      requestId: "req_test",
      ip: "127.0.0.1",
      userAgent: null,
      user: { id: userId, name: "体检测试", email: `${userId}@test.invalid`, twoFactorEnabled: false },
      session: { id: "s", createdAt: new Date() },
      merchant: res.merchant,
      membership: { id: res.membership.id, role: "admin", status: "active" },
      isOwner: true,
      shopIds: null,
      twoFactorRequired: false,
      actor: { kind: "member", merchantId: res.merchant.id, membershipId: res.membership.id, userId, name: "体检测试", requestId: "req_test" },
      can: (p) => can("admin", true, p),
      permissions: permissionsFor("admin", true),
    };
    const [app] = await db()
      .insert(schema.platformApp)
      .values({ merchantId: ctx.merchant.id, platform: "shopee", appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), apiHost: "http://shopee.test", region: "sg", status: "verified" })
      .returning();
    const [shop] = await db()
      .insert(schema.shop)
      .values({ merchantId: ctx.merchant.id, platformAppId: app.id, platform: "shopee", externalShopId: `s-${randomUUID()}`, name: "Shopee MY", market: "MY", capabilities: { chat: true, orders: true, piiMasked: false, productScope: true, cards: [], coupons: false, endSession: false, maxTextLength: 500 } })
      .returning();
    return { ctx, shopId: shop.id };
  }

  beforeAll(async () => {
    [savedAiStub] = await db().select().from(schema.devAiStub).where(eq(schema.devAiStub.id, 1));
    await db().insert(schema.devAiStub).values({ id: 1, next: "normal", sticky: false }).onConflictDoUpdate({ target: schema.devAiStub.id, set: { next: "normal", sticky: false } });
  });

  afterAll(async () => {
    const restoreAi = savedAiStub ? { next: savedAiStub.next, sticky: savedAiStub.sticky, lastRequest: savedAiStub.lastRequest } : { next: "normal" as const, sticky: false, lastRequest: null };
    await db().insert(schema.devAiStub).values({ id: 1, ...restoreAi }).onConflictDoUpdate({ target: schema.devAiStub.id, set: restoreAi });
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
    await rm(dataDir, { recursive: true, force: true });
  });

  /** 一个会话一段，按 [角色, 文字] 依次写消息（每条间隔 1 分钟） */
  async function conversation(env: { ctx: MemberContext; shopId: string }, lines: Array<["buyer" | "agent", string]>, seg: Partial<typeof schema.segment.$inferInsert> = {}) {
    const [conv] = await db()
      .insert(schema.conversation)
      .values({ merchantId: env.ctx.merchant.id, shopId: env.shopId, platform: "shopee", externalConversationId: `c-${randomUUID()}`, buyerExternalId: `b-${randomUUID()}`, buyerName: "buyer.test", handlingState: "human" })
      .returning();
    const [s] = await db()
      .insert(schema.segment)
      .values({ merchantId: env.ctx.merchant.id, conversationId: conv.id, stage: "aftersale", startedAt: at(lines.length + 10), firstBuyerAt: at(lines.length + 10), ...seg })
      .returning();
    const ids: string[] = [];
    for (const [i, [role, text]] of lines.entries()) {
      const [m] = await db()
        .insert(schema.message)
        .values({ merchantId: env.ctx.merchant.id, conversationId: conv.id, segmentId: s.id, direction: role === "buyer" ? "in" : "out", senderRole: role, type: "text", text, sentAt: at(lines.length - i + 5) })
        .returning();
      ids.push(m.id);
    }
    return { conv, segId: s.id, ids };
  }

  /** 写一张卡，并把第 1 版挪到 3 天前（挑卡要求 24 小时内没有新版本） */
  async function publishedCard(env: { ctx: MemberContext }, content: CardContent): Promise<CardRow> {
    const row = await db().transaction(async (tx) => store.insertCard(tx, { merchantId: env.ctx.merchant.id, content, author: { kind: "member", memberId: env.ctx.membership.id }, vec: await store.tryEmbedCard(content) }));
    await db().update(schema.experienceCardVersion).set({ createdAt: at(3 * DAY_MIN) }).where(eq(schema.experienceCardVersion.cardId, row.id));
    return row;
  }

  /** 一份用到这张卡的草稿：买家问 question，草稿回答它；可带草稿对比结论 */
  async function draftWith(
    env: { ctx: MemberContext; shopId: string },
    row: CardRow,
    question: string,
    opts: { status: DraftStatus; mode?: "assist" | "shadow"; minAgo?: number; consistency?: "same" | "partial" | "different"; action?: CardAction } = { status: "sent" },
  ) {
    const c = await conversation(env, [
      ["buyer", "你好"],
      ["buyer", question],
      ["agent", "客服最后发出去的回复"],
    ]);
    const mode = opts.mode ?? "assist";
    const [d] = await db()
      .insert(schema.draft)
      .values({
        merchantId: env.ctx.merchant.id,
        conversationId: c.conv.id,
        segmentId: c.segId,
        triggerMessageId: c.ids[1],
        mode,
        text: `AI 草稿：${question}`,
        confidence: 0.9,
        status: opts.status,
        disposedAt: opts.status === "shadow" ? null : at(opts.minAgo ?? 60),
        model: "stub",
        latencyMs: 1,
        cardId: row.id,
        card: { version: row.version, title: row.title, step: 1, action: opts.action ?? "continue", reason: "替身：调用条件成立", ticketSummary: null },
        createdAt: at(opts.minAgo ?? 60),
      })
      .returning();
    if (opts.consistency)
      await db()
        .insert(schema.draftReview)
        .values({
          merchantId: env.ctx.merchant.id,
          draftId: d.id,
          conversationId: c.conv.id,
          segmentId: c.segId,
          kind: mode === "shadow" ? "shadow" : "assist",
          draftStatus: opts.status,
          humanText: "客服最后发出去的回复",
          editClass: opts.consistency === "same" ? "same" : "process",
          consistency: opts.consistency,
          reason: "替身对比",
          model: "stub",
        });
    return { ...c, draftId: d.id };
  }

  const taskOf = async (id: string) => (await db().select().from(schema.learningTask).where(eq(schema.learningTask.id, id)))[0];
  const reviewTaskOf = async (cardId: string) => (await db().select().from(schema.learningTask).where(and(eq(schema.learningTask.kind, "card_review"), eq(schema.learningTask.targetCardId, cardId))))[0];
  const cardOf = async (id: string) => (await db().select().from(schema.experienceCard).where(eq(schema.experienceCard.id, id)))[0];
  const agentVersion = (row: CardRow) =>
    db().transaction(async (tx) => {
      const c = await store.writeCardVersion(tx, { row, content: { ...store.cardContentOf(row), tips: `Agent 改 ${randomUUID()}` }, author: { kind: "agent" } });
      await gate.recordAgentUpdate(tx, c);
      return c;
    });

  it("挑卡：已发布、近 7 天 ≥ 3 份草稿且有问题信号、24 小时内没有新版本；按问题比例排；同一天不重复建；任务带代表性用例与证据", async () => {
    const env = await setup();
    const a = await publishedCard(env, card("镜头起雾：帮买家处理", "买家说镜头起雾"));
    const b = await publishedCard(env, card("灯不亮：帮买家排查", "买家说灯不亮"));
    const few = await publishedCard(env, card("草稿不够三份", "买家问草稿不够"));
    const clean = await publishedCard(env, card("都原样发送", "买家问都原样发送"));
    const fresh = await publishedCard(env, card("刚改过的卡", "买家问刚改过"));
    const old = await publishedCard(env, card("八天前的草稿", "买家问八天前"));
    const archived = await publishedCard(env, card("已下架的卡", "买家问已下架"));
    // a：3 份里 2 份有问题（改后发送、弃用）；b：4 份里 1 份（影子回复部分一致），排在 a 后面
    const aEdited = await draftWith(env, a, "镜头起雾怎么办", { status: "edited_sent", minAgo: 120 });
    const aIgnored = await draftWith(env, a, "镜头又起雾", { status: "ignored", minAgo: 30 });
    await draftWith(env, a, "镜头起雾了吗", { status: "sent", minAgo: 10 });
    for (const q of ["灯不亮一", "灯不亮二", "灯不亮三"]) await draftWith(env, b, q, { status: "sent" });
    await draftWith(env, b, "灯不亮四", { status: "shadow", mode: "shadow", consistency: "partial" });
    for (const q of ["一", "二"]) await draftWith(env, few, `草稿不够${q}`, { status: "ignored" });
    for (const q of ["一", "二", "三"]) await draftWith(env, clean, `都原样发送${q}`, { status: "sent" });
    for (const q of ["一", "二", "三"]) await draftWith(env, fresh, `刚改过${q}`, { status: "ignored" });
    await db().update(schema.experienceCardVersion).set({ createdAt: at(60) }).where(eq(schema.experienceCardVersion.cardId, fresh.id));
    for (const q of ["一", "二", "三"]) await draftWith(env, old, `八天前${q}`, { status: "ignored", minAgo: 8 * DAY_MIN });
    for (const q of ["一", "二", "三"]) await draftWith(env, archived, `已下架${q}`, { status: "ignored" });
    await db().update(schema.experienceCard).set({ status: "archived" }).where(eq(schema.experienceCard.id, archived.id));

    expect(await review.pickCardsForReview(env.ctx.merchant.id)).toEqual([
      { cardId: a.id, total: 3, problems: 2 },
      { cardId: b.id, total: 4, problems: 1 },
    ]);
    expect((await review.pickCardsForReview(env.ctx.merchant.id, 1)).map((x) => x.cardId)).toEqual([a.id]);

    enqueue.mockClear();
    expect(await review.reviewCards({ merchantId: env.ctx.merchant.id })).toEqual({ merchants: 1, reviewed: 2 });
    const t = await reviewTaskOf(a.id);
    expect(t).toMatchObject({ kind: "card_review", source: "agent", status: "analyzing", conversationId: aIgnored.conv.id, segmentId: aIgnored.segId, testQuestion: "镜头又起雾", stage: "aftersale" });
    // 证据：有问题的在前（弃用重于改后发送），统计按全部草稿
    expect(t.evidence?.draftIds.slice(0, 2)).toEqual([aIgnored.draftId, aEdited.draftId]);
    expect(t.evidence?.counts).toEqual({ sent: 1, edited: 1, ignored: 1, shadowSame: 0, shadowPartial: 0, shadowDifferent: 0, handoffs: 0 });
    expect(t.messages.map((m) => m.text)).toEqual(["你好", "镜头又起雾"]);
    expect(t.messages.filter((m) => m.selected).map((m) => m.text)).toEqual(["镜头又起雾"]);
    expect(enqueue).toHaveBeenCalledWith("learning.analyze", { taskId: t.id }, { singletonKey: t.id });

    // 同一天再跑：不再挑，唯一索引也挡住重复
    expect(await review.reviewCards({ merchantId: env.ctx.merchant.id })).toEqual({ merchants: 1, reviewed: 0 });
    const dup = await db()
      .insert(schema.learningTask)
      .values({ merchantId: env.ctx.merchant.id, shopId: env.shopId, conversationId: aIgnored.conv.id, source: "agent", kind: "card_review", messages: [], productStatus: "none", stage: "aftersale", targetCardId: a.id })
      .onConflictDoNothing()
      .returning();
    expect(dup).toEqual([]);
    // 工作台不把体检高亮的消息标成「已提交学习」
    expect((await svc.conversationLearning(env.ctx, aIgnored.conv.id)).items).toMatchObject([{ id: t.id, messageIds: [] }]);
  });

  it("体检：用例没有明显问题 → 无需更新；有改后发送 → 复测（加原样发送的用例）通过即写 Agent 版本；卡抽屉列体检记录并链到版本", async () => {
    const env = await setup();
    const keep = await publishedCard(env, card("充电慢：帮买家排查", "买家说充电慢"));
    await draftWith(env, keep, "充电慢怎么办", { status: "ignored" });
    for (const q of ["充电慢一", "充电慢二"]) await draftWith(env, keep, q, { status: "sent" });
    const fix = await publishedCard(env, card("识别不到：帮买家恢复", "识别不到"));
    await draftWith(env, fix, "识别不到", { status: "edited_sent", minAgo: 30 });
    const sentA = await draftWith(env, fix, "还是识别不到", { status: "sent", minAgo: 20 });
    const sentB = await draftWith(env, fix, "又识别不到", { status: "sent", minAgo: 10 });
    await review.reviewCards({ merchantId: env.ctx.merchant.id });

    const tk = await reviewTaskOf(keep.id);
    await job.analyzeLearning({ taskId: tk.id });
    expect(await taskOf(tk.id)).toMatchObject({ status: "closed", result: "none_needed", diagnosis: "covered", reason: "替身：用例没有明显问题" });
    expect((await cardOf(keep.id)).version).toBe(1);

    const tf = await reviewTaskOf(fix.id);
    await job.analyzeLearning({ taskId: tf.id });
    const done = await taskOf(tf.id);
    expect(done).toMatchObject({ status: "published", result: "card_updated", targetCardId: fix.id, publishedCardId: fix.id, publishedVersion: 2 });
    expect(done.retest?.passed).toBe(true);
    expect(done.retest?.regressions.map((g) => ({ taskId: g.taskId, draftId: g.draftId, conversationId: g.conversationId }))).toEqual([
      { taskId: null, draftId: sentB.draftId, conversationId: sentB.conv.id },
      { taskId: null, draftId: sentA.draftId, conversationId: sentA.conv.id },
    ]);
    const after = await cardOf(fix.id);
    expect(after).toMatchObject({ version: 2, agentUnseen: true });
    // 适用范围沿用原卡（RULE-KB-006）
    expect(after).toMatchObject({ productIds: [], stage: "aftersale", markets: ["ALL"] });
    expect(after.steps.at(-1)).toEqual({ text: "替身补充的一步", branches: [] });
    const audits = await db()
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.merchantId, env.ctx.merchant.id), eq(schema.auditLog.action, "card_reviewed")));
    expect(audits.map((x) => x.data?.result).sort()).toEqual(["applied", "keep"]);

    const detail = await cards.getCard(env.ctx, fix.id);
    expect(detail.reviews).toEqual([{ taskId: tf.id, createdAt: expect.any(String), status: "published", result: "card_updated", reason: "替身：客服改写过这张卡的草稿", version: 2 }]);
    expect((await cards.getCard(env.ctx, keep.id)).reviews).toMatchObject([{ taskId: tk.id, status: "closed", result: "none_needed", version: null }]);

    // 列表按类型筛选
    const onlyReview = await svc.listLearning(env.ctx, { limit: 50, kind: "card_review" });
    expect(onlyReview.items.map((x) => x.id).sort()).toEqual([tk.id, tf.id].sort());
    expect(onlyReview.items[0]).toMatchObject({ kind: "card_review", source: "agent", evidence: { counts: expect.any(Object) } });
    expect((await svc.listLearning(env.ctx, { limit: 50, source: "agent", kind: "conversation" })).items).toEqual([]);

    // 买家数据删除：原样发送用例所在的会话删掉时，体检任务复测记录里的这条用例一起去掉
    await db().transaction((tx) => forget.forgetLearningTasks(tx, env.ctx.merchant.id, { conversationIds: [sentA.conv.id] }));
    expect((await taskOf(tf.id)).retest?.regressions.map((g) => g.draftId)).toEqual([sentB.draftId]);
  });

  it("原样发送的用例改后变差：复测没通过，列出变差的用例，卡不动", async () => {
    const env = await setup();
    const row = await publishedCard(env, card("云台卡住：帮买家排查", "云台卡住"));
    await draftWith(env, row, "云台卡住", { status: "edited_sent", minAgo: 30 });
    const worse = await draftWith(env, row, "云台卡住会变差吗", { status: "sent", minAgo: 20 });
    await draftWith(env, row, "云台还是卡住", { status: "sent", minAgo: 10 });
    await review.reviewCards({ merchantId: env.ctx.merchant.id });
    const t = await reviewTaskOf(row.id);
    await job.analyzeLearning({ taskId: t.id });
    const done = await taskOf(t.id);
    expect(done).toMatchObject({ status: "closed", result: "retest_failed", targetCardId: row.id });
    expect(done.retest?.regressions.find((g) => g.draftId === worse.draftId)).toMatchObject({ taskId: null, notWorse: false });
    expect(done.error).toContain("改后变差");
    expect((await cardOf(row.id)).version).toBe(1);
  });

  it("RULE-KB-007：暂停、这张卡今天已被 Agent 改过、今天满 5 次，各自挡住直接生效并给出原因；两个任务同时生效合计不越过上限", async () => {
    const env = await setup();
    const m = env.ctx.merchant.id;
    const rows = await Promise.all(["甲", "乙", "丙", "丁", "戊", "己", "庚"].map((n) => publishedCard(env, card(`卡${n}`, `买家问${n}`))));
    const allowed = (cardId: string) => db().transaction((tx) => gate.agentApplyAllowed(tx, m, cardId));
    expect(await allowed(rows[0].id)).toEqual({ ok: true });

    await db().update(schema.merchant).set({ agentAutoapplyPausedAt: new Date(), agentAutoapplyPauseReason: "辅助草稿采纳率连续两周下降：80% → 72% → 60%" }).where(eq(schema.merchant.id, m));
    const paused = await allowed(rows[0].id);
    expect(paused.ok).toBe(false);
    expect(!paused.ok && paused.reason).toMatch(/^自动生效已暂停（\d+ 月 \d+ 日）：辅助草稿采纳率连续两周下降：80% → 72% → 60%。$/);
    await db().update(schema.merchant).set({ agentAutoapplyPausedAt: null, agentAutoapplyPauseReason: null }).where(eq(schema.merchant.id, m));

    await agentVersion(rows[0]);
    expect(await allowed(rows[0].id)).toEqual({ ok: false, reason: "这张卡今天已被 Agent 改过一次。" });
    expect(await allowed(rows[1].id)).toEqual({ ok: true });
    for (const r of rows.slice(1, 4)) await agentVersion(r);
    expect(await gate.agentAppliedToday(m)).toBe(4);

    // 还差 1 次：两张卡同时要生效，锁住商户行后只有一个能写
    const race = await Promise.all(
      [rows[4], rows[5]].map((r) =>
        db().transaction(async (tx) => {
          const g = await gate.agentApplyAllowed(tx, m, r.id);
          if (g.ok) await gate.recordAgentUpdate(tx, await store.writeCardVersion(tx, { row: r, content: { ...store.cardContentOf(r), tips: "并发" }, author: { kind: "agent" } }));
          return g;
        }),
      ),
    );
    expect(race.filter((g) => g.ok)).toHaveLength(1);
    expect(race.find((g) => !g.ok)).toEqual({ ok: false, reason: "今天 Agent 直接生效的改动已满 5 次。" });
    expect(await gate.agentAppliedToday(m)).toBe(5);
    expect(await allowed(rows[6].id)).toEqual({ ok: false, reason: "今天 Agent 直接生效的改动已满 5 次。" });
    // 删掉当天改过的卡，名额不放回来（次数按审计算，INV-KB-010）
    await cards.deleteCard(env.ctx, rows[1].id);
    expect(await gate.agentAppliedToday(m)).toBe(5);
    // 组长只看负责店铺的体检记录
    const lead = { ...env.ctx, membership: { ...env.ctx.membership, role: "lead" as const }, isOwner: false, shopIds: [] as string[] };
    expect(await review.reviewHistory(lead, rows[0].id)).toEqual([]);
  });

  it("自动生效暂停时体检改卡进待审核，建议栏写明原因；审核人不改内容直接发布到这张卡", async () => {
    const env = await setup();
    await db().update(schema.merchant).set({ agentAutoapplyPausedAt: new Date(), agentAutoapplyPauseReason: "影子回复一致率连续两周下降：90% → 80% → 70%" }).where(eq(schema.merchant.id, env.ctx.merchant.id));
    const row = await publishedCard(env, card("没声音：帮买家排查", "没声音"));
    await draftWith(env, row, "没声音", { status: "edited_sent", minAgo: 30 });
    for (const q of ["还是没声音", "又没声音"]) await draftWith(env, row, q, { status: "sent" });
    await review.reviewCards({ merchantId: env.ctx.merchant.id });
    const t = await reviewTaskOf(row.id);
    await job.analyzeLearning({ taskId: t.id });
    const held = await taskOf(t.id);
    expect(held).toMatchObject({ status: "pending_review", targetCardId: row.id, publishedCardId: null });
    expect(held.suggestion).toMatch(/^自动生效已暂停（\d+ 月 \d+ 日）：影子回复一致率连续两周下降：90% → 80% → 70%。/);
    expect(held.retest?.passed).toBe(true);
    expect((await cardOf(row.id)).version).toBe(1);
    const view = (await svc.getLearning(env.ctx, t.id)).task;
    expect(view).toMatchObject({ kind: "card_review", targetCard: { id: row.id, title: row.title, version: 1 } });

    // 接口按 zCardContent 校验请求体（键按模式的顺序），与 Agent 写拟发布内容时一致
    const r = await svc.publishLearning(env.ctx, t.id, { version: held.version, card: zCardContent.parse(held.proposal), targetCardId: row.id });
    expect(r.task).toMatchObject({ status: "published", result: "card_updated", publishedCard: { id: row.id, version: 2 } });
    const [v2] = await db()
      .select()
      .from(schema.experienceCardVersion)
      .where(and(eq(schema.experienceCardVersion.cardId, row.id), eq(schema.experienceCardVersion.version, 2)));
    expect(v2).toMatchObject({ author: "member", learningTaskId: t.id });
    expect((await cards.getCard(env.ctx, row.id)).reviews).toMatchObject([{ taskId: t.id, status: "published", version: 2 }]);
  });

  it("会话学习挑段：只被会话学习任务挡住，体检任务挂在同一段上不挡", async () => {
    const env = await setup();
    const lines: Array<["buyer" | "agent", string]> = [["buyer", "灯不亮"], ["agent", "请检查电源"], ["buyer", "还是不亮"], ["agent", "给您建个工单"], ["buyer", "好的"], ["agent", "已建"]];
    const c = await conversation(env, lines, { endedAt: at(60), humanReplied: true, handedOff: true });
    const base = { merchantId: env.ctx.merchant.id, shopId: env.shopId, conversationId: c.conv.id, segmentId: c.segId, source: "agent" as const, messages: [], productStatus: "none" as const, stage: "aftersale" };
    await db().insert(schema.learningTask).values({ ...base, kind: "card_review" });
    expect((await job.pickCandidates(env.ctx.merchant.id)).map((x) => x.segmentId)).toContain(c.segId);
    await db().insert(schema.learningTask).values({ ...base, kind: "conversation" });
    expect((await job.pickCandidates(env.ctx.merchant.id)).map((x) => x.segmentId)).not.toContain(c.segId);
  });
});
