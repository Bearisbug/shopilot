// 店铺与连接（REQ-SHOP-006 至 REQ-SHOP-011）：列表、详情、检查连接、更新应用密钥、断开、撤销授权链接、远程协助。
// 对应 API-SHOP-008…014；只对管理员开放（shops.manage），全部查询带 merchant_id。
import { TZDate } from "@date-fns/tz";
import { startOfDay } from "date-fns";
import { and, count, desc, eq, gte, inArray, ne } from "drizzle-orm";
import {
  ASSIST_STEPS,
  type AssistBody,
  type DiagnoseCheck,
  type DiagnoseResult,
  type DisconnectResult,
  type PlatformAppCard,
  type ShopDetail,
  type ShopIssue,
  type ShopPeriod,
  type ShopRow,
  type ShopsResponse,
  shopeeRotateBody,
  tiktokRotateBody,
} from "@/contracts/shops";
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { decrypt, encrypt } from "@/server/core/crypto";
import { db, schema } from "@/server/db/client";
import { env } from "@/server/env";
import { json } from "@/server/http/route";
import { notAllowed, notFound, Problem } from "@/server/http/problem";
import { isReadOnlyShop, ShopUnavailableError, shopeeApp, webhookUrl, withShop, type AppRow, type ShopClient } from "@/server/platforms/clients";
import { SHOPEE_PUSH_CODES, shopeeAuthedShops, shopeeAuthUrl, shopeeConversations, shopeeGetPushConfig, shopeeOrderSns, shopeeShopInfo } from "@/server/platforms/shopee";
import { TIKTOK_WEBHOOK_EVENTS, tiktokAuthorizedShops, tiktokConversations, tiktokEndSession, tiktokRefresh, tiktokSearchOrders, tiktokWebhooks } from "@/server/platforms/tiktok";
import { PlatformError, platformErrorText } from "@/server/platforms/types";
import { setTikTokAcceptChat } from "./agent-settings";
import { forgetProbe } from "./capabilities";
import type { StoredMetrics } from "./jobs";
import { PLATFORM_NAME, type Platform } from "./shared";

const DAY = 86400_000;
type ShopDb = typeof schema.shop.$inferSelect;

async function deny(ctx: MemberContext, apiId: string, reason: string, detail: string): Promise<never> {
  await audit(ctx.actor, { module: "auth", action: "permission_denied", summary: `被业务规则拒绝：${detail}`, data: { api_id: apiId, role: ctx.membership.role, reason } });
  throw notAllowed(detail, reason);
}

async function ownShop(ctx: MemberContext, id: string): Promise<ShopDb> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("店铺不存在或已删除。");
  const [s] = await db().select().from(schema.shop).where(and(eq(schema.shop.id, id), eq(schema.shop.merchantId, ctx.merchant.id))).limit(1);
  if (!s) throw notFound("店铺不存在或已删除。");
  return s;
}

function zeroInbound(s: ShopDb, now = Date.now()): boolean {
  if (s.status !== "connected") return false;
  if (s.lastInboundAt) return now - s.lastInboundAt.getTime() >= 7 * DAY;
  return now - (s.connectedAt ?? s.createdAt).getTime() >= 7 * DAY;
}

