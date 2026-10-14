// pnpm db:seed：在空库上建 Demo Store 与 Other Store（账号、成员、平台应用、已接入店铺），重建模拟平台数据，
// 再把模拟平台里已授权店铺的会话、订单、售后导入 Shopilot（docs/TEST.md §3 的基线）。只用于本机。
import { and, eq, inArray } from "drizzle-orm";
import { MOCK_BUYERS } from "@/mock/fixtures";
import { mockDb } from "@/mock/db/client";
import { mockAfterSale, mockBuyerThread, mockMessage, mockOrder, mockShop } from "@/mock/db/schema";
import { seedMock } from "@/mock/seed";
import { shopeeMessageFields, shopeeOrderDetail, shopeeReturnFields } from "@/mock/shopee/ops";
import { tiktokCancelFields, tiktokMessageFields, tiktokOrderFields, tiktokReturnFields } from "@/mock/tiktok/ops";
import { auth } from "@/server/auth/auth";
import { judgeStage } from "@/server/conversations/stage";
import { encrypt } from "@/server/core/crypto";
import { db, pool, schema } from "@/server/db/client";
import { env, shopeeHosts } from "@/server/env";
import { syncShopeeCancelRequest } from "@/server/inbound/process";
import { boss, enqueue } from "@/server/jobs/boss";
import { provisionMerchant } from "@/server/merchants/provision";
import { upsertAfterSale, upsertOrder } from "@/server/orders/mirror";
import { capabilitiesFor } from "@/server/platforms/capabilities";
import { webhookUrl } from "@/server/platforms/clients";
import { normalizeShopeeMessage, normalizeShopeeOrder, normalizeShopeeReturn } from "@/server/platforms/shopee";
import { normalizeTiktokAfterSale, normalizeTiktokMessage, normalizeTiktokOrder } from "@/server/platforms/tiktok";
import type { NormalizedMessage } from "@/server/platforms/types";
import { syncAfterSaleTicket } from "@/server/tickets/platform";
import { createTicket } from "@/server/tickets/engine";
import { createInvoice } from "@/server/invoices/service";
import { permissionsFor, type Permission } from "@/lib/permissions";

if (!/@(127\.0\.0\.1|localhost):/.test(process.env.DATABASE_URL ?? "")) {
  console.error("db:seed 只允许对本机数据库执行");
  process.exit(1);
}

const PASSWORD = "Shopilot-Demo-2026";
const TZ = "Asia/Kuala_Lumpur";

type Mode = "off" | "shadow" | "assist" | "auto";
type Who = "owner" | "admin2" | "lead" | "agent" | "agent2" | "other";

const USERS: Record<Who, { email: string; name: string }> = {
  owner: { email: "owner@demo.test", name: "林晓" },
  admin2: { email: "admin2@demo.test", name: "陈卓" },
  lead: { email: "lead@demo.test", name: "Arif Rahman" },
  agent: { email: "agent@demo.test", name: "Nur Aisyah" },
  agent2: { email: "agent2@demo.test", name: "Mei Lin" },
  other: { email: "other@demo.test", name: "Rizal Hakim" },
};

/** 已接入店铺：模拟平台店铺 ID → Shopilot 设定 */
const SHOPS: Record<string, { merchant: "demo" | "other"; modes: [Mode, Mode]; productScope: boolean }> = {
  "shopee:220001": { merchant: "demo", modes: ["assist", "assist"], productScope: true },
  "shopee:220002": { merchant: "demo", modes: ["shadow", "shadow"], productScope: true },
  "tiktok:7000001": { merchant: "demo", modes: ["assist", "auto"], productScope: false },
  "tiktok:7000002": { merchant: "demo", modes: ["off", "off"], productScope: true },
  "tiktok:7000003": { merchant: "other", modes: ["assist", "assist"], productScope: true },
};

/**
 * 会话初始状态（按模拟平台会话 ID）。没列的会话：最后一条是卖家 → 已结束；否则按店铺模式进 AI 或待认领。
 * draft 为 AI 草稿（assist）或影子回复（shadow）的正文与置信度。
 */
