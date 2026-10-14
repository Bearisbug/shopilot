// TikTok Shop 网关：响应外层、错误码、公共参数与签名校验、token 与 shop_cipher 校验。
import { and, eq, or } from "drizzle-orm";
import { mockDb } from "../db/client";
import { mockApp, mockShop } from "../db/schema";
import { jsonResponse, newRequestId } from "../http";
import { safeEqualHex, tiktokApiSign } from "../signing";

export type TiktokApp = typeof mockApp.$inferSelect;
export type TiktokShop = typeof mockShop.$inferSelect;

export class TiktokError extends Error {
  constructor(public code: number, message: string, public httpStatus = 200) {
    super(message);
  }
}

export const T = {
  noSign: () => new TiktokError(36009004, "Missing credentials. The request does not include a required signature in the query.", 401),
  badSign: () => new TiktokError(106001, "Invalid credentials. The `sign` query parameter is invalid.", 401),
  badAppKey: () => new TiktokError(36009004, "Invalid credentials. Invalid `app_key` query parameter.", 401),
  badToken: () => new TiktokError(36009004, "Invalid credentials. The `x-tts-access-token` header is invalid.", 401),
  expiredToken: () => new TiktokError(105002, "Expired credentials. The `access_token` or `x-tts-access-token` header has expired.", 401),
  negativeTs: () => new TiktokError(36009004, "Invalid timestamp. The value of the `timestamp` query parameter must not be lesser than 0."),
  staleTs: () => new TiktokError(36009004, "Invalid timestamp. The value of the `timestamp` query parameter must not be earlier than 5 minutes before the current time."),
  futureTs: () => new TiktokError(36009004, "Invalid timestamp. The value of the `timestamp` query parameter must not exceed the current time by more than 30 seconds."),
  noCipher: () => new TiktokError(106013, "Missing identifier. The `shop_cipher` query parameter is required to identify the target shop."),
  unexpectedCipher: () => new TiktokError(36009004, "Unexpected identifier. The `shop_cipher` query parameter is not required for this request."),
  cipherMismatch: () => new TiktokError(101000, "Invalid query or header. The `category_asset_cipher` query parameter or `x-tts-access-token` header is invalid."),
  path: () => new TiktokError(36009009, "Invalid path. Please check the request path.", 404),
  method: () => new TiktokError(36009010, "Invalid method. Please check the request method.", 405),
  param: (detail: string) => new TiktokError(36009004, `Invalid params. ${detail}`),
  internal: () => new TiktokError(36009003, "Internal error. Please try again. If the issue persists after multiple attempts, please contact platform support.", 500),
};

export function ok(data: unknown): Response {
  return jsonResponse({ code: 0, message: "Success", request_id: newRequestId(), data });
}

export function errorResponse(e: TiktokError): Response {
  return jsonResponse({ code: e.code, message: e.message, request_id: newRequestId(), data: null }, e.httpStatus);
}

export type TiktokGateway = { app: TiktokApp; shop: TiktokShop | null; tokenShops: TiktokShop[] };

/**
 * 校验公共参数、签名、x-tts-access-token；shopLevel 时还要求 shop_cipher 且属于该 token 授权的店。
 * 签名 path 不含模拟主机前缀，body 为原始文本（multipart 请求传空串）。
 */
export async function verifyTiktok(apiPath: string, query: URLSearchParams, headers: Headers, rawBody: string, shopLevel: boolean): Promise<TiktokGateway> {
  const appKey = query.get("app_key");
  if (!appKey) throw T.badAppKey();
  const sign = query.get("sign");
  if (!sign) throw T.noSign();
  const tsRaw = query.get("timestamp") ?? "";
  const ts = Number(tsRaw);
  if (!tsRaw || !Number.isFinite(ts) || ts < 0) throw T.negativeTs();
  const now = Math.floor(Date.now() / 1000);
  if (ts < now - 300) throw T.staleTs();
  if (ts > now + 30) throw T.futureTs();

  const [app] = await mockDb().select().from(mockApp).where(and(eq(mockApp.platform, "tiktok"), eq(mockApp.appKey, appKey))).limit(1);
  if (!app) throw T.badAppKey();
  const params: Record<string, string> = {};
  query.forEach((v, k) => {
    params[k] = v;
  });
  if (!safeEqualHex(tiktokApiSign(app.secret, apiPath, params, rawBody), sign)) throw T.badSign();

  const accessToken = headers.get("x-tts-access-token");
  if (!accessToken) throw T.badToken();
  const shops = await mockDb()
    .select()
    .from(mockShop)
    .where(and(eq(mockShop.platform, "tiktok"), eq(mockShop.appKey, appKey), eq(mockShop.authStatus, "authorized"), or(eq(mockShop.accessToken, accessToken), eq(mockShop.prevAccessToken, accessToken))));
  if (shops.length === 0) throw T.badToken();
  const nowMs = Date.now();
  const alive = shops.filter((s) =>
    s.accessToken === accessToken
      ? (s.accessExpiresAt?.getTime() ?? 0) > nowMs && (!s.authExpiresAt || s.authExpiresAt.getTime() > nowMs)
      : (s.prevAccessExpiresAt?.getTime() ?? 0) > nowMs,
  );
  if (alive.length === 0) throw T.expiredToken();

  const cipher = query.get("shop_cipher");
  if (!shopLevel) {
    if (cipher) throw T.unexpectedCipher();
    return { app, shop: null, tokenShops: alive };
  }
  if (!cipher) throw T.noCipher();
  const shop = alive.find((s) => s.cipher === cipher);
  if (!shop) throw T.cipherMismatch();
  return { app, shop, tokenShops: alive };
}