function issuesOf(s: ShopDb, metric: ShopRow["metrics"], readOnly: boolean): ShopIssue[] {
  if (s.status === "disconnected") return [];
  const out: ShopIssue[] = [];
  // 只读接入不刷新 token：借用的 token 过期后拉取停止，等重新同步（店铺状态保持已连接）
  if (readOnly && s.status === "connected" && (!s.accessExpiresAt || s.accessExpiresAt.getTime() <= Date.now())) {
    out.push({ key: "borrowed_token_expired", text: "借用的 token 已过期：拉取已停止，等待重新同步" });
  }
  if (s.status === "auth_expired") out.push({ key: "auth_expired", text: "授权失效：停止收发消息，续期授权后恢复" });
  if (s.status === "connected" && !s.capabilities.chat) out.push({ key: "chat_unavailable", text: `收发聊天不可用：${s.capabilities.chatReason ?? "平台没有给聊天权限"}` });
  if (zeroInbound(s)) out.push({ key: "zero_inbound", text: "7 天没有收到买家消息：授权正常时先到平台卖家中心确认这家店有没有买家聊天" });
  if (metric?.responseRate !== null && metric?.responseRate !== undefined && typeof metric.target === "number" && metric.responseRate < metric.target) {
    out.push({ key: "metric_low", text: `平台回复率 ${metric.responseRate}% 低于目标 ${metric.target}%` });
  }
  if (s.status === "connected" && s.authExpiresAt && s.authExpiresAt.getTime() - Date.now() < 7 * DAY) {
    out.push({ key: "auth_expiring", text: `授权 ${Math.max(0, Math.ceil((s.authExpiresAt.getTime() - Date.now()) / DAY))} 天内到期，请续期` });
  }
  if (s.backfill.state === "failed") out.push({ key: "backfill_failed", text: `历史回补失败：${s.backfill.error ?? "平台接口出错"}` });
  return out;
}

const metricsOf = (s: ShopDb, period: ShopPeriod): ShopRow["metrics"] => ((s.metrics as StoredMetrics | null) ?? {})[period] ?? null;

/** 需处理的店数：与 /shops 的「需处理」同一判定（未断开且 issuesOf 非空），侧栏徽标（API-NAV-001）复用 */
export async function countShopsNeedingAttention(merchantId: string, period: ShopPeriod = "7d"): Promise<number> {
  const rows = await db()
    .select({ shop: schema.shop, readOnly: schema.platformApp.readOnly })
    .from(schema.shop)
    .innerJoin(schema.platformApp, eq(schema.platformApp.id, schema.shop.platformAppId))
    .where(and(eq(schema.shop.merchantId, merchantId), ne(schema.shop.status, "disconnected")));
  return rows.filter((r) => issuesOf(r.shop, metricsOf(r.shop, period), r.readOnly).length > 0).length;
}

function toRow(s: ShopDb, modes: { in: string | null; off: string | null }, period: ShopPeriod, readOnly: boolean): ShopRow {
  const metrics = metricsOf(s, period);
  return {
    id: s.id,
    platform: s.platform,
    name: s.name,
    market: s.market,
    status: s.status,
    readOnly,
    authExpiresAt: s.authExpiresAt?.toISOString() ?? null,
    modes: { inHours: modes.in ?? "off", offHours: modes.off ?? "off" },
    lastInboundAt: s.lastInboundAt?.toISOString() ?? null,
    zeroInbound7d: zeroInbound(s),
    metrics,
    metricsAt: s.metricsAt?.toISOString() ?? null,
    issues: issuesOf(s, metrics, readOnly),
    backfill: s.backfill,
    caps: { chat: s.capabilities.chat, piiMasked: s.capabilities.piiMasked, productScope: s.capabilities.productScope },
  };
}

async function shopsWithModes(merchantId: string) {
  return db()
    .select({ shop: schema.shop, modeIn: schema.shopReception.modeInHours, modeOff: schema.shopReception.modeOffHours, readOnly: schema.platformApp.readOnly })
    .from(schema.shop)
    .innerJoin(schema.platformApp, eq(schema.platformApp.id, schema.shop.platformAppId))
    .leftJoin(schema.shopReception, eq(schema.shopReception.shopId, schema.shop.id))
    .where(eq(schema.shop.merchantId, merchantId))
    .orderBy(schema.shop.platform, schema.shop.market, schema.shop.name);
}

// ---------- API-SHOP-008 ----------

