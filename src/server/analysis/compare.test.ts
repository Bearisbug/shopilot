// AI 草稿与人工回复对比（draft.compare）：模型输出解析与越界丢弃、选人工回复的规则（原样发送、修改后发送、忽略、影子；
// 截到下一条买家消息、最多 3 条、平台后台回复也算、发送失败不算）、生成满 15 分钟与 8 天的补扫窗口、看板汇总口径（分母不足 10）、
// 样例列表、历史补算、接口权限。解析与权限不需要数据库；其余需要 DATABASE_URL，且 AI_MODE=stub（替身按字面比较）。
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MemberContext } from "@/server/auth/context";
import { can, permissionsFor } from "@/lib/permissions";
import { parseCompare } from "./compare";

describe("模型输出解析", () => {
  it("合法输出：分类、一致性、理由与证据", () => {
    expect(parseCompare('{"edit_class":"correction","consistency":"different","reason":"时效从 7 天改成 10 天","evidence":"需要 10 天"}')).toEqual({
      editClass: "correction",
      consistency: "different",
      reason: "时效从 7 天改成 10 天",
      evidence: "需要 10 天",
    });
  });
  it("分类或一致性不在取值表里时丢弃（返回 null，不写库）", () => {
    expect(parseCompare('{"edit_class":"tone","consistency":"same","reason":"x"}')).toBeNull();
    expect(parseCompare('{"edit_class":"same","consistency":"mostly"}')).toBeNull();
    expect(parseCompare('{"consistency":"same"}')).toBeNull();
  });
  it("理由压成一行并截到 100 字，证据截到 200 字；空串记 null", () => {
    const r = parseCompare(JSON.stringify({ edit_class: "polish", consistency: "same", reason: `a\n b ${"改".repeat(150)}`, evidence: "证".repeat(300) }))!;
    expect(r.reason!.startsWith("a b 改")).toBe(true);
    expect([...r.reason!]).toHaveLength(100);
    expect([...r.evidence!]).toHaveLength(200);
    expect(parseCompare('{"edit_class":"same","consistency":"same","reason":"  ","evidence":""}')).toMatchObject({ reason: null, evidence: null });
  });
  it("不是 JSON 时抛错（这一轮不写库）", () => {
    expect(() => parseCompare("语义一致")).toThrow();
  });
});

