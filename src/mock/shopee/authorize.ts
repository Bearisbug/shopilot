// Shopee 授权页（shop/auth_partner）与取消授权页（shop/cancel_auth_partner）的校验与动作。
import { and, asc, eq, inArray } from "drizzle-orm";
import { mockDb } from "../db/client";
import { mockApp, mockAuthCode, mockShop } from "../db/schema";
import { AUTH_TTL_SEC, SHOPEE_CODE_TTL_SEC } from "../fixtures";
import { authCode } from "../ids";
import { runPushes } from "../push";
import { safeEqualHex, shopeeApiSign, timestampFresh } from "../signing";
import { E, SHOPEE_REGIONS, ShopeeError, type ShopeeApp, type ShopeeShop } from "./core";
import { shopeePush } from "./ops";

export type ShopeeAuthKind = "auth_partner" | "cancel_auth_partner";
export type ShopeeAuthParams = { partner_id: string; timestamp: string; sign: string; redirect: string };

export type ShopeeAuthView =
  | { ok: true; app: Pick<ShopeeApp, "appKey" | "name" | "region">; mainAccountId: string; shops: Array<Pick<ShopeeShop, "shopId" | "name" | "region" | "authStatus">>; redirect: string }
  | { ok: false; error: string; message: string };

/** 校验授权链接：应用在本区域登记、签名正确；checkFresh 为 true 时还要求时间戳在 5 分钟内（打开页面时）。 */
async function verifyLink(region: string, kind: ShopeeAuthKind, p: Partial<ShopeeAuthParams>, checkFresh: boolean): Promise<{ app: ShopeeApp; redirect: string }> {
  if (!(SHOPEE_REGIONS as readonly string[]).includes(region)) throw E.pathNotFound();
  if (!p.partner_id) throw E.noPartner();
  if (!p.timestamp) throw E.noTimestamp();
  if (checkFresh && !timestampFresh(p.timestamp)) throw E.timestampExpired();
  if (!p.sign) throw E.noSign();
  if (!p.redirect) throw new ShopeeError("error_param", "There is no redirect in query.", 400);
  try {
    const u = new URL(p.redirect);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
  } catch {
    throw new ShopeeError("error_param", "redirect is invalid.", 400);
  }
  const [app] = await mockDb().select().from(mockApp).where(and(eq(mockApp.platform, "shopee"), eq(mockApp.appKey, p.partner_id))).limit(1);
  if (!app || app.region !== region) throw E.invalidPartner();
  if (!safeEqualHex(shopeeApiSign(app.secret, p.partner_id, `/api/v2/shop/${kind}`, p.timestamp), p.sign)) throw E.wrongSign();
  return { app, redirect: p.redirect };
}

export async function inspectShopeeAuthLink(region: string, kind: ShopeeAuthKind, p: Partial<ShopeeAuthParams>): Promise<ShopeeAuthView> {
  try {
    const { app, redirect } = await verifyLink(region, kind, p, true);
    const shops = await shopsOfApp(app);
    return {
      ok: true,
      app: { appKey: app.appKey, name: app.name, region: app.region },
      mainAccountId: app.mainAccountId ?? "",
      shops: shops.filter((s) => kind === "auth_partner" || s.authStatus === "authorized").map((s) => ({ shopId: s.shopId, name: s.name, region: s.region, authStatus: s.authStatus })),
      redirect,
    };
  } catch (e) {
    if (e instanceof ShopeeError) return { ok: false, error: e.error, message: e.message };
    throw e;
  }
}

async function shopsOfApp(app: ShopeeApp): Promise<ShopeeShop[]> {
  return mockDb().select().from(mockShop).where(and(eq(mockShop.platform, "shopee"), eq(mockShop.appKey, app.appKey))).orderBy(asc(mockShop.shopId));
}

