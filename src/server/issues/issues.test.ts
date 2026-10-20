// 看板问题提取：模型输出解析、定时补扫选段（买家停 30 分钟、新发言后重提、回补与达人会话不提）、
// 类别增删改名（「其他」内置、删除后会话段归「其他」）、看板两个视图的统计与类别下的会话段列表、历史补算。
// 解析部分不需要数据库；其余需要 DATABASE_URL，且 AI_MODE=stub（替身按关键词归类）。
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_ISSUE_CATEGORIES, ISSUE_OTHER, type IssueCategory } from "@/contracts/issues";
import type { MemberContext } from "@/server/auth/context";
import { can, permissionsFor } from "@/lib/permissions";
import { parseIssue } from "./extract";

const CATS: IssueCategory[] = DEFAULT_ISSUE_CATEGORIES.map((name, i) => ({ id: `c${i}`, name, builtin: name === ISSUE_OTHER }));
const id = (name: string) => CATS.find((c) => c.name === name)!.id;

describe("模型输出解析", () => {
  it("类别名原样匹配", () => {
    expect(parseIssue('{"summary":"买家问快递到哪了","category":"物流查询"}', CATS)).toEqual({ summary: "买家问快递到哪了", categoryId: id("物流查询") });
  });
  it("忽略空白与括号、逗号的写法差异", () => {
    expect(parseIssue('{"summary":"问库存","category":"商品咨询(库存,规格,价格)"}', CATS).categoryId).toBe(id("商品咨询（库存、规格、价格）"));
  });
  it("类别不在表里或缺失时归「其他」，总结为空时为 null", () => {
    expect(parseIssue('{"summary":"  ","category":"售后服务"}', CATS)).toEqual({ summary: null, categoryId: id(ISSUE_OTHER) });
    expect(parseIssue('{"summary":"x"}', CATS).categoryId).toBe(id(ISSUE_OTHER));
  });
  it("总结压成一行并截到 60 字", () => {
    const long = "买".repeat(80);
    const r = parseIssue(JSON.stringify({ summary: `a\n b  ${long}`, category: "开票" }), CATS);
    expect(r.summary!.startsWith("a b 买")).toBe(true);
    expect([...r.summary!]).toHaveLength(60);
    expect(r.summary!.endsWith("…")).toBe(true);
  });
  it("不是 JSON 时抛错（这一轮不写库）", () => {
    expect(() => parseIssue("物流查询", CATS)).toThrow();
  });
});