export async function listShops(ctx: MemberContext, q: { platform: "all" | Platform; status: "all" | "attention" | "ok"; period: ShopPeriod }): Promise<ShopsResponse> {
  const rows = await shopsWithModes(ctx.merchant.id);
  const all = rows.map((r) => ({ db: r.shop, row: toRow(r.shop, { in: r.modeIn, off: r.modeOff }, q.period, r.readOnly) }));
  const active = all.filter((x) => x.db.status !== "disconnected");

  const items = all
    .filter((x) => q.platform === "all" || x.row.platform === q.platform)
    .filter((x) => {
      if (q.status === "attention") return x.row.status !== "disconnected" && x.row.issues.length > 0;
      if (q.status === "ok") return x.row.status === "connected" && x.row.issues.length === 0;
      return true;
    })
    .map((x) => x.row);

  const apps = await db().select().from(schema.platformApp).where(eq(schema.platformApp.merchantId, ctx.merchant.id));
  const appCards: PlatformAppCard[] = apps.map((a) => {
    const own = active.filter((x) => x.db.platformAppId === a.id);
    const expiries = own.map((x) => x.db.authExpiresAt?.getTime()).filter((t): t is number => typeof t === "number");
    return {
      id: a.id,
      platform: a.platform,
      appKey: a.appKey,
      status: a.status,
      region: a.region,
      shopCount: own.length,
      authExpiresAt: expiries.length ? new Date(Math.min(...expiries)).toISOString() : null,
      keyExpiresAt: a.keyExpiresAt,
      webhookUrl: webhookUrl(a.platform, a.id),
    };
  });

  const dayStart = startOfDay(new TZDate(new Date(), ctx.merchant.timezone));
  const [today] = await db()
    .select({ n: count() })
    .from(schema.segment)
    .where(and(eq(schema.segment.merchantId, ctx.merchant.id), gte(schema.segment.startedAt, new Date(dayStart.getTime())), eq(schema.segment.backfilled, false)));
  const latest = active.filter((x) => x.db.lastInboundAt).sort((a, b) => b.db.lastInboundAt!.getTime() - a.db.lastInboundAt!.getTime())[0];
  const rated = active.filter((x) => x.row.status === "connected" && typeof x.row.metrics?.responseRate === "number");
  const lowest = rated.sort((a, b) => a.row.metrics!.responseRate! - b.row.metrics!.responseRate!)[0];
  const attention = active.filter((x) => x.row.issues.length > 0);
  const metricsTimes = active.map((x) => x.db.metricsAt?.getTime()).filter((t): t is number => typeof t === "number");
  const recent = await db()
    .select({ id: schema.shopEvent.id, shopId: schema.shopEvent.shopId, shopName: schema.shop.name, kind: schema.shopEvent.kind, text: schema.shopEvent.text, createdAt: schema.shopEvent.createdAt })
    .from(schema.shopEvent)
    .innerJoin(schema.shop, eq(schema.shop.id, schema.shopEvent.shopId))
    .where(and(eq(schema.shopEvent.merchantId, ctx.merchant.id), gte(schema.shopEvent.createdAt, new Date(Date.now() - 7 * DAY))))
    .orderBy(desc(schema.shopEvent.createdAt))
    .limit(10);

  return {
    items,
    apps: appCards,
    events: recent.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    summary: {
      total: active.length,
      byPlatform: { shopee: active.filter((x) => x.db.platform === "shopee").length, tiktok: active.filter((x) => x.db.platform === "tiktok").length },
      authValid: active.filter((x) => x.db.status === "connected").length,
      attention: attention.length,
      attentionText: attention.slice(0, 3).map((x) => `${x.row.name} ${x.row.issues[0].text.split("：")[0]}`),
      todayInbound: today.n,
      lastInbound: latest ? { at: latest.db.lastInboundAt!.toISOString(), shopName: latest.db.name } : null,
      lowestRate: lowest ? { value: lowest.row.metrics!.responseRate!, shopName: lowest.row.name, platform: lowest.row.platform } : null,
      metricsAt: metricsTimes.length ? new Date(Math.max(...metricsTimes)).toISOString() : null,
    },
  };
}

