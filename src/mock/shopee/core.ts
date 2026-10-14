// Shopee 网关：响应外层、错误、公共参数与签名校验、区域识别、token 校验。
import { and, eq } from "drizzle-orm";
import { mockDb } from "../db/client";
import { mockApp, mockShop } from "../db/schema";
import { jsonResponse, newRequestId } from "../http";
import { safeEqualHex, shopeeApiSign, timestampFresh } from "../signing";

export const SHOPEE_REGIONS = ["cn", "sg", "br", "sandbox"] as const;
export type ShopeeRegion = (typeof SHOPEE_REGIONS)[number];

export type ShopeeApp = typeof mockApp.$inferSelect;
export type ShopeeShop = typeof mockShop.$inferSelect;

/** 平台错误：error 为平台错误串，httpStatus 网关类为 403/400，业务类为 200。 */
export class ShopeeError extends Error {
  constructor(public error: string, message: string, public httpStatus = 200) {
    super(message);
  }
}

export const E = {
  noPartner: () => new ShopeeError("error_param", "There is no partner_id in query.", 400),
  badPartnerFormat: () => new ShopeeError("error_param", "Partner_id is invalid, should be an integer between 0 and 4294967295.", 400),
  noTimestamp: () => new ShopeeError("error_param", "no timestamp", 400),
  badTimestampFormat: () => new ShopeeError("error_param", "Timestamp is invalid, should be an integer between 0 and 4294967295.", 400),
  timestampExpired: () => new ShopeeError("error_param", "Timestamp is expired.", 400),
  noSign: () => new ShopeeError("error_param", "There is no sign in query.", 400),
  wrongSign: () => new ShopeeError("error_sign", "Wrong sign.", 403),
  invalidPartner: () => new ShopeeError("invalid_partner_id", "Invalid partner_id, please have a check.", 403),
  noAccessToken: () => new ShopeeError("error_param", "There is no access_token in query.", 400),
  noShopId: () => new ShopeeError("error_param", "There is no shop_id in query.", 400),
  badShopId: () => new ShopeeError("error_param", "shop_id is invalid, should be an integer between 0 and 4294967295.", 400),
  shopNotLinked: () => new ShopeeError("error_auth", "Invalid partner_id or shopid.", 403),
  invalidToken: () => new ShopeeError("invalid_acceess_token", "Invalid access_token, please have a check.", 403),
  pathNotFound: () => new ShopeeError("error_param", "Permission denied. This API is currently offline or the request path is incorrect.", 404),
  param: (detail: string) => new ShopeeError("error_param", `Wrong parameters, detail: ${detail}.`),
  notFound: (detail: string) => new ShopeeError("error_not_found", `Wrong parameters, detail: ${detail}.`),
  noChatPermission: () => new ShopeeError("error_permission", "Sorry you don't have the permission, detail: this shop has no permission to use chat API."),
};

/** 业务接口：{ request_id, error, message, response } */
export function ok(response: unknown, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ request_id: newRequestId(), error: "", message: "", response, ...extra });
}

/** 扁平接口（token、get_shops_by_partner、get_shop_info）：字段与 request_id 同层 */
export function okFlat(fields: Record<string, unknown>): Response {
  return jsonResponse({ request_id: newRequestId(), error: "", message: "", ...fields });
}

export function errorResponse(e: ShopeeError): Response {
  return jsonResponse({ request_id: newRequestId(), error: e.error, message: e.message }, e.httpStatus);
}

const UINT32 = /^\d{1,10}$/;

export type GatewayResult = { app: ShopeeApp; shop: ShopeeShop | null; partnerId: string; timestamp: string };

/**
 * 校验公共参数与签名。level = public 时基串为 partner_id + path + timestamp；
 * level = shop 时加 access_token + shop_id，并校验店铺授权与 token。
 * 应用只登记在一个区域：用别的区域主机调用返回 invalid_partner_id（Shopilot 据此识别区域）。
 */
export async function verifyShopee(region: string, apiPath: string, query: URLSearchParams, level: "public" | "shop"): Promise<GatewayResult> {
  const partnerId = query.get("partner_id");
  if (!partnerId) throw E.noPartner();
  if (!UINT32.test(partnerId) || Number(partnerId) > 4294967295) throw E.badPartnerFormat();
  const timestamp = query.get("timestamp");
  if (!timestamp) throw E.noTimestamp();
  if (!UINT32.test(timestamp)) throw E.badTimestampFormat();
  if (!timestampFresh(timestamp)) throw E.timestampExpired();
  const sign = query.get("sign");
  if (!sign) throw E.noSign();

  const [app] = await mockDb().select().from(mockApp).where(and(eq(mockApp.platform, "shopee"), eq(mockApp.appKey, partnerId))).limit(1);
  if (!app || app.region !== region) throw E.invalidPartner();

  if (level === "public") {
    if (!safeEqualHex(shopeeApiSign(app.secret, partnerId, apiPath, timestamp), sign)) throw E.wrongSign();
    return { app, shop: null, partnerId, timestamp };
  }

  const accessToken = query.get("access_token");
  if (!accessToken) throw E.noAccessToken();
  const shopId = query.get("shop_id");
  if (!shopId) throw E.noShopId();
  if (!UINT32.test(shopId)) throw E.badShopId();
  if (!safeEqualHex(shopeeApiSign(app.secret, partnerId, apiPath, timestamp, accessToken, shopId), sign)) throw E.wrongSign();

  const [shop] = await mockDb()
    .select()
    .from(mockShop)
    .where(and(eq(mockShop.platform, "shopee"), eq(mockShop.shopId, shopId), eq(mockShop.appKey, app.appKey)))
    .limit(1);
  if (!shop || shop.authStatus !== "authorized") throw E.shopNotLinked();
  const now = Date.now();
  const current = shop.accessToken === accessToken && shop.accessExpiresAt && shop.accessExpiresAt.getTime() > now;
  const grace = shop.prevAccessToken === accessToken && shop.prevAccessExpiresAt && shop.prevAccessExpiresAt.getTime() > now;
  const authAlive = !shop.authExpiresAt || shop.authExpiresAt.getTime() > now;
  if (!(current || grace) || !authAlive) throw E.invalidToken();
  return { app, shop, partnerId, timestamp };
}

/** Shopee 店铺的卖家 user_id（消息 from_id / to_id 用），由 shop_id 派生 */
export function shopUserId(shopId: string): number {
  return 800000000 + Number(shopId);
}

/** 店铺用户名（to_user_name / from_user_name） */
export function shopUsername(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
}

export function regionLower(region: string): string {
  return region.toLowerCase();
}
