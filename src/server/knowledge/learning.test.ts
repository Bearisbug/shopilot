// 会话学习：快照窗口、模型卡解析、复测指纹与对话拼法（不需要数据库）；提交与快照、限流、产品识别依据、分析各诊断的落点、
// Agent 改卡复测通过写 Agent 版本、复测没通过结束、审核人复测与发布、结束与重新分析、Agent 挑会话、会话删除后任务一并删除（需要数据库，AI_MODE=stub）。
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CardContent, LearningMessage } from "@/contracts/cards";
import { can, permissionsFor } from "@/lib/permissions";
import { cardFromModel } from "./learning-analyze";
import { snapshotWindow } from "./learning";
import { proposalHash, simInputOf } from "./retest";

const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn<(...args: unknown[]) => Promise<null>>(async () => null) }));
vi.mock("@/server/jobs/boss", () => ({ enqueue }));

const card = (over: Partial<CardContent> = {}): CardContent => ({
  title: "摄像头接上电脑后识别不到：帮买家恢复使用",
  productIds: [],
  stage: "aftersale",
  markets: ["ALL"],
  tags: [],
  conditions: ["买家说设备已接上电脑但识别不到"],
  conditionMode: "all",
  steps: [{ text: "问清电脑系统和连接方式", branches: [] }],
  tips: null,
  qaIds: [],
  ...over,
});

describe("快照窗口", () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ id: `m${i}` }));
  it("勾选的全留，前后各补 5 条，按时间排", () => {
    expect(snapshotWindow(rows, new Set(["m20"])).map((r) => r.id)).toEqual(["m15", "m16", "m17", "m18", "m19", "m20", "m21", "m22", "m23", "m24", "m25"]);
    expect(snapshotWindow(rows, new Set(["m0", "m59"])).map((r) => r.id)).toEqual(["m0", "m1", "m2", "m3", "m4", "m5", "m54", "m55", "m56", "m57", "m58", "m59"]);
  });
  it("最多 40 条，勾选的一定在里面，先补离勾选近的", () => {
    const picked = new Set(Array.from({ length: 20 }, (_, i) => `m${i * 3}`));
    const w = snapshotWindow(rows, picked);
    expect(w).toHaveLength(40);
    for (const id of picked) expect(w.some((r) => r.id === id)).toBe(true);
    expect(w.some((r) => r.id === "m1")).toBe(true);
  });
});

describe("模型写的卡", () => {
  const codes = new Map([["TL2-B", "11111111-1111-4111-8111-111111111111"]]);
  it("截断超长、丢掉跳转不合法的分支与不认识的动作；产品按编码对；新卡用全部站点", () => {
    const c = cardFromModel(
      {
        title: "题".repeat(150),
        conditions: ["条件一", "", "条件二"],
        condition_mode: "any",
        steps: [
          { text: "第一步", branches: [{ when: "急用", action: "handoff" }, { when: "跳自己", action: "goto", goto: 1 }, { when: "x", action: "refund" }] },
          { text: "第二步", branches: [{ when: "回去", action: "goto", goto: 1 }] },
        ],
        tips: "  ",
        stage: "insale",
        product_codes: ["tl2-b", "NOPE"],
      },
      null,
      codes,
      "aftersale",
    )!;
    expect([...c.title]).toHaveLength(100);
    expect(c.conditions).toEqual(["条件一", "条件二"]);
    expect(c.conditionMode).toBe("any");
    expect(c.steps[0].branches).toEqual([{ when: "急用", action: "handoff" }]);
    expect(c.steps[1].branches).toEqual([{ when: "回去", action: "goto", goto: 1 }]);
    expect(c).toMatchObject({ tips: null, stage: "insale", productIds: ["11111111-1111-4111-8111-111111111111"], markets: ["ALL"] });
  });
  it("改卡时没给编码沿用原卡的产品、站点、标签、关联问答；阶段不认识用原卡的；缺条件或步骤返回 null", () => {
    const base = card({ productIds: ["22222222-2222-4222-8222-222222222222"], markets: ["MY"], tags: ["连接"], qaIds: ["33333333-3333-4333-8333-333333333333"], stage: "presale" });
    const c = cardFromModel({ title: "改", conditions: ["c"], steps: [{ text: "s" }], stage: "bad" }, base, codes, "aftersale")!;
    expect(c).toMatchObject({ productIds: ["22222222-2222-4222-8222-222222222222"], markets: ["MY"], tags: ["连接"], qaIds: ["33333333-3333-4333-8333-333333333333"], stage: "presale" });
    expect(cardFromModel({ title: "无条件", conditions: [], steps: [{ text: "s" }] }, null, codes, "unknown")).toBeNull();
    expect(cardFromModel({ title: "无步骤", conditions: ["c"], steps: [] }, null, codes, "unknown")).toBeNull();
    expect(cardFromModel({ title: "阶段", conditions: ["c"], steps: [{ text: "s" }] }, null, codes, "unknown")!.stage).toBe("any");
  });
});