const PLAN: Record<string, { state: "bot" | "awaiting_human" | "human" | "closed"; claim?: Who; handoff?: string; draft?: { text: string; confidence: number } }> = {
  "1871200300114510001": { state: "bot", draft: { text: "Hai Cik Nurul, parcel anda (251006K7QX2M1A) sedang dalam perjalanan bersama SPX dan dijangka sampai dalam 1–2 hari bekerja. Kami akan terus pantau untuk anda ya.", confidence: 0.82 } },
  "1871200300114510002": { state: "human", claim: "agent" },
  "1871200300114510003": { state: "human", claim: "agent2" },
  "1871200300114510004": { state: "awaiting_human", handoff: "low_confidence" },
  "1871200300224520001": { state: "awaiting_human", handoff: "shadow", draft: { text: "Hi Chloe, sure — we'll prepare a tax invoice for order 250921C2VB7N3D under Lumen Studio Pte Ltd (UEN 201912345K) and send it here shortly.", confidence: 0.74 } },
  "1871200300224520002": { state: "closed", claim: "admin2" },
  "1871200300224520003": { state: "awaiting_human", handoff: "shadow", draft: { text: "Hi Priya, sorry to hear that! We'll check with the courier right away and update you within today.", confidence: 0.66 } },
  "1871200300224520004": { state: "human", claim: "admin2" },
  "7494560109732330101": { state: "bot", draft: { text: "Hai Farah! Pesanan 576486316948490101 akan dipos hari ini sebelum jam 5 petang, jadi sempat sampai sebelum hujung minggu. Terima kasih!", confidence: 0.78 } },
  "7494560109732330102": { state: "human", claim: "lead" },
  "7494560109732330104": { state: "awaiting_human", handoff: "low_confidence" },
  "7494560109732330201": { state: "awaiting_human", handoff: "shop_off" },
  "7494560109732330202": { state: "human", claim: "agent2" },
  "7494560109732330203": { state: "awaiting_human", handoff: "shop_off" },
  "7494560109732330301": { state: "bot", draft: { text: "Chào bạn, đơn 576486316948490301 sẽ được gửi đi trong hôm nay, dự kiến giao trong 2–3 ngày ạ.", confidence: 0.8 } },
  "7494560109732330303": { state: "awaiting_human", handoff: "low_confidence" },
};

async function createUser(who: Who): Promise<string> {
  const u = USERS[who];
  const res = await auth().api.signUpEmail({ body: { email: u.email, password: PASSWORD, name: u.name } });
  await db().update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, res.user.id));
  return res.user.id;
}