// ---------- API-SHOP-009 ----------

export async function shopDetail(ctx: MemberContext, id: string, period: ShopPeriod = "7d"): Promise<ShopDetail> {
  const s = await ownShop(ctx, id);
  const [[rec], [app], events] = await Promise.all([
    db().select().from(schema.shopReception).where(eq(schema.shopReception.shopId, s.id)).limit(1),
    db().select({ appKey: schema.platformApp.appKey, readOnly: schema.platformApp.readOnly }).from(schema.platformApp).where(eq(schema.platformApp.id, s.platformAppId)).limit(1),
    db().select().from(schema.shopEvent).where(eq(schema.shopEvent.shopId, s.id)).orderBy(desc(schema.shopEvent.createdAt)).limit(20),
  ]);
  const c = s.capabilities;
  return {
    ...toRow(s, { in: rec?.modeInHours ?? null, off: rec?.modeOffHours ?? null }, period, Boolean(app?.readOnly)),
    appKey: app?.appKey ?? "",
    externalShopId: s.externalShopId,
    mainAccountId: s.mainAccountId,
    connectedAt: s.connectedAt?.toISOString() ?? null,
    disconnectedAt: s.disconnectedAt?.toISOString() ?? null,
    capabilities: {
      chat: c.chat,
      chatReason: c.chatReason,
      orders: c.orders,
      ordersReason: c.ordersReason,
      piiMasked: c.piiMasked,
      productScope: c.productScope,
      cards: [...c.cards],
      coupons: c.coupons,
      endSession: c.endSession,
      maxTextLength: c.maxTextLength,
    },
    events: events.map((e) => ({ id: e.id, kind: e.kind, text: e.text, createdAt: e.createdAt.toISOString() })),
  };
}

// ---------- API-SHOP-010 ----------

const reauthLink = (id: string) => `/shops?shop=${id}&dialog=reauth`;

function failText(e: unknown): string {
  if (e instanceof PlatformError) return platformErrorText(e);
  if (e instanceof ShopUnavailableError) return "店铺授权已失效，续期授权后再检查。";
  return "检查时出错，请稍后重试。";
}

export async function diagnose(ctx: MemberContext, shopIds?: string[]): Promise<DiagnoseResult> {
  const conds = [eq(schema.shop.merchantId, ctx.merchant.id), ne(schema.shop.status, "disconnected")];
  if (shopIds?.length) conds.push(inArray(schema.shop.id, shopIds));
  const shops = await db().select().from(schema.shop).where(and(...conds)).orderBy(schema.shop.platform, schema.shop.market, schema.shop.name);
  if (shopIds?.length && shops.length !== new Set(shopIds).size) throw notFound("有店铺不存在、已断开或不属于当前商户。");

  const apps = shops.length ? await db().select().from(schema.platformApp).where(inArray(schema.platformApp.id, [...new Set(shops.map((s) => s.platformAppId))])) : [];
  const pushByApp = new Map<string, DiagnoseCheck>();
  for (const a of apps.filter((x) => x.platform === "shopee")) pushByApp.set(a.id, await shopeePushCheck(a));

  const results: DiagnoseResult["results"] = [];
  for (const s of shops) {
    let checks: DiagnoseCheck[];
    if (s.status !== "connected") {
      const reason = "授权已失效：停止收发消息，续期授权后恢复。";
      checks = (["shop_info", "conversations", "orders", "push_config"] as const).map((key) => ({ key, ok: false, reason, fixLink: reauthLink(s.id) }));
    } else {
      try {
        checks = await withShop(s.id, (c) => runChecks(c, pushByApp.get(s.platformAppId)));
      } catch (e) {
        checks = (["shop_info", "conversations", "orders", "push_config"] as const).map((key) => ({ key, ok: false, reason: failText(e), fixLink: reauthLink(s.id) }));
      }
    }
    results.push({ shopId: s.id, name: s.name, platform: s.platform, market: s.market, checks });
  }
  return { checkedAt: new Date().toISOString(), results };
}