function withParams(redirect: string, params: Record<string, string>): string {
  const u = new URL(redirect);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/**
 * 卖家点「授权」：mode = main 时主账号授权勾选的店铺（默认全部），回调带 main_account_id；
 * mode = sub 时模拟子账号或单店授权，回调只带 shop_id。返回要重定向到的地址。
 */
export async function confirmShopeeAuth(region: string, p: ShopeeAuthParams, mode: "main" | "sub", subShopId?: string, mainShopIds?: string[]): Promise<string> {
  const { app, redirect } = await verifyLink(region, "auth_partner", p, false);
  const all = await shopsOfApp(app);
  // 主账号授权时卖家可在授权页取消勾选部分店铺
  const picked = mode === "main" ? (mainShopIds?.length ? all.filter((s) => mainShopIds.includes(s.shopId)) : all) : all.filter((s) => s.shopId === subShopId);
  if (picked.length === 0) throw new ShopeeError("error_param", "No shop to authorize.", 400);
  const mainAccountId = mode === "main" ? app.mainAccountId : null;
  const code = authCode();
  const now = Date.now();
  await mockDb().insert(mockAuthCode).values({ code, platform: "shopee", appKey: app.appKey, shopIds: picked.map((s) => s.shopId), mainAccountId, expiresAt: new Date(now + SHOPEE_CODE_TTL_SEC * 1000) });
  await mockDb()
    .update(mockShop)
    .set({ authStatus: "authorized", authTime: new Date(now), authExpiresAt: new Date(now + AUTH_TTL_SEC * 1000) })
    .where(and(eq(mockShop.platform, "shopee"), inArray(mockShop.shopId, picked.map((s) => s.shopId))));
  const data: Record<string, unknown> =
    mode === "main"
      ? { authorize_type: "shop authorization by user", extra: `main account ${mainAccountId} has authorized ${picked.length} shop(s) successfully`, main_account_id: Number(mainAccountId), shop_id_list: picked.map((s) => Number(s.shopId)), success: 1 }
      : { authorize_type: "shop authorization by user", extra: `shop id ${picked[0].shopId} (${picked[0].region}) has been authorized successfully`, shop_id: Number(picked[0].shopId), success: 1 };
  await runPushes([shopeePush(app, null, 1, data, `授权 ${picked.map((s) => s.name).join("、")}`, { partner_id: Number(app.appKey) })]);
  return mode === "main" ? withParams(redirect, { code, main_account_id: mainAccountId ?? "" }) : withParams(redirect, { code, shop_id: picked[0].shopId });
}

/** 卖家拒绝授权：回到 redirect，不带 code。 */
export async function rejectShopeeAuth(region: string, p: ShopeeAuthParams): Promise<string> {
  const { redirect } = await verifyLink(region, "auth_partner", p, false);
  return withParams(redirect, { error: "access_denied" });
}

/** 取消授权：主账号下已授权店铺全部转为已取消，推送 code 2，回到 redirect。 */
export async function confirmShopeeCancel(region: string, p: ShopeeAuthParams): Promise<string> {
  const { app, redirect } = await verifyLink(region, "cancel_auth_partner", p, false);
  const shops = (await shopsOfApp(app)).filter((s) => s.authStatus === "authorized");
  if (shops.length > 0) {
    await mockDb()
      .update(mockShop)
      .set({ authStatus: "deauthorized", accessToken: null, refreshToken: null, prevAccessToken: null, prevAccessExpiresAt: null })
      .where(and(eq(mockShop.platform, "shopee"), inArray(mockShop.shopId, shops.map((s) => s.shopId))));
    const mainAccountId = app.mainAccountId;
    await runPushes([
      shopeePush(
        app,
        null,
        2,
        { authorize_type: "user cancel shop authorization", extra: `main account ${mainAccountId} has cancelled authorization of ${shops.length} shop(s)`, main_account_id: Number(mainAccountId), shop_id_list: shops.map((s) => Number(s.shopId)), success: 1 },
        `取消授权 ${shops.map((s) => s.name).join("、")}`,
        { partner_id: Number(app.appKey) },
      ),
    ]);
  }
  return redirect;
}
