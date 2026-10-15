// 接入向导（REQ-SHOP-001 至 REQ-SHOP-005、REQ-SHOP-009）：草稿、应用凭证、授权链接、OAuth 回调、检查并完成。
// 对应 API-SHOP-001…007；店铺状态迁移按 DESIGN §11.6 authorize / reauthorize。
import { and, count, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import {
  shopeeAppBody,
  tiktokAppBody,
  type AuthUrlResult,
  type CompleteResult,
  type ConnectDraft,
  type DraftBody,
  type OAuthReason,
  type ProbeResponse,
  type RegionAttempt,
  type SaveAppResult,
} from "@/contracts/shops";
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { encrypt, decrypt, randomToken, sha256 } from "@/server/core/crypto";
import { db, schema } from "@/server/db/client";
import { env } from "@/server/env";
import { notAllowed, notFound, Problem, validation } from "@/server/http/problem";
import { enqueue } from "@/server/jobs/boss";
import { plan } from "@/server/billing/plans";
import { merchantWebhookKey, oauthRedirectUrl, shopeeApp, tiktokApp, webhookUrl, type AppRow, type ShopRow } from "@/server/platforms/clients";
import { shopeeAuthedShops, shopeeAuthUrl, shopeeDetectRegion, shopeeExchangeCode, shopeeGetPushConfig, shopeeSetPushConfig, shopeeShopInfo } from "@/server/platforms/shopee";
import { tiktokAuthorizeNeedsServiceId, tiktokAuthUrl, tiktokExchangeCode, tiktokRegisterWebhooks, tiktokSetAcceptChat } from "@/server/platforms/tiktok";
import { PlatformError, platformErrorText, type TokenGrant } from "@/server/platforms/types";
import { initialCapabilities, probeShop } from "./capabilities";
import { setTikTokAcceptChat } from "./agent-settings";
import { refreshShopMetrics } from "./jobs";
import { normalizeMarket, PLATFORM_NAME, type Platform } from "./shared";

const AUTH_LINK_TTL_MS = 5 * 60_000;
const CHECKLIST_KEYS = ["1", "2", "3", "4", "5"] as const;

async function deny(ctx: MemberContext, apiId: string, reason: string, detail: string): Promise<never> {
  await audit(ctx.actor, { module: "auth", action: "permission_denied", summary: `被业务规则拒绝：${detail}`, data: { api_id: apiId, role: ctx.membership.role, reason } });
  throw notAllowed(detail, reason);
}

async function appRow(merchantId: string, platform: Platform): Promise<AppRow | undefined> {
  const [row] = await db()
    .select()
    .from(schema.platformApp)
    .where(and(eq(schema.platformApp.merchantId, merchantId), eq(schema.platformApp.platform, platform)))
    .limit(1);
  return row;
}

async function draftRow(merchantId: string, platform: Platform) {
  const [row] = await db()
    .select()
    .from(schema.connectDraft)
    .where(and(eq(schema.connectDraft.merchantId, merchantId), eq(schema.connectDraft.platform, platform)))
    .limit(1);
  return row;
}

/** 本次接入的店铺（草稿里记的、仍未断开的） */
async function batchShops(merchantId: string, platform: Platform): Promise<ShopRow[]> {
  const d = await draftRow(merchantId, platform);
  const ids = d?.shopIds ?? [];
  if (ids.length === 0) return [];
  return db()
    .select()
    .from(schema.shop)
    .where(and(eq(schema.shop.merchantId, merchantId), inArray(schema.shop.id, ids), ne(schema.shop.status, "disconnected")));
}

// ---------- API-SHOP-001 / 002 ----------

export async function getDraft(ctx: MemberContext, platform: Platform): Promise<ConnectDraft> {
  const [d, app, shops] = await Promise.all([
    draftRow(ctx.merchant.id, platform),
    appRow(ctx.merchant.id, platform),
    db()
      .select({ id: schema.shop.id, name: schema.shop.name, market: schema.shop.market, status: schema.shop.status })
      .from(schema.shop)
      .where(and(eq(schema.shop.merchantId, ctx.merchant.id), eq(schema.shop.platform, platform)))
      .orderBy(schema.shop.market, schema.shop.name),
  ]);
  const checklist = Object.fromEntries(CHECKLIST_KEYS.map((k) => [k, Boolean(d?.checklist?.[k])])) as ConnectDraft["checklist"];
  const pending = d?.shopIds?.length ? (await batchShops(ctx.merchant.id, platform)).length : 0;
  return {
    platform,
    step: d?.step ?? "platform",
    checklist,
    initialMode: d?.initialMode ?? "shadow",
    pendingShops: pending,
    app: app
      ? {
          appKey: app.appKey,
          status: app.status,
          region: app.region,
          sandboxOnly: app.region === "sandbox",
          callbackState: app.callbackState,
          keyExpiresAt: app.keyExpiresAt,
          hasPushKey: Boolean(app.pushKeyEnc),
          serviceId: app.serviceId,
          verifiedAt: app.verifiedAt?.toISOString() ?? null,
        }
      : null,
    urls: { redirect: oauthRedirectUrl(platform), redirectDomain: new URL(env().APP_BASE_URL).origin, webhook: webhookUrl(platform, ctx.merchant.webhookKey) },
    shops,
  };
}

export async function saveDraft(ctx: MemberContext, platform: Platform, body: DraftBody): Promise<ConnectDraft> {
  const existing = await draftRow(ctx.merchant.id, platform);
  const checklist = { ...(existing?.checklist ?? {}), ...(body.checklist ?? {}) };
  const now = new Date();
  await db()
    .insert(schema.connectDraft)
    .values({ merchantId: ctx.merchant.id, platform, step: body.step ?? "platform", checklist, initialMode: body.initialMode ?? "shadow" })
    .onConflictDoUpdate({
      target: [schema.connectDraft.merchantId, schema.connectDraft.platform],
      set: { ...(body.step ? { step: body.step } : {}), checklist, ...(body.initialMode ? { initialMode: body.initialMode } : {}), updatedAt: now },
    });
  if (!existing) {
    await audit(ctx.actor, { module: "shops", action: "connect_started", summary: `开始接入 ${PLATFORM_NAME[platform]}`, data: { platform } });
  }
  return getDraft(ctx, platform);
}

async function setStep(merchantId: string, platform: Platform, step: "credentials" | "auth" | "probe" | "done") {
  await db()
    .insert(schema.connectDraft)
    .values({ merchantId, platform, step })
    .onConflictDoUpdate({ target: [schema.connectDraft.merchantId, schema.connectDraft.platform], set: { step, updatedAt: new Date() } });
}

// ---------- API-SHOP-003 ----------

const REGION_LABEL: Record<string, string> = { cn: "中国大陆", sg: "全球", br: "巴西", sandbox: "沙箱" };
const ATTEMPT_TEXT: Record<RegionAttempt["result"], string> = { ok: "通过", invalid_partner: "这个区域没有该 Partner ID", wrong_key: "Partner ID 对，但 Key 不对", error: "连接出错" };

function attemptsDetail(attempts: RegionAttempt[]): string {
  const wrongKey = attempts.find((a) => a.result === "wrong_key");
  const head = wrongKey ? `Partner ID 在${REGION_LABEL[wrongKey.region] ?? wrongKey.region}控制台找到了，但 Key 不对` : "各区域都没有认出这个 Partner ID";
  return `${head}：${attempts.map((a) => `${REGION_LABEL[a.region] ?? a.region} ${ATTEMPT_TEXT[a.result]}${a.message ? `（${a.message}）` : ""}`).join("；")}。`;
}

async function activeShopCount(appId: string): Promise<number> {
  const [r] = await db().select({ n: count() }).from(schema.shop).where(and(eq(schema.shop.platformAppId, appId), ne(schema.shop.status, "disconnected")));
  return r.n;
}

async function upsertApp(merchantId: string, platform: Platform, values: Partial<typeof schema.platformApp.$inferInsert> & { appKey: string; secretEnc: string }): Promise<AppRow> {
  const now = new Date();
  const [row] = await db()
    .insert(schema.platformApp)
    .values({ merchantId, platform, ...values })
    .onConflictDoUpdate({ target: [schema.platformApp.merchantId, schema.platformApp.platform], set: { ...values, updatedAt: now } })
    .returning();
  return row;
}

async function updateApp(id: string, values: Partial<typeof schema.platformApp.$inferInsert>): Promise<void> {
  await db().update(schema.platformApp).set({ ...values, updatedAt: new Date() }).where(eq(schema.platformApp.id, id));
}

export async function saveApp(ctx: MemberContext, platform: Platform, raw: unknown): Promise<SaveAppResult> {
  const existing = await appRow(ctx.merchant.id, platform);
  if (existing?.readOnly) await deny(ctx, "API-SHOP-003", "read_only", "只读接入的应用凭证由导入脚本维护，不能在这里修改或重新授权。");
  if (platform === "tiktok") return saveTiktokApp(ctx, existing, tiktokAppBody.parse(raw));
  return saveShopeeApp(ctx, existing, shopeeAppBody.parse(raw));
}

async function guardAppSwitch(ctx: MemberContext, existing: AppRow | undefined, appKey: string, label: string) {
  if (!existing || existing.appKey === appKey) return;
  const n = await activeShopCount(existing.id);
  if (n > 0) await deny(ctx, "API-SHOP-003", "app_has_shops", `已有 ${n} 家店接在${label} ${existing.appKey} 上。换应用前先在「店铺与连接」断开这些店；只是密钥变了，请用「更新应用密钥」。`);
}

async function saveShopeeApp(ctx: MemberContext, existing: AppRow | undefined, body: ReturnType<typeof shopeeAppBody.parse>): Promise<SaveAppResult> {
  await guardAppSwitch(ctx, existing, body.partnerId, " Partner ID");
  const detected = await shopeeDetectRegion(body.partnerId, body.partnerKey);
  const attempts: RegionAttempt[] = detected.attempts;
  if (!detected.app) {
    throw new Problem("platform-credentials", { detail: attemptsDetail(attempts), extra: { attempts } });
  }
  const sameApp = existing?.appKey === body.partnerId;
  const base = {
    appKey: body.partnerId,
    secretEnc: encrypt(body.partnerKey),
    pushKeyEnc: body.pushKey ? encrypt(body.pushKey) : sameApp ? existing?.pushKeyEnc ?? null : null,
    keyExpiresAt: body.keyExpiresAt ?? (sameApp ? existing?.keyExpiresAt ?? null : null),
    apiHost: detected.app.host,
    region: detected.app.region,
  };
  const auditSaved = (summary: string, data: Record<string, unknown>) =>
    audit(ctx.actor, { module: "shops", action: "platform_app_saved", summary, targetType: "platform_app", data: { platform: "shopee", partnerId: body.partnerId, ...data } });

  if (detected.app.region === "sandbox") {
    const row = await upsertApp(ctx.merchant.id, "shopee", { ...base, status: "unverified", callbackState: "unset", callbackCurrent: null, verifiedAt: null });
    await auditSaved(`保存 Shopee 应用 ${body.partnerId}：只在沙箱通过，需换成 Live 凭证`, { region: "sandbox" });
    return { status: row.status, region: "sandbox", sandboxOnly: true, callbackState: "unset", attempts };
  }

  const row = await upsertApp(ctx.merchant.id, "shopee", { ...base, ...(sameApp ? {} : { status: "unverified" as const, verifiedAt: null }) });
  const app = shopeeApp(row);
  let authorizedShops: number | undefined;
  try {
    authorizedShops = (await shopeeAuthedShops(app)).length;
  } catch {
    authorizedShops = undefined;
  }

  const ours = webhookUrl("shopee", ctx.merchant.webhookKey);
  const oursPrefix = `${env().APP_BASE_URL}/api/webhooks/shopee/`;
  let current: string;
  try {
    current = (await shopeeGetPushConfig(app)).callbackUrl;
  } catch (e) {
    await updateApp(row.id, { status: "unverified", callbackState: "failed" });
    throw platformProblem(e, "读取推送配置失败");
  }
  const isOurs = current === "" || current.startsWith(oursPrefix);
  if (!isOurs && !body.overwriteCallback) {
    await updateApp(row.id, { status: "unverified", callbackState: "other_needs_confirm", callbackCurrent: current });
    await auditSaved(`保存 Shopee 应用 ${body.partnerId}：推送回调指向其他系统，等待确认`, { region: detected.app.region, callbackCurrent: current });
    throw new Problem("callback-occupied", {
      detail: `这个应用的推送现在发往 ${current}。勾选「改发到 Shopilot」后再保存；改了以后原系统收不到 Shopee 推送。`,
      extra: { callbackCurrent: current, region: detected.app.region, authorizedShops },
    });
  }
  try {
    await shopeeSetPushConfig(app, ours);
  } catch (e) {
    await updateApp(row.id, { status: "unverified", callbackState: "failed" });
    throw platformProblem(e, "Shopee 没有接受 Shopilot 的回调地址（保存时 Shopee 会先往回调发一条测试推送）");
  }
  const callbackState = current === ours ? "already_ours" : "set";
  await updateApp(row.id, { status: "verified", verifiedAt: new Date(), callbackState, callbackCurrent: ours });
  await setStep(ctx.merchant.id, "shopee", "auth");
  await auditSaved(`保存 Shopee 应用 ${body.partnerId}：校验通过（${REGION_LABEL[detected.app.region] ?? detected.app.region}），推送回调${current && current !== ours ? `由 ${current} 改发到 Shopilot` : "已指向 Shopilot"}`, {
    region: detected.app.region,
    callbackState,
    callbackBefore: current || null,
  });
  return { status: "verified", region: detected.app.region, sandboxOnly: false, callbackState, authorizedShops, attempts };
}

async function saveTiktokApp(ctx: MemberContext, existing: AppRow | undefined, body: ReturnType<typeof tiktokAppBody.parse>): Promise<SaveAppResult> {
  await guardAppSwitch(ctx, existing, body.appKey, " App Key");
  const sameApp = existing?.appKey === body.appKey;
  // 同一 App Key 已保存过 Secret：不填就沿用（只改 Service ID 时不必重贴 Secret）
  const appSecret = body.appSecret || (sameApp && existing ? decrypt(existing.secretEnc) : "");
  if (!appSecret) throw validation("请填 App Secret。", { appSecret: "请填 App Secret" });
  const sameSecret = sameApp && existing ? decrypt(existing.secretEnc) === appSecret : false;
  if (sameApp && existing && !sameSecret && (await activeShopCount(existing.id)) > 0) {
    await deny(ctx, "API-SHOP-003", "use_rotate", "这个应用已有店铺接入，换 App Secret 请用「店铺与连接」里的「更新应用密钥」：先校验新 Secret，通过才替换。");
  }
  const status = sameSecret && existing ? existing.status : "unverified";
  const row = await upsertApp(ctx.merchant.id, "tiktok", {
    appKey: body.appKey,
    secretEnc: encrypt(appSecret),
    serviceId: body.serviceId,
    region: "global",
    apiHost: null,
    status,
    callbackState: "unset",
    ...(sameSecret ? {} : { verifiedAt: null }),
  });
  await setStep(ctx.merchant.id, "tiktok", "auth");
  await audit(ctx.actor, { module: "shops", action: "platform_app_saved", summary: `保存 TikTok 应用 ${body.appKey}（Service ID ${body.serviceId}；Secret 在第一次授权换 token 时校验）`, targetType: "platform_app", targetId: row.id, data: { platform: "tiktok", appKey: body.appKey, serviceId: body.serviceId } });
  return { status: row.status, region: "global", sandboxOnly: false, callbackState: "unset" };
}

function platformProblem(e: unknown, prefix: string): Problem {
  if (e instanceof PlatformError) {
    const kind = e.kind === "timeout" ? "platform-timeout" : "platform";
    return new Problem(kind, { detail: `${prefix}：${platformErrorText(e)}`, extra: { platformCode: e.code, platformMessage: e.message } });
  }
  return new Problem("internal", { detail: `${prefix}，请稍后重试。` });
}

// ---------- API-SHOP-004 ----------

export async function createAuthUrl(ctx: MemberContext, platform: Platform, body: { shopRegion?: string; shopId?: string }): Promise<AuthUrlResult> {
  const app = await appRow(ctx.merchant.id, platform);
  if (app?.readOnly) await deny(ctx, "API-SHOP-004", "read_only", "只读接入的应用凭证由导入脚本维护，不能在这里修改或重新授权。");
  if (!app) await deny(ctx, "API-SHOP-004", "app_unverified", `还没有保存 ${PLATFORM_NAME[platform]} 应用凭证，先在「应用凭证」一步填好。`);
  if (platform === "shopee" && (app!.status !== "verified" || app!.region === "sandbox")) {
    await deny(
      ctx,
      "API-SHOP-004",
      "app_unverified",
      app!.region === "sandbox" ? "这是沙箱凭证，只能连沙箱，不能授权真实店铺。请换成应用上线后的 Live Partner ID 与 Key。" : "Shopee 应用凭证还没有校验通过，先在「应用凭证」一步点「验证并保存」。",
    );
  }
  if (platform === "tiktok" && tiktokAuthorizeNeedsServiceId() && !app!.serviceId) {
    await deny(ctx, "API-SHOP-004", "app_unverified", "TikTok 应用还没有填 Service ID，先在「应用凭证」一步补上（Partner Center 应用详情页可以看到）。");
  }
  let shop: ShopRow | undefined;
  if (body.shopId) {
    [shop] = await db()
      .select()
      .from(schema.shop)
      .where(and(eq(schema.shop.id, body.shopId), eq(schema.shop.merchantId, ctx.merchant.id), eq(schema.shop.platform, platform)))
      .limit(1);
    if (!shop) throw notFound("店铺不存在或不属于当前商户。");
  }
  const region = platform === "tiktok" ? body.shopRegion ?? shop?.market : undefined;
  if (platform === "tiktok" && !region) throw validation("请选择要授权的站点。", { shopRegion: "请选择站点" });

  const state = randomToken(24);
  const expiresAt = new Date(Date.now() + AUTH_LINK_TTL_MS);
  await db()
    .insert(schema.oauthState)
    .values({ id: state, merchantId: ctx.merchant.id, membershipId: ctx.membership.id, platform, shopId: shop?.id ?? null, shopRegion: region ?? null, expiresAt });
  const url =
    platform === "shopee"
      ? shopeeAuthUrl(shopeeApp(app!), `${oauthRedirectUrl("shopee")}?${new URLSearchParams({ state })}`)
      : tiktokAuthUrl(tiktokApp(app!), state, region!);
  if (!shop) await setStep(ctx.merchant.id, platform, "auth");
  return { url, expiresAt: expiresAt.toISOString() };
}

// ---------- API-SHOP-005 ----------

type StateRow = typeof schema.oauthState.$inferSelect;
type CallbackResult = NonNullable<StateRow["result"]>;

function errorPath(platform: Platform, reason: OAuthReason) {
  return `/shops/connect/${platform}/auth?result=error&reason=${reason}`;
}

function resultPath(platform: Platform, state: Pick<StateRow, "shopId">, r: CallbackResult): string {
  if (!r.ok) return errorPath(platform, (r.reason as OAuthReason) ?? "platform_error");
  if (state.shopId) return `/shops?shop=${state.shopId}&renewed=1`;
  return `/shops/connect/${platform}/probe${r.renewed ? `?renewed=${r.renewed}` : ""}`;
}

/** 平台授权后浏览器回跳：返回要 302 去的站内路径。state 一次性、5 分钟有效；同一 code 重放返回首次结果。 */
export async function handleOAuthCallback(platform: Platform, q: URLSearchParams): Promise<string> {
  const stateId = q.get("state") || (platform === "tiktok" ? await pendingTiktokState(q.get("app_key")) : "") || "";
  const code = q.get("code") ?? "";
  const codeHash = code ? sha256(code) : undefined;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(stateId)) return errorPath(platform, "state_invalid");
  const [row] = await db().select().from(schema.oauthState).where(eq(schema.oauthState.id, stateId)).limit(1);
  if (!row || row.platform !== platform) return errorPath(platform, "state_invalid");

  if (row.usedAt) return replay(platform, row, codeHash);
  if (row.expiresAt.getTime() < Date.now()) {
    await db().update(schema.oauthState).set({ usedAt: new Date(), result: { ok: false, reason: "state_invalid", codeHash } }).where(eq(schema.oauthState.id, row.id));
    return errorPath(platform, "state_invalid");
  }
  // 原子占用：只有 used_at 为空的那一次请求能拿到，其余按重放处理
  const claimed = await db()
    .update(schema.oauthState)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.oauthState.id, row.id), isNull(schema.oauthState.usedAt)))
    .returning({ id: schema.oauthState.id });
  if (claimed.length === 0) return replay(platform, row, codeHash);

  let result: CallbackResult;
  try {
    result = await authorize(platform, row, q);
  } catch (e) {
    console.error(JSON.stringify({ t: new Date().toISOString(), level: "error", msg: "oauth callback failed", platform, err: e instanceof Error ? e.stack : String(e) }));
    result = { ok: false, reason: "platform_error" };
  }
  await db().update(schema.oauthState).set({ result: { ...result, codeHash } }).where(eq(schema.oauthState.id, row.id));
  return resultPath(platform, row, result);
}