async function shopeePushCheck(app: AppRow): Promise<DiagnoseCheck> {
  try {
    const cfg = await shopeeGetPushConfig(shopeeApp(app));
    const ours = webhookUrl("shopee", app.id);
    if (cfg.callbackUrl !== ours) {
      return {
        key: "push_config",
        ok: false,
        reason: cfg.callbackUrl ? `推送回调指向 ${cfg.callbackUrl}，Shopilot 收不到这个应用的推送。到「应用凭证」重新保存并勾选「改发到 Shopilot」。` : "推送回调是空的，Shopilot 收不到推送。到「应用凭证」重新保存。",
        fixLink: "/shops/connect/shopee",
      };
    }
    const missing = SHOPEE_PUSH_CODES.filter((c) => !cfg.on.includes(c));
    if (missing.length) return { key: "push_config", ok: false, reason: `推送订阅缺少 code ${missing.join("、")}。到「应用凭证」重新保存即可补上。`, fixLink: "/shops/connect/shopee" };
    return { key: "push_config", ok: true };
  } catch (e) {
    return { key: "push_config", ok: false, reason: failText(e), fixLink: "/shops/connect/shopee" };
  }
}

async function runChecks(c: ShopClient, shopeePush?: DiagnoseCheck): Promise<DiagnoseCheck[]> {
  const id = c.shop.id;
  const guide = `/shops/connect/${c.platform}/guide#item-4`;
  const check = async (key: DiagnoseCheck["key"], fn: () => Promise<void>, fixLink: string): Promise<DiagnoseCheck> => {
    try {
      await fn();
      return { key, ok: true };
    } catch (e) {
      return { key, ok: false, reason: failText(e), fixLink };
    }
  };
  if (c.platform === "shopee") {
    return [
      await check("shop_info", async () => void (await shopeeShopInfo(c.app, c.auth)), reauthLink(id)),
      await check("conversations", async () => void (await shopeeConversations(c.app, c.auth, null, 1)), guide),
      await check("orders", async () => void (await shopeeOrderSns(c.app, c.auth, new Date(Date.now() - 15 * DAY), new Date(), "create_time")), reauthLink(id)),
      shopeePush ?? { key: "push_config", ok: false, reason: "没有读到应用推送配置。", fixLink: "/shops/connect/shopee" },
    ];
  }
  const ours = webhookUrl("tiktok", c.appRow.id);
  return [
    await check(
      "shop_info",
      async () => {
        const shops = await tiktokAuthorizedShops(c.app, c.auth.accessToken);
        if (!shops.some((s) => s.id === c.shop.externalShopId)) throw new PlatformError("tiktok", "shop_not_authorized", "这家店不在已授权店铺列表里", "auth");
      },
      reauthLink(id),
    ),
    await check("conversations", async () => void (await tiktokConversations(c.app, c.auth, null, 1)), guide),
    await check("orders", async () => void (await tiktokSearchOrders(c.app, c.auth, { createTimeGe: new Date(Date.now() - 15 * DAY) }, null)), reauthLink(id)),
    await (async (): Promise<DiagnoseCheck> => {
      try {
        const hooks = await tiktokWebhooks(c.app, c.auth);
        const missing = TIKTOK_WEBHOOK_EVENTS.filter((ev) => !hooks.some((h) => h.eventType === ev && h.address === ours));
        if (missing.length === 0) return { key: "push_config", ok: true };
        return { key: "push_config", ok: false, reason: `消息通知没有发往 Shopilot：${missing.join("、")}。续期授权时会重新登记。`, fixLink: reauthLink(id) };
      } catch (e) {
        return { key: "push_config", ok: false, reason: failText(e), fixLink: reauthLink(id) };
      }
    })(),
  ];
}