describe("样例接口权限（dashboard.view）", () => {
  it("API 处理器要求 dashboard.view；管理员可看、组长按负责店铺、员工不可看", async () => {
    const src = await readFile(path.resolve(import.meta.dirname, "../../app/api/v1/dashboard/draft-reviews/route.ts"), "utf8");
    expect(src.match(/export const (GET|POST|PUT|PATCH|DELETE) = route\(/g)).toHaveLength(1);
    expect(src).toMatch(/auth: "member",\s+perm: "dashboard\.view"/);
    expect(can("admin", false, "dashboard.view")).toBe(true);
    expect(can("lead", false, "dashboard.view")).toBe(true);
    expect(can("agent", false, "dashboard.view")).toBe(false);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("草稿对比：补扫、人工回复选取、看板汇总、样例、补算", async () => {
  process.env.AI_MODE = "stub";
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { sweepDraftReviews, backfillDraftReviews, compareDraft } = await import("./compare");
  const { dashboard, draftReviewList } = await import("@/server/dashboard/service");

  const userId = `test-${randomUUID()}`;
  let merchantId = "";
  let ctx: MemberContext;
  const draft: Record<string, string> = {};
  const now = new Date();
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);

  type Reply = { at: number; text: string; role?: "agent" | "platform_human"; failed?: boolean; original?: string };
  type Spec = {
    key: string;
    mode: "assist" | "shadow";
    status: "sent" | "edited_sent" | "ignored" | "shadow";
    /** 买家触发消息、草稿生成的时间（分钟前） */
    at: number;
    draftText: string;
    replies?: Reply[];
    /** 触发之后的下一条买家消息（分钟前） */
    nextBuyerAt?: number;
    /** 原样或修改后发送：发出的那条消息 */
    sent?: Reply;
  };

  beforeAll(async () => {
    await db().insert(schema.user).values({ id: userId, name: "草稿对比", email: `${userId}@test.invalid` });
    const { merchant, membership } = await db().transaction((tx) => provisionMerchant(tx, { name: "Draft Compare", timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantId = merchant.id;
    ctx = {
      requestId: "req_test",
      ip: "127.0.0.1",
      userAgent: null,
      user: { id: userId, name: "草稿对比", email: `${userId}@test.invalid`, twoFactorEnabled: false },
      session: { id: "s", createdAt: new Date() },
      merchant,
      membership: { id: membership.id, role: "admin", status: "active" },
      isOwner: true,
      shopIds: null,
      twoFactorRequired: false,
      actor: { kind: "member", merchantId, membershipId: membership.id, userId, name: "草稿对比", requestId: "req_test" },
      can: (p) => can("admin", true, p),
      permissions: permissionsFor("admin", true),
    };
    const [app] = await db()
      .insert(schema.platformApp)
      .values({ merchantId, platform: "shopee", appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), apiHost: "http://shopee.test", region: "sg", status: "verified" })
      .returning();
    const [shop] = await db()
      .insert(schema.shop)
      .values({ merchantId, platformAppId: app.id, platform: "shopee", externalShopId: "9301", name: "Compare Shop", market: "MY", capabilities: { chat: true, orders: true, piiMasked: false, productScope: true, cards: [], coupons: false, endSession: false, maxTextLength: 500 } })
      .returning();

    const specs: Spec[] = [
      // 辅助草稿原样发送：不调 AI，直接记语义一致
      { key: "sent", mode: "assist", status: "sent", at: 60, draftText: "Your order ships today.", sent: { at: 59, text: "Your order ships today." } },
      // 修改后发送：比发出的那条（替身：发出的包含草稿 → 补充信息、部分一致）
      { key: "edited", mode: "assist", status: "edited_sent", at: 60, draftText: "It ships in 3 days.", sent: { at: 58, text: "It ships in 3 days. Please keep the original box.", original: "3 天内发货，请保留原包装。" } },
      // 辅助草稿被忽略、客服另行回复 → 比另回的那条
      { key: "ignored", mode: "assist", status: "ignored", at: 60, draftText: "好的", replies: [{ at: 55, text: "这款不支持 Mac，建议换 Tiny 2" }] },
      // 影子回复与人工回复一字不差 → 一致
      { key: "shadowSame", mode: "shadow", status: "shadow", at: 90, draftText: "您好，已经发货了", replies: [{ at: 85, text: "您好，已经发货了" }] },
      // 平台后台回复也算人工回复（替身：长度差太多 → 弃用重写、不一致）
      { key: "shadowPlatform", mode: "shadow", status: "shadow", at: 90, draftText: "您好，已发货", replies: [{ at: 80, text: "Sorry, we will check the courier and get back to you soon", role: "platform_human" }] },
      // 下一条买家消息之前有 4 条本方回复 → 只取前 3 条
      { key: "shadowMax", mode: "shadow", status: "shadow", at: 120, draftText: "好的", nextBuyerAt: 100, replies: [{ at: 118, text: "好的" }, { at: 117, text: "稍等" }, { at: 116, text: "马上处理" }, { at: 115, text: "第四条不取" }] },
      // 人工回复在下一条买家消息之后 → 不算这份草稿的回复，不对比
      { key: "shadowCut", mode: "shadow", status: "shadow", at: 120, draftText: "好的", nextBuyerAt: 110, replies: [{ at: 105, text: "好的" }] },
      // 只有发送失败的回复 → 不对比
      { key: "shadowFailed", mode: "shadow", status: "shadow", at: 120, draftText: "好的", replies: [{ at: 118, text: "好的", failed: true }] },
      // 生成不满 15 分钟 → 这一轮不对比
      { key: "fresh", mode: "shadow", status: "shadow", at: 5, draftText: "好的", replies: [{ at: 4, text: "好的" }] },
      // 10 天前的草稿：补扫只看 8 天内，交给补算
      { key: "old", mode: "shadow", status: "shadow", at: 10 * 1440, draftText: "好的", replies: [{ at: 10 * 1440 - 5, text: "好的" }] },
      // 凑够 10 份影子回复，验证一致率
      ...Array.from({ length: 8 }, (_, i): Spec => ({ key: `bulk${i}`, mode: "shadow", status: "shadow", at: 200 + i, draftText: "收到，马上为您查询", replies: [{ at: 195 + i, text: "收到，马上为您查询" }] })),
    ];
    for (const s of specs) {
      const [conv] = await db()
        .insert(schema.conversation)
        .values({ merchantId, shopId: shop.id, platform: "shopee", externalConversationId: `c-${randomUUID()}`, buyerExternalId: `b-${s.key}`, buyerName: `buyer.${s.key}`, handlingState: "human" })
        .returning();
      const [seg] = await db().insert(schema.segment).values({ merchantId, conversationId: conv.id, stage: "presale", startedAt: ago(s.at), firstBuyerAt: ago(s.at) }).returning();
      const base = { merchantId, conversationId: conv.id, segmentId: seg.id, type: "text" as const };
      const [trigger] = await db()
        .insert(schema.message)
        .values({ ...base, externalMessageId: `m-${randomUUID()}`, direction: "in", senderRole: "buyer", text: `问题 ${s.key}`, sentAt: ago(s.at) })
        .returning();
      if (s.nextBuyerAt !== undefined) await db().insert(schema.message).values({ ...base, externalMessageId: `m-${randomUUID()}`, direction: "in", senderRole: "buyer", text: "还在吗", sentAt: ago(s.nextBuyerAt) });
      const reply = (r: Reply) => ({
        ...base,
        externalMessageId: `m-${randomUUID()}`,
        direction: "out" as const,
        senderRole: r.role ?? ("agent" as const),
        text: r.text,
        originalText: r.original ?? null,
        sendStatus: r.role === "platform_human" ? null : r.failed ? ("failed" as const) : ("sent" as const),
        sentAt: ago(r.at),
      });
      if (s.replies?.length) await db().insert(schema.message).values(s.replies.map(reply));
      const [sentMsg] = s.sent ? await db().insert(schema.message).values(reply(s.sent)).returning() : [];
      const [d] = await db()
        .insert(schema.draft)
        .values({ merchantId, conversationId: conv.id, segmentId: seg.id, triggerMessageId: trigger.id, mode: s.mode, text: s.draftText, confidence: 0.8, status: s.status, sentMessageId: sentMsg?.id ?? null, model: "stub", latencyMs: 100, createdAt: ago(s.at) })
        .returning();
      draft[s.key] = d.id;
    }
  });

  afterAll(async () => {
    if (merchantId) await db().delete(schema.merchant).where(inArray(schema.merchant.id, [merchantId]));
    await db().delete(schema.user).where(inArray(schema.user.id, [userId]));
    await pool().end();
  });

  const review = async (key: string) => (await db().select().from(schema.draftReview).where(inArray(schema.draftReview.draftId, [draft[key]])))[0];

  it("补扫：生成满 15 分钟、8 天内的草稿才对比，忽略与影子要先有人工回复", async () => {
    // 库里可能有别的商户的待对比草稿（每轮最多 50 份），跑到没有可对比的为止
    for (let i = 0; i < 20 && (await sweepDraftReviews(now)).picked > 0; i++);
    const sent = await review("sent");
    expect(sent).toMatchObject({ kind: "assist", draftStatus: "sent", editClass: "same", consistency: "same", model: "rule", humanText: "Your order ships today." });
    expect(await review("edited")).toMatchObject({ kind: "assist", draftStatus: "edited_sent", editClass: "supplement", consistency: "partial", humanText: "It ships in 3 days. Please keep the original box." });
    expect(await review("ignored")).toMatchObject({ kind: "assist", draftStatus: "ignored", humanText: "这款不支持 Mac，建议换 Tiny 2" });
    expect(await review("shadowSame")).toMatchObject({ kind: "shadow", editClass: "same", consistency: "same", model: "stub" });
    expect(await review("shadowPlatform")).toMatchObject({ kind: "shadow", editClass: "rewrite", consistency: "different" });
    const max = await review("shadowMax");
    expect(max.humanMessageIds).toHaveLength(3);
    expect(max.humanText).toBe("好的\n稍等\n马上处理");
    for (const k of ["shadowCut", "shadowFailed", "fresh", "old"]) expect(await review(k)).toBeUndefined();
    // 没有人工回复的草稿单独对比时也不建记录
    expect(await compareDraft(draft.shadowCut)).toBe("no_reply");
    expect(await review("shadowCut")).toBeUndefined();
    // 再跑一轮不会重复对比
    const before = sent.comparedAt.getTime();
    await sweepDraftReviews(new Date(now.getTime() + 60_000));
    expect((await review("sent")).comparedAt.getTime()).toBe(before);
  });

  it("看板汇总：影子回复一致率满 10 份才计算，辅助草稿按处置计数，修改分类六类都列", async () => {
    const d = await dashboard(ctx, { preset: "7d" });
    const r = d.draftReview;
    // 影子：一致 = shadowSame + 8 份 bulk；不一致 = 平台后台那份；部分一致 = shadowMax（替身：回复包含草稿）
    expect(r.shadow).toMatchObject({ compared: 11, same: 9, partial: 1, different: 1 });
    expect(r.shadow.consistency.rate).toBeCloseTo(9 / 11);
    expect(r.assist).toEqual({ compared: 3, sent: 1, editedSent: 1, ignored: 1 });
    expect(r.byClass.shadow.map((x) => x.editClass)).toEqual(["same", "polish", "supplement", "correction", "process", "rewrite"]);
    expect(Object.fromEntries(r.byClass.shadow.map((x) => [x.editClass, x.count]))).toMatchObject({ same: 9, supplement: 1, rewrite: 1, polish: 0 });
    // 9 天前那天还没有对比（10 天前的草稿留给补算）→ 分母不足 10，不给一致率
    const day = ago(9 * 1440).toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
    const empty = await dashboard(ctx, { from: day, to: day });
    expect(empty.draftReview.shadow).toMatchObject({ compared: 0, consistency: { num: 0, den: 0, rate: null } });
  });

  it("样例列表：按类型与分类筛，带 AI 草稿、人工回复与理由，按生成时间倒序", async () => {
    const same = await draftReviewList(ctx, { preset: "7d" }, "shadow", "same");
    expect(same.total).toBe(9);
    expect(same.items[0]).toMatchObject({ draftText: "您好，已经发货了", humanText: "您好，已经发货了", editClass: "same", shopName: "Compare Shop" });
    const assist = await draftReviewList(ctx, { preset: "7d" }, "assist", "supplement");
    expect(assist.items.map((x) => x.draftId)).toEqual([draft.edited]);
    expect(assist.items[0].reason).toBeTruthy();
    const all = await draftReviewList(ctx, { preset: "7d" }, "assist", null);
    expect(all.total).toBe(3);
  });

  it("补算：按日期范围补 8 天以前的草稿", async () => {
    const lines: string[] = [];
    const r = await backfillDraftReviews({ from: ago(11 * 1440), to: ago(9 * 1440), merchantId, perSecond: 100, log: (l) => lines.push(l) });
    expect(r.done).toBe(1);
    expect(await review("old")).toMatchObject({ kind: "shadow", editClass: "same" });
  });
});