async function main() {
  const [existing] = await db().select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, USERS.owner.email)).limit(1);
  if (existing) throw new Error("库里已有种子账号；先运行 pnpm db:reset");

  // ── 账号与商户 ──
  const userIds = {} as Record<Who, string>;
  for (const who of Object.keys(USERS) as Who[]) userIds[who] = await createUser(who);
  await db().delete(schema.session).where(inArray(schema.session.userId, Object.values(userIds)));

  const demo = await db().transaction((tx) => provisionMerchant(tx, { name: "Demo Store", timezone: TZ, ownerUserId: userIds.owner, billingEmail: USERS.owner.email, planCode: "basic" }));
  const other = await db().transaction((tx) => provisionMerchant(tx, { name: "Other Store", timezone: TZ, ownerUserId: userIds.other, billingEmail: USERS.other.email, planCode: "basic" }));
  const merchantId = { demo: demo.merchant.id, other: other.merchant.id };

  const memberships = {} as Record<Who, string>;
  memberships.owner = demo.membership.id;
  memberships.other = other.membership.id;
  const addMember = async (mId: string, who: Who, role: "admin" | "lead" | "agent") => {
    const [m] = await db().insert(schema.membership).values({ merchantId: mId, userId: userIds[who], role }).returning();
    return m.id;
  };
  // agent@demo.test 也是 Other Store 员工；先建这条，让最近加入的 Demo Store 成为默认商户
  const otherAgent = await addMember(merchantId.other, "agent", "agent");
  memberships.admin2 = await addMember(merchantId.demo, "admin2", "admin");
  memberships.lead = await addMember(merchantId.demo, "lead", "lead");
  memberships.agent = await addMember(merchantId.demo, "agent", "agent");
  memberships.agent2 = await addMember(merchantId.demo, "agent2", "agent");

  // ── 平台应用 ──
  const sg = shopeeHosts().find((h) => h.region === "sg");
  if (!sg) throw new Error("SHOPEE_HOSTS 里没有 sg 区域");
  const [shopeeApp] = await db()
    .insert(schema.platformApp)
    .values({ merchantId: merchantId.demo, platform: "shopee", appKey: "1000101", secretEnc: encrypt("mock-key-1000101"), apiHost: sg.host, region: "sg", status: "verified", callbackState: "set", verifiedAt: new Date() })
    .returning();
  const [tiktokApp] = await db()
    .insert(schema.platformApp)
    .values({ merchantId: merchantId.demo, platform: "tiktok", appKey: "mockttdemo01", secretEnc: encrypt("mock-secret-demo01"), serviceId: "7000000000000000001", region: "global", status: "verified", callbackState: "set", verifiedAt: new Date() })
    .returning();
  const [otherApp] = await db()
    .insert(schema.platformApp)
    .values({ merchantId: merchantId.other, platform: "tiktok", appKey: "mockttother01", secretEnc: encrypt("mock-secret-other01"), serviceId: "7000000000000000002", region: "global", status: "verified", callbackState: "set", verifiedAt: new Date() })
    .returning();
  const appByKey: Record<string, typeof shopeeApp> = { "1000101": shopeeApp, mockttdemo01: tiktokApp, mockttother01: otherApp };

  // ── 模拟平台：回调指向本机 ──
  const mock = await seedMock({
    baseUrl: env().APP_BASE_URL,
    callbacks: Object.fromEntries(Object.entries(appByKey).map(([key, app]) => [key, webhookUrl(app.platform, app.merchantId === merchantId.demo ? demo.merchant.webhookKey : other.merchant.webhookKey)])),
  });

  // ── 已接入店铺 ──
  const shopIdOf: Record<string, string> = {};
  for (const t0 of mock.shops) {
    const t = { ...t0, platform: t0.platform as "shopee" | "tiktok" };
    const key = `${t.platform}:${t.shopId}`;
    const cfg = SHOPS[key];
    if (!cfg) continue;
    const [ms] = await mockDb().select().from(mockShop).where(and(eq(mockShop.platform, t.platform), eq(mockShop.shopId, t.shopId))).limit(1);
    const [row] = await db()
      .insert(schema.shop)
      .values({
        merchantId: merchantId[cfg.merchant],
        platformAppId: appByKey[t.appKey].id,
        platform: t.platform,
        externalShopId: t.shopId,
        shopCipher: ms.cipher,
        name: ms.name,
        market: ms.region,
        mainAccountId: ms.mainAccountId,
        accessTokenEnc: encrypt(t.accessToken),
        refreshTokenEnc: encrypt(t.refreshToken),
        accessExpiresAt: t.accessExpiresAt,
        authExpiresAt: t.authExpiresAt,
        capabilities: capabilitiesFor(t.platform, { chat: true, orders: true, piiMasked: true, productScope: cfg.productScope }),
        backfill: { state: "done", conversations: 0, orders: 0 },
        connectedAt: new Date(Date.now() - 30 * 86400_000),
      })
      .returning();
    await db().insert(schema.shopReception).values({ shopId: row.id, merchantId: row.merchantId, modeInHours: cfg.modes[0], modeOffHours: cfg.modes[1] });
    await db().insert(schema.shopEvent).values({ merchantId: row.merchantId, shopId: row.id, kind: "connected", text: "店铺已接入（种子）" });
    shopIdOf[key] = row.id;
  }
  const scope = (who: Who, keys: string[]) => db().insert(schema.membershipShop).values(keys.map((k) => ({ membershipId: memberships[who], shopId: shopIdOf[k] })));
  await scope("lead", ["shopee:220001", "tiktok:7000001"]);
  await scope("agent", ["shopee:220001"]);
  await scope("agent2", ["shopee:220001", "tiktok:7000002"]);
  await db().insert(schema.membershipShop).values({ membershipId: otherAgent, shopId: shopIdOf["tiktok:7000003"] });

  // ── 订单与售后镜像 ──
  const counts: Record<string, { orders: number; conversations: number }> = {};
  for (const [key, shopId] of Object.entries(shopIdOf)) {
    const [platform, ext] = key.split(":") as ["shopee" | "tiktok", string];
    const [shop] = await db().select().from(schema.shop).where(eq(schema.shop.id, shopId));
    const [ms] = await mockDb().select().from(mockShop).where(and(eq(mockShop.platform, platform), eq(mockShop.shopId, ext)));
    const orders = await mockDb().select().from(mockOrder).where(and(eq(mockOrder.platform, platform), eq(mockOrder.shopId, ext)));
    const all = new Set(["buyer_user_id", "buyer_username", "total_amount", "item_list", "recipient_address", "shipping_carrier", "package_list", "pay_time", "cancel_by", "cancel_reason", "buyer_cancel_reason"]);
    for (const o of orders) {
      const n = platform === "shopee" ? normalizeShopeeOrder(shopeeOrderDetail(o, ms, all)) : normalizeTiktokOrder(tiktokOrderFields(o, ms, false));
      await upsertOrder(db(), shop, n);
    }
    const sales = await mockDb().select().from(mockAfterSale).where(and(eq(mockAfterSale.platform, platform), eq(mockAfterSale.shopId, ext)));
    for (const a of sales) {
      const n =
        platform === "shopee"
          ? normalizeShopeeReturn(shopeeReturnFields(a, ms, "", true))
          : normalizeTiktokAfterSale(a.kind === "return" ? tiktokReturnFields(a) : tiktokCancelFields(a), a.kind as "return" | "cancel");
      await upsertAfterSale(db(), shop, n);
    }
    counts[key] = { orders: orders.length, conversations: 0 };
  }

  // ── 会话 ──
  for (const [key, shopId] of Object.entries(shopIdOf)) {
    const [platform, ext] = key.split(":") as ["shopee" | "tiktok", string];
    const [shop] = await db().select().from(schema.shop).where(eq(schema.shop.id, shopId));
    const [ms] = await mockDb().select().from(mockShop).where(and(eq(mockShop.platform, platform), eq(mockShop.shopId, ext)));
    const threads = await mockDb().select().from(mockBuyerThread).where(and(eq(mockBuyerThread.platform, platform), eq(mockBuyerThread.shopId, ext), eq(mockBuyerThread.started, true)));
    const mId = shop.merchantId;
    const memberOf = (who: Who) => (mId === merchantId.other ? memberships.other : memberships[who]);
    for (const t of threads) {
      const rows = await mockDb().select().from(mockMessage).where(eq(mockMessage.conversationId, t.conversationId)).orderBy(mockMessage.seq);
      const msgs: NormalizedMessage[] = rows.map((m) =>
        platform === "shopee" ? normalizeShopeeMessage(shopeeMessageFields(m, t, ms), ext) : normalizeTiktokMessage({ ...tiktokMessageFields(m, t, ms), conversation_id: t.conversationId }),
      );
      if (msgs.length === 0) continue;
      const fixture = MOCK_BUYERS.find((b) => b.conversationId === t.conversationId);
      const last = msgs[msgs.length - 1];
      const plan = PLAN[t.conversationId] ?? (last.fromBuyer ? { state: "awaiting_human" as const, handoff: "shop_off" } : { state: "closed" as const });
      const claimer = plan.claim ? memberOf(plan.claim) : null;
      const lastBuyer = [...msgs].reverse().find((m) => m.fromBuyer);
      const lastAgent = [...msgs].reverse().find((m) => !m.fromBuyer);
      await db().transaction(async (tx) => {
        const [conv] = await tx
          .insert(schema.conversation)
          .values({
            merchantId: mId,
            shopId,
            platform,
            externalConversationId: t.conversationId,
            buyerExternalId: t.buyerId,
            buyerName: t.buyerName,
            buyerLanguage: fixture?.language ?? null,
            handlingState: plan.state,
            claimedBy: plan.state === "human" || plan.state === "closed" ? claimer : null,
            claimedAt: claimer ? new Date(Date.now() - 10 * 60_000) : null,
            handoffReason: plan.state === "awaiting_human" ? (plan.handoff ?? null) : null,
            lastMessageAt: last.sentAt,
            lastBuyerAt: lastBuyer?.sentAt ?? null,
            lastAgentAt: lastAgent?.sentAt ?? null,
          })
          .returning();
        const stage = await judgeStage(tx, { shopId, platform, buyerExternalId: t.buyerId, referencedOrderId: (msgs.find((m) => m.payload.orderId)?.payload.orderId as string | undefined) ?? null, buyerText: lastBuyer?.text, backfillDone: true });
        const firstHuman = msgs.find((m) => !m.fromBuyer);
        const [seg] = await tx
          .insert(schema.segment)
          .values({
            merchantId: mId,
            conversationId: conv.id,
            stage: stage.stage,
            stageSource: stage.source,
            stageBasis: stage.basis,
            startedAt: msgs[0].sentAt,
            endedAt: plan.state === "closed" ? last.sentAt : null,
            endReason: plan.state === "closed" ? "resolved" : null,
            firstClaimedBy: claimer,
            firstBuyerAt: msgs.find((m) => m.fromBuyer)?.sentAt ?? null,
            firstHumanReplyAt: firstHuman?.sentAt ?? null,
            firstReplyInHours: firstHuman ? true : null,
            humanReplied: !!firstHuman,
            handedOff: plan.state === "awaiting_human" && plan.handoff !== "shop_off" && plan.handoff !== "shadow",
          })
          .returning();
        await tx.update(schema.conversation).set({ currentSegmentId: seg.id }).where(eq(schema.conversation.id, conv.id));
        let lastBuyerMsgId: string | null = null;
        for (const m of msgs) {
          const [row] = await tx
            .insert(schema.message)
            .values({
              merchantId: mId,
              conversationId: conv.id,
              segmentId: seg.id,
              externalMessageId: m.externalMessageId,
              direction: m.fromBuyer ? "in" : "out",
              senderRole: m.fromBuyer ? "buyer" : "agent",
              sentBy: m.fromBuyer ? null : (claimer ?? memberOf("lead")),
              type: m.type,
              text: m.text,
              translation: platform === "tiktok" && m.fromBuyer && m.type === "text" ? null : m.translation,
              payload: m.payload,
              clientRequestId: m.fromBuyer ? null : `seed:${m.externalMessageId}`,
              sendStatus: m.fromBuyer ? null : "sent",
              sentAt: m.sentAt,
            })
            .returning();
          if (m.fromBuyer) lastBuyerMsgId = row.id;
        }
        if (plan.draft && lastBuyerMsgId) {
          const shadow = plan.state === "awaiting_human";
          await tx.insert(schema.draft).values({
            merchantId: mId,
            conversationId: conv.id,
            segmentId: seg.id,
            triggerMessageId: lastBuyerMsgId,
            mode: shadow ? "shadow" : "assist",
            text: plan.draft.text,
            confidence: plan.draft.confidence,
            reason: "none",
            status: shadow ? "shadow" : "generated",
            model: "seed",
            latencyMs: 1800,
            createdAt: new Date(Date.now() - 3 * 60_000),
          });
        }
      });
      counts[key].conversations++;
    }
    await db().update(schema.shop).set({ backfill: { state: "done", ...counts[key] }, lastInboundAt: new Date() }).where(eq(schema.shop.id, shopId));
  }

  // ── 售后工单（会话已建好，负责人按会话处理人） ──
  for (const [, shopId] of Object.entries(shopIdOf)) {
    const [shop] = await db().select().from(schema.shop).where(eq(schema.shop.id, shopId));
    const actor = { kind: "system" as const, merchantId: shop.merchantId };
    for (const o of await db().select().from(schema.order).where(and(eq(schema.order.shopId, shopId), eq(schema.order.platformStatus, "IN_CANCEL")))) {
      await db().transaction((tx) => syncShopeeCancelRequest(tx, shop, o, actor));
    }
    for (const a of await db().select().from(schema.afterSale).where(eq(schema.afterSale.shopId, shopId))) {
      const [o] = await db().select().from(schema.order).where(and(eq(schema.order.shopId, shopId), eq(schema.order.externalOrderId, a.externalOrderId)));
      await db().transaction((tx) => syncAfterSaleTicket(tx, shop, a, o ?? null, actor));
    }
  }

  // ── 发票与 Other Store 的工单（每个列表页非空） ──
  const ctxOf = async (merchantName: "demo" | "other", who: Who) => {
    const [merchant] = await db().select().from(schema.merchant).where(eq(schema.merchant.id, merchantId[merchantName]));
    const membershipId = merchantName === "other" && who === "agent" ? otherAgent : memberships[who];
    const [ms] = await db().select().from(schema.membership).where(eq(schema.membership.id, membershipId));
    const user = USERS[who];
    const isOwner = merchant.ownerUserId === userIds[who];
    const permissions = permissionsFor(ms.role, isOwner);
    return {
      requestId: "seed",
      ip: "127.0.0.1",
      userAgent: "seed",
      user: { id: userIds[who], name: user.name, email: user.email, twoFactorEnabled: false },
      session: { id: "seed", createdAt: new Date() },
      merchant,
      membership: { id: ms.id, role: ms.role, status: ms.status },
      isOwner,
      shopIds: null,
      twoFactorRequired: false,
      actor: { kind: "member" as const, merchantId: merchant.id, membershipId: ms.id, userId: userIds[who], name: user.name, requestId: "seed" },
      can: (perm: Permission) => permissions.includes(perm),
      permissions,
    };
  };
  const invoiceFor = async (merchantName: "demo" | "other", kind: "invoice" | "receipt", externalOrderId: string, buyer: { buyerName: string; address: string; email: string }) => {
    const ctx = await ctxOf(merchantName, merchantName === "demo" ? "owner" : "other");
    const [o] = await db().select().from(schema.order).where(and(eq(schema.order.merchantId, merchantId[merchantName]), eq(schema.order.externalOrderId, externalOrderId)));
    await createInvoice(ctx, { kind, orderId: o.id, fields: { ...buyer, items: o.items.map((i) => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice })), currency: o.currency }, sendToChat: false, sendEmail: true });
  };
  await invoiceFor("demo", "invoice", "576486316948490104", { buyerName: "Hafiz Rahman", address: "No 3, Jalan Kenanga, Taman Seri Gombak, 68100 Batu Caves", email: "hafiz@demo.test" });
  await invoiceFor("demo", "receipt", "576486316948490204", { buyerName: "Kittipong Thongdee", address: "120 Phetkasem Rd, Hat Yai, Songkhla 90110", email: "kittipong@demo.test" });
  await invoiceFor("other", "invoice", "576486316948490302", { buyerName: "Trần Minh Đức", address: "102 Trần Phú, Hải Châu, Đà Nẵng", email: "duc@demo.test" });
  const [vn] = await db().select().from(schema.shop).where(eq(schema.shop.id, shopIdOf["tiktok:7000003"]));
  await db().transaction((tx) =>
    createTicket(
      tx,
      { merchantId: merchantId.other, type: "internal", origin: "manual", dedupeKey: `internal:manual:${vn.id}`, shopId: vn.id, platform: "tiktok", buyerName: "Phạm Thu Hà", description: "确认硅胶厨具套装的耐热温度后回复买家", assigneeId: otherAgent, createdBy: memberships.other },
      { kind: "system", merchantId: merchantId.other },
    ),
  );

  // TikTok 买家消息由 Shopilot 翻译：排给 Worker（pnpm dev 起来后处理）
  const tiktokBuyerTexts = await db()
    .select({ id: schema.message.id })
    .from(schema.message)
    .innerJoin(schema.conversation, eq(schema.conversation.id, schema.message.conversationId))
    .where(and(eq(schema.conversation.platform, "tiktok"), eq(schema.message.senderRole, "buyer"), eq(schema.message.type, "text")));
  for (const m of tiktokBuyerTexts) await enqueue("message.translate", { messageId: m.id });
  await (await boss()).stop({ graceful: false });

  console.log(JSON.stringify({ merchants: merchantId, shops: counts, mock: mock.counts }, null, 2));
}

main()
  .then(() => pool().end())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await pool().end();
    process.exit(1);
  });