// ---------- API-SHOP-011 ----------

export async function rotateKey(ctx: MemberContext, platform: Platform, raw: unknown): Promise<{ ok: true; verifiedAt: string }> {
  const [app] = await db()
    .select()
    .from(schema.platformApp)
    .where(and(eq(schema.platformApp.merchantId, ctx.merchant.id), eq(schema.platformApp.platform, platform)))
    .limit(1);
  if (app?.readOnly) await deny(ctx, "API-SHOP-011", "read_only", "只读接入的应用凭证由导入脚本维护，不能在这里修改或重新授权。");
  if (!app) await deny(ctx, "API-SHOP-011", "app_missing", `还没有 ${PLATFORM_NAME[platform]} 应用，先在接入向导里填凭证。`);
  const now = new Date();
  if (platform === "shopee") {
    const body = shopeeRotateBody.parse(raw);
    if (!app!.apiHost || app!.region === "sandbox") await deny(ctx, "API-SHOP-011", "app_unverified", "这个应用还没有校验通过，请在接入向导的「应用凭证」一步重新验证。");
    try {
      await shopeeAuthedShops({ partnerId: app!.appKey, partnerKey: body.partnerKey, host: app!.apiHost! });
    } catch (e) {
      if (!(e instanceof PlatformError)) throw e;
      const result = e.code === "error_sign" ? "wrong_key" : e.code === "invalid_partner_id" ? "invalid_partner" : "error";
      throw new Problem("platform-credentials", {
        detail: `新的 Partner Key 没有通过校验（${result === "wrong_key" ? "Key 不对" : platformErrorText(e)}），旧 Key 保留，店铺照常收发。`,
        extra: { attempts: [{ region: app!.region ?? "", result, message: e.code }] },
      });
    }
    await db()
      .update(schema.platformApp)
      .set({ secretEnc: encrypt(body.partnerKey), ...(body.pushKey ? { pushKeyEnc: encrypt(body.pushKey) } : {}), status: "verified", verifiedAt: now, updatedAt: now })
      .where(eq(schema.platformApp.id, app!.id));
    await audit(ctx.actor, { module: "shops", action: "app_key_rotated", summary: `更新 Shopee 应用 ${app!.appKey} 的 Partner Key${body.pushKey ? " 与 Push Key" : ""}（新密钥校验通过后替换）`, targetType: "platform_app", targetId: app!.id, data: { platform, pushKey: Boolean(body.pushKey) } });
    return { ok: true, verifiedAt: now.toISOString() };
  }

  const body = tiktokRotateBody.parse(raw);
  const shops = await db()
    .select()
    .from(schema.shop)
    .where(and(eq(schema.shop.platformAppId, app!.id), eq(schema.shop.status, "connected")));
  const probe = shops.find((s) => s.refreshTokenEnc);
  if (!probe) await deny(ctx, "API-SHOP-011", "no_shop_to_verify", "TikTok 只能用已授权店铺刷新一次 token 来校验 Secret；现在没有已连接的店，请到接入向导重新填凭证并授权。");
  const oldRefresh = decrypt(probe!.refreshTokenEnc!);
  let grant;
  try {
    grant = await tiktokRefresh({ appKey: app!.appKey, appSecret: body.appSecret }, oldRefresh);
  } catch (e) {
    if (!(e instanceof PlatformError)) throw e;
    throw new Problem("platform-credentials", {
      detail: `新的 App Secret 没有通过校验（${e.kind === "auth" ? "Secret 不对" : platformErrorText(e)}），旧 Secret 保留，店铺照常收发。`,
      extra: { attempts: [{ region: "global", result: e.kind === "auth" ? "wrong_key" : "error", message: e.code }] },
    });
  }
  await db().transaction(async (tx) => {
    await tx.update(schema.platformApp).set({ secretEnc: encrypt(body.appSecret), status: "verified", verifiedAt: now, updatedAt: now }).where(eq(schema.platformApp.id, app!.id));
    for (const s of shops) {
      if (!s.refreshTokenEnc || decrypt(s.refreshTokenEnc) !== oldRefresh) continue;
      await tx
        .update(schema.shop)
        .set({ accessTokenEnc: encrypt(grant.accessToken), refreshTokenEnc: encrypt(grant.refreshToken), accessExpiresAt: grant.accessExpiresAt, authExpiresAt: grant.authExpiresAt, updatedAt: now })
        .where(eq(schema.shop.id, s.id));
    }
    await audit(ctx.actor, { module: "shops", action: "app_key_rotated", summary: `更新 TikTok 应用 ${app!.appKey} 的 App Secret（新密钥刷新 token 成功后替换）`, targetType: "platform_app", targetId: app!.id, data: { platform } }, tx);
  });
  return { ok: true, verifiedAt: now.toISOString() };
}

