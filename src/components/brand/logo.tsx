/* eslint-disable @next/next/no-img-element -- 标志是本地 SVG 资产，原样显示 */
import { cn } from "@/lib/utils";

/** 标志「叠信」：lockup 用于侧栏顶部与认证页；symbol 用于收起的侧栏。资产来自 brand/assets（复制到 public/brand）。 */
export function Lockup({ className }: { className?: string }) {
  return <img src="/brand/lockup.svg" alt="Shopilot" width={450} height={96} className={cn("h-6 w-auto", className)} />;
}

export function Symbol({ className }: { className?: string }) {
  return <img src="/brand/symbol.svg" alt="Shopilot" width={96} height={96} className={cn("size-8", className)} />;
}