describe.skipIf(!process.env.DATABASE_URL)("问题提取：补扫、类别、看板统计、补算", async () => {
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { sweepIssues, backfillIssues } = await import("./extract");
  const { createIssueCategory, deleteIssueCategory, listIssueCategories, renameIssueCategory } = await import("./categories");
  const { dashboard, issueList } = await import("@/server/dashboard/service");

  const userId = `test-${randomUUID()}`;
  let merchantId = "";
  let ctx: MemberContext;
  const seg: Record<string, string> = {};
  const now = new Date();
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);

  beforeAll(async () => {
    await db().insert(schema.user).values({ id: userId, name: "问题提取", email: `${userId}@test.invalid` });
    const { merchant, membership } = await db().transaction((tx) => provisionMerchant(tx, { name: "Issue Extract", timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantId = merchant.id;
    ctx = {
      requestId: "req_test",
      ip: "127.0.0.1",
      userAgent: null,
      user: { id: userId, name: "问题提取", email: `${userId}@test.invalid`, twoFactorEnabled: false },
      session: { id: "s", createdAt: new Date() },
      merchant,
      membership: { id: membership.id, role: "admin", status: "active" },
      isOwner: true,
      shopIds: null,
      twoFactorRequired: false,
      actor: { kind: "member", merchantId, membershipId: membership.id, userId, name: "问题提取", requestId: "req_test" },
      can: (p) => can("admin", true, p),
      permissions: permissionsFor("admin", true),
    };
    const [app] = await db()
      .insert(schema.platformApp)
      .values({ merchantId, platform: "shopee", appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), apiHost: "http://shopee.test", region: "sg", status: "verified" })
      .returning();
    const [shop] = await db()
      .insert(schema.shop)
      .values({ merchantId, platformAppId: app.id, platform: "shopee", externalShopId: "9101", name: "Issue Shop", market: "MY", capabilities: { chat: true, orders: true, piiMasked: false, productScope: true, cards: [], coupons: false, endSession: false, maxTextLength: 500 } })
      .returning();

    type Spec = { key: string; buyer: Array<[number, string]>; agentAt?: number; backfilled?: boolean; affiliate?: boolean; handedOff?: boolean; extractedAt?: number };
    const specs: Spec[] = [
      // 买家 2 小时前问物流、1 小时 50 分前客服回过 → 提取，替身归「物流查询」
      { key: "logistics", buyer: [[120, "我的快递到哪了？"]], agentAt: 110 },
      // 买家 10 分钟前才发言 → 还没停够 30 分钟，不提取
      { key: "fresh", buyer: [[10, "有现货吗"]] },
      // 回补段、达人会话 → 不提取
      { key: "backfilled", buyer: [[120, "发票怎么开"]], backfilled: true },
      { key: "affiliate", buyer: [[120, "合作佣金多少"]], affiliate: true },
      // 1 小时前提取过，40 分钟前买家又问了退款 → 重新提取
      { key: "again", buyer: [[180, "有优惠券吗"], [40, "我要退款"]], extractedAt: 60 },
      // AI 接待后转人工的段：问发票 → 两个视图都有
      { key: "handoff", buyer: [[90, "能开发票吗"]], handedOff: true },
      // 10 天前的段：补扫只看 8 天内，交给补算
      { key: "old", buyer: [[10 * 1440, "东西坏了连不上电脑"]] },
    ];
    for (const s of specs) {
      const start = ago(s.buyer[0][0]);
      const [conv] = await db()
        .insert(schema.conversation)
        .values({ merchantId, shopId: shop.id, platform: "shopee", externalConversationId: `c-${randomUUID()}`, buyerExternalId: `b-${s.key}`, buyerName: `buyer.${s.key}`, buyerKind: s.affiliate ? "affiliate" : "buyer", handlingState: "human" })
        .returning();
      const [row] = await db()
        .insert(schema.segment)
        .values({
          merchantId,
          conversationId: conv.id,
          stage: "presale",
          startedAt: start,
          firstBuyerAt: start,
          backfilled: !!s.backfilled,
          openMode: s.handedOff ? "auto" : "off",
          handedOff: !!s.handedOff,
          handedOffAt: s.handedOff ? ago(s.buyer[0][0] - 1) : null,
          issueExtractedAt: s.extractedAt ? ago(s.extractedAt) : null,
          issueSummary: s.extractedAt ? "旧总结" : null,
        })
        .returning();
      seg[s.key] = row.id;
      const msg = (senderRole: "buyer" | "agent", text: string, sentAt: Date) => ({ merchantId, conversationId: conv.id, segmentId: row.id, externalMessageId: `m-${randomUUID()}`, direction: senderRole === "buyer" ? ("in" as const) : ("out" as const), senderRole, type: "text" as const, text, sentAt });
      await db()
        .insert(schema.message)
        .values([...s.buyer.map(([m, t]) => msg("buyer", t, ago(m))), ...(s.agentAt ? [msg("agent", "已经发货了", ago(s.agentAt))] : [])]);
    }
  });

  afterAll(async () => {
    if (merchantId) await db().delete(schema.merchant).where(inArray(schema.merchant.id, [merchantId]));
    await db().delete(schema.user).where(inArray(schema.user.id, [userId]));
    await pool().end();
  });

  const segRow = async (key: string) => (await db().select().from(schema.segment).where(inArray(schema.segment.id, [seg[key]])))[0];
  const catId = async (name: string) => (await listIssueCategories(ctx)).items.find((c) => c.name === name)!.id;

  it("开通商户时建好默认类别，「其他」排最后且是内置", async () => {
    const { items } = await listIssueCategories(ctx);
    expect(items.map((c) => c.name)).toEqual([...DEFAULT_ISSUE_CATEGORIES]);
    expect(items.filter((c) => c.builtin).map((c) => c.name)).toEqual([ISSUE_OTHER]);
  });

  it("补扫只提取买家已停 30 分钟、8 天内的段，提取后买家再发言会重提", async () => {
    // 库里可能有别的商户的待提取段（每轮最多 50 段），跑到没有可提取的为止
    for (let i = 0; i < 20 && (await sweepIssues(now)).picked > 0; i++);
    const [logistics, fresh, backfilled, affiliate, again, handoff, old] = await Promise.all(["logistics", "fresh", "backfilled", "affiliate", "again", "handoff", "old"].map(segRow));
    expect(logistics.issueCategoryId).toBe(await catId("物流查询"));
    expect(logistics.issueSummary).toContain("快递");
    expect(again.issueCategoryId).toBe(await catId("退换货与退款"));
    expect(again.issueSummary).not.toBe("旧总结");
    expect(handoff.issueCategoryId).toBe(await catId("开票"));
    for (const s of [fresh, backfilled, affiliate, old]) expect(s.issueExtractedAt).toBeNull();
    // 再跑一轮不会重复提取已是最新的段
    const before = logistics.issueExtractedAt!.getTime();
    await sweepIssues(new Date(now.getTime() + 60_000));
    expect((await segRow("logistics")).issueExtractedAt!.getTime()).toBe(before);
  });

  it("看板两个视图：全部问题按类别计数、未提取的计为待提取；转人工的只算转人工的 AI 接待段", async () => {
    const d = await dashboard(ctx, { preset: "7d" });
    const all = d.issues.views.all;
    // 7 天内有买家发言的非回补、非达人段：logistics、fresh、again、handoff
    expect(all.segments).toBe(4);
    expect(all.pending).toBe(1);
    const count = async (v: typeof all, name: string) => {
      const cid = await catId(name);
      return v.byCategory.find((x) => x.categoryId === cid)?.count ?? 0;
    };
    expect(await count(all, "物流查询")).toBe(1);
    expect(await count(all, "退换货与退款")).toBe(1);
    expect(await count(all, "开票")).toBe(1);
    expect(all.trend.reduce((n, t) => n + Object.values(t.counts).reduce((a, b) => a + b, 0), 0)).toBe(3);
    expect(d.issues.views.handoff).toMatchObject({ segments: 1, pending: 0, byCategory: [{ categoryId: await catId("开票"), count: 1 }] });
    expect(d.issues.categories.at(-1)).toMatchObject({ name: ISSUE_OTHER, builtin: true });
  });

  it("类别下的会话段列表：带店铺、买家与一句话总结", async () => {
    const r = await issueList(ctx, { preset: "7d" }, "all", await catId("物流查询"));
    expect(r).toMatchObject({ categoryName: "物流查询", total: 1 });
    expect(r.items[0]).toMatchObject({ segmentId: seg.logistics, shopName: "Issue Shop", buyerName: "buyer.logistics" });
    expect((await issueList(ctx, { preset: "7d" }, "handoff", await catId("物流查询"))).total).toBe(0);
  });

  it("类别增删改名：同名 409；「其他」不能改名或删除；删除后其中会话段归「其他」", async () => {
    const created = await createIssueCategory(ctx, "保修咨询");
    expect((await listIssueCategories(ctx)).items.at(-2)?.name).toBe("保修咨询");
    await expect(createIssueCategory(ctx, "保修咨询")).rejects.toMatchObject({ type: "duplicate" });
    const other = await catId(ISSUE_OTHER);
    await expect(renameIssueCategory(ctx, other, "杂项")).rejects.toMatchObject({ type: "not-allowed" });
    await expect(deleteIssueCategory(ctx, other)).rejects.toMatchObject({ type: "not-allowed" });
    expect((await renameIssueCategory(ctx, created.id, "保修与延保")).name).toBe("保修与延保");
    await deleteIssueCategory(ctx, created.id);
    const logistics = await catId("物流查询");
    expect(await deleteIssueCategory(ctx, logistics)).toEqual({ movedSegments: 1 });
    expect((await segRow("logistics")).issueCategoryId).toBe(other);
    const r = await issueList(ctx, { preset: "7d" }, "all", other);
    expect(r.items.map((i) => i.segmentId)).toContain(seg.logistics);
  });

  it("补算历史：只补没提取的，按日期范围", async () => {
    const r = await backfillIssues({ from: ago(11 * 1440), to: ago(9 * 1440), merchantId, perSecond: 100 });
    expect(r).toMatchObject({ total: 1, done: 1, failed: 0 });
    expect((await segRow("old")).issueCategoryId).toBe(await catId("产品使用与故障"));
    // 再跑一次没有可补的段
    expect((await backfillIssues({ from: ago(11 * 1440), to: ago(9 * 1440), merchantId, perSecond: 100 })).total).toBe(0);
  });
});
