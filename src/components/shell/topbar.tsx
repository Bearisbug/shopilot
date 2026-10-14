"use client";

import { BellIcon, ChevronsUpDownIcon, CircleHelpIcon, MenuIcon, SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Me } from "@/contracts/auth";
import { ROLE_LABEL } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** 打开全局对话框：写进 URL 的 ?dialog=（INT-020），不跳页 */
export function useDialogHref() {
  const pathname = usePathname();
  const params = useSearchParams();
  return (dialog: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("dialog", dialog);
    return `${pathname}?${next.toString()}`;
  };
}

const noop = () => () => {};
/** 快捷键提示跟随操作系统；服务端渲染时不知道系统，先不显示 */
function useShortcutHint() {
  return useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘K" : "Ctrl K"),
    () => null,
  );
}

export function TopBar({ me, unread, actionSlotRef, onOpenNav }: { me?: Me; unread: number; actionSlotRef: (el: HTMLDivElement | null) => void; onOpenNav: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const dialogHref = useDialogHref();
  // 只回显搜索页自己的 q；别的页面的 q 是页内筛选，不属于全局搜索
  const urlQ = pathname === "/search" ? (params.get("q") ?? "") : "";
  const [q, setQ] = useState(urlQ);
  const [syncedQ, setSyncedQ] = useState(urlQ);
  if (syncedQ !== urlQ) {
    setSyncedQ(urlQ);
    setQ(urlQ);
  }
  // 窄屏（< md）搜索收成图标按钮，点开后覆盖顶栏展开成整行输入框
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchBtnRef = useRef<HTMLButtonElement>(null);
  const shortcut = useShortcutHint();

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const iconBtn = "state-layer focus-ring relative flex size-10 items-center justify-center rounded-md bg-card text-foreground";
  const role = me?.active.role;

  const closeSearch = () => {
    setSearchOpen(false);
    searchBtnRef.current?.focus();
  };

  return (
    <header className="relative flex h-[72px] shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
      <button type="button" onClick={onOpenNav} aria-label="打开导航" className="state-layer focus-ring flex size-10 shrink-0 items-center justify-center rounded-md bg-card lg:hidden">
        <MenuIcon className="size-5" />
      </button>
      <form
        role="search"
        className={cn(
          "h-10 w-80 max-w-full shrink-0 items-center gap-2 rounded-md bg-card px-3 text-muted-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--semantic-state-focus-ring) md:flex",
          searchOpen ? "flex max-md:absolute max-md:inset-x-0 max-md:top-4 max-md:z-10 max-md:w-auto" : "hidden",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          const v = q.trim();
          // 短于 2 字也跳，由搜索页给出提示（REQ-SEARCH-001）
          if (v) router.push(`/search?q=${encodeURIComponent(v)}`);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && searchOpen) closeSearch();
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSearchOpen(false);
        }}
      >
        <SearchIcon className="size-4 shrink-0" />
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="搜索买家、订单号、工单号、会话，回车查看结果"
          placeholder="搜索买家、订单号、工单号、会话"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-hidden placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        {q ? (
          <button
            type="button"
            aria-label="清除搜索"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            className="state-layer focus-ring -mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground"
          >
            <XIcon className="size-4" />
          </button>
        ) : (
          shortcut && <kbd className="hidden shrink-0 text-xs whitespace-nowrap sm:inline">{shortcut}</kbd>
        )}
      </form>
      <button ref={searchBtnRef} type="button" onClick={() => setSearchOpen(true)} aria-label="搜索" aria-expanded={searchOpen} className={cn(iconBtn, "shrink-0 md:hidden")}>
        <SearchIcon className="size-5" />
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
        <Link href={dialogHref("notifications")} scroll={false} className={iconBtn} aria-label={unread ? `通知，${unread} 条未读` : "通知"}>
          <BellIcon className="size-5" />
          {unread > 0 && <span className="absolute top-2 right-2.5 size-2 rounded-full bg-(--semantic-color-text-link)" aria-hidden />}
        </Link>
        <Link href={dialogHref("help")} scroll={false} className={iconBtn} aria-label="帮助">
          <CircleHelpIcon className="size-5" />
        </Link>
        <Link
          href={dialogHref("account")}
          scroll={false}
          aria-label="账号与商户切换"
          className="state-layer focus-ring flex h-10 items-center gap-2 rounded-md bg-card px-1.5 text-left xl:pr-3"
        >
          <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
            {me?.user.name.slice(0, 1).toUpperCase() ?? ""}
          </span>
          <span className="hidden leading-tight xl:block">
            <span className="block max-w-56 truncate text-sm">
              {me ? `${me.user.name} · ${me.active.merchantName} ${role ? ROLE_LABEL[role] : ""}` : " "}
            </span>
            <span className="block max-w-56 truncate text-xs text-muted-foreground">{me?.user.email ?? " "}</span>
          </span>
          <ChevronsUpDownIcon className="hidden size-4 text-muted-foreground xl:block" />
        </Link>
        <div ref={actionSlotRef} className={cn("flex items-center gap-2 empty:hidden")} />
      </div>
    </header>
  );
}
