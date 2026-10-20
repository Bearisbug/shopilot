// 工单转发到飞书：卡片组装、平台状态与异常说明的中文、接口权限；需要数据库的部分（DATABASE_URL 未设置时跳过）：
// 可用性、群列表与预选、转发落投递记录与时间线、feishu.send 发出 / 失败 / 跳过、可见范围。
// 造的商户、账号在 afterAll 删除；队列投递被替换，不进共用的 pg-boss。
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { anomalyText, platformStatusText, ticketDescriptionText } from "@/lib/ticket-text";
import { can, permissionsFor, type Role } from "@/lib/permissions";
import { ticketCard, type TicketCardInput } from "@/server/feishu/card";

const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn<(...args: unknown[]) => Promise<null>>(async () => null) }));
vi.mock("@/server/jobs/boss", () => ({ enqueue }));

describe("平台状态与异常说明的中文", () => {
  it("订单与售后状态码换成中文，认不出的原样返回", () => {
    expect(platformStatusText("tiktok", "IN_TRANSIT")).toBe("运输中");
    expect(platformStatusText("shopee", "SHIPPED")).toBe("运输中");
    expect(platformStatusText("tiktok", "RETURN_OR_REFUND_REQUEST_PENDING")).toBe("退货退款待处理");
    expect(platformStatusText("shopee", "SOME_NEW_STATUS")).toBe("SOME_NEW_STATUS");
    expect(platformStatusText("shopee", null)).toBeNull();
  });

  it("系统写的物流异常说明换成可读中文，买家填的原因不动", () => {
    expect(ticketDescriptionText("72 小时没有新的物流轨迹")).toBe("物流轨迹 72 小时未更新");
    expect(ticketDescriptionText("包裹 PKG123 LOGISTICS_DELIVERY_FAILED")).toBe("包裹 PKG123 派送失败");
    expect(ticketDescriptionText("包裹  LOGISTICS_LOST")).toBe("包裹 包裹丢失");
    expect(ticketDescriptionText("订单重新发货（RETRY_SHIP）")).toBe("订单需要重新发货");
    expect(ticketDescriptionText("Wrong product was sent")).toBe("Wrong product was sent");
    expect(anomalyText({ type: "logistics", description: "72 小时没有新的物流轨迹" })).toBe("物流异常 - 物流轨迹 72 小时未更新");
    expect(anomalyText({ type: "internal", description: null })).toBe("内部确认");
  });
});

describe("工单转发卡", () => {
  const base: TicketCardInput = {
    number: "T-1041",
    anomaly: "物流异常 - 物流轨迹 72 小时未更新",
    statusText: "待处理",
    platformStatus: "运输中",
    shopName: "OBSBOT.PH",
    platform: "tiktok",
    market: "PH",
    buyerName: "lion.haert*yabes",
    externalOrderId: "586565462593668786",
    items: [{ name: "OBSBOT Tiny 3 Lite [4K]", sku: "Black", qty: 1 }],
    dueText: "2026-10-21 23:59",
    remainingSec: 2 * 86400 + 3600,
    assigneeName: null,
    note: "请仓库今天联系物流商",
    forwardedBy: "Arif",
    ticketUrl: "https://shopilot.live/tickets/abc",
    sellerUrl: "https://seller.tiktokshopglobalselling.com/order/detail?order_no=586565462593668786&shop_region=PH",
  };
  const text = (card: Record<string, unknown>) => JSON.stringify(card);

  it("含订单号、异常与说明、订单内容、截止、备注，两个跳转按钮", () => {
    const card = ticketCard(base);
    expect(card).toMatchObject({ schema: "2.0", header: { template: "wathet", title: { content: "工单 T-1041 · 物流异常 - 物流轨迹 72 小时未更新" } } });
    const s = text(card);
    for (const part of ["**订单号** 586565462593668786", "**异常** 物流异常 - 物流轨迹 72 小时未更新", "**平台状态** 运输中", "TikTok Shop · 菲律宾", "规格 Black", "×1", "**截止** 2026-10-21 23:59，剩 2 天 1 小时", "**负责人** 未指派", "**备注** 请仓库今天联系物流商", "Arif 从工单详情页转发"]) {
      expect(s).toContain(part);
    }
    expect(s).toContain('"default_url":"https://shopilot.live/tickets/abc"');
    expect(s).toContain("打开卖家后台订单");
    // 买家名里的 * 转义，不被当成加粗
    expect(s).toContain("lion.haert&#42;yabes");
  });

  it("没有订单时不写订单号与订单内容、不放卖家后台按钮；已超时写超时多久", () => {
    const s = text(ticketCard({ ...base, externalOrderId: null, items: [], sellerUrl: null, note: null, remainingSec: -3 * 3600 }));
    expect(s).not.toContain("订单号");
    expect(s).not.toContain("订单内容");
    expect(s).not.toContain("打开卖家后台订单");
    expect(s).not.toContain("备注");
    expect(s).toContain("已超时 3 小时");
  });
});

