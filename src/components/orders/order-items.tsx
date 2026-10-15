"use client";

import { PackageIcon } from "lucide-react";
import Image from "next/image";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

type IconType = React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/** 商品方图：等比裁切填满；没有图或加载失败时显示图标。md = 56px（商品卡、单图卡片），sm = 40px（商品明细列表） */
export function Thumb({ src, icon: Icon = PackageIcon, size = "md" }: { src: string | null | undefined; icon?: IconType; size?: "sm" | "md" }) {
  const [broken, setBroken] = useState(false);
  const px = size === "sm" ? 40 : 56;
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted", size === "sm" ? "size-10" : "size-14")}>
      {src && !broken ? (
        <Image src={src} alt="" fill sizes={`${px}px`} unoptimized referrerPolicy="no-referrer" className="object-cover" onError={() => setBroken(true)} />
      ) : (
        <Icon className={size === "sm" ? "size-4 text-muted-foreground" : "size-5 text-muted-foreground"} aria-hidden="true" />
      )}
    </span>
  );
}

/** 被 line-clamp 截断时为 true：尺寸变化（卡片随对话栏变宽变窄）时重新判断 */
export function useClamped<T extends HTMLElement>(text: string) {
  const ref = useRef<T>(null);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);
  return { ref, clamped };
}

/**
 * 商品名最多两行；被截断时可聚焦，悬停或键盘聚焦弹出全名（I18N-007）。
 * 截断只是 CSS，读屏读到的始终是全名；没被截断时不进 Tab 顺序、不弹提示。
 */
function ClampedName({ text }: { text: string }) {
  const { ref, clamped } = useClamped<HTMLSpanElement>(text);
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={clamped && open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span ref={ref} tabIndex={clamped ? 0 : undefined} className={cn("line-clamp-2 text-sm leading-snug [overflow-wrap:anywhere]", clamped && "focus-ring rounded-sm")}>
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-80 [overflow-wrap:anywhere]">{text}</TooltipContent>
    </Tooltip>
  );
}

export type OrderItemView = { name: string; sku?: string; skuId?: string; qty: number; unitPrice?: string; image?: string };

/** 超过这个件数先折叠，剩下的点「还有 N 件」展开 */
const VISIBLE = 3;

/**
 * 订单商品明细：每件一行 = 缩略图 + 商品名（最多两行）+ 规格 · ×数量 · 单价。
 * 超过 3 件先显示 3 件，其余可展开；highlightSkuId 对应的那件标「本次退货」。
 * 卡片与右栏这类紧凑位置商品名截到两行（clamp）；订单详情抽屉是看全名的地方，传 clamp={false}（I18N-007）。
 */
export function OrderItems({ items, currency, highlightSkuId, clamp = true, className }: { items: OrderItemView[]; currency?: string | null; highlightSkuId?: string | null; clamp?: boolean; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  if (items.length === 0) return null;
  // 要标出的那件即使排在 3 件之后也先露出来
  const hi = highlightSkuId ? items.findIndex((i) => i.skuId === highlightSkuId) : -1;
  const ordered = hi >= VISIBLE ? [items[hi], ...items.filter((_, idx) => idx !== hi)] : items;
  const shown = expanded ? ordered : ordered.slice(0, VISIBLE);
  const rest = ordered.length - VISIBLE;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ul id={listId} className="flex flex-col gap-2">
        {shown.map((i, idx) => {
          const marked = !!highlightSkuId && i.skuId === highlightSkuId;
          const meta = [i.sku, `×${i.qty}`, i.unitPrice && currency ? money(i.unitPrice, currency) : null].filter(Boolean).join(" · ");
          return (
            <li key={`${i.skuId ?? i.name}-${idx}`} className={cn("flex items-start gap-2.5", marked && "-mx-1.5 rounded-md bg-accent px-1.5 py-1")}>
              <Thumb src={i.image} size="sm" />
              <span className="min-w-0 flex-1">
                {clamp ? <ClampedName text={i.name} /> : <span className="block text-sm leading-snug [overflow-wrap:anywhere]">{i.name}</span>}
                <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums [overflow-wrap:anywhere]">
                  {marked && <span className="mr-1.5 font-medium text-(--semantic-color-text-link)">本次退货</span>}
                  {meta}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((v) => !v)}
          className="focus-ring self-start rounded-sm text-xs font-medium text-(--semantic-color-text-link) underline-offset-4 hover:underline"
        >
          {expanded ? "收起" : `还有 ${rest} 件`}
        </button>
      )}
    </div>
  );
}
