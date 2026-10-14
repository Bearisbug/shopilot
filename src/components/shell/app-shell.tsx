"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { NavSummary } from "@/contracts/nav";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { GlobalDialogs } from "./global-dialogs";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";

const ActionSlot = createContext<HTMLDivElement | null>(null);

/** 页面把主按钮放进顶栏右侧的槽位（原型 TopBar 的 action slot） */
export function PageActions({ children }: { children: React.ReactNode }) {
  const slot = useContext(ActionSlot);
  return slot ? createPortal(children, slot) : null;
}

function setCookie(name: string, value: string | null) {
  document.cookie = value === null ? `${name}=; Path=/; Max-Age=0; SameSite=Lax` : `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function useNavSummary() {
  return useQuery({
    queryKey: ["nav-summary"],
    queryFn: () => api.get<NavSummary>("/api/v1/nav-summary"),
    refetchInterval: () => (typeof document !== "undefined" && document.visibilityState === "hidden" ? false : 30_000),
  });
}

/** 各页的标签页标题（WCAG 2.4.2）：(app) 下的页面是客户端组件，导出不了 metadata，由外壳按路由设置，格式同根布局的 title.template */
const PAGE_TITLES: [prefix: string, title: string][] = [
  ["/wb", "工作台"],
  ["/tickets", "工单"],
  ["/orders", "订单与开票"],
  ["/dashboard", "看板"],
  ["/reception", "接待设置"],
  ["/shops", "店铺与连接"],
  ["/team", "团队与权限"],
  ["/billing", "用量与套餐"],
  ["/settings", "商户设置"],
  ["/search", "搜索"],
  ["/account", "账号安全"],
];

// 定高外壳（RESP-009、RESP-017）：外壳 100dvh 不滚，侧栏与主区各自滚动。
export function AppShell({ children, initialCollapsed }: { children: React.ReactNode; initialCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const me = useMe();
  const summary = useNavSummary();
  const slotRef = useCallback((el: HTMLDivElement | null) => setSlot(el), []);
  const pathname = usePathname();
  const router = useRouter();
  const pendingDeletion = me.data?.active.merchantStatus === "pending_deletion";
  // 11.10：待删除期间只能访问商户设置与本人账号页
  useEffect(() => {
    if (pendingDeletion && !pathname.startsWith("/settings") && !pathname.startsWith("/account")) router.replace("/settings");
  }, [pendingDeletion, pathname, router]);

  const pageTitle = PAGE_TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1];
  useEffect(() => {
    if (!pageTitle) return;
    const want = `${pageTitle} · Shopilot`;
    const apply = () => {
      if (document.title !== want) document.title = want;
    };
    apply();
    // 根布局的 metadata 是流式下发的，会晚于这里把标题写回「Shopilot」，盯住 head 再改回来
    const mo = new MutationObserver(apply);
    mo.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [pageTitle]);

  const toggle = () =>
    setCollapsed((c) => {
      setCookie("sp_sidebar", c ? null : "collapsed");
      return !c;
    });

  // me 取到之前不知道角色：传 undefined 让侧栏先出骨架，不先渲染员工级菜单再补项
  const permissions = me.isError ? [] : me.data?.active.permissions;

  return (
    <ActionSlot.Provider value={slot}>
      <a
        href="#content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("content")?.focus();
        }}
        className="focus-ring sr-only rounded-md bg-card text-sm font-medium text-(--semantic-color-text-link) focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2"
      >
        跳到主内容
      </a>
      <div className="flex h-dvh overflow-hidden bg-background">
        <Sidebar
          className="hidden lg:flex"
          collapsed={collapsed}
          onToggle={toggle}
          permissions={permissions}
          summary={summary.data}
        />
        {/* 窄屏与平板（< lg）侧栏收成左侧抽屉 */}
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent
            side="left"
            className="w-64 gap-0 p-0 lg:hidden"
            onOpenAutoFocus={(e) => {
              // 初始焦点放在当前导航项，而不是第一个可聚焦的按钮
              const current = (e.target as HTMLElement).querySelector<HTMLElement>('nav [aria-current="page"]');
              if (current) {
                e.preventDefault();
                current.focus();
              }
            }}
          >
            <SheetTitle className="sr-only">主导航</SheetTitle>
            <SheetDescription className="sr-only">工作台、工单、订单与各项设置</SheetDescription>
            <Sidebar
              className="static h-full w-full"
              collapsed={false}
              onNavigate={() => setNavOpen(false)}
              permissions={permissions}
              summary={summary.data}
            />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col px-3 md:px-6">
          <TopBar me={me.data} unread={summary.data?.unreadNotifications ?? 0} actionSlotRef={slotRef} onOpenNav={() => setNavOpen(true)} />
          <main id="content" tabIndex={-1} className="flex min-h-0 flex-1 flex-col focus-visible:outline-none">
            {children}
          </main>
        </div>
      </div>
      <GlobalDialogs me={me.data} />
    </ActionSlot.Provider>
  );
}