/**
 * TikTok 跨境店的定制授权链接回跳时可能不带 state：按 app_key 找使用这个应用的商户最近一条
 * 未过期（5 分钟内签发）、未使用的授权 state，后续照常走一次性占用与校验。
 */
async function pendingTiktokState(appKey: string | null): Promise<string> {
  if (!appKey) return "";
  const [row] = await db()
    .select({ id: schema.oauthState.id })
    .from(schema.oauthState)
    .innerJoin(schema.platformApp, and(eq(schema.platformApp.merchantId, schema.oauthState.merchantId), eq(schema.platformApp.platform, "tiktok")))
    .where(and(eq(schema.oauthState.platform, "tiktok"), eq(schema.platformApp.appKey, appKey), isNull(schema.oauthState.usedAt), gt(schema.oauthState.expiresAt, new Date())))
    .orderBy(desc(schema.oauthState.createdAt))
    .limit(1);
  return row?.id ?? "";
}

async function replay(platform: Platform, row: StateRow, codeHash?: string): Promise<string> {
  // 并发的第二次请求：等首次处理写完结果（最多约 10 秒）
  for (let i = 0; i < 20 && !row.result; i++) {
    await new Promise((r) => setTimeout(r, 500));
    [row] = await db().select().from(schema.oauthState).where(eq(schema.oauthState.id, row.id)).limit(1);
  }
  const r = row.result;
  if (!r) return errorPath(platform, "state_invalid");
  if (r.codeHash && codeHash && r.codeHash !== codeHash) return errorPath(platform, "state_invalid");
  return resultPath(platform, row, r);
}

