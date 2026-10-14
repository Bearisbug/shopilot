import { cn } from "@/lib/utils";

/** 平台徽标：带边框的文字「Shopee · MY」，不用平台 logo 与平台品牌色（设计系统 v5） */
export function PlatformBadge({ platform, market, className }: { platform: "shopee" | "tiktok"; market?: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-sm border border-border px-1.5 text-xs whitespace-nowrap text-muted-foreground", className)}>
      {platform === "shopee" ? "Shopee" : "TikTok"}
      {market ? ` · ${market}` : ""}
    </span>
  );
}
