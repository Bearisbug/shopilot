// pnpm scenario <名称>：在 Demo Store 里构造时间敏感数据（docs/TEST.md §3 场景表）。每次新建对象、可重复执行；只用于本机。
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { mockDb } from "@/mock/db/client";
import { mockShop } from "@/mock/db/schema";
import { encrypt, randomToken, sha256 } from "@/server/core/crypto";
import { nextSequence } from "@/server/core/sequence";
import { db, pool, schema } from "@/server/db/client";
import { env } from "@/server/env";
import { writeDataFile } from "@/server/files/storage";
import { capabilitiesFor } from "@/server/platforms/capabilities";
import { oauthRedirectUrl, shopeeApp } from "@/server/platforms/clients";
import { shopeeAuthUrl } from "@/server/platforms/shopee";
import { plan } from "@/server/billing/plans";
import { builtinCategoryId } from "@/server/knowledge/categories";

if (!/@(127\.0\.0\.1|localhost):/.test(process.env.DATABASE_URL ?? "")) {
  console.error("scenario 只允许对本机数据库执行");
  process.exit(1);
}

const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);
const out = (o: Record<string, unknown>) => console.log(JSON.stringify(o, null, 2));

async function demo() {
  const [m] = await db().select().from(schema.merchant).where(eq(schema.merchant.name, "Demo Store")).orderBy(desc(schema.merchant.createdAt)).limit(1);
  if (!m) throw new Error("没有 Demo Store，先运行 pnpm db:reset && pnpm db:seed");
  return m;
}

async function member(merchantId: string, email: string) {
  const [r] = await db()
    .select({ id: schema.membership.id, name: schema.user.name })
    .from(schema.membership)
    .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .where(and(eq(schema.membership.merchantId, merchantId), eq(schema.user.email, email)))
    .limit(1);
  if (!r) throw new Error(`Demo Store 没有成员 ${email}`);
  return r;
}

async function shopByName(merchantId: string, name: string) {
  const [s] = await db().select().from(schema.shop).where(and(eq(schema.shop.merchantId, merchantId), eq(schema.shop.name, name))).limit(1);
  if (!s) throw new Error(`Demo Store 没有店铺 ${name}`);
  return s;
}