describe("复测指纹与对话", () => {
  it("内容或目标卡变了指纹就变", () => {
    expect(proposalHash(card(), null)).toBe(proposalHash(card(), null));
    expect(proposalHash(card(), null)).not.toBe(proposalHash(card({ tips: "x" }), null));
    expect(proposalHash(card(), null)).not.toBe(proposalHash(card(), "c1"));
  });
  it("对话截到勾选的最后一条买家文字，问题优先用 test_question", () => {
    const m = (id: string, from: LearningMessage["from"], text: string, selected = false): LearningMessage => ({ id, from, type: "text", text, at: "2026-10-21T00:00:00Z", selected });
    const messages = [m("1", "buyer", "你好"), m("2", "buyer", "识别不到", true), m("3", "seller", "请换线"), m("4", "buyer", "好了谢谢")];
    expect(simInputOf({ messages, testQuestion: null })).toMatchObject({ question: "识别不到", conversation: [{ text: "你好" }, { text: "识别不到" }] });
    expect(simInputOf({ messages: messages.map((x) => ({ ...x, selected: false })), testQuestion: "换个问法" }).question).toBe("换个问法");
    expect(simInputOf({ messages: messages.map((x) => ({ ...x, selected: false })), testQuestion: null }).conversation).toHaveLength(4);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("会话学习（需要数据库）", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "shopilot-learning-test-"));
  process.env.DATA_DIR = dataDir;
  process.env.KNOWLEDGE_MODE = "stub";
  process.env.AI_MODE = "stub";
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { Problem } = await import("@/server/http/problem");
  const svc = await import("./learning");
  const job = await import("./learning-analyze");
  const store = await import("./card-store");
  const dict = await import("@/server/products/dictionary");
  type MemberContext = import("@/server/auth/context").MemberContext;
  type Conv = typeof schema.conversation.$inferSelect;

  const userIds: string[] = [];
  const merchantIds: string[] = [];
  let ctx: MemberContext;
  let shopId = "";
  let savedAiStub: typeof schema.devAiStub.$inferSelect | undefined;
  const now = Date.now();
  const at = (minAgo: number) => new Date(now - minAgo * 60_000);

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
    [savedAiStub] = await db().select().from(schema.devAiStub).where(eq(schema.devAiStub.id, 1));
    await db().insert(schema.devAiStub).values({ id: 1, next: "normal", sticky: false }).onConflictDoUpdate({ target: schema.devAiStub.id, set: { next: "normal", sticky: false } });
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: "学习测试", email: `${userId}@test.invalid` });
    userIds.push(userId);
    const res = await db().transaction((tx) => provisionMerchant(tx, { name: "学习测试", timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantIds.push(res.merchant.id);
    ctx = {
      requestId: "req_test",
      ip: "127.0.0.1",
      userAgent: null,
      user: { id: userId, name: "学习测试", email: `${userId}@test.invalid`, twoFactorEnabled: false },
      session: { id: "s", createdAt: new Date() },
      merchant: res.merchant,
      membership: { id: res.membership.id, role: "admin", status: "active" },
      isOwner: true,
      shopIds: null,
      twoFactorRequired: false,
      actor: { kind: "member", merchantId: res.merchant.id, membershipId: res.membership.id, userId, name: "学习测试", requestId: "req_test" },
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
    shopId = shop.id;
    await dict.importProducts(ctx, "物料编码,名称\nTL2-B,OBSBOT Tail 2");
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
  async function conversation(lines: Array<["buyer" | "agent", string]>, seg: Partial<typeof schema.segment.$inferInsert> = {}): Promise<{ conv: Conv; segId: string; ids: string[] }> {
    const [conv] = await db()
      .insert(schema.conversation)
      .values({ merchantId: ctx.merchant.id, shopId, platform: "shopee", externalConversationId: `c-${randomUUID()}`, buyerExternalId: `b-${randomUUID()}`, buyerName: "buyer.test", handlingState: "human", claimedBy: ctx.membership.id })
      .returning();
    const [s] = await db()
      .insert(schema.segment)
      .values({ merchantId: ctx.merchant.id, conversationId: conv.id, stage: "aftersale", startedAt: at(lines.length + 10), firstBuyerAt: at(lines.length + 10), ...seg })
      .returning();
    await db().update(schema.conversation).set({ currentSegmentId: s.id }).where(eq(schema.conversation.id, conv.id));
    const ids: string[] = [];
    for (const [i, [role, text]] of lines.entries()) {
      const [m] = await db()
        .insert(schema.message)
        .values({ merchantId: ctx.merchant.id, conversationId: conv.id, segmentId: s.id, direction: role === "buyer" ? "in" : "out", senderRole: role, type: "text", text, sentAt: at(lines.length - i + 5) })
        .returning();
      ids.push(m.id);
    }
    return { conv: { ...conv, currentSegmentId: s.id }, segId: s.id, ids };
  }

  const taskOf = async (id: string) => (await db().select().from(schema.learningTask).where(eq(schema.learningTask.id, id)))[0];
  const writeCard = async (content: CardContent) => db().transaction(async (tx) => store.insertCard(tx, { merchantId: ctx.merchant.id, content, author: { kind: "member", memberId: ctx.membership.id }, vec: await store.tryEmbedCard(content) }));

  it("提交：快照勾选消息与前后各 5 条，记产品与依据、阶段与测试问题，排分析；别的会话的消息 422；同一会话每分钟 5 次", async () => {
    const lines: Array<["buyer" | "agent", string]> = Array.from({ length: 16 }, (_, i) => [i % 2 ? "agent" : "buyer", `第 ${i} 条`]);
    lines[8] = ["buyer", "TL2-B 接上电脑识别不到"];
    const { conv, ids, segId } = await conversation(lines);
    enqueue.mockClear();
    const r = await svc.submitLearning(ctx, conv.id, { messageIds: [ids[8], ids[9]], note: "这个流程要记下来" });
    expect(r.task).toMatchObject({ status: "analyzing", source: "member", note: "这个流程要记下来", submittedByName: "学习测试", productStatus: "identified", productBasis: "依据：消息里提到的型号或名称", stage: "aftersale", testQuestion: "TL2-B 接上电脑识别不到", products: [{ code: "TL2-B" }] });
    expect(r.task.messages.map((m) => m.text)).toEqual(lines.slice(3, 15).map((l) => l[1]));
    expect(r.task.messages.filter((m) => m.selected).map((m) => m.id)).toEqual([ids[8], ids[9]]);
    expect((await taskOf(r.task.id)).segmentId).toBe(segId);
    expect(enqueue).toHaveBeenCalledWith("learning.analyze", { taskId: r.task.id }, { singletonKey: r.task.id });

    const other = await conversation([["buyer", "另一个会话"]]);
    expect((await problemOf(svc.submitLearning(ctx, conv.id, { messageIds: [other.ids[0]] }))).status).toBe(422);
    for (let i = 0; i < 4; i++) await svc.submitLearning(ctx, conv.id, { messageIds: [ids[0]] });
    expect((await problemOf(svc.submitLearning(ctx, conv.id, { messageIds: [ids[0]] }))).status).toBe(429);

    const mine = await svc.conversationLearning(ctx, conv.id);
    expect(mine.items).toHaveLength(5);
    expect(mine.items.at(-1)).toMatchObject({ id: r.task.id, source: "member", status: "analyzing", messageIds: [ids[8], ids[9]], submittedByName: "学习测试" });
  });

  it("分析：「无需」→ 无需更新结束；「新卡」→ 内部测试后待审核，改后用到了这张拟发布卡", async () => {
    const a = await conversation([["buyer", "这个已经有答案了，无需再学"]]);
    const ta = await svc.submitLearning(ctx, a.conv.id, { messageIds: a.ids });
    await job.analyzeLearning({ taskId: ta.task.id });
    expect(await taskOf(ta.task.id)).toMatchObject({ status: "closed", result: "none_needed", diagnosis: "covered" });

    const b = await conversation([["buyer", "耳机充不进电"], ["agent", "请换充电线试试"]]);
    const tb = await svc.submitLearning(ctx, b.conv.id, { messageIds: b.ids, note: "建一张新卡" });
    await job.analyzeLearning({ taskId: tb.task.id });
    const row = await taskOf(tb.task.id);
    expect(row).toMatchObject({ status: "pending_review", diagnosis: "process", result: null, targetCardId: null });
    expect(row.proposal).toMatchObject({ title: "替身：耳机充不进电", stage: "aftersale", steps: [{ text: "替身第一步：问清情况" }] });
    expect(row.test).toMatchObject({ question: "耳机充不进电", after: { card: { cardId: "proposal", step: 1 } } });
    expect(row.test!.before.card).toBeNull();
  });

  it("Agent 改已有卡：复测通过即写 Agent 版本、标还没人看过、任务已发布；再改同一张卡时以前的用例变差 → 复测没通过、卡不动", async () => {
    const target = await writeCard(card({ title: "云台转不动：帮买家排查" }));
    const a = await conversation([["buyer", "云台转不动了，会变差吗"]]);
    const ta = await svc.submitLearning(ctx, a.conv.id, { messageIds: a.ids });
    await job.analyzeLearning({ taskId: ta.task.id });
    const done = await taskOf(ta.task.id);
    expect(done).toMatchObject({ status: "published", result: "card_updated", targetCardId: target.id, publishedCardId: target.id, publishedVersion: 2 });
    expect(done.retest).toMatchObject({ passed: true, regressions: [] });
    const [cardRow] = await db().select().from(schema.experienceCard).where(eq(schema.experienceCard.id, target.id));
    expect(cardRow).toMatchObject({ version: 2, agentUnseen: true });
    expect(cardRow.steps.at(-1)).toEqual({ text: "替身补充的一步", branches: [] });
    const [v2] = await db()
      .select()
      .from(schema.experienceCardVersion)
      .where(and(eq(schema.experienceCardVersion.cardId, target.id), eq(schema.experienceCardVersion.version, 2)));
    expect(v2).toMatchObject({ author: "agent", learningTaskId: ta.task.id, retest: { passed: true, regressions: 0, failReason: null } });

    const b = await conversation([["buyer", "云台又转不动"]]);
    const tb = await svc.submitLearning(ctx, b.conv.id, { messageIds: b.ids });
    await job.analyzeLearning({ taskId: tb.task.id });
    const failed = await taskOf(tb.task.id);
    expect(failed).toMatchObject({ status: "closed", result: "retest_failed", targetCardId: target.id });
    expect(failed.retest).toMatchObject({ passed: false, regressions: [{ taskId: ta.task.id, notWorse: false }] });
    expect(failed.error).toContain("改后变差");
    expect((await db().select().from(schema.experienceCard).where(eq(schema.experienceCard.id, target.id)))[0].version).toBe(2);
  });

  it("审核：没复测不能发布；复测通过后内容又改要重新复测；发布新建卡（人写、带学习任务）；结束写原因；版本不对 409", async () => {
    const c = await conversation([["buyer", "手机支架装不上"], ["agent", "先拧松底座"]]);
    const t = await svc.submitLearning(ctx, c.conv.id, { messageIds: c.ids, note: "新卡" });
    await job.analyzeLearning({ taskId: t.task.id });
    const pending = (await svc.getLearning(ctx, t.task.id)).task;
    expect(pending.status).toBe("pending_review");
    const edited = { ...pending.proposal!, title: "手机支架装不上：帮买家装好", steps: [{ text: "先拧松底座", branches: [] }] };
    expect((await problemOf(svc.publishLearning(ctx, t.task.id, { version: pending.version, card: edited }))).code).toBe("retest_required");

    const retested = (await svc.retestLearning(ctx, t.task.id, { version: pending.version, card: edited })).task;
    expect(retested.retest).toMatchObject({ passed: true, original: { card: { cardId: "proposal", title: "手机支架装不上：帮买家装好" } } });
    expect(retested.proposal?.title).toBe("手机支架装不上：帮买家装好");
    expect((await problemOf(svc.publishLearning(ctx, t.task.id, { version: retested.version, card: { ...edited, tips: "改了" } }))).code).toBe("retest_required");
    expect((await problemOf(svc.publishLearning(ctx, t.task.id, { version: pending.version, card: edited }))).code).toBe("version_conflict");

    const published = (await svc.publishLearning(ctx, t.task.id, { version: retested.version, card: edited })).task;
    expect(published).toMatchObject({ status: "published", result: "new_card", reviewedByName: "学习测试", publishedCard: { title: "手机支架装不上：帮买家装好", version: 1 } });
    const [cardRow] = await db().select().from(schema.experienceCard).where(eq(schema.experienceCard.id, published.publishedCard!.id));
    expect(cardRow).toMatchObject({ source: "member", agentUnseen: false, createdBy: ctx.membership.id });
    const [v1] = await db().select().from(schema.experienceCardVersion).where(eq(schema.experienceCardVersion.cardId, cardRow.id));
    expect(v1).toMatchObject({ author: "member", learningTaskId: t.task.id });

    const d = await conversation([["buyer", "镜头起雾"]]);
    const td = await svc.submitLearning(ctx, d.conv.id, { messageIds: d.ids, note: "新卡" });
    await job.analyzeLearning({ taskId: td.task.id });
    const p2 = (await svc.getLearning(ctx, td.task.id)).task;
    const closed = (await svc.closeLearning(ctx, td.task.id, { version: p2.version, result: "rejected", reason: "不是普遍问题" })).task;
    expect(closed).toMatchObject({ status: "closed", result: "rejected", reviewNote: "不是普遍问题", reviewedByName: "学习测试" });
    expect((await problemOf(svc.closeLearning(ctx, td.task.id, { version: closed.version, result: "none_needed" }))).code).toBe("invalid_state");
  });

  it("重新分析只限分析失败；列表按状态、来源筛选并带各状态数量", async () => {
    const c = await conversation([["buyer", "遥控器失灵"]]);
    const t = await svc.submitLearning(ctx, c.conv.id, { messageIds: c.ids });
    expect((await problemOf(svc.reanalyzeLearning(ctx, t.task.id, t.task.version))).code).toBe("invalid_state");
    await db().update(schema.learningTask).set({ status: "failed", error: "AI 超时，可以重新分析。" }).where(eq(schema.learningTask.id, t.task.id));
    enqueue.mockClear();
    const r = (await svc.reanalyzeLearning(ctx, t.task.id, t.task.version)).task;
    expect(r).toMatchObject({ status: "analyzing", error: null, version: t.task.version + 1 });
    expect(enqueue).toHaveBeenCalledWith("learning.analyze", { taskId: t.task.id }, { singletonKey: t.task.id });

    const list = await svc.listLearning(ctx, { status: "pending_review", limit: 30 });
    expect(list.items.every((x) => x.status === "pending_review")).toBe(true);
    expect(list.counts.pending_review).toBe(list.items.length);
    expect(list.counts.analyzing).toBeGreaterThan(0);
    expect((await svc.listLearning(ctx, { source: "agent", limit: 30 })).items).toEqual([]);
    const page = await svc.listLearning(ctx, { limit: 2 });
    expect(page.nextCursor).not.toBeNull();
    const next = await svc.listLearning(ctx, { limit: 2, cursor: page.nextCursor! });
    expect(next.items.map((x) => x.id)).not.toContain(page.items[0].id);
  });

  it("Agent 挑会话：已结束、有人工回复、≥ 2 分的段才挑，按分数排，不重复挑；回补的、没人工回复的不挑", async () => {
    const lines: Array<["buyer" | "agent", string]> = [["buyer", "灯不亮"], ["agent", "请检查电源"], ["buyer", "还是不亮"], ["agent", "给您建个工单"], ["buyer", "好的"], ["agent", "已建"]];
    const ended = { endedAt: at(60), humanReplied: true };
    const good = await conversation(lines, { ...ended, handedOff: true });
    const low = await conversation([["buyer", "谢谢"], ["agent", "不客气"]], { ...ended });
    const backfilled = await conversation(lines, { ...ended, handedOff: true, backfilled: true });
    const noHuman = await conversation(lines, { endedAt: at(60), humanReplied: false, handedOff: true });
    const cands = await job.pickCandidates(ctx.merchant.id);
    const segs = cands.map((x) => x.segmentId);
    expect(segs).toContain(good.segId);
    expect(cands.find((x) => x.segmentId === good.segId)?.score).toBe(3);
    for (const s of [low.segId, backfilled.segId, noHuman.segId]) expect(segs).not.toContain(s);

    enqueue.mockClear();
    const r = await job.pickLearning({ merchantId: ctx.merchant.id });
    expect(r.picked).toBeGreaterThanOrEqual(1);
    const [task] = await db()
      .select()
      .from(schema.learningTask)
      .where(and(eq(schema.learningTask.segmentId, good.segId), eq(schema.learningTask.source, "agent")));
    expect(task).toMatchObject({ source: "agent", submittedBy: null, status: "analyzing", testQuestion: "好的" });
    expect(task.messages).toHaveLength(6);
    expect(task.messages.every((m) => !m.selected)).toBe(true);
    expect(enqueue).toHaveBeenCalledWith("learning.analyze", { taskId: task.id }, { singletonKey: task.id });
    expect((await job.pickCandidates(ctx.merchant.id)).map((x) => x.segmentId)).not.toContain(good.segId);
  });

  it("会话删除后学习任务一并删除（买家删除数据、保留期清理都删会话或会话段）", async () => {
    const c = await conversation([["buyer", "要删的会话"]]);
    const t = await svc.submitLearning(ctx, c.conv.id, { messageIds: c.ids });
    await db().delete(schema.conversation).where(eq(schema.conversation.id, c.conv.id));
    expect(await taskOf(t.task.id)).toBeUndefined();
  });
});