// ---------- API-SHOP-012 ----------

export async function disconnectShop(ctx: MemberContext, id: string, keepHistory: boolean): Promise<DisconnectResult> {
  const s = await ownShop(ctx, id);
  if (s.status === "disconnected") return { closedConversations: 0, deletedConversations: 0, deletedOrders: 0, warnings: [] };
  const warnings: string[] = [];
  const open = await db()
    .select()
    .from(schema.conversation)
    .where(and(eq(schema.conversation.shopId, s.id), ne(schema.conversation.handlingState, "closed")));

  // 平台侧（只对 connected 的店）：TikTok 先关坐席接单，处理中的会话结束 session；失败只记原因不阻断。只读接入不碰平台
  if (s.platform === "tiktok" && s.status === "connected" && !(await isReadOnlyShop(s))) {
    const r = await setTikTokAcceptChat(s.id, false);
    if (!r.ok) warnings.push(`TikTok 坐席接单没有关闭：${r.error ?? "平台没有返回原因"}`);
    for (const c of open.filter((x) => x.handlingState === "human" && x.externalSessionId)) {
      try {
        await withShop(s.id, async (cl) => {
          if (cl.platform === "tiktok") await tiktokEndSession(cl.app, cl.auth, c.externalConversationId, c.externalSessionId!);
        });
      } catch (e) {
        await db().insert(schema.message).values({
          merchantId: ctx.merchant.id,
          conversationId: c.id,
          segmentId: c.currentSegmentId,
          direction: "out",
          senderRole: "system",
          type: "other",
          text: `店铺断开时结束 TikTok 会话没有成功：${failText(e)}`,
          sentAt: new Date(),
        });
      }
    }
  }

  const now = new Date();
  const result = await db().transaction(async (tx) => {
    for (const c of open) {
      await tx.update(schema.conversation).set({ handlingState: "closed", version: c.version + 1, updatedAt: now }).where(eq(schema.conversation.id, c.id));
      if (c.currentSegmentId) {
        await tx.update(schema.segment).set({ endedAt: now, endReason: "shop_disconnected" }).where(and(eq(schema.segment.id, c.currentSegmentId), eq(schema.segment.conversationId, c.id)));
      }
      await tx.update(schema.draft).set({ status: "superseded" }).where(and(eq(schema.draft.conversationId, c.id), eq(schema.draft.status, "generated")));
      await audit(ctx.actor, { module: "workbench", action: "conversation_closed", summary: `店铺「${s.name}」断开，会话结束（${c.buyerName}）`, targetType: "conversation", targetId: c.id, data: { end_reason: "shop_disconnected", ai_resolved: false } }, tx);
    }
    let deletedConversations = 0;
    let deletedOrders = 0;
    if (!keepHistory) {
      deletedConversations = (await tx.delete(schema.conversation).where(eq(schema.conversation.shopId, s.id)).returning({ id: schema.conversation.id })).length;
      await tx.delete(schema.afterSale).where(eq(schema.afterSale.shopId, s.id));
      deletedOrders = (await tx.delete(schema.order).where(eq(schema.order.shopId, s.id)).returning({ id: schema.order.id })).length;
    }
    await tx
      .update(schema.shop)
      .set({ status: "disconnected", accessTokenEnc: null, refreshTokenEnc: null, accessExpiresAt: null, disconnectedAt: now, updatedAt: now })
      .where(eq(schema.shop.id, s.id));
    const [d] = await tx
      .select()
      .from(schema.connectDraft)
      .where(and(eq(schema.connectDraft.merchantId, ctx.merchant.id), eq(schema.connectDraft.platform, s.platform)))
      .limit(1);
    if (d?.shopIds.includes(s.id)) await tx.update(schema.connectDraft).set({ shopIds: d.shopIds.filter((x) => x !== s.id), updatedAt: now }).where(eq(schema.connectDraft.id, d.id));
    await tx.insert(schema.shopEvent).values({ merchantId: ctx.merchant.id, shopId: s.id, kind: "disconnected", text: keepHistory ? "已断开，保留历史会话与订单" : "已断开，并删除历史会话与订单镜像" });
    await audit(
      ctx.actor,
      {
        module: "shops",
        action: "shop_disconnected",
        summary: `断开「${s.name}」（${PLATFORM_NAME[s.platform]} · ${s.market}），${keepHistory ? "保留历史" : `删除历史：${deletedConversations} 个会话、${deletedOrders} 张订单`}`,
        targetType: "shop",
        targetId: s.id,
        data: { platform: s.platform, keepHistory, closedConversations: open.length, deletedConversations, deletedOrders },
      },
      tx,
    );
    return { closedConversations: open.length, deletedConversations, deletedOrders };
  });
  forgetProbe(s.id);
  return { ...result, warnings };
}

