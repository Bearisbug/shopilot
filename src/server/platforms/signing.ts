// 两个平台的请求签名与回调验签（算法与 Obsbot v2 backend/app/channels/signing.py 一致）。
import { createHmac, timingSafeEqual } from "node:crypto";

function hmacHex(key: string, message: string): string {
  return createHmac("sha256", key).update(message, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a.trim().toLowerCase());
  const y = Buffer.from(b.trim().toLowerCase());
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Shopee：HMAC-SHA256(partner_key, partner_id + path + timestamp [+ access_token + shop_id]) */
export function shopeeSign(partnerKey: string, partnerId: string, path: string, timestamp: number, accessToken?: string, shopId?: string): string {
  return hmacHex(partnerKey, `${partnerId}${path}${timestamp}${accessToken ?? ""}${shopId ?? ""}`);
}

/** Shopee 推送：Authorization = HMAC-SHA256(push key, `<回调 URL>|<原始 body>`) */
export function verifyShopeePush(key: string, callbackUrl: string, rawBody: string, authorization: string | null): boolean {
  if (!authorization) return false;
  return safeEqualHex(hmacHex(key, `${callbackUrl}|${rawBody}`), authorization);
}

/** TikTok：HMAC-SHA256(secret, secret + path + 按 key 排序的 k+v（不含 sign、access_token）+ body + secret)；multipart 的 body 记空串 */
export function tiktokSign(appSecret: string, path: string, query: Record<string, string>, body: string): string {
  const params = Object.keys(query)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort()
    .map((k) => `${k}${query[k]}`)
    .join("");
  return hmacHex(appSecret, `${appSecret}${path}${params}${body}${appSecret}`);
}

/** TikTok webhook：Authorization = HMAC-SHA256(app_secret, app_key + 原始 body) */
export function verifyTiktokWebhook(appSecret: string, appKey: string, rawBody: string, authorization: string | null): boolean {
  if (!authorization) return false;
  return safeEqualHex(hmacHex(appSecret, `${appKey}${rawBody}`), authorization);
}

export const nowSec = () => Math.floor(Date.now() / 1000);
