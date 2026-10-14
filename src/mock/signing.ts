// 两个平台的签名算法，与真实平台一致（参考 Obsbot v2 backend/app/channels/signing.py）。
import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacHex(key: string, message: string): string {
  return createHmac("sha256", key).update(message, "utf8").digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a.trim().toLowerCase());
  const y = Buffer.from(b.trim().toLowerCase());
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Shopee API：sign = HMAC-SHA256(partner_key, partner_id + path + timestamp [+ access_token + shop_id])，path 形如 /api/v2/order/get_order_detail。 */
export function shopeeApiSign(
  partnerKey: string,
  partnerId: string | number,
  path: string,
  timestamp: string | number,
  accessToken?: string | null,
  shopIdOrMerchantId?: string | number | null,
): string {
  const base = `${partnerId}${path}${timestamp}${accessToken ?? ""}${shopIdOrMerchantId ?? ""}`;
  return hmacHex(partnerKey, base);
}

/** Shopee 推送：Authorization = HMAC-SHA256(push key, `<回调 URL>|<原始 body>`)。 */
export function shopeePushSign(pushKey: string, callbackUrl: string, rawBody: string): string {
  return hmacHex(pushKey, `${callbackUrl}|${rawBody}`);
}

/** TikTok API：sign = HMAC-SHA256(app_secret, app_secret + path + 按 key 排序的 k+v（不含 sign、access_token）+ body + app_secret)。multipart 请求 body 传空串。 */
export function tiktokApiSign(appSecret: string, path: string, query: Record<string, string>, body: string): string {
  const params = Object.keys(query)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort()
    .map((k) => `${k}${query[k]}`)
    .join("");
  return hmacHex(appSecret, `${appSecret}${path}${params}${body}${appSecret}`);
}

/** TikTok webhook：Authorization = HMAC-SHA256(app_secret, app_key + 原始 body)。 */
export function tiktokWebhookSign(appSecret: string, appKey: string, rawBody: string): string {
  return hmacHex(appSecret, `${appKey}${rawBody}`);
}

/** 两个平台的时间戳都是秒，允许偏差 5 分钟。 */
export const TIMESTAMP_TOLERANCE_SEC = 300;

export function timestampFresh(ts: string | number | null | undefined, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return false;
  return Math.abs(nowSec - Math.floor(n)) <= TIMESTAMP_TOLERANCE_SEC;
}
