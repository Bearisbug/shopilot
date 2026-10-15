// 需要数据库：DATABASE_URL 未设置时跳过（set -a && . ./.env && set +a && pnpm exec vitest run src/server/feishu）。
// 飞书推送：设置接口（替身）、两个触发点入队与去重、feishu.send 构卡与跳过、重试与失败、落地认领的服务端部分、接口权限。
// 造的商户、账号在 afterAll 删除；队列投递被替换，不进共用的 pg-boss。
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { can, permissionsFor, type Role } from "@/lib/permissions";

const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn<(...args: unknown[]) => Promise<null>>(async () => null) }));
vi.mock("@/server/jobs/boss", () => ({ enqueue }));

describe("飞书设置接口权限（settings.manage）", () => {
  it("只有管理员有 settings.manage", () => {
    expect(can("admin", false, "settings.manage")).toBe(true);
    expect(can("lead", false, "settings.manage")).toBe(false);
    expect(can("agent", false, "settings.manage")).toBe(false);
  });

  it("飞书接口每个处理器都要求 settings.manage", async () => {
    const root = path.resolve(import.meta.dirname, "../../app/api/v1/feishu");
    for (const f of ["route.ts", "chats/route.ts", "targets/route.ts", "targets/[id]/route.ts", "targets/[id]/test/route.ts"]) {
      const src = await readFile(path.join(root, f), "utf8");
      const handlers = src.match(/export const (GET|POST|PUT|PATCH|DELETE) = route\(/g) ?? [];
      const guarded = src.match(/auth: "member", perm: "settings\.manage"/g) ?? [];
      expect(handlers.length, f).toBeGreaterThan(0);
      expect(guarded.length, f).toBe(handlers.length);
    }
  });
});

describe.skipIf(!process.env.DATABASE_URL)("飞书推送（需要数据库）", async () => {
  process.env.FEISHU_MODE = "stub";
  process.env.AI_MODE = "stub";
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { Problem } = await import("@/server/http/problem");
  const settings = await import("./settings");
  const { deliverFeishuCard, queueFeishuCard } = await import("./deliver");
  const { stubFeishu, FeishuError, STUB_CHATS, stubImageSource } = await import("./client");
  const { ingestMessage, runFollowUp } = await import("@/server/conversations/ingest");
  const { handoff } = await import("@/server/ai/draft");
  const { remindUnclaimed } = await import("@/server/conversations/jobs");
  const { claim } = await import("@/server/conversations/actions");
  const { STUB_SUMMARY } = await import("@/server/ai/client");
  type MemberContext = import("@/server/auth/context").MemberContext;
  type Merchant = typeof schema.merchant.$inferSelect;
  type Shop = typeof schema.shop.$inferSelect;

  const userIds: string[] = [];
  const merchantIds: string[] = [];

  function ctxFor(merchant: Merchant, membershipId: string, userId: string, role: Role, shopIds: string[] | null, name = `测试${role}`): MemberContext {
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

  async function newMerchant(name: string) {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name, email: `${userId}@test.invalid` });
    userIds.push(userId);
    const res = await db().transaction((tx) => provisionMerchant(tx, { name, timezone: "Asia/Ho_Chi_Minh", ownerUserId: userId }));
    merchantIds.push(res.merchant.id);
    const [app] = await db()
      .insert(schema.platformApp)
      .values({ merchantId: res.merchant.id, platform: "shopee", appKey: `app-${randomUUID()}`, secretEnc: encrypt("secret"), region: "sg", status: "verified" })
      .returning();
    const caps = { chat: true, orders: true, piiMasked: false, productScope: false, cards: [], coupons: false, endSession: false, maxTextLength: 500 };
    const mk = (ext: string, shopName: string, market: string) =>
      db()
        .insert(schema.shop)
        .values({ merchantId: res.merchant.id, platformAppId: app.id, platform: "shopee", externalShopId: ext, name: shopName, market, accessTokenEnc: encrypt("t"), refreshTokenEnc: encrypt("r"), accessExpiresAt: new Date(Date.now() + 86_400_000), capabilities: caps })
        .returning()
        .then((r) => r[0]);
    const shopVn = await mk("vn-1", "OBSBOT 越南店", "VN");
    const shopTh = await mk("th-1", "OBSBOT 泰国店", "TH");
    return { merchant: res.merchant, admin: ctxFor(res.merchant, res.membership.id, userId, "admin", null, "测试管理员"), shopVn, shopTh };
  }

  async function addMember(merchant: Merchant, role: Role, name: string, shopIds: string[]) {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name, email: `${userId}@test.invalid` });
    userIds.push(userId);
    const [m] = await db().insert(schema.membership).values({ merchantId: merchant.id, userId, role }).returning();
    if (shopIds.length) await db().insert(schema.membershipShop).values(shopIds.map((shopId) => ({ membershipId: m.id, shopId })));
    return ctxFor(merchant, m.id, userId, role, role === "admin" ? null : shopIds, name);
  }

  function buyerMsg(convExt: string, over: Partial<{ type: "text" | "image"; text: string | null; payload: Record<string, unknown>; sentAt: Date }> = {}) {
    return {
      externalMessageId: `m-${randomUUID()}`,
      externalConversationId: convExt,
      buyerExternalId: "buyer-1",
      buyerName: "Nguyen Van A",
      fromBuyer: true,
      senderRole: "buyer" as const,
      type: over.type ?? ("text" as const),
      text: over.text === undefined ? "Can it work with Mac?" : over.text,
      translation: null,
      payload: over.payload ?? {},
      sentAt: over.sentAt ?? new Date(),
      affiliate: false,
      raw: {},
    };
  }

  /** 店铺接待模式 off：新会话段直接进待认领 */
  async function ingestBuyer(shop: Shop, convExt: string, over: Parameters<typeof buyerMsg>[1] = {}) {
    const res = await db().transaction((tx) => ingestMessage(tx, shop, buyerMsg(convExt, over), { externalId: "buyer-1", name: "Nguyen Van A", affiliate: false }));
    await runFollowUp(res.followUp);
    return res.conversationId!;
  }

  const deliveries = (conversationId: string) => db().select().from(schema.feishuDelivery).where(eq(schema.feishuDelivery.conversationId, conversationId));
  const sendJobs = () => enqueue.mock.calls.filter((c) => c[0] === "feishu.send");
  async function problemOf(p: Promise<unknown>): Promise<InstanceType<typeof Problem>> {
    try {
      await p;
    } catch (e) {
      if (e instanceof Problem) return e;
      throw e;
    }
    throw new Error("没有抛出 Problem");
  }

  let A: Awaited<ReturnType<typeof newMerchant>>;

  beforeAll(async () => {
    A = await newMerchant("飞书测试商户");
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

  describe("设置（替身）", () => {
    it("未连接时列出店铺、没有群；App Secret 不对时 422 且不落库", async () => {
      const v = await settings.feishuView(A.admin);
      expect(v).toMatchObject({ mode: "stub", connection: null, defaultTarget: null, notifyUnclaimed: true, notifyOverdue: true });
      expect(v.shops.map((s) => s.name).sort()).toEqual(["OBSBOT 泰国店", "OBSBOT 越南店"]);
      const p = await problemOf(settings.connectFeishu(A.admin, { method: "app", appId: "cli_a1b2c3d4", appSecret: "bad-secret" }));
      expect(p.status).toBe(422);
      expect(p.detail).toContain("10014");
      expect(await db().select().from(schema.feishuIntegration).where(eq(schema.feishuIntegration.merchantId, A.merchant.id))).toHaveLength(0);
    });

    it("应用接法：校验通过后加密保存、列出机器人所在的群、设默认群与店铺群；群不在列表里拒收", async () => {
      const v = await settings.connectFeishu(A.admin, { method: "app", appId: "cli_a1b2c3d4", appSecret: "good-secret" });
      expect(v.connection).toMatchObject({ method: "app", appId: "cli_a1b2c3d4", status: "verified" });
      const [row] = await db().select().from(schema.feishuIntegration).where(eq(schema.feishuIntegration.merchantId, A.merchant.id));
      expect(row.appSecretEnc).not.toContain("good-secret");
      expect((await settings.listFeishuChats(A.admin)).chats).toEqual(STUB_CHATS);
      // 同一 App ID 再保存可不填 Secret，群设置保留
      await settings.saveFeishuTarget(A.admin, { shopId: null, chatId: "oc_stub_service" });
      const again = await settings.connectFeishu(A.admin, { method: "app", appId: "cli_a1b2c3d4" });
      expect(again.defaultTarget?.name).toBe("Shopilot 客服群（替身）");
      const withShop = await settings.saveFeishuTarget(A.admin, { shopId: A.shopTh.id, chatId: "oc_stub_th" });
      expect(withShop.shops.find((s) => s.id === A.shopTh.id)?.target?.name).toBe("泰国站客服（替身）");
      const p = await problemOf(settings.saveFeishuTarget(A.admin, { shopId: null, chatId: "oc_not_member" }));
      expect(p.status).toBe(422);
    });

    it("发测试卡片：同步发出，记一行 test 投递；应用接法带一张上传的图片", async () => {
      const v = await settings.feishuView(A.admin);
      const r = await settings.sendFeishuTest(A.admin, v.defaultTarget!.id);
      expect(r).toEqual({ ok: true, stub: true, imageUpload: "ok", imageError: null });
      const [row] = await db().select().from(schema.feishuDelivery).where(and(eq(schema.feishuDelivery.merchantId, A.merchant.id), eq(schema.feishuDelivery.kind, "test")));
      expect(row).toMatchObject({ status: "sent", stub: true, targetName: "Shopilot 客服群（替身）" });
      expect(row.messageId).toMatch(/^om_stub_/);
      expect(JSON.stringify(row.card)).toContain('"tag":"img"');
    });

    it("开关保存后可读回", async () => {
      const v = await settings.updateFeishuToggles(A.admin, { notifyOverdue: false });
      expect(v).toMatchObject({ notifyUnclaimed: true, notifyOverdue: false });
      await settings.updateFeishuToggles(A.admin, { notifyOverdue: true });
    });
  });

  describe("触发与去重", () => {
    it("接待模式 off 的新会话直接进待认领：写一行待认领投递并入队 feishu.send；同段再触发不重复", async () => {
      const convId = await ingestBuyer(A.shopVn, `c-${randomUUID()}`);
      const rows = await deliveries(convId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: "unclaimed", status: "queued", targetName: "Shopilot 客服群（替身）" });
      expect(sendJobs()).toEqual([["feishu.send", { id: rows[0].id }]]);
      expect(await queueFeishuCard(convId, "unclaimed")).toBeNull();
      expect(await deliveries(convId)).toHaveLength(1);
      expect(sendJobs()).toHaveLength(1);
    });

    it("店铺另指定的群优先于默认群", async () => {
      const convId = await ingestBuyer(A.shopTh, `c-${randomUUID()}`);
      expect((await deliveries(convId))[0].targetName).toBe("泰国站客服（替身）");
    });

    it("AI 转人工（handoff）同样推待认领卡", async () => {
      const [conv] = await db()
        .insert(schema.conversation)
        .values({ merchantId: A.merchant.id, shopId: A.shopVn.id, platform: "shopee", externalConversationId: `c-${randomUUID()}`, buyerExternalId: "b9", buyerName: "Bot Buyer", handlingState: "bot" })
        .returning();
      const [seg] = await db().insert(schema.segment).values({ merchantId: A.merchant.id, conversationId: conv.id, stage: "unknown", startedAt: new Date() }).returning();
      await db().update(schema.conversation).set({ currentSegmentId: seg.id }).where(eq(schema.conversation.id, conv.id));
      await handoff({ ...conv, currentSegmentId: seg.id }, "keyword", "assist");
      const rows = await deliveries(conv.id);
      expect(rows.map((r) => [r.kind, r.segmentId])).toEqual([["unclaimed", seg.id]]);
    });

    it("待认领超时：提醒任务推一张超时卡，每段只一次；开关关着时不推", async () => {
      await db().update(schema.receptionSettings).set({ unclaimedRemindMinutes: 1 }).where(eq(schema.receptionSettings.merchantId, A.merchant.id));
      const convId = await ingestBuyer(A.shopVn, `c-${randomUUID()}`, { sentAt: new Date(Date.now() - 5 * 60_000) });
      await remindUnclaimed();
      await remindUnclaimed();
      expect((await deliveries(convId)).map((r) => r.kind).sort()).toEqual(["overdue", "unclaimed"]);

      await settings.updateFeishuToggles(A.admin, { notifyUnclaimed: false, notifyOverdue: false });
      const quiet = await ingestBuyer(A.shopVn, `c-${randomUUID()}`, { sentAt: new Date(Date.now() - 5 * 60_000) });
      await remindUnclaimed();
      expect(await deliveries(quiet)).toHaveLength(0);
      await settings.updateFeishuToggles(A.admin, { notifyUnclaimed: true, notifyOverdue: true });
    });

    it("没有默认群、店铺也没指定群时不推", async () => {
      const B = await newMerchant("无群商户");
      await settings.connectFeishu(B.admin, { method: "app", appId: "cli_b1b2c3d4", appSecret: "good" });
      const convId = await ingestBuyer(B.shopVn, `c-${randomUUID()}`);
      expect(await deliveries(convId)).toHaveLength(0);
    });
  });

  describe("feishu.send", () => {
    it("构卡并发出：标题、AI 总结、中文译文、图片上传、认领链接", async () => {
      const ext = `c-${randomUUID()}`;
      const convId = await ingestBuyer(A.shopVn, ext, { sentAt: new Date(Date.now() - 3 * 60_000) });
      await ingestBuyer(A.shopVn, ext, { type: "image", text: null, payload: { url: "https://cf.shopee.sg/file/abc" } });
      await ingestBuyer(A.shopVn, ext, { text: "这个能退货吗" });
      const [row] = await deliveries(convId);
      await deliverFeishuCard({ id: row.id });
      const [sent] = await deliveries(convId);
      expect(sent).toMatchObject({ status: "sent", stub: true, attempts: 1, error: null });
      const card = sent.card as { header: { template: string; title: { content: string } }; body: { elements: Array<{ tag: string; content?: string; img_key?: string; columns?: unknown }> } };
      expect(card.header).toMatchObject({ template: "orange", title: { content: "待认领 · OBSBOT 越南店" } });
      const md = card.body.elements.filter((e) => e.tag === "markdown").map((e) => e.content).join("\n");
      expect(card.body.elements[0].content).toBe(`**AI 总结**　${STUB_SUMMARY}`);
      expect(md).toContain("**平台** Shopee · 越南");
      expect(md).toContain("**已等** 3 分钟");
      expect(md).toContain("Can it work with Mac?\n<font color='grey'>译文：&#91;译文&#93; Can it work with Mac?</font>");
      expect(md).toContain("这个能退货吗");
      expect(md).not.toContain("译文：这个能退货吗");
      const img = card.body.elements.find((e) => e.tag === "img");
      expect(stubImageSource(img!.img_key!)).toBe("https://cf.shopee.sg/file/abc");
      expect(JSON.stringify(card)).toContain(`/wb/${convId}?claim=1&m=${A.merchant.id}`);
    });

    it("发出前会话已被认领：记为跳过，不发", async () => {
      const convId = await ingestBuyer(A.shopVn, `c-${randomUUID()}`);
      const [row] = await deliveries(convId);
      await db().update(schema.conversation).set({ handlingState: "human", claimedBy: A.admin.membership.id }).where(eq(schema.conversation.id, convId));
      const spy = vi.spyOn(stubFeishu, "sendToChat");
      await deliverFeishuCard({ id: row.id });
      expect((await deliveries(convId))[0]).toMatchObject({ status: "skipped", error: "会话已被认领" });
      expect(spy).not.toHaveBeenCalled();
    });

    it("可重试的失败抛给队列重试并沿用已构好的卡片；第 6 次仍失败记为失败、写原因", async () => {
      const convId = await ingestBuyer(A.shopVn, `c-${randomUUID()}`);
      const [row] = await deliveries(convId);
      vi.spyOn(stubFeishu, "sendToChat").mockRejectedValue(new FeishuError("network", null, "连不上飞书"));
      await expect(deliverFeishuCard({ id: row.id })).rejects.toThrow("连不上飞书");
      const [after1] = await deliveries(convId);
      expect(after1).toMatchObject({ status: "queued", attempts: 1, error: "连不上飞书" });
      expect(after1.card).not.toBeNull();
      await db().update(schema.feishuDelivery).set({ attempts: 5 }).where(eq(schema.feishuDelivery.id, row.id));
      await deliverFeishuCard({ id: row.id });
      expect((await deliveries(convId))[0]).toMatchObject({ status: "failed", attempts: 6, error: "连不上飞书" });
    });

    it("不可重试的失败（机器人不在群里）直接记为失败；凭证失效时把接入标为失效", async () => {
      const c1 = await ingestBuyer(A.shopVn, `c-${randomUUID()}`);
      const [r1] = await deliveries(c1);
      vi.spyOn(stubFeishu, "sendToChat").mockRejectedValueOnce(new FeishuError("not_in_chat", 230002, "机器人不在这个群里"));
      await deliverFeishuCard({ id: r1.id });
      expect((await deliveries(c1))[0]).toMatchObject({ status: "failed", attempts: 1 });

      const c2 = await ingestBuyer(A.shopVn, `c-${randomUUID()}`);
      const [r2] = await deliveries(c2);
      vi.spyOn(stubFeishu, "sendToChat").mockRejectedValueOnce(new FeishuError("credentials", 99991663, "应用凭证已失效"));
      await deliverFeishuCard({ id: r2.id });
      expect((await deliveries(c2))[0].status).toBe("failed");
      const v = await settings.feishuView(A.admin);
      expect(v.connection?.status).toBe("invalid");
      expect(v.lastFailure?.error).toBe("应用凭证已失效");
      // 下一次成功发出后恢复为已校验
      const c3 = await ingestBuyer(A.shopVn, `c-${randomUUID()}`);
      await deliverFeishuCard({ id: (await deliveries(c3))[0].id });
      expect((await settings.feishuView(A.admin)).connection?.status).toBe("verified");
    });
  });

  describe("自定义机器人与断开", () => {
    it("换成自定义机器人清掉原群；地址不是飞书机器人拒收；密钥加密保存；签名失败的测试卡片返回原因并记失败", async () => {
      const B = await newMerchant("机器人商户");
      await settings.connectFeishu(B.admin, { method: "app", appId: "cli_c1b2c3d4", appSecret: "good" });
      await settings.saveFeishuTarget(B.admin, { shopId: null, chatId: "oc_stub_service" });
      const v = await settings.connectFeishu(B.admin, { method: "webhook" });
      expect(v.connection?.method).toBe("webhook");
      expect(v.defaultTarget).toBeNull();
      const bad = await problemOf(settings.saveFeishuTarget(B.admin, { shopId: null, name: "售后群", webhookUrl: "https://example.com/hook/abcdefgh", secret: "s" }));
      expect(bad.status).toBe(422);
      const ok = await settings.saveFeishuTarget(B.admin, { shopId: null, name: "售后群", webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/0f1e2d3c4b5a", secret: "sign-secret" });
      expect(ok.defaultTarget).toMatchObject({ kind: "webhook", name: "售后群", webhookHint: "4b5a" });
      const [t] = await db().select().from(schema.feishuTarget).where(eq(schema.feishuTarget.merchantId, B.merchant.id));
      expect(t.webhookEnc).not.toContain("0f1e2d3c4b5a");
      expect(t.secretEnc).not.toContain("sign-secret");
      expect(await settings.sendFeishuTest(B.admin, t.id)).toMatchObject({ ok: true, imageUpload: "skipped" });
      // 改名时可不重填地址与密钥
      await settings.saveFeishuTarget(B.admin, { shopId: null, name: "售后处理群" });
      await settings.saveFeishuTarget(B.admin, { shopId: B.shopVn.id, name: "越南群", webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/badbadbad1", secret: "x" });
      const shopTarget = (await settings.feishuView(B.admin)).shops.find((s) => s.id === B.shopVn.id)!.target!;
      const fail = await problemOf(settings.sendFeishuTest(B.admin, shopTarget.id));
      expect(fail.status).toBe(502);
      expect(fail.detail).toContain("签名校验没有通过");
      expect((await settings.feishuView(B.admin)).lastFailure).toMatchObject({ targetName: "越南群", kind: "test" });

      const off = await settings.disconnectFeishu(B.admin);
      expect(off.connection).toBeNull();
      expect(await db().select().from(schema.feishuTarget).where(eq(schema.feishuTarget.merchantId, B.merchant.id))).toHaveLength(0);
    });
  });

  describe("落地认领（服务端）", () => {
    it("带版本认领待认领会话；本人已认领再认领返回原会话；版本过期 409", async () => {
      const convId = await ingestBuyer(A.shopVn, `c-${randomUUID()}`);
      const lead = await addMember(A.merchant, "lead", "组长小李", [A.shopVn.id]);
      const [conv] = await db().select().from(schema.conversation).where(eq(schema.conversation.id, convId));
      const stale = await problemOf(claim(lead, convId, conv.version + 5));
      expect(stale.status).toBe(409);
      const mine = await claim(lead, convId, conv.version);
      expect(mine).toMatchObject({ handlingState: "human", claimedBy: lead.membership.id });
      expect((await claim(lead, convId, null)).id).toBe(convId);
    });

    it("员工点认领时会话已被同事认领：不带版本也回 409 并带上处理人（员工看不到同事的会话）", async () => {
      const convId = await ingestBuyer(A.shopVn, `c-${randomUUID()}`);
      const a1 = await addMember(A.merchant, "agent", "员工甲", [A.shopVn.id]);
      const a2 = await addMember(A.merchant, "agent", "员工乙", [A.shopVn.id]);
      await claim(a1, convId, null);
      const lost = await problemOf(claim(a2, convId, null));
      expect(lost.status).toBe(409);
      expect(lost.extra?.claimedBy).toEqual({ id: a1.membership.id, name: "员工甲" });
      // 不负责这家店的员工：看不到，404
      const outsider = await addMember(A.merchant, "agent", "员工丙", [A.shopTh.id]);
      expect((await problemOf(claim(outsider, convId, null))).status).toBe(404);
    });
  });
});
