"use client";

import {
  BotIcon,
  ChartColumnIcon,
  ChevronsLeftIcon,
  ClipboardListIcon,
  GaugeIcon,
  InboxIcon,
  ReceiptIcon,
  SettingsIcon,
  StoreIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NavSummary } from "@/contracts/nav";
import { Lockup, Symbol } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; perm?: string; badge?: number; match: (p: string) => boolean };

const countText = (n: number) => (n > 99 ? "99+" : String(n));

function CountBadge({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-(--semantic-color-surface-inverse) px-1.5 text-xs font-semibold text-(--semantic-color-text-on-inverse) tabular-nums", className)}>
      {countText(n)}
    </span>
  );
}

/** 收起态只剩图标：名称（含计数）放进 aria-label，悬停与键盘聚焦都弹 Tooltip */
function CollapsedTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** current：子项可见且选中时，父项只保留选中样式，aria-current 交给子项 */
function NavLink({ item, active, current = active, collapsed }: { item: Item; active: boolean; current?: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  const name = item.badge ? `${item.label}，${countText(item.badge)} 项待处理` : item.label;
  const link = (
    <Link
      href={item.href}
      aria-label={collapsed ? name : undefined}
      aria-current={current ? "page" : undefined}
      className={cn(
        "state-layer focus-ring relative flex scroll-my-10 items-center gap-3 rounded-md px-3 py-1.5 whitespace-nowrap",
        collapsed && "justify-center px-0",
        active ? "bg-accent font-semibold text-(--semantic-color-text-link) before:absolute before:top-1.5 before:bottom-1.5 before:-left-4 before:w-1 before:rounded-r-full before:bg-(--semantic-color-text-link)" : "text-foreground",
      )}
    >
      <span className="relative shrink-0">
        <Icon className="size-5" />
        {collapsed && item.badge ? <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-(--semantic-color-surface-inverse) ring-2 ring-card" aria-hidden /> : null}
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && item.badge ? <CountBadge n={item.badge} className="ml-auto" /> : null}
    </Link>
  );
  return collapsed ? <CollapsedTip label={name}>{link}</CollapsedTip> : link;
}

/** 侧栏滚动区：溢出时在还有内容的一端渐隐（RESP-016），滚到头去掉 */
function useEdgeFade(ref: React.RefObject<HTMLDivElement | null>) {
  const [fade, setFade] = useState<"top" | "bottom" | "both" | undefined>(undefined);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const top = el.scrollTop > 1;
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      setFade(top && bottom ? "both" : top ? "top" : bottom ? "bottom" : undefined);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [ref]);
  return fade;
}

