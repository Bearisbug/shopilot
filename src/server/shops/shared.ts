import { MARKETS, type CallbackState, type Market } from "@/contracts/shops";

export type Platform = "shopee" | "tiktok";

export const PLATFORM_NAME: Record<Platform, string> = { shopee: "Shopee", tiktok: "TikTok Shop" };

/** Shopee 推送已订阅到 Shopilot：应用回调状态是「已设置」或「原本就指向 Shopilot」（店铺页「推送未订阅」与订单页 pushOk 同一判定） */
export const shopeePushSubscribed = (s: CallbackState): boolean => s === "set" || s === "already_ours";

/** 平台返回的区域码归一到 §9.2 的站点枚举 */
export function normalizeMarket(region: string | null | undefined): Market {
  const r = (region ?? "").trim().toUpperCase();
  return (MARKETS as readonly string[]).includes(r) ? (r as Market) : "OTHER";
}
