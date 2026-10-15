"use client";

import { ClipboardListIcon, ClockIcon, LibraryBigIcon, MessageSquareQuoteIcon, StoreIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader, PageScroll, Panel } from "@/components/shell/page";
import { useCan } from "@/hooks/use-me";
import type { Permission } from "@/lib/permissions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 按权限显示：组长只有 knowledge.manage，只看到「知识库」 */
const SUB_NAV: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }>; perm: Permission }> = [
  { href: "/reception", label: "店铺模式", icon: StoreIcon, perm: "reception.manage" },
  { href: "/reception/hours", label: "工作时间与转人工", icon: ClockIcon, perm: "reception.manage" },
  { href: "/reception/prompts", label: "语气与提示词", icon: MessageSquareQuoteIcon, perm: "reception.manage" },
  { href: "/reception/tickets", label: "工单类型与时限", icon: ClipboardListIcon, perm: "reception.manage" },
  { href: "/reception/knowledge", label: "知识库", icon: LibraryBigIcon, perm: "knowledge.manage" },
];

/**
 * 有未保存修改时拦住离开：刷新、关页走浏览器原生确认；站内链接（侧栏、子导航、顶栏）先弹确认。
 * 浏览器后退不拦：App Router 没有可靠的路由阻断。
 */
function useLeaveGuard(dirty: boolean) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    // 捕获阶段先于 Link 的 onClick；只拦会换页的同源链接，新标签打开放行
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname + url.search === location.pathname + location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
  return {
    dialog: (
      <AlertDialog open={pendingHref !== null} onOpenChange={(o) => !o && setPendingHref(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>离开会丢失未保存的修改</AlertDialogTitle>
            <AlertDialogDescription>这一页有还没保存的修改。要保留，先留下并点右上角「保存」。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>留下</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                const href = pendingHref;
                setPendingHref(null);
                if (href) router.push(href);
              }}
            >
              放弃并离开
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
  };
}

/** 接待设置各子页共用：页头 + 左侧子导航（原型 s_reception.py 的 page()）；dirty 为子页是否有未保存的修改 */
export function ReceptionFrame({ facts, dirty = false, children }: { facts?: React.ReactNode; dirty?: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const guard = useLeaveGuard(dirty);
  const can = useCan();
  return (
    <PageScroll>
      <PageHeader title="接待设置" facts={facts ?? " "} />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[200px_minmax(0,1fr)]">
        <Panel as="div" className="p-3 xl:sticky xl:top-0">
          <nav aria-label="接待设置分组">
            <ul className="flex flex-wrap gap-1 xl:flex-col">
              {SUB_NAV.filter((item) => can(item.perm)).map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "state-layer focus-ring flex items-center gap-3 rounded-md px-3 py-2 text-sm whitespace-nowrap",
                        active && "bg-accent font-semibold text-(--semantic-color-text-link)",
                      )}
                    >
                      <item.icon className="size-4" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </Panel>
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
      </div>
      {guard.dialog}
    </PageScroll>
  );
}