// ---------- API-SHOP-013 ----------

export async function cancelAuthUrl(ctx: MemberContext, id: string): Promise<{ url: string; expiresAt: string }> {
  const s = await ownShop(ctx, id);
  if (s.platform !== "shopee") await deny(ctx, "API-SHOP-013", "tiktok_no_cancel", "TikTok 没有撤销授权的开放接口：Shopilot 只能删除本地保存的授权；要在 TikTok 侧撤销，请卖家到 Seller Center 的授权管理里操作。");
  const [app] = await db().select().from(schema.platformApp).where(eq(schema.platformApp.id, s.platformAppId)).limit(1);
  if (!app?.apiHost) await deny(ctx, "API-SHOP-013", "app_unverified", "Shopee 应用凭证没有校验通过，生成不了撤销授权链接。");
  const url = shopeeAuthUrl(shopeeApp(app), `${env().APP_BASE_URL}/shops?shop=${s.id}`, "cancel_auth_partner");
  return { url, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
}

// ---------- API-SHOP-014 ----------

export async function createAssistRequest(ctx: MemberContext, body: AssistBody): Promise<Response> {
  const [row] = await db()
    .insert(schema.assistRequest)
    .values({ merchantId: ctx.merchant.id, platform: body.platform, stuckStep: body.stuckStep, slot: body.slot, contactChannel: body.contactChannel, contact: body.contact, note: body.note || null, createdBy: ctx.membership.id })
    .returning();
  const step = ASSIST_STEPS.find((x) => x.value === body.stuckStep)?.label ?? body.stuckStep;
  await audit(ctx.actor, {
    module: "shops",
    action: "assist_requested",
    summary: `预约远程协助：${step}，时段 ${body.slot}，联系方式 ${body.contactChannel === "email" ? "邮箱" : "电话"}`,
    targetType: "assist_request",
    targetId: row.id,
    data: { platform: body.platform, stuckStep: body.stuckStep, slot: body.slot, contactChannel: body.contactChannel },
  });
  return json({ id: row.id, createdAt: row.createdAt.toISOString() }, 201);
}

