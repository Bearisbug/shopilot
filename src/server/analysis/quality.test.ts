// AI 质量周指标与自动生效暂停：周起始、暂停规则（两项指标、样本不足、只降一周、刚好 5 个百分点）不需要数据库；
// 周指标口径与同一周重算覆盖、连续回落时暂停并只通知一次、管理员恢复（重复恢复不写审计）、组长看全商户的状态（需要数据库）。
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { can, permissionsFor } from "@/lib/permissions";
import { brakeReason, weekStartOf } from "./quality";

type Week = Parameters<typeof brakeReason>[0][number];
/** 采纳率 a/den、一致率 c/den 的一周 */
const week = (weekStart: string, adoption: [number, number], consistency: [number, number] = [0, 0]): Week => ({
  merchantId: "m",
  weekStart,
  assistSent: adoption[0],
  assistEdited: 0,
  assistIgnored: adoption[1] - adoption[0],
  shadowSame: consistency[0],
  shadowPartial: 0,
  shadowDifferent: consistency[1] - consistency[0],
  aiSegments: 0,
  aiHandoffs: 0,
  computedAt: new Date(),
});

describe("周起始", () => {
  it("取所在周的周一（UTC）", () => {
    expect(weekStartOf(new Date("2026-10-19T00:00:00Z"))).toBe("2026-10-19");
    expect(weekStartOf(new Date("2026-10-25T23:59:59Z"))).toBe("2026-10-19");
    expect(weekStartOf(new Date("2026-10-26T00:30:00Z"))).toBe("2026-10-26");
  });
});

describe("暂停规则", () => {
  it("采纳率连续两周各降 ≥ 5 个百分点（三周样本都 ≥ 20）就暂停，原因写三周的比率", () => {
    expect(brakeReason([week("2026-09-28", [40, 50]), week("2026-10-05", [36, 50]), week("2026-10-12", [30, 50])])).toBe("辅助草稿采纳率连续两周下降：80% → 72% → 60%");
  });
  it("一致率同样适用；采纳率不降时看一致率", () => {
    expect(brakeReason([week("2026-09-28", [20, 20], [27, 30]), week("2026-10-05", [20, 20], [24, 30]), week("2026-10-12", [20, 20], [21, 30])])).toBe("影子回复一致率连续两周下降：90% → 80% → 70%");
  });
  it("某周样本不到 20 的那一项不参与", () => {
    expect(brakeReason([week("2026-09-28", [16, 20]), week("2026-10-05", [12, 19]), week("2026-10-12", [8, 20])])).toBeNull();
  });
  it("只降了一周不暂停；刚好 5 个百分点算，4 个不算；不满三周不判断", () => {
    expect(brakeReason([week("2026-09-28", [40, 50]), week("2026-10-05", [40, 50]), week("2026-10-12", [20, 50])])).toBeNull();
    expect(brakeReason([week("2026-09-28", [80, 100]), week("2026-10-05", [75, 100]), week("2026-10-12", [70, 100])])).toBe("辅助草稿采纳率连续两周下降：80% → 75% → 70%");
    expect(brakeReason([week("2026-09-28", [80, 100]), week("2026-10-05", [76, 100]), week("2026-10-12", [72, 100])])).toBeNull();
    expect(brakeReason([week("2026-10-05", [40, 50]), week("2026-10-12", [20, 50])])).toBeNull();
  });
});