/** 直接写一个会话：消息按 minutesAgo 排列；不经平台 */
async function conversation(input: {
  shopName: string;
  state: "bot" | "awaiting_human" | "human" | "closed";
  claimedBy?: string | null;
  handoffReason?: string | null;
  messages: Array<{ from: "buyer" | "agent"; text: string; minutesAgo: number }>;
  draft?: { minutesAgo: number; text: string };
  ended?: boolean;
}) {
  const m = await demo();
  const shop = await shopByName(m.id, input.shopName);
  const tag = randomUUID().slice(0, 8);
  const buyerName = `scenario.${tag}`;
  const sorted = [...input.messages].sort((a, b) => b.minutesAgo - a.minutesAgo);
  const at = (x: { minutesAgo: number }) => ago(x.minutesAgo * MIN);
  const last = sorted[sorted.length - 1];
  const lastBuyer = [...sorted].reverse().find((x) => x.from === "buyer");
  const lastAgent = [...sorted].reverse().find((x) => x.from === "agent");
  return db().transaction(async (tx) => {
    const [conv] = await tx
      .insert(schema.conversation)
      .values({
        merchantId: m.id,
        shopId: shop.id,
        platform: shop.platform,
        externalConversationId: `scenario-${tag}`,
        buyerExternalId: `scenario-buyer-${tag}`,
        buyerName,
        handlingState: input.state,
        claimedBy: input.claimedBy ?? null,
        claimedAt: input.claimedBy ? at(sorted[0]) : null,
        handoffReason: input.handoffReason ?? null,
        lastMessageAt: at(last),
        lastBuyerAt: lastBuyer ? at(lastBuyer) : null,
        lastAgentAt: lastAgent ? at(lastAgent) : null,
      })
      .returning();
    const [seg] = await tx
      .insert(schema.segment)
      .values({
        merchantId: m.id,
        conversationId: conv.id,
        stage: "presale",
        stageSource: "auto",
        stageBasis: "场景构造",
        startedAt: at(sorted[0]),
        endedAt: input.ended ? at(last) : null,
        endReason: input.ended ? "resolved" : null,
        firstClaimedBy: input.claimedBy ?? null,
        firstBuyerAt: at(sorted[0]),
        humanReplied: !!lastAgent,
        firstHumanReplyAt: lastAgent ? at(lastAgent) : null,
      })
      .returning();
    await tx.update(schema.conversation).set({ currentSegmentId: seg.id }).where(eq(schema.conversation.id, conv.id));
    let trigger: string | null = null;
    for (const x of sorted) {
      const [row] = await tx
        .insert(schema.message)
        .values({
          merchantId: m.id,
          conversationId: conv.id,
          segmentId: seg.id,
          externalMessageId: `scenario-${randomUUID()}`,
          direction: x.from === "buyer" ? "in" : "out",
          senderRole: x.from === "buyer" ? "buyer" : "agent",
          sentBy: x.from === "agent" ? (input.claimedBy ?? null) : null,
          type: "text",
          text: x.text,
          sendStatus: x.from === "agent" ? "sent" : null,
          clientRequestId: x.from === "agent" ? `scenario-${randomUUID()}` : null,
          sentAt: at(x),
        })
        .returning();
      if (x.from === "buyer") trigger = row.id;
    }
    if (input.draft) {
      await tx.insert(schema.draft).values({
        merchantId: m.id,
        conversationId: conv.id,
        segmentId: seg.id,
        triggerMessageId: trigger,
        mode: "assist",
        text: input.draft.text,
        confidence: 0.8,
        status: "generated",
        model: "scenario",
        latencyMs: 1500,
        createdAt: ago(input.draft.minutesAgo * MIN),
      });
    }
    return { conversationId: conv.id, buyerName, link: `${env().APP_BASE_URL}/wb/${conv.id}` };
  });
}

async function invitation(status: "expired" | "revoked") {
  const m = await demo();
  const owner = await member(m.id, "owner@demo.test");
  const shop = await shopByName(m.id, "Demo Shopee MY");
  const token = randomToken();
  const email = `invite-${status}-${randomUUID().slice(0, 6)}@demo.test`;
  await db()
    .insert(schema.invitation)
    .values({ merchantId: m.id, email, role: "agent", shopIds: [shop.id], tokenHash: sha256(token), status, expiresAt: status === "expired" ? ago(60 * MIN) : new Date(Date.now() + 7 * 86400_000), invitedBy: owner.id });
  out({ email, link: `${env().APP_BASE_URL}/invite/${token}` });
}

async function ticket(input: { shopName: string; type: "return_refund" | "internal"; assignee: string; dueAt: Date; status?: "open" | "resolved"; resolvedAt?: Date; platform?: boolean }) {
  const m = await demo();
  const shop = await shopByName(m.id, input.shopName);
  const who = await member(m.id, input.assignee);
  const n = await nextSequence(db(), m.id, "ticket", 1001);
  let afterSaleId: string | null = null;
  let dedupeKey = `${input.type}:manual:${randomUUID()}`;
  if (input.platform) {
    const ext = `scenario-${randomUUID().slice(0, 8)}`;
    const [a] = await db()
      .insert(schema.afterSale)
      .values({ merchantId: m.id, shopId: shop.id, platform: shop.platform, kind: "return", externalId: ext, externalOrderId: `scenario-order-${ext}`, platformStatus: "RETURN_OR_REFUND_REQUEST_PENDING", nextAction: "SELLER_RESPOND_RETURN", sellerDueAt: input.dueAt, dueField: "seller_next_action_response.deadline", reason: "场景构造" })
      .returning();
    afterSaleId = a.id;
    dedupeKey = `return:${ext}`;
  }
  const [t] = await db()
    .insert(schema.ticket)
    .values({
      merchantId: m.id,
      number: `T-${n}`,
      type: input.type,
      origin: input.platform ? "platform" : "manual",
      dedupeKey,
      shopId: shop.id,
      platform: shop.platform,
      afterSaleId,
      buyerName: "scenario buyer",
      status: input.status ?? "open",
      phase: input.platform ? "待审核" : null,
      platformStatus: input.platform ? "RETURN_OR_REFUND_REQUEST_PENDING" : null,
      assigneeId: who.id,
      dueAt: input.dueAt,
      dueSource: input.platform ? "platform" : "merchant",
      resolvedAt: input.resolvedAt ?? null,
      description: "场景构造",
      createdBy: who.id,
    })
    .returning();
  await db().insert(schema.ticketEvent).values({ merchantId: m.id, ticketId: t.id, type: "created", source: "system", data: { scenario: true } });
  out({ ticket: t.number, id: t.id, link: `${env().APP_BASE_URL}/tickets/${t.id}` });
}