async function shopLimit(merchantId: string): Promise<number> {
  const [sub] = await db().select({ planCode: schema.subscription.planCode }).from(schema.subscription).where(eq(schema.subscription.merchantId, merchantId)).limit(1);
  return plan(sub?.planCode ?? "basic").shopLimit;
}

async function authorize(platform: Platform, state: StateRow, q: URLSearchParams): Promise<CallbackResult> {
  if (q.get("error")) return { ok: false, reason: "denied" };
  const code = q.get("code");
  if (!code) return { ok: false, reason: "denied" };
  const [app] = await db()
    .select()
    .from(schema.platformApp)
    .where(and(eq(schema.platformApp.merchantId, state.merchantId), eq(schema.platformApp.platform, platform)))
    .limit(1);
  if (!app) return { ok: false, reason: "platform_error" };

  let grant: TokenGrant;
  if (platform === "shopee") {
    const mainAccountId = q.get("main_account_id");
    if (!mainAccountId) return { ok: false, reason: q.get("shop_id") ? "sub_account" : "platform_error" };
    try {
      grant = await shopeeExchangeCode(shopeeApp(app), code, { mainAccountId });
    } catch (e) {
      if (e instanceof PlatformError) return { ok: false, reason: "platform_error" };
      throw e;
    }
  } else {
    try {
      grant = await tiktokExchangeCode(tiktokApp(app), code);
    } catch (e) {
      if (e instanceof PlatformError && e.kind === "auth") {
        await updateApp(app.id, { status: "invalid" });
        return { ok: false, reason: "secret_or_redirect_mismatch" };
      }
      if (e instanceof PlatformError) return { ok: false, reason: "platform_error" };
      throw e;
    }
  }
  if (grant.shops.length === 0) return { ok: false, reason: "platform_error" };

  // 套餐店铺上限（REQ-SHOP-004）：本次新增（含重新接入已断开的店）后超过上限就整体拒绝
  const externalIds = grant.shops.map((s) => s.externalShopId);
  const existing = await db()
    .select()
    .from(schema.shop)
    .where(and(eq(schema.shop.platformAppId, app.id), inArray(schema.shop.externalShopId, externalIds)));
  const byExt = new Map(existing.map((s) => [s.externalShopId, s]));
  if (state.shopId) {
    // 从店铺页续期：只覆盖已接入（未断开）的店；主账号授权带回的其他店要接入请走接入向导
    grant = { ...grant, shops: grant.shops.filter((s) => (byExt.get(s.externalShopId)?.status ?? "disconnected") !== "disconnected") };
    if (!grant.shops.some((s) => byExt.get(s.externalShopId)?.id === state.shopId)) return { ok: false, reason: "platform_error" };
  }
  const adding = grant.shops.filter((s) => {
    const cur = byExt.get(s.externalShopId);
    return !cur || cur.status === "disconnected";
  }).length;
  const [active] = await db().select({ n: count() }).from(schema.shop).where(and(eq(schema.shop.merchantId, state.merchantId), ne(schema.shop.status, "disconnected")));
  if (adding > 0 && active.n + adding > (await shopLimit(state.merchantId))) return { ok: false, reason: "shop_limit" };

  // 店铺名称与站点：Shopee 按店调 get_shop_info；TikTok 换 token 时已带回
  const details = new Map<string, { name: string; market: string }>();
  for (const s of grant.shops) {
    let name = s.name ?? byExt.get(s.externalShopId)?.name ?? "";
    let market = s.market ?? "";
    if (platform === "shopee") {
      try {
        const info = await shopeeShopInfo(shopeeApp(app), { shopId: s.externalShopId, accessToken: grant.accessToken });
        name = info.name || name;
        market = info.region || market;
      } catch {
        // 取不到店名不阻断授权，用已有记录或店铺 ID 代替
      }
    }
    details.set(s.externalShopId, { name: name || `${PLATFORM_NAME[platform]} ${s.externalShopId}`, market: normalizeMarket(market) });
  }

  const now = new Date();
  const capabilities = initialCapabilities(platform, grant.grantedScopes);
  const member = await memberOf(state.membershipId);
  const actor = { kind: "member" as const, merchantId: state.merchantId, membershipId: state.membershipId, userId: member.userId, name: member.name };
  // 已授权、还没点「完成接入」的店（connect_draft.shop_ids）再授权不算续期，仍按接入记
  const pending = new Set((await draftRow(state.merchantId, platform))?.shopIds ?? []);
  const touched: Array<{ id: string; kind: "new" | "reconnect" | "pending" | "renew"; ext: string; cipher: string }> = [];
  // 这次授权才拿到 TikTok 商品权限的店：之前的商品卡是从订单借来的，授权后作废缓存、改从商品接口重新取
  const productScopeGained = platform === "tiktok" && capabilities.productScope ? existing.filter((s) => !s.capabilities.productScope).map((s) => s.id) : [];

  await db().transaction(async (tx) => {
    for (const s of grant.shops) {
      const d = details.get(s.externalShopId)!;
      const cur = byExt.get(s.externalShopId);
      const tokens = {
        accessTokenEnc: encrypt(grant.accessToken),
        refreshTokenEnc: encrypt(grant.refreshToken),
        accessExpiresAt: grant.accessExpiresAt,
        authExpiresAt: s.authExpiresAt ?? grant.authExpiresAt ?? null,
      };
      if (cur) {
        const kind = cur.status === "disconnected" ? "reconnect" : pending.has(cur.id) ? "pending" : "renew";
        const authChanged = (cur.authExpiresAt?.getTime() ?? 0) !== (tokens.authExpiresAt?.getTime() ?? 0);
        await tx
          .update(schema.shop)
          .set({
            ...tokens,
            status: "connected",
            name: d.name,
            market: d.market,
            shopCipher: s.cipher ?? cur.shopCipher,
            mainAccountId: s.mainAccountId ?? cur.mainAccountId,
            ...(authChanged ? { authRemindedAt: [] } : {}),
            ...(kind === "reconnect" ? { connectedAt: now, disconnectedAt: null, capabilities } : platform === "tiktok" ? { capabilities: { ...cur.capabilities, productScope: capabilities.productScope, cards: capabilities.cards } } : {}),
            updatedAt: now,
          })
          .where(eq(schema.shop.id, cur.id));
        if (kind === "reconnect") {
          await tx
            .insert(schema.shopReception)
            .values({ shopId: cur.id, merchantId: state.merchantId, modeInHours: "off", modeOffHours: "off", updatedAt: now })
            .onConflictDoUpdate({ target: schema.shopReception.shopId, set: { modeInHours: "off", modeOffHours: "off", updatedAt: now } });
        }
        await tx.insert(schema.shopEvent).values({
          merchantId: state.merchantId,
          shopId: cur.id,
          kind: kind === "renew" ? "reauthorized" : "authorized",
          text: kind === "reconnect" ? "重新授权接入" : kind === "pending" ? "授权接入" : cur.status === "auth_expired" ? "续期授权，恢复收发" : "续期授权",
        });
        await audit(
          actor,
          {
            module: "shops",
            action: kind === "renew" ? "shop_reauthorized" : "shop_connected",
            summary: `${kind === "reconnect" ? "重新接入" : kind === "pending" ? "接入" : "续期授权"}「${d.name}」（${PLATFORM_NAME[platform]} · ${d.market}）`,
            targetType: "shop",
            targetId: cur.id,
            data: { platform, market: d.market, shop_id: cur.id },
          },
          tx,
        );
        touched.push({ id: cur.id, kind, ext: s.externalShopId, cipher: s.cipher ?? cur.shopCipher ?? "" });
      } else {
        const [created] = await tx
          .insert(schema.shop)
          .values({
            merchantId: state.merchantId,
            platformAppId: app.id,
            platform,
            externalShopId: s.externalShopId,
            shopCipher: s.cipher ?? null,
            name: d.name,
            market: d.market,
            mainAccountId: s.mainAccountId ?? null,
            status: "connected",
            ...tokens,
            capabilities,
            connectedAt: now,
          })
          .returning({ id: schema.shop.id });
        await tx.insert(schema.shopReception).values({ shopId: created.id, merchantId: state.merchantId, modeInHours: "off", modeOffHours: "off", updatedAt: now }).onConflictDoNothing();
        await tx.insert(schema.shopEvent).values({ merchantId: state.merchantId, shopId: created.id, kind: "authorized", text: "授权接入" });
        await audit(
          actor,
          { module: "shops", action: "shop_connected", summary: `接入「${d.name}」（${PLATFORM_NAME[platform]} · ${d.market}）`, targetType: "shop", targetId: created.id, data: { platform, market: d.market, shop_id: created.id } },
          tx,
        );
        touched.push({ id: created.id, kind: "new", ext: s.externalShopId, cipher: s.cipher ?? "" });
      }
    }
    const fresh = touched.filter((t) => t.kind !== "renew").map((t) => t.id);
    if (fresh.length > 0) {
      const [d] = await tx
        .select()
        .from(schema.connectDraft)
        .where(and(eq(schema.connectDraft.merchantId, state.merchantId), eq(schema.connectDraft.platform, platform)))
        .limit(1);
      const shopIds = [...new Set([...(d?.shopIds ?? []), ...fresh])];
      await tx
        .insert(schema.connectDraft)
        .values({ merchantId: state.merchantId, platform, step: "probe", shopIds })
        .onConflictDoUpdate({ target: [schema.connectDraft.merchantId, schema.connectDraft.platform], set: { step: "probe", shopIds, updatedAt: now } });
    }
  });
  if (platform === "tiktok" && app.status !== "verified") await updateApp(app.id, { status: "verified", verifiedAt: now });
  const gained = productScopeGained.filter((id) => touched.some((t) => t.id === id));
  if (gained.length > 0) {
    await db().update(schema.productInfo).set({ fetchedAt: new Date(0) }).where(inArray(schema.productInfo.shopId, gained));
    await enqueue("product.prefetch", {});
  }

  // 平台侧设置（失败不回滚授权，写连接事件，检查页与店铺页会显示）
  if (platform === "tiktok") {
    const appCreds = tiktokApp(app);
    const webhookKey = await merchantWebhookKey(state.merchantId);
    for (const t of touched) {
      const auth = { accessToken: grant.accessToken, cipher: t.cipher };
      try {
        await tiktokRegisterWebhooks(appCreds, auth, webhookUrl("tiktok", webhookKey));
        if (t.kind !== "renew") await tiktokSetAcceptChat(appCreds, auth, true);
      } catch (e) {
        const text = e instanceof PlatformError ? platformErrorText(e) : String(e);
        await db().insert(schema.shopEvent).values({ merchantId: state.merchantId, shopId: t.id, kind: "setup_failed", text: `消息通知或坐席接单设置失败：${text}` });
      }
    }
  }
  for (const t of touched) await probeShop(t.id, { fresh: true });
  return { ok: true, shopIds: touched.map((t) => t.id), renewed: touched.filter((t) => t.kind === "renew").length };
}