describe.skipIf(!process.env.DATABASE_URL)("AI 质量周指标（需要数据库）", async () => {
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const q = await import("./quality");
  type MemberContext = import("@/server/auth/context").MemberContext;

  const userIds: string[] = [];
  const merchantIds: string[] = [];

  async function setup(): Promise<{ ctx: MemberContext; convId: string }> {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: "质量测试", email: `${userId}@test.invalid` });
    userIds.push(userId);
    const res = await db().transaction((tx) => provisionMerchant(tx, { name: "质量测试", timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantIds.push(res.merchant.id);
    const ctx: MemberContext = {
      requestId: "req_test",
      ip: "127.0.0.1",
      userAgent: null,
      user: { id: userId, name: "质量测试", email: `${userId}@test.invalid`, twoFactorEnabled: false },
      session: { id: "s", createdAt: new Date() },
      merchant: res.merchant,
      membership: { id: res.membership.id, role: "admin", status: "active" },
      isOwner: true,
      shopIds: null,
      twoFactorRequired: false,
      actor: { kind: "member", merchantId: res.merchant.id, membershipId: res.membership.id, userId, name: "质量测试", requestId: "req_test" },
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
    const [conv] = await db()
      .insert(schema.conversation)
      .values({ merchantId: ctx.merchant.id, shopId: shop.id, platform: "shopee", externalConversationId: `c-${randomUUID()}`, buyerExternalId: `b-${randomUUID()}`, buyerName: "buyer.test", handlingState: "human" })
      .returning();
    return { ctx, convId: conv.id };
  }

  /** 某一天处置的辅助草稿：按状态各几份 */
  async function assistDrafts(env: { ctx: MemberContext; convId: string }, day: string, counts: Partial<Record<"sent" | "edited_sent" | "ignored", number>>, mode: "assist" | "auto" = "assist") {
    const at = new Date(`${day}T06:00:00Z`);
    const rows = Object.entries(counts).flatMap(([status, n]) =>
      Array.from({ length: n ?? 0 }, () => ({ merchantId: env.ctx.merchant.id, conversationId: env.convId, mode, text: "草稿", confidence: 0.9, status: status as "sent", disposedAt: at, model: "stub", latencyMs: 1, createdAt: at })),
    );
    if (rows.length) await db().insert(schema.draft).values(rows);
  }

  afterAll(async () => {
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
  });

  const weekRow = async (merchantId: string, weekStart: string) => (await db().select().from(schema.aiQualityWeek).where(and(eq(schema.aiQualityWeek.merchantId, merchantId), eq(schema.aiQualityWeek.weekStart, weekStart))))[0];

  it("周指标：辅助草稿按处置时间、影子对比按对比时间、AI 接待段按开段时间与开段模式（回补不算）；同一周重算覆盖", async () => {
    const env = await setup();
    const m = env.ctx.merchant.id;
    await assistDrafts(env, "2026-10-13", { sent: 3, edited_sent: 1, ignored: 2 });
    await assistDrafts(env, "2026-10-20", { sent: 5 }); // 下一周
    await assistDrafts(env, "2026-10-14", { sent: 4 }, "auto"); // 不是辅助草稿
    const shadows = await db()
      .insert(schema.draft)
      .values(Array.from({ length: 4 }, () => ({ merchantId: m, conversationId: env.convId, mode: "shadow" as const, text: "影子", confidence: 0.9, status: "shadow" as const, model: "stub", latencyMs: 1 })))
      .returning({ id: schema.draft.id });
    // 第 4 份在下一周才对比
    const consistency = ["same", "same", "partial", "different"] as const;
    await db()
      .insert(schema.draftReview)
      .values(
        shadows.map((s, i) => ({
          merchantId: m,
          draftId: s.id,
          conversationId: env.convId,
          kind: "shadow" as const,
          draftStatus: "shadow",
          humanText: "人工",
          editClass: consistency[i] === "same" ? ("same" as const) : ("process" as const),
          consistency: consistency[i],
          model: "stub",
          comparedAt: new Date(i === 3 ? "2026-10-21T00:00:00Z" : "2026-10-15T00:00:00Z"),
        })),
      );
    const seg = (startedAt: string, openMode: "assist" | "auto" | "shadow" | "off", handedOff: boolean, backfilled = false) => ({ merchantId: m, conversationId: env.convId, stage: "aftersale" as const, startedAt: new Date(startedAt), openMode, handedOff, backfilled });
    await db()
      .insert(schema.segment)
      .values([seg("2026-10-12T01:00:00Z", "auto", true), seg("2026-10-13T01:00:00Z", "assist", false), seg("2026-10-14T01:00:00Z", "auto", false), seg("2026-10-15T01:00:00Z", "shadow", true), seg("2026-10-16T01:00:00Z", "auto", true, true)]);

    await q.computeQualityWeek(m, "2026-10-12");
    expect(await weekRow(m, "2026-10-12")).toMatchObject({ assistSent: 3, assistEdited: 1, assistIgnored: 2, shadowSame: 2, shadowPartial: 1, shadowDifferent: 0, aiSegments: 3, aiHandoffs: 1 });

    await assistDrafts(env, "2026-10-18", { ignored: 4 });
    await q.computeQualityWeek(m, "2026-10-12");
    const rows = await db().select().from(schema.aiQualityWeek).where(eq(schema.aiQualityWeek.merchantId, m));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ assistSent: 3, assistIgnored: 6 });
  });

  it("连续两周回落：暂停自动生效、通知管理员、写审计；已暂停的再算不重复通知；管理员恢复，重复恢复不写审计；组长看全商户的状态", async () => {
    const env = await setup();
    const m = env.ctx.merchant.id;
    // 采纳率 80% → 72% → 60%，每周 25 份
    await assistDrafts(env, "2026-09-29", { sent: 20, ignored: 5 });
    await assistDrafts(env, "2026-10-07", { sent: 18, ignored: 7 });
    await assistDrafts(env, "2026-10-14", { sent: 15, ignored: 10 });
    const monday = new Date("2026-10-19T00:30:00Z");
    expect(await q.qualityWeekly({ merchantId: m }, monday)).toEqual({ merchants: 1, paused: 1 });
    const [mer] = await db().select().from(schema.merchant).where(eq(schema.merchant.id, m));
    expect(mer.agentAutoapplyPausedAt).not.toBeNull();
    expect(mer.agentAutoapplyPauseReason).toBe("辅助草稿采纳率连续两周下降：80% → 72% → 60%");
    const notes = await db()
      .select()
      .from(schema.notification)
      .where(and(eq(schema.notification.merchantId, m), eq(schema.notification.event, "agent_autoapply_paused")));
    expect(notes).toMatchObject([{ membershipId: env.ctx.membership.id, title: "Agent 自动改卡已暂停", link: "/reception/knowledge?tab=cards" }]);
    const auditOf = async (action: string) =>
      db()
        .select()
        .from(schema.auditLog)
        .where(and(eq(schema.auditLog.merchantId, m), eq(schema.auditLog.action, action)));
    expect(await auditOf("agent_autoapply_paused")).toMatchObject([{ data: { metric: "adoption", rates: ["80%", "72%", "60%"], samples: 25 } }]);

    expect(await q.qualityWeekly({ merchantId: m }, monday)).toEqual({ merchants: 1, paused: 0 });
    expect(await db().select().from(schema.notification).where(and(eq(schema.notification.merchantId, m), eq(schema.notification.event, "agent_autoapply_paused")))).toHaveLength(1);

    // 组长：看全商户的暂停状态与周指标（不按负责店铺筛）
    const lead: MemberContext = { ...env.ctx, membership: { ...env.ctx.membership, role: "lead" }, isOwner: false, shopIds: [], can: (p) => can("lead", false, p), permissions: permissionsFor("lead", false) };
    const s = await q.agentStatus(lead);
    expect(s).toMatchObject({ paused: { reason: "辅助草稿采纳率连续两周下降：80% → 72% → 60%" }, todayApplied: 0, dailyLimit: 5 });
    expect(s.weeks.map((w) => [w.weekStart, w.adoption])).toEqual([
      ["2026-09-28", { num: 20, den: 25 }],
      ["2026-10-05", { num: 18, den: 25 }],
      ["2026-10-12", { num: 15, den: 25 }],
    ]);

    // 恢复只给管理员（API-KB-044 要 reception.manage）
    expect(can("lead", false, "reception.manage")).toBe(false);
    expect(can("admin", false, "reception.manage")).toBe(true);
    const admin = { ...env.ctx, merchant: mer };
    expect(await q.resumeAutoapply(admin)).toEqual({ paused: null });
    expect((await db().select().from(schema.merchant).where(eq(schema.merchant.id, m)))[0]).toMatchObject({ agentAutoapplyPausedAt: null, agentAutoapplyPauseReason: null });
    expect(await auditOf("agent_autoapply_resumed")).toMatchObject([{ data: { paused_days: 0 } }]);
    expect(await q.resumeAutoapply(admin)).toEqual({ paused: null });
    expect(await auditOf("agent_autoapply_resumed")).toHaveLength(1);
    expect((await q.agentStatus(lead)).paused).toBeNull();
  });
});