async function setUsage(used: number, alertsSent: number[] = []) {
  const m = await demo();
  const owner = await member(m.id, "owner@demo.test");
  const [p] = await db()
    .select()
    .from(schema.usagePeriod)
    .where(eq(schema.usagePeriod.merchantId, m.id))
    .orderBy(desc(schema.usagePeriod.periodStart))
    .limit(1);
  await db().update(schema.usagePeriod).set({ quota: 100, topupQuota: 0, draftsUsed: used, alertsSent }).where(eq(schema.usagePeriod.id, p.id));
  await db()
    .update(schema.subscription)
    .set({ overagePolicy: "stop", overageBudget: null, alertConfig: { thresholds: [80], recipients: [owner.id], email: false, inApp: true } })
    .where(eq(schema.subscription.merchantId, m.id));
  out({ quota: 100, used, overage: "stop", alertThreshold: 80 });
}

/** 在模拟平台与 Shopilot 同时建一家已授权的 Shopee 种子店（Demo Shopee 主账号 900001 下） */
/** 模拟库里还没用过的 Shopee 店铺号（从 start 往上找），避免随机号撞上已有的店 */
async function freeShopeeShopId(start: number): Promise<string> {
  const used = new Set((await mockDb().select({ id: mockShop.shopId }).from(mockShop).where(eq(mockShop.platform, "shopee"))).map((r) => r.id));
  let n = start;
  while (used.has(String(n))) n++;
  return String(n);
}

async function extraShopeeShop(name: string, region: string, currency: string) {
  const m = await demo();
  const [app] = await db().select().from(schema.platformApp).where(and(eq(schema.platformApp.merchantId, m.id), eq(schema.platformApp.platform, "shopee"))).limit(1);
  const shopId = await freeShopeeShopId(220100);
  const access = `mock-at-${shopId}`;
  const refresh = `mock-rt-${shopId}`;
  const now = Date.now();
  await mockDb()
    .insert(mockShop)
    .values({
      platform: "shopee",
      shopId,
      appKey: app.appKey,
      name,
      region,
      currency,
      mainAccountId: "900001",
      authStatus: "authorized",
      authTime: new Date(now),
      authExpiresAt: new Date(now + 365 * 86400_000),
      accessToken: access,
      accessExpiresAt: new Date(now + 4 * 3600_000),
      refreshToken: refresh,
      refreshExpiresAt: new Date(now + 30 * 86400_000),
      capabilities: { chat: true },
      performance: { response_rate: 90, response_time: 0.5 },
    });
  const [row] = await db()
    .insert(schema.shop)
    .values({
      merchantId: m.id,
      platformAppId: app.id,
      platform: "shopee",
      externalShopId: shopId,
      name,
      market: region,
      mainAccountId: "900001",
      accessTokenEnc: encrypt(access),
      refreshTokenEnc: encrypt(refresh),
      accessExpiresAt: new Date(now + 4 * 3600_000),
      authExpiresAt: new Date(now + 365 * 86400_000),
      capabilities: capabilitiesFor("shopee", { chat: true, orders: true, piiMasked: true, productScope: true }),
      backfill: { state: "done", conversations: 0, orders: 0 },
      connectedAt: new Date(now),
    })
    .returning();
  await db().insert(schema.shopReception).values({ shopId: row.id, merchantId: m.id, modeInHours: "off", modeOffHours: "off" });
  return row;
}