export function Sidebar({
  collapsed,
  onToggle,
  permissions,
  summary,
  onNavigate,
  className,
}: {
  /** 窄屏抽屉里点了导航链接后关闭抽屉 */
  onNavigate?: () => void;
  className?: string;
  collapsed: boolean;
  /** 收起 / 展开侧栏；抽屉里不传，不显示这个按钮 */
  onToggle?: () => void;
  /** 当前商户下的权限；还没取到时为 undefined，导航区先显示骨架 */
  permissions?: string[];
  summary?: NavSummary;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fade = useEdgeFade(scrollRef);
  const can = (p?: string) => !p || Boolean(permissions?.includes(p));
  const view = params.get("view") ?? "queue";
  const inWb = pathname.startsWith("/wb");
  const ready = permissions !== undefined;

  // 当前项在矮视口下可能落在滚动区外：挂载、换页后把它滚进渐隐区以内。
  // 只改滚动区的 scrollTop，不用 scrollIntoView：后者会把 Tab 的起点移到当前项，首个 Tab 就跳不到「跳到主内容」
  useEffect(() => {
    const box = scrollRef.current;
    const cur = ready ? box?.querySelector('[aria-current="page"]') : null;
    if (!box || !cur) return;
    const edge = 40;
    const b = box.getBoundingClientRect();
    const c = cur.getBoundingClientRect();
    if (c.bottom > b.bottom - edge) box.scrollTop += c.bottom - (b.bottom - edge);
    else if (c.top < b.top + edge) box.scrollTop -= b.top + edge - c.top;
  }, [ready, pathname, view]);

  // 接待设置对管理员、组长显示；组长只有知识库（knowledge.manage），直接链到知识库页
  const fullReception = can("reception.manage");
  const primary: Item[] = [
    { href: "/tickets", label: "工单", icon: ClipboardListIcon, badge: summary?.ticketsBadge, match: (p) => p.startsWith("/tickets") },
    { href: "/orders", label: "订单与开票", icon: ReceiptIcon, match: (p) => p.startsWith("/orders") },
    { href: "/dashboard", label: "看板", icon: ChartColumnIcon, perm: "dashboard.view", match: (p) => p.startsWith("/dashboard") },
    {
      href: fullReception ? "/reception" : "/reception/knowledge",
      label: "接待设置",
      icon: BotIcon,
      perm: fullReception ? "reception.manage" : "knowledge.manage",
      match: (p) => p.startsWith("/reception"),
    },
  ];
  const adminItems: Item[] = [
    { href: "/shops", label: "店铺与连接", icon: StoreIcon, perm: "shops.manage", badge: summary?.shopsAttention, match: (p) => p.startsWith("/shops") },
    { href: "/team", label: "团队与权限", icon: UsersIcon, perm: "team.manage", match: (p) => p.startsWith("/team") },
    { href: "/billing", label: "用量与套餐", icon: GaugeIcon, perm: "billing.manage", match: (p) => p.startsWith("/billing") },
    { href: "/settings", label: "商户设置", icon: SettingsIcon, perm: "settings.manage", match: (p) => p.startsWith("/settings") },
  ];
  const admin = adminItems.filter((i) => can(i.perm));

  const wbViews = [
    { view: "queue", label: "待认领", n: summary?.counts.queue },
    { view: "ai", label: "AI 草稿", n: summary?.counts.ai },
    { view: "mine", label: "我处理中", n: summary?.counts.mine },
    { view: "team", label: "他人处理中", n: summary?.counts.team },
    { view: "done", label: "已结束", n: summary?.counts.done },
  ];
  const wbBadge = (summary?.counts.queue ?? 0) + (summary?.counts.ai ?? 0);
  const wbSubActive = !collapsed && wbViews.some((v) => v.view === view);

  return (
    <aside
      data-collapsed={collapsed}
      onClick={(e) => {
        if (onNavigate && (e.target as Element).closest("a")) onNavigate();
      }}
      className={cn(
        "sticky top-0 flex h-dvh shrink-0 flex-col overflow-hidden bg-card transition-[width] duration-(--semantic-motion-duration-base) ease-(--semantic-motion-easing-standard)",
        collapsed ? "w-[72px]" : "w-60",
        className,
      )}
    >
      <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center" : "px-6")}>{collapsed ? <Symbol /> : <Lockup />}</div>
      <div
        ref={scrollRef}
        data-fade={fade}
        className="scroll-nav min-h-0 flex-1 data-[fade=both]:[mask-image:linear-gradient(to_bottom,transparent,#000_2rem,#000_calc(100%-2rem),transparent)] data-[fade=bottom]:[mask-image:linear-gradient(to_bottom,#000_calc(100%-2rem),transparent)] data-[fade=top]:[mask-image:linear-gradient(to_bottom,transparent,#000_2rem)]"
      >
        <nav aria-label="主导航" className="px-4 py-2">
          {!ready ? (
            <div aria-busy="true" aria-label="正在加载导航" className="space-y-1">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className={cn("h-9", collapsed ? "mx-auto w-10" : "w-full")} />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-1 text-base">
                <NavLink item={{ href: "/wb", label: "工作台", icon: InboxIcon, badge: wbBadge, match: () => inWb }} active={inWb} current={inWb && !wbSubActive} collapsed={collapsed} />
                {!collapsed && (
                  <div className="ml-5 border-l border-border pl-3 text-sm">
                    {wbViews.map((v) => {
                      const active = inWb && view === v.view;
                      return (
                        <Link
                          key={v.view}
                          href={`/wb?view=${v.view}`}
                          aria-current={active ? "page" : undefined}
                          className={cn("state-layer focus-ring flex scroll-my-10 items-center justify-between gap-3 rounded-md px-3 py-1", active ? "font-semibold text-(--semantic-color-text-link)" : "text-foreground")}
                        >
                          <span className="truncate">{v.label}</span>
                          {v.n ? <CountBadge n={v.n} /> : null}
                        </Link>
                      );
                    })}
                  </div>
                )}
                {primary.filter((i) => can(i.perm)).map((i) => (
                  <NavLink key={i.href} item={i} active={i.match(pathname)} collapsed={collapsed} />
                ))}
              </div>
              {admin.length > 0 && (
                <>
                  <div className={cn("my-3 border-t border-border", collapsed ? "mx-1" : "mx-3")} />
                  <div className="space-y-1 text-base">
                    {admin.map((i) => (
                      <NavLink key={i.href} item={i} active={i.match(pathname)} collapsed={collapsed} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </nav>
      </div>
      {onToggle && (
        <div className="shrink-0 px-4 pb-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
            className={cn("state-layer focus-ring mt-1 flex h-10 w-full items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap", collapsed && "justify-center px-0")}
          >
            <ChevronsLeftIcon className={cn("size-4 shrink-0 transition-transform duration-(--semantic-motion-duration-base)", collapsed && "rotate-180")} />
            {!collapsed && <span>收起侧栏</span>}
          </button>
        </div>
      )}
    </aside>
  );
}