describe("转发接口权限（tickets.own）", () => {
  it("API-TKT-009、010 的处理器都要求 tickets.own", async () => {
    const src = await readFile(path.resolve(import.meta.dirname, "../../app/api/v1/tickets/[id]/feishu/route.ts"), "utf8");
    expect(src.match(/export const (GET|POST|PUT|PATCH|DELETE) = route\(/g)).toHaveLength(2);
    expect(src.match(/auth: "member",\s+perm: "tickets\.own"/g)).toHaveLength(2);
    for (const role of ["admin", "lead", "agent"] as const) expect(can(role, false, "tickets.own")).toBe(true);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("工单转发到飞书（需要数据库）", async () => {
  process.env.FEISHU_MODE = "stub";
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { Problem } = await import("@/server/http/problem");
  const settings = await import("@/server/feishu/settings");
  const { deliverFeishuCard } = await import("@/server/feishu/deliver");
  const { STUB_CHATS } = await import("@/server/feishu/client");
  const { forwardTicket, ticketForwardTargets } = await import("./forward");
  const { getTicket } = await import("./service");
  type MemberContext = import("@/server/auth/context").MemberContext;
  type Merchant = typeof schema.merchant.$inferSelect;

  const userIds: string[] = [];
  const merchantIds: string[] = [];

  function ctxFor(merchant: Merchant, membershipId: string, userId: string, role: Role, shopIds: string[] | null, name: string): MemberContext {
    const isOwner = role === "admin" && merchant.ownerUserId === userId;
    return {
      requestId: "req_test",
      ip: "127.0.0.1",
      userAgent: null,
      user: { id: userId, name, email: `${userId}@test.invalid`, twoFactorEnabled: false },
      session: { id: "s", createdAt: new Date() },
      merchant,
      membership: { id: membershipId, role, status: "active" },
      isOwner,
      shopIds,
      twoFactorRequired: false,
      actor: { kind: "member", merchantId: merchant.id, membershipId, userId, name, requestId: "req_test" },
      can: (p) => can(role, isOwner, p),
      permissions: permissionsFor(role, isOwner),
    };
  }

  async function addMember(merchant: Merchant, role: Role, name: string, shopIds: string[]) {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name, email: `${userId}@test.invalid` });
    userIds.push(userId);
    const [m] = await db().insert(schema.membership).values({ merchantId: merchant.id, userId, role }).returning();
    if (shopIds.length) await db().insert(schema.membershipShop).values(shopIds.map((shopId) => ({ membershipId: m.id, shopId })));
    return ctxFor(merchant, m.id, userId, role, role === "admin" ? null : shopIds, name);
  }

  async function setup() {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: "转发测试管理员", email: `${userId}@test.invalid` });
    userIds.push(userId);
    const res = await db().transaction((tx) => provisionMerchant(tx, { name: "转发测试商户", timezone: "Asia/Manila", ownerUserId: userId }));
    merchantIds.push(res.merchant.id);
    const [app] = await db()
      .insert(schema.platformApp)
      .values({ merchantId: res.merchant.id, platform: "tiktok", appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), region: "sg", status: "verified" })
      .returning();
    const caps = { chat: true, orders: true, piiMasked: false, productScope: false, cards: [], coupons: false, endSession: false, maxTextLength: 500 };
    const [shop] = await db()
      .insert(schema.shop)
      .values({ merchantId: res.merchant.id, platformAppId: app.id, platform: "tiktok", externalShopId: "ph-1", name: "OBSBOT.PH", market: "PH", accessTokenEnc: encrypt("t"), capabilities: caps })
      .returning();
    const [order] = await db()
      .insert(schema.order)
      .values({
        merchantId: res.merchant.id,
        shopId: shop.id,
        platform: "tiktok",
        externalOrderId: "586565462593668786",
        platformStatus: "IN_TRANSIT",
        statusGroup: "shipped",
        totalAmount: "9713.00",
        currency: "PHP",
        items: [{ name: "OBSBOT Tiny 3 Lite", sku: "Black", qty: 1, unitPrice: "9713.00" }],
        platformCreatedAt: new Date(),
      })
      .returning();
    const [ticket] = await db()
      .insert(schema.ticket)
      .values({
        merchantId: res.merchant.id,
        number: "T-1041",
        type: "logistics",
        origin: "platform",
        dedupeKey: `logistics:${order.externalOrderId}`,
        shopId: shop.id,
        platform: "tiktok",
        orderId: order.id,
        buyerName: "lion.haert.yabes",
        phase: "物流异常",
        platformStatus: "IN_TRANSIT",
        description: "72 小时没有新的物流轨迹",
        dueAt: new Date(Date.now() + 2 * 86400_000),
        dueSource: "platform",
      })
      .returning();
    await db().insert(schema.ticketEvent).values({ merchantId: res.merchant.id, ticketId: ticket.id, type: "created", source: "webhook", data: { status: "open", phase: "物流异常", platformStatus: "IN_TRANSIT" } });
    const admin = ctxFor(res.merchant, res.membership.id, userId, "admin", null, "转发测试管理员");
    return { merchant: res.merchant, admin, shop, ticket };
  }

  async function problemOf(p: Promise<unknown>): Promise<InstanceType<typeof Problem>> {
    try {
      await p;
    } catch (e) {
      if (e instanceof Problem) return e;
      throw e;
    }
    throw new Error("没有抛出 Problem");
  }
  const sendJobs = () => enqueue.mock.calls.filter((c) => c[0] === "feishu.send");
  const ticketDeliveries = (ticketId: string) => db().select().from(schema.feishuDelivery).where(eq(schema.feishuDelivery.ticketId, ticketId));

  let S: Awaited<ReturnType<typeof setup>>;

  beforeAll(async () => {
    S = await setup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    enqueue.mockClear();
  });

  afterAll(async () => {
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
  });

  it("没连飞书时按钮不可用并说明原因，转发 409；工单页平台状态与说明是中文", async () => {
    const d = await getTicket(S.admin, S.ticket.id);
    expect(d.feishu).toEqual({ available: false, reason: expect.stringContaining("还没有连接飞书") });
    const p = await problemOf(forwardTicket(S.admin, S.ticket.id, { chatId: "oc_stub_service" }));
    expect(p.status).toBe(409);
    expect(d.events[0]?.title).toBe("平台事件建单 T-1041 · 运输中");
  });

  it("应用接法：列机器人所在的群并预选这家店的群，否则默认群", async () => {
    await settings.connectFeishu(S.admin, { method: "app", appId: "cli_a1b2c3d4", appSecret: "good-secret" });
    await settings.saveFeishuTarget(S.admin, { shopId: null, chatId: "oc_stub_service" });
    expect((await getTicket(S.admin, S.ticket.id)).feishu).toEqual({ available: true, reason: null });
    let t = await ticketForwardTargets(S.admin, S.ticket.id);
    expect(t.method).toBe("app");
    expect(t.targets.map((x) => x.key)).toEqual(STUB_CHATS.map((c) => c.chatId));
    expect(t.defaultKey).toBe("oc_stub_service");
    expect(t.targets.find((x) => x.key === "oc_stub_service")?.scope).toBe("默认群");
    await settings.saveFeishuTarget(S.admin, { shopId: S.shop.id, chatId: "oc_stub_aftersale" });
    t = await ticketForwardTargets(S.admin, S.ticket.id);
    expect(t.defaultKey).toBe("oc_stub_aftersale");
    expect(t.targets.find((x) => x.key === "oc_stub_aftersale")?.scope).toBe("OBSBOT.PH 的群");
  });

  it("转发：落一行工单投递（卡片已构好）、时间线记一条、入队；feishu.send 发出后时间线不再写发送中", async () => {
    const r = await forwardTicket(S.admin, S.ticket.id, { chatId: "oc_stub_aftersale", note: "请仓库今天联系物流商" });
    expect(r.targetName).toBe("售后处理群（替身）");
    expect(r.event).toMatchObject({ type: "feishu", title: "转发测试管理员 转发到飞书 · 售后处理群（替身）", detail: "备注：请仓库今天联系物流商 · 发送中" });
    expect(sendJobs()).toEqual([["feishu.send", { id: r.deliveryId }]]);
    const [row] = await ticketDeliveries(S.ticket.id);
    expect(row).toMatchObject({ kind: "ticket", status: "queued", chatId: "oc_stub_aftersale", targetName: "售后处理群（替身）", actorId: S.admin.membership.id });
    const card = JSON.stringify(row.card);
    expect(card).toContain("物流异常 - 物流轨迹 72 小时未更新");
    expect(card).toContain("586565462593668786");
    expect(card).toContain("seller.tiktokshopglobalselling.com/order/detail?order_no=586565462593668786&shop_region=PH");
    // 「在 Shopilot 打开」带商户参数，工单页按 m 切到这个商户（同会话卡片的落地）
    expect(card).toContain(`/tickets/${S.ticket.id}?m=${S.merchant.id}`);

    await deliverFeishuCard({ id: r.deliveryId });
    const [sent] = await ticketDeliveries(S.ticket.id);
    expect(sent).toMatchObject({ status: "sent", stub: true, attempts: 1 });
    expect(sent.messageId).toMatch(/^om_stub_/);
    const ev = (await getTicket(S.admin, S.ticket.id)).events.find((e) => e.type === "feishu");
    expect(ev).toMatchObject({ title: "转发测试管理员 转发到飞书 · 售后处理群（替身）", detail: "备注：请仓库今天联系物流商" });
  });

  it("选的群机器人不在里面 422；员工看不到的工单 404", async () => {
    const p = await problemOf(forwardTicket(S.admin, S.ticket.id, { chatId: "oc_not_member" }));
    expect(p.status).toBe(422);
    const agent = await addMember(S.merchant, "agent", "未指派的员工", [S.shop.id]);
    expect((await problemOf(forwardTicket(agent, S.ticket.id, { chatId: "oc_stub_service" }))).status).toBe(404);
    expect((await problemOf(ticketForwardTargets(agent, S.ticket.id))).status).toBe(404);
  });

  it("飞书拒收（机器人已被移出群）记为失败，时间线写没有发出的原因", async () => {
    const [row] = await db()
      .insert(schema.feishuDelivery)
      .values({ merchantId: S.merchant.id, kind: "ticket", ticketId: S.ticket.id, chatId: "oc_stub_gone", targetName: "已解散的群", card: { schema: "2.0" } })
      .returning();
    await db().insert(schema.ticketEvent).values({ merchantId: S.merchant.id, ticketId: S.ticket.id, type: "feishu", actorId: S.admin.membership.id, source: "page", data: { deliveryId: row.id, targetName: "已解散的群" } });
    await deliverFeishuCard({ id: row.id });
    const [failed] = await db().select().from(schema.feishuDelivery).where(eq(schema.feishuDelivery.id, row.id));
    expect(failed.status).toBe("failed");
    const ev = (await getTicket(S.admin, S.ticket.id)).events.find((e) => e.title.endsWith("已解散的群"));
    expect(ev?.detail).toContain("没有发出：机器人不在这个群里");
  });

  it("群自定义机器人接法：只列设过的群；改了接法后排队中的应用群转发记为跳过", async () => {
    const [queued] = await db()
      .insert(schema.feishuDelivery)
      .values({ merchantId: S.merchant.id, kind: "ticket", ticketId: S.ticket.id, chatId: "oc_stub_service", targetName: "Shopilot 客服群（替身）", card: { schema: "2.0" } })
      .returning();
    await settings.connectFeishu(S.admin, { method: "webhook" });
    expect((await getTicket(S.admin, S.ticket.id)).feishu.reason).toContain("还没有设置飞书群");
    await settings.saveFeishuTarget(S.admin, { shopId: null, name: "物流群", webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/abcdef12-good", secret: "s3cret" });
    const t = await ticketForwardTargets(S.admin, S.ticket.id);
    expect(t).toMatchObject({ method: "webhook", targets: [{ name: "物流群", scope: "默认群" }] });
    expect(t.defaultKey).toBe(t.targets[0].key);
    // 应用接法的 chatId 在这里不认
    expect((await problemOf(forwardTicket(S.admin, S.ticket.id, { chatId: "oc_stub_service" }))).status).toBe(422);
    const r = await forwardTicket(S.admin, S.ticket.id, { targetId: t.defaultKey! });
    await deliverFeishuCard({ id: r.deliveryId });
    const [sent] = await db().select().from(schema.feishuDelivery).where(eq(schema.feishuDelivery.id, r.deliveryId));
    expect(sent).toMatchObject({ status: "sent", targetId: t.defaultKey, chatId: null, messageId: null });

    await deliverFeishuCard({ id: queued.id });
    const [skipped] = await db().select().from(schema.feishuDelivery).where(eq(schema.feishuDelivery.id, queued.id));
    expect(skipped).toMatchObject({ status: "skipped", error: "飞书接法已改为群自定义机器人" });
  });
});
