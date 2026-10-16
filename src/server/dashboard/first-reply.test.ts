// 需要数据库：DATABASE_URL 未设置时跳过（set -a && . ./.env && set +a && pnpm exec vitest run src/server/dashboard）。
// 看板口径（DESIGN §3 指标口径补充、§8.9 API-DASH-001）：AI 接待段做比率分母、首响按工作时段累计并含平台后台回复、
// 转人工前 AI 回过买家的段从转人工时刻起算、每日去向拆 Shopilot 与平台后台、影子回复数、无时限工单；团队页（API-TEAM-001）同口径。
import { randomUUID } from "node:crypto";
import { TZDate } from "@date-fns/tz";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MemberContext } from "@/server/auth/context";
import type { Schedule } from "@/server/db/schema";

describe.skipIf(!process.env.DATABASE_URL)("看板口径：AI 接待段、人工首响、去向、影子回复、无时限工单", async () => {
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { dashboard } = await import("./service");
  const { listMembers } = await import("@/server/team/service");

  const TZ = "Asia/Kuala_Lumpur";
  const userId = `test-${randomUUID()}`;
  let merchantId = "";
  let me = "";
  let ctx: MemberContext;
  // 5 天前（商户时区）的某个钟点；dayOffset = 1 是它的次日
  const local = new TZDate(Date.now(), TZ);
  const at = (hh: number, mm: number, dayOffset = 0) => new Date(new TZDate(local.getFullYear(), local.getMonth(), local.getDate() - 5 + dayOffset, hh, mm, 0, TZ).getTime());
  const D5 = `${at(12, 0).toLocaleDateString("sv-SE", { timeZone: TZ })}`;

  beforeAll(async () => {
    await db().insert(schema.user).values({ id: userId, name: "口径测试", email: `${userId}@test.invalid` });
    const { merchant, membership } = await db().transaction((tx) => provisionMerchant(tx, { name: "Dashboard Metrics", timezone: TZ, ownerUserId: userId }));
    merchantId = merchant.id;
    me = membership.id;
    const everyDay = { on: true, start: "09:00", end: "18:00" };
    const schedule: Schedule = { mon: everyDay, tue: everyDay, wed: everyDay, thu: everyDay, fri: everyDay, sat: everyDay, sun: everyDay };
    await db().update(schema.receptionSettings).set({ schedule, holidays: [] }).where(inArray(schema.receptionSettings.merchantId, [merchantId]));
    const [app] = await db()
      .insert(schema.platformApp)
      .values({ merchantId, platform: "shopee", appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), apiHost: "http://shopee.test", region: "sg", status: "verified" })
      .returning();
    const [shop] = await db()
      .insert(schema.shop)
      .values({ merchantId, platformAppId: app.id, platform: "shopee", externalShopId: "9001", name: "Shopee MY", market: "MY", capabilities: { chat: true, orders: true, piiMasked: false, productScope: true, cards: [], coupons: false, endSession: false, maxTextLength: 500 } })
      .returning();

    type Seg = {
      openMode: "off" | "shadow" | "assist" | "auto";
      start: Date;
      ended?: boolean;
      aiReplied?: boolean;
      aiResolved?: boolean;
      handedOffAt?: Date;
      handoffReason?: string;
      shopilotAt?: Date;
      platformAt?: Date[];
      shadowDraft?: boolean;
    };
    const segs: Seg[] = [
      // AI 接待（自动）并独立解决
      { openMode: "auto", start: at(9, 30), ended: true, aiReplied: true, aiResolved: true },
      // 自动：AI 回过买家，10:10 转人工，10:20 本人回复 → 从转人工起算 600 秒
      { openMode: "auto", start: at(10, 0), ended: true, aiReplied: true, handedOffAt: at(10, 10), handoffReason: "human_request", shopilotAt: at(10, 20) },
      // 辅助：草稿不发给买家，11:30 转人工，11:40 回复 → 仍从 11:00 起算 2400 秒
      { openMode: "assist", start: at(11, 0), ended: true, handedOffAt: at(11, 30), handoffReason: "manual", shopilotAt: at(11, 40) },
      // 影子：17:50 开段，次日 09:10 回复 → 下班前 10 分钟 + 上班后 10 分钟 = 1200 秒
      { openMode: "shadow", start: at(17, 50), ended: true, shopilotAt: at(9, 10, 1), shadowDraft: true },
      // 未开 AI：20:00（工作时间外）开段，次日 09:05 回复 → 从上班起算 300 秒
      { openMode: "off", start: at(20, 0), ended: true, shopilotAt: at(9, 5, 1) },
      // 影子：只有平台后台回复，14:02 → 120 秒；开段前挂进来的 13:00 那条不算
      { openMode: "shadow", start: at(14, 0), platformAt: [at(13, 0), at(14, 2)], shadowDraft: true },
      // 未开 AI：平台后台 15:01 先回、本人 15:30 再回 → 总体 60 秒，按人 1800 秒
      { openMode: "off", start: at(15, 0), ended: true, platformAt: [at(15, 1)], shopilotAt: at(15, 30) },
    ];
    for (const s of segs) {
      const [conv] = await db()
        .insert(schema.conversation)
        .values({ merchantId, shopId: shop.id, platform: "shopee", externalConversationId: `c-${randomUUID()}`, buyerExternalId: "b", buyerName: "Buyer", handlingState: s.ended ? "closed" : "human", claimedBy: s.shopilotAt ? me : null, handoffReason: s.handoffReason ?? null })
        .returning();
      const [seg] = await db()
        .insert(schema.segment)
        .values({
          merchantId,
          conversationId: conv.id,
          stage: "presale",
          startedAt: s.start,
          firstBuyerAt: s.start,
          endedAt: s.ended ? new Date(s.start.getTime() + 86_400_000) : null,
          endReason: s.ended ? "resolved" : null,
          openMode: s.openMode,
          aiReplied: !!s.aiReplied,
          aiResolved: !!s.aiResolved,
          handedOff: !!s.handedOffAt,
          handedOffAt: s.handedOffAt ?? null,
          humanReplied: !!(s.shopilotAt || s.platformAt),
          firstHumanReplyAt: s.shopilotAt ?? null,
          firstClaimedBy: s.shopilotAt ? me : null,
        })
        .returning();
      await db().update(schema.conversation).set({ currentSegmentId: seg.id }).where(inArray(schema.conversation.id, [conv.id]));
      for (const t of s.platformAt ?? []) {
        await db().insert(schema.message).values({ merchantId, conversationId: conv.id, segmentId: seg.id, externalMessageId: `m-${randomUUID()}`, direction: "out", senderRole: "platform_human", type: "text", text: "hi", sentAt: t });
      }
      if (s.shadowDraft) {
        await db().insert(schema.draft).values({ merchantId, conversationId: conv.id, segmentId: seg.id, mode: "shadow", text: "影子", confidence: 0.8, status: "shadow", model: "test", latencyMs: 1, createdAt: s.start });
      }
    }
    // 两张在 5 天前解决的工单：一张有截止时间且按时，一张没有截止时间
    const ticket = (n: number, dueAt: Date | null) => ({ merchantId, number: `T-${n}`, type: "internal" as const, origin: "manual" as const, dedupeKey: `k-${randomUUID()}`, shopId: shop.id, platform: "shopee" as const, status: "resolved" as const, dueAt, dueSource: dueAt ? ("merchant" as const) : null, resolvedAt: at(12, 0), assigneeId: me });
    await db().insert(schema.ticket).values([ticket(1, at(13, 0)), ticket(2, null)]);
    ctx = { merchant: { ...merchant }, membership: { id: me, role: "admin", status: "active" }, shopIds: null } as unknown as MemberContext;
  });

  afterAll(async () => {
    if (merchantId) await db().delete(schema.merchant).where(inArray(schema.merchant.id, [merchantId]));
    await db().delete(schema.user).where(inArray(schema.user.id, [userId]));
    await pool().end();
  });

  it("比率只算 AI 接待段；首响按工作时段、含平台后台回复；去向、影子回复与无时限工单单列", async () => {
    const d = await dashboard(ctx, "7d");
    expect(d.kpis.segments).toBe(7);
    // AI 接待段 3 个（自动 2、辅助 1），影子与未开 AI 的不进分母
    expect(d.kpis.aiResolved).toMatchObject({ num: 1, den: 3 });
    expect(d.kpis.handoffRate).toMatchObject({ num: 2, den: 3 });
    expect(d.handoffReasons.reduce((n, r) => n + r.count, 0)).toBe(2);
    // 总体样本 600、2400、1200、300、120、60 → 中位 450
    expect(d.kpis).toMatchObject({ firstReplySamples: 6, firstReplyMedianSec: 450 });
    // 按人只算本人回复：600、2400、1200、300、1800 → 中位 1200
    expect(d.people).toEqual([expect.objectContaining({ membershipId: me, segments: 5, firstReplyMedianSec: 1200 })]);
    expect(d.trend.find((t) => t.date === D5)).toEqual({ date: D5, segments: 7, aiResolved: 1, handedOff: 2, shopilot: 3, platform: 1, pending: 0 });
    expect(d.drafts).toMatchObject({ generated: 0, shadow: 2 });
    expect(d.tickets).toMatchObject({ resolved: 2, noDue: 1, onTimeRate: { num: 1, den: 1, rate: null } });
    expect(d.tickets.byType).toEqual([expect.objectContaining({ type: "internal", onTime: 1, noDue: 1 })]);
    expect(d.people[0].ticketsOnTimeRate).toMatchObject({ num: 1, den: 1 });
  });

  it("团队页与看板同口径：总体含平台后台回复，成员只算本人回复", async () => {
    const t = await listMembers(ctx, { role: "all", status: "all", period: "30d" });
    expect(t.stats.firstReplyMedianSec).toBe(450);
    expect(t.members.find((m) => m.membershipId === me)?.handled).toMatchObject({ segments: 5, firstReplyMedianSec: 1200 });
  });

  it("导出的当日一行与合计行", async () => {
    const { dashboardCsv } = await import("./service");
    const text = await (await dashboardCsv(ctx, "7d")).text();
    const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
    expect(lines[0]).toBe("日期,会话段,AI 独立解决,转人工,Shopilot 回复,平台后台回复,未回复或进行中,人工首响中位（秒）,辅助草稿,原样发送,改后发送,忽略,过期,影子回复,工单已解决,工单按时解决,工单无时限");
    expect(lines.find((l) => l.startsWith(D5))).toBe(`${D5},7,1,2,3,1,0,450,0,0,0,0,0,2,2,1,1`);
    expect(lines[lines.length - 1]).toBe("合计,7,1,2,3,1,0,450,0,0,0,0,0,2,2,1,1");
  });
});