async function memberOf(membershipId: string): Promise<{ name: string; userId: string }> {
  const [r] = await db()
    .select({ name: schema.user.name, userId: schema.user.id })
    .from(schema.membership)
    .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .where(eq(schema.membership.id, membershipId))
    .limit(1);
  return r ?? { name: "管理员", userId: "" };
}

// ---------- API-SHOP-006 ----------

export async function probe(ctx: MemberContext, platform: Platform): Promise<ProbeResponse> {
  const shops = await batchShops(ctx.merchant.id, platform);
  const weekAgo = Date.now() - 7 * 86400_000;
  const out: ProbeResponse["shops"] = [];
  for (const s of shops) {
    const r = await probeShop(s.id);
    const [fresh] = await db().select({ capabilities: schema.shop.capabilities, backfill: schema.shop.backfill, status: schema.shop.status }).from(schema.shop).where(eq(schema.shop.id, s.id));
    const last = s.lastInboundAt?.getTime() ?? null;
    out.push({
      shopId: s.id,
      name: s.name,
      market: s.market,
      status: fresh.status,
      chat: r.chat,
      orders: r.orders,
      pii: { masked: r.piiMasked },
      productScope: fresh.capabilities.productScope,
      zeroInbound7d: last === null ? (s.connectedAt?.getTime() ?? Date.now()) < weekAgo : last < weekAgo,
      backfill: fresh.backfill,
    });
  }
  return { platform, checkedAt: new Date().toISOString(), shops: out };
}

