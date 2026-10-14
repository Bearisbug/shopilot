// TikTok 授权页（open/authorize）与换 token（api/v2/token/get、refresh）。
import { and, asc, eq, inArray } from "drizzle-orm";
import { mockDb } from "../db/client";
import { mockApp, mockAuthCode, mockShop } from "../db/schema";
import { AUTH_TTL_SEC, TIKTOK_ACCESS_TTL_SEC, TIKTOK_CODE_TTL_SEC } from "../fixtures";
import { authCode, token } from "../ids";
import { errorResponse, ok, TiktokError, type TiktokApp, type TiktokShop } from "./core";

export type TiktokAuthView =
  | { ok: true; app: Pick<TiktokApp, "appKey" | "name">; region: string; shops: Array<Pick<TiktokShop, "shopId" | "name" | "region" | "authStatus">>; state: string }
  | { ok: false; message: string };

async function loadApp(appKey: string): Promise<TiktokApp | null> {
  const [app] = await mockDb().select().from(mockApp).where(and(eq(mockApp.platform, "tiktok"), eq(mockApp.appKey, appKey))).limit(1);
  return app ?? null;
}

async function regionShops(appKey: string, region: string): Promise<TiktokShop[]> {
  return mockDb()
    .select()
    .from(mockShop)
    .where(and(eq(mockShop.platform, "tiktok"), eq(mockShop.appKey, appKey), eq(mockShop.region, region.toUpperCase())))
    .orderBy(asc(mockShop.shopId));
}

export async function inspectTiktokAuth(appKey: string | null, shopRegion: string | null, state: string | null): Promise<TiktokAuthView> {
  if (!appKey) return { ok: false, message: "缺少 app_key 参数。" };
  const app = await loadApp(appKey);
  if (!app) return { ok: false, message: `应用 ${appKey} 未在模拟平台登记。` };
  if (!app.redirectUrl) return { ok: false, message: "该应用没有登记 redirect_url，授权后无处回跳。" };
  if (!shopRegion) return { ok: false, message: "缺少 shop_region 参数（如 MY、TH、VN）。" };
  const shops = await regionShops(app.appKey, shopRegion);
  return { ok: true, app: { appKey: app.appKey, name: app.name }, region: shopRegion.toUpperCase(), shops: shops.map((s) => ({ shopId: s.shopId, name: s.name, region: s.region, authStatus: s.authStatus })), state: state ?? "" };
}

