// 平台风格的 ID 与令牌生成。
import { randomBytes, randomInt } from "node:crypto";

export function digits(n: number): string {
  let s = String(randomInt(1, 10));
  while (s.length < n) s += String(randomInt(0, 10));
  return s;
}

const ALNUM = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function alnum(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += ALNUM[randomInt(0, ALNUM.length)];
  return s;
}

function yymmdd(d = new Date()): string {
  return `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Shopee order_sn：YYMMDD + 8 位字母数字，如 251010R3HN8P2B */
export const shopeeOrderSn = () => `${yymmdd()}${alnum(8)}`;
/** Shopee return_sn：YYMMDD + 0 + 8 位，如 2510080TA5PM801 */
export const shopeeReturnSn = () => `${yymmdd()}0${alnum(8)}`;
/** Shopee message_id / conversation_id：19 位数字 */
export const shopeeMessageId = () => digits(19);
export const shopeeConversationId = () => digits(19);
export const shopeeBuyerId = () => digits(10);
export const shopeePackageNumber = () => `OFG${digits(15)}`;
export const shopeeTrackingNo = (region: string) => `${region}${digits(12)}${alnum(1)}`;

/** TikTok order / return / cancel / message / conversation / package ID：18–19 位数字 */
export const tiktokOrderId = () => `5764${digits(14)}`;
export const tiktokReturnId = () => `4035${digits(15)}`;
export const tiktokLineItemId = () => `5770${digits(14)}`;
export const tiktokPackageId = () => `1152${digits(15)}`;
export const tiktokMessageId = () => `7494${digits(15)}`;
export const tiktokSessionId = () => `7494${digits(15)}`;
export const tiktokNotificationId = () => `7327${digits(15)}`;
export const tiktokTrackingNo = () => `TT${digits(12)}${alnum(2)}`;

export const token = () => randomBytes(16).toString("hex");
export const authCode = () => randomBytes(12).toString("base64url");
export const uploadId = () => randomBytes(12).toString("hex");

/** TikTok 店铺客服的 im_user_id（发出消息的 sender.im_user_id）。由 shop_id 派生，保持稳定。 */
export function tiktokShopImId(shopId: string): string {
  return `7${shopId.padStart(18, "0")}`;
}