// ---------- API-SHOP-007 ----------

export async function complete(ctx: MemberContext, platform: Platform, initialMode: "shadow" | "off"): Promise<CompleteResult> {
  const shops = await batchShops(ctx.merchant.id, platform);
  if (shops.length === 0) await deny(ctx, "API-SHOP-007", "no_authorized_shop", "还没有授权任何店铺，先在「授权店铺」一步完成平台授权。");
  const now = new Date();
  await db().transaction(async (tx) => {
    for (const s of shops) {
      await tx
        .insert(schema.shopReception)
        .values({ shopId: s.id, merchantId: ctx.merchant.id, modeInHours: initialMode, modeOffHours: initialMode, updatedAt: now })
        .onConflictDoUpdate({ target: schema.shopReception.shopId, set: { modeInHours: initialMode, modeOffHours: initialMode, updatedAt: now } });
      await tx.update(schema.shop).set({ backfill: { state: "pending", conversations: 0, orders: 0 }, updatedAt: now }).where(eq(schema.shop.id, s.id));
      await tx.insert(schema.shopEvent).values({ merchantId: ctx.merchant.id, shopId: s.id, kind: "completed", text: `完成接入，AI 初始方式：${initialMode === "shadow" ? "只起草、不发送" : "暂不启用"}` });
    }
    await tx
      .update(schema.connectDraft)
      .set({ step: "done", shopIds: [], initialMode, updatedAt: now })
      .where(and(eq(schema.connectDraft.merchantId, ctx.merchant.id), eq(schema.connectDraft.platform, platform)));
    await audit(
      ctx.actor,
      {
        module: "shops",
        action: "connect_completed",
        summary: `完成 ${PLATFORM_NAME[platform]} 接入：${shops.map((s) => s.name).join("、")}，AI 初始方式 ${initialMode}`,
        data: { platform, shopIds: shops.map((s) => s.id), initialMode },
      },
      tx,
    );
  });

  const warnings: string[] = [];
  for (const s of shops) {
    await enqueue("shop.backfill", { shopId: s.id }, { singletonKey: s.id });
    // 坐席接单随接待模式（REQ-RCP-001：全 off 时关闭）；授权时已打开
    if (platform === "tiktok" && initialMode === "off") {
      const r = await setTikTokAcceptChat(s.id, false);
      if (!r.ok) warnings.push(`「${s.name}」的 TikTok 坐席接单没有关闭：${r.error ?? "平台没有返回原因"}`);
    }
  }
  await refreshShopMetrics(shops.map((s) => s.id)).catch(() => undefined);
  return { shops: shops.map((s) => ({ id: s.id, name: s.name, modeInHours: initialMode, modeOffHours: initialMode })), warnings };
}

/** 路由参数里的平台名；不是两个平台之一按 404 处理 */
export function parsePlatform(p: unknown): Platform {
  if (p === "shopee" || p === "tiktok") return p;
  throw notFound("没有这个平台。");
}