function withParams(url: string, params: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/** 卖家点「授权」：该站点下店铺全部授权给应用，生成 code，回跳 redirect_url?code&state。 */
export async function confirmTiktokAuth(appKey: string, shopRegion: string, state: string): Promise<string> {
  const app = await loadApp(appKey);
  if (!app?.redirectUrl) throw new Error("应用未登记或没有 redirect_url");
  const shops = await regionShops(app.appKey, shopRegion);
  if (shops.length === 0) throw new Error("该站点下没有可授权的店铺");
  const code = authCode();
  const now = Date.now();
  await mockDb().insert(mockAuthCode).values({ code, platform: "tiktok", appKey: app.appKey, shopIds: shops.map((s) => s.shopId), expiresAt: new Date(now + TIKTOK_CODE_TTL_SEC * 1000) });
  await mockDb()
    .update(mockShop)
    .set({ authStatus: "authorized", authTime: new Date(now), authExpiresAt: new Date(now + AUTH_TTL_SEC * 1000) })
    .where(and(eq(mockShop.platform, "tiktok"), inArray(mockShop.shopId, shops.map((s) => s.shopId))));
  return withParams(app.redirectUrl, { code, state });
}

/** 卖家拒绝授权：回跳 redirect_url?error=auth_denied&state，不带 code。 */
export async function rejectTiktokAuth(appKey: string, state: string): Promise<string> {
  const app = await loadApp(appKey);
  if (!app?.redirectUrl) throw new Error("应用未登记或没有 redirect_url");
  return withParams(app.redirectUrl, { error: "auth_denied", state });
}

const SCOPES = [
  "seller.authorization.info",
  "seller.customer_service",
  "seller.order.info",
  "seller.fulfillment.basic",
  "seller.return_refund.basic",
  "seller.promotion.info",
  "seller.webhook",
];

function authError(message: string): Response {
  return errorResponse(new TiktokError(36004004, message));
}

function tokenData(shops: TiktokShop[], access: string, accessExp: number, refresh: string, refreshExp: number) {
  const first = shops[0];
  return {
    access_token: access,
    access_token_expire_in: accessExp,
    refresh_token: refresh,
    refresh_token_expire_in: refreshExp,
    open_id: first.sellerOpenId ?? `open-${first.shopId}`,
    seller_name: first.sellerName ?? first.name,
    seller_base_region: first.region,
    user_type: 0,
    granted_scopes: SCOPES,
  };
}

/** GET /api/v2/token/get?app_key&app_secret&auth_code&grant_type=authorized_code */
export async function tiktokTokenGet(q: URLSearchParams): Promise<Response> {
  const appKey = q.get("app_key");
  const app = appKey ? await loadApp(appKey) : null;
  if (!app) return authError("Invalid app_key.");
  if (q.get("app_secret") !== app.secret) return authError("Invalid app_secret.");
  if (q.get("grant_type") !== "authorized_code") return authError("Invalid grant_type.");
  const code = q.get("auth_code");
  const [row] = code ? await mockDb().select().from(mockAuthCode).where(eq(mockAuthCode.code, code)).limit(1) : [];
  if (!row || row.platform !== "tiktok" || row.appKey !== app.appKey || row.usedAt || row.expiresAt.getTime() < Date.now()) return authError("Invalid auth code.");
  const now = Date.now();
  const access = `TTP_${token()}`;
  const refresh = `TTP_${token()}`;
  const accessExp = new Date(now + TIKTOK_ACCESS_TTL_SEC * 1000);
  const shops = await mockDb().select().from(mockShop).where(and(eq(mockShop.platform, "tiktok"), inArray(mockShop.shopId, row.shopIds)));
  const refreshExp = shops[0]?.authExpiresAt ?? new Date(now + AUTH_TTL_SEC * 1000);
  await mockDb().update(mockAuthCode).set({ usedAt: new Date(now) }).where(eq(mockAuthCode.code, row.code));
  await mockDb()
    .update(mockShop)
    .set({ accessToken: access, accessExpiresAt: accessExp, refreshToken: refresh, refreshExpiresAt: refreshExp, prevAccessToken: null, prevAccessExpiresAt: null })
    .where(and(eq(mockShop.platform, "tiktok"), inArray(mockShop.shopId, row.shopIds)));
  return ok(tokenData(shops, access, Math.floor(accessExp.getTime() / 1000), refresh, Math.floor(refreshExp.getTime() / 1000)));
}

/** GET /api/v2/token/refresh?app_key&app_secret&refresh_token&grant_type=refresh_token；旧 access_token 保持到原到期时间。 */
export async function tiktokTokenRefresh(q: URLSearchParams): Promise<Response> {
  const appKey = q.get("app_key");
  const app = appKey ? await loadApp(appKey) : null;
  if (!app) return authError("Invalid app_key.");
  if (q.get("app_secret") !== app.secret) return authError("Invalid app_secret.");
  if (q.get("grant_type") !== "refresh_token") return authError("Invalid grant_type.");
  const refresh = q.get("refresh_token");
  const shops = refresh
    ? await mockDb()
        .select()
        .from(mockShop)
        .where(and(eq(mockShop.platform, "tiktok"), eq(mockShop.appKey, app.appKey), eq(mockShop.refreshToken, refresh), eq(mockShop.authStatus, "authorized")))
    : [];
  if (shops.length === 0) return authError("Invalid refresh_token.");
  const now = Date.now();
  const s = shops[0];
  if ((s.refreshExpiresAt && s.refreshExpiresAt.getTime() < now) || (s.authExpiresAt && s.authExpiresAt.getTime() < now)) return authError("The refresh_token has expired.");
  const access = `TTP_${token()}`;
  const accessExp = new Date(now + TIKTOK_ACCESS_TTL_SEC * 1000);
  await mockDb()
    .update(mockShop)
    .set({ prevAccessToken: s.accessToken, prevAccessExpiresAt: s.accessExpiresAt, accessToken: access, accessExpiresAt: accessExp })
    .where(and(eq(mockShop.platform, "tiktok"), inArray(mockShop.shopId, shops.map((x) => x.shopId))));
  const refreshExp = s.refreshExpiresAt ?? new Date(now + AUTH_TTL_SEC * 1000);
  return ok(tokenData(shops, access, Math.floor(accessExp.getTime() / 1000), refresh!, Math.floor(refreshExp.getTime() / 1000)));
}