async function setPlan(code: "basic" | "growth") {
  const m = await demo();
  await db().update(schema.subscription).set({ planCode: code, pendingPlanCode: null }).where(eq(schema.subscription.merchantId, m.id));
  return plan(code).shopLimit;
}

/** 一份停在 queued 或 processing、最近更新在 minutesAgo 分钟前的资料（不排入库任务），给 knowledge.purge 的入库补扫用 */
async function stuckKnowledge(status: "queued" | "processing", minutesAgo: number) {
  const m = await demo();
  const owner = await member(m.id, "owner@demo.test");
  const tag = randomUUID().slice(0, 8);
  const bytes = new TextEncoder().encode(`补扫场景资料 ${tag}：退货需在签收后 7 天内申请。\n`);
  const fileId = randomUUID();
  const documentId = randomUUID();
  const path = `knowledge/${m.id}/${documentId}.txt`;
  await writeDataFile(path, bytes);
  await db().insert(schema.file).values({ id: fileId, merchantId: m.id, kind: "knowledge_source", path, mime: "text/plain", size: bytes.length, createdBy: owner.id });
  const [doc] = await db()
    .insert(schema.knowledgeDocument)
    .values({ id: documentId, merchantId: m.id, categoryId: await builtinCategoryId(m.id), fileId, name: `补扫-${status}-${tag}.txt`, mime: "text/plain", size: bytes.length, sha256: sha256(Buffer.from(bytes).toString("utf8")), status, uploadedBy: owner.id, createdAt: ago(minutesAgo * MIN), updatedAt: ago(minutesAgo * MIN) })
    .returning();
  out({ documentId: doc.id, name: doc.name, status: doc.status, updatedAt: doc.updatedAt?.toISOString() ?? null });
}

async function connectedShops(merchantId: string) {
  return db().select().from(schema.shop).where(and(eq(schema.shop.merchantId, merchantId), inArray(schema.shop.status, ["connected", "auth_expired"])));
}

