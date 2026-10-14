import { MARKETS, type Market } from "@/contracts/shops";

export type Platform = "shopee" | "tiktok";

export const PLATFORM_NAME: Record<Platform, string> = { shopee: "Shopee", tiktok: "TikTok Shop" };

/** 平台返回的区域码归一到 §9.2 的站点枚举 */
export function normalizeMarket(region: string | null | undefined): Market {
  const r = (region ?? "").trim().toUpperCase();
  return (MARKETS as readonly string[]).includes(r) ? (r as Market) : "OTHER";
}