const SCENARIOS: Record<string, () => Promise<void>> = {
  "invite-expired": () => invitation("expired"),
  "invite-revoked": () => invitation("revoked"),
  "ticket-due-soon": () => ticket({ shopName: "Demo TikTok MY", type: "return_refund", assignee: "lead@demo.test", dueAt: new Date(Date.now() + 5 * 3600_000), platform: true }),
  "ticket-overdue": () => ticket({ shopName: "Demo Shopee MY", type: "internal", assignee: "agent@demo.test", dueAt: ago(60 * MIN) }),
  "ticket-resolved-8d": () => ticket({ shopName: "Demo Shopee MY", type: "internal", assignee: "agent@demo.test", dueAt: ago(9 * 86400_000), status: "resolved", resolvedAt: ago(8 * 86400_000) }),
  "conversation-idle-73h": async () => {
    const m = await demo();
    const agent = await member(m.id, "agent@demo.test");
    out(await conversation({ shopName: "Demo Shopee MY", state: "human", claimedBy: agent.id, messages: [{ from: "buyer", text: "Hello, is this still available?", minutesAgo: 74 * 60 }, { from: "agent", text: "Yes, still in stock.", minutesAgo: 73 * 60 }] }));
  },
  "draft-25h": () =>
    conversation({ shopName: "Demo Shopee MY", state: "bot", messages: [{ from: "buyer", text: "Do you have this in blue?", minutesAgo: 25 * 60 + 1 }], draft: { minutesAgo: 25 * 60, text: "Hi! Yes, the blue one is in stock." } }).then(out),
  "segment-200d": async () => {
    const r = await conversation({ shopName: "Demo Shopee MY", state: "closed", ended: true, messages: [{ from: "buyer", text: "Old question from 200 days ago", minutesAgo: 200 * 1440 + 5 }, { from: "agent", text: "Old answer", minutesAgo: 200 * 1440 }], draft: { minutesAgo: 200 * 1440 + 2, text: "Old draft" } });
    await db().update(schema.draft).set({ status: "sent" }).where(eq(schema.draft.conversationId, r.conversationId));
    out(r);
  },
  "usage-near-quota": () => setUsage(79),
  "usage-exhausted": () => setUsage(100, [80]),
  "auth-expiring-20d": async () => {
    const m = await demo();
    const s = await shopByName(m.id, "Demo TikTok MY");
    await db().update(schema.shop).set({ authExpiresAt: new Date(Date.now() + 20 * 86400_000), authRemindedAt: [] }).where(eq(schema.shop.id, s.id));
    out({ shop: s.name, authExpiresAt: new Date(Date.now() + 20 * 86400_000).toISOString() });
  },
  "handover-candidate": async () => {
    const m = await demo();
    const agent = await member(m.id, "agent@demo.test");
    const r = await conversation({ shopName: "Demo Shopee MY", state: "human", claimedBy: agent.id, messages: [{ from: "agent", text: "Let me check for you.", minutesAgo: 40 }, { from: "buyer", text: "Any update please?", minutesAgo: 20 }] });
    // 今天的工作时段改为 1 分钟前结束（商户时区）
    const local = new Date(new Date().toLocaleString("en-US", { timeZone: m.timezone }));
    const end = new Date(local.getTime() - MIN);
    const key = (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[local.getDay()];
    const [rs] = await db().select().from(schema.receptionSettings).where(eq(schema.receptionSettings.merchantId, m.id));
    const hhmm = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
    await db()
      .update(schema.receptionSettings)
      .set({ schedule: { ...rs.schedule, [key]: { on: true, start: "00:00", end: hhmm } }, holidays: [] })
      .where(eq(schema.receptionSettings.merchantId, m.id));
    out({ ...r, todayEndsAt: hhmm });
  },
  "unclaimed-11m": async () => {
    const m = await demo();
    await db().update(schema.receptionSettings).set({ unclaimedRemindMinutes: 10 }).where(eq(schema.receptionSettings.merchantId, m.id));
    out(await conversation({ shopName: "Demo Shopee MY", state: "awaiting_human", handoffReason: "low_confidence", messages: [{ from: "buyer", text: "Hello? Anyone there?", minutesAgo: 11 }] }));
  },
  // 卖家在平台后台直接回复过：处理中、没有 Shopilot 处理人（模拟器没有「平台后台回复」动作，用场景造）
  "platform-human": async () =>
    out(await conversation({ shopName: "Demo Shopee MY", state: "human", claimedBy: null, handoffReason: "platform_human", messages: [{ from: "buyer", text: "Can I use it with Android?", minutesAgo: 6 }] })),
  // 工作时间外开始、林晓首个认领并回复的已结束会话段：人工首响只算工作时间内开始的段，这一段不进首响样本
  "first-reply-off-hours": async () => {
    const m = await demo();
    const owner = await member(m.id, "owner@demo.test");
    const r = await conversation({
      shopName: "Demo Shopee MY",
      state: "closed",
      claimedBy: owner.id,
      ended: true,
      messages: [
        { from: "buyer", text: "Is this still in stock?", minutesAgo: 30 },
        { from: "agent", text: "Yes, it is in stock.", minutesAgo: 10 },
      ],
    });
    await db().update(schema.segment).set({ firstReplyInHours: false }).where(eq(schema.segment.conversationId, r.conversationId));
    out({ ...r, firstClaimedBy: owner.name, firstReplySec: 20 * 60 });
  },
  "auth-link-6min": async () => {
    const m = await demo();
    const owner = await member(m.id, "owner@demo.test");
    const [app] = await db().select().from(schema.platformApp).where(and(eq(schema.platformApp.merchantId, m.id), eq(schema.platformApp.platform, "shopee"))).limit(1);
    const state = randomToken(24);
    await db().insert(schema.oauthState).values({ id: state, merchantId: m.id, membershipId: owner.id, platform: "shopee", expiresAt: ago(MIN), createdAt: ago(6 * MIN) });
    out({ link: shopeeAuthUrl(shopeeApp(app), `${oauthRedirectUrl("shopee")}?${new URLSearchParams({ state })}`), issuedAt: ago(6 * MIN).toISOString() });
  },
  "session-aged-9h": async () => {
    const [u] = await db().select().from(schema.user).where(eq(schema.user.email, "agent@demo.test")).limit(1);
    const [s] = await db().select().from(schema.session).where(eq(schema.session.userId, u.id)).orderBy(desc(schema.session.createdAt)).limit(1);
    if (!s) throw new Error("agent@demo.test 还没有登录会话，先登录一次");
    await db().update(schema.session).set({ createdAt: ago(9 * 3600_000) }).where(eq(schema.session.id, s.id));
    out({ sessionId: s.id, createdAt: ago(9 * 3600_000).toISOString() });
  },
  "export-expired": async () => {
    const m = await demo();
    const owner = await member(m.id, "owner@demo.test");
    const fileId = randomUUID();
    const path = `exports/${m.id}/scenario-${fileId}.zip`;
    await writeDataFile(path, new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]));
    await db().insert(schema.file).values({ id: fileId, merchantId: m.id, kind: "export_zip", path, mime: "application/zip", size: 22, createdBy: owner.id });
    const [job] = await db()
      .insert(schema.exportJob)
      .values({ merchantId: m.id, status: "done", fileId, requestedBy: owner.id, expiresAt: ago(MIN), finishedAt: ago(25 * 3600_000), createdAt: ago(25 * 3600_000) })
      .returning();
    out({ exportJobId: job.id, link: `${env().APP_BASE_URL}/api/v1/files/${fileId}` });
  },
  "shop-no-inbound-8d": async () => {
    const m = await demo();
    const s = await shopByName(m.id, "Demo TikTok TH");
    await db().update(schema.shop).set({ lastInboundAt: ago(8 * 86400_000), connectedAt: ago(30 * 86400_000) }).where(eq(schema.shop.id, s.id));
    out({ shop: s.name, lastInboundAt: ago(8 * 86400_000).toISOString() });
  },
  "plan-over-shop-limit": async () => {
    await setPlan("growth");
    const added = [];
    for (const [name, region, cur] of [["Demo Shopee TH", "TH", "THB"], ["Demo Shopee VN", "VN", "VND"], ["Demo Shopee PH 2", "PH", "PHP"], ["Demo Shopee ID", "ID", "IDR"]] as const) added.push((await extraShopeeShop(name, region, cur)).name);
    const m = await demo();
    out({ plan: "growth", added, connectedShops: (await connectedShops(m.id)).length, basicLimit: plan("basic").shopLimit });
  },
  "shop-limit-full": async () => {
    const limit = await setPlan("basic");
    const m = await demo();
    const added = [];
    while ((await connectedShops(m.id)).length < limit) added.push((await extraShopeeShop(`Demo Shopee Extra ${added.length + 1}`, "MY", "MYR")).name);
    // 主账号下另有一家未接入的模拟店
    const pending = await freeShopeeShopId(229000);
    await mockDb().insert(mockShop).values({ platform: "shopee", shopId: pending, appKey: "1000101", name: "Demo Shopee PH", region: "PH", currency: "PHP", mainAccountId: "900001", authStatus: "unauthorized", capabilities: { chat: true } });
    out({ plan: "basic", limit, connectedShops: (await connectedShops(m.id)).length, added, unconnectedMockShop: { shopId: pending, name: "Demo Shopee PH" } });
  },
  "knowledge-queued-11m": () => stuckKnowledge("queued", 11),
  "knowledge-processing-26m": () => stuckKnowledge("processing", 26),
};

async function main() {
  const name = process.argv[2];
  const run = name ? SCENARIOS[name] : undefined;
  if (!run) {
    console.error(`用法：pnpm scenario <名称>\n可用：${Object.keys(SCENARIOS).join("、")}`);
    process.exit(2);
  }
  await run();
}

main()
  .then(() => pool().end())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await pool().end();
    process.exit(1);
  });
