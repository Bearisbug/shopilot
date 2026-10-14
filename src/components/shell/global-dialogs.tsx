"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BellIcon, CheckIcon, ExternalLinkIcon, LogOutIcon, MailIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import type { NotificationList } from "@/contracts/notifications";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorText } from "@/lib/api";
import { relative } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, LoadingRows } from "./page";

/** 读写 ?dialog=：打开、关闭都改 URL（INT-020），关闭用 replace 不堆历史 */
export function useDialogParam(name: string) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const open = params.get("dialog") === name;
  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("dialog");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const openIt = () => {
    const next = new URLSearchParams(params.toString());
    next.set("dialog", name);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return { open, close, openIt };
}

const NOTIF_TABS = [
  { value: "all", label: "全部", empty: "转人工、工单到期、授权到期、用量提醒会出现在这里。" },
  { value: "conversation", label: "会话", empty: "买家转人工、会话超时没人认领会出现在这里。" },
  { value: "ticket", label: "工单", empty: "工单分派给你、临近到期、已超时会出现在这里。" },
  { value: "shop", label: "店铺", empty: "授权到期、断开、指标不达标会出现在这里。" },
  { value: "usage", label: "用量", empty: "出稿用量到达提醒阈值时会出现在这里。" },
] as const;

/** 列表底部哨兵：滚进视口时续拉下一页（API-NOTIF-001 游标分页） */
function LoadMoreSentinel({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible);
  useEffect(() => {
    cb.current = onVisible;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && cb.current(), { root: el.closest(".scroll-y"), rootMargin: "0px 0px 120px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} aria-hidden className="h-px" />;
}

function NotificationsDialog() {
  const { open, close } = useDialogParam("notifications");
  const [type, setType] = useState<(typeof NOTIF_TABS)[number]["value"]>("all");
  const qc = useQueryClient();
  const router = useRouter();
  const list = useInfiniteQuery({
    queryKey: ["notifications", type],
    queryFn: ({ pageParam }) => api.get<NotificationList>(`/api/v1/notifications?type=${type}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: open,
  });
  const first = list.data?.pages[0];
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const tab = NOTIF_TABS.find((t) => t.value === type) ?? NOTIF_TABS[0];
  const readAll = useMutation({
    mutationFn: () => api.post<{ unread: number }>("/api/v1/notifications/read", { all: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["nav-summary"] });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  async function openItem(id: string, link: string | null, read: boolean) {
    if (!read) await api.post("/api/v1/notifications/read", { ids: [id] }).catch(() => undefined);
    qc.invalidateQueries({ queryKey: ["nav-summary"] });
    if (link) router.push(link);
    else qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>通知</DialogTitle>
          <DialogDescription>{first ? `${first.unread} 条未读` : " "}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-2">
          <Tabs value={type} onValueChange={(v) => setType(v as typeof type)}>
            <TabsList>
              {NOTIF_TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button variant="ghost" size="sm" disabled={readAll.isPending || !first?.unread} onClick={() => readAll.mutate()}>
            <CheckIcon />
            全部标为已读
          </Button>
        </div>
        <div className="scroll-y -mx-2 max-h-[60dvh] px-2">
          {list.isPending ? (
            <LoadingRows rows={4} />
          ) : !first ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState icon={BellIcon} title={type === "all" ? "没有通知" : `没有${tab.label}通知`} description={tab.empty} />
          ) : (
            <>
              <ul className="flex flex-col">
                {items.map((item) => (
                  <li key={item.id} className="border-b border-border last:border-0">
                    <button type="button" onClick={() => openItem(item.id, item.link, Boolean(item.readAt))} className="state-layer focus-ring flex w-full items-start gap-3 rounded-md px-2 py-3 text-left">
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.readAt ? "bg-transparent" : "bg-(--semantic-color-text-link)")} aria-label={item.readAt ? undefined : "未读"} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{item.title}</span>
                        {item.body && <span className="mt-0.5 block text-xs text-muted-foreground">{item.body}</span>}
                      </span>
                      <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">{relative(item.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {list.isFetchingNextPage ? (
                <div aria-busy="true" aria-label="正在加载更早的通知" className="flex flex-col gap-2 py-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : list.isFetchNextPageError ? (
                <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                  更早的通知没有加载出来
                  <Button variant="outline" size="xs" onClick={() => list.fetchNextPage()}>
                    重试
                  </Button>
                </div>
              ) : list.hasNextPage ? (
                <LoadMoreSentinel onVisible={() => list.fetchNextPage()} />
              ) : (
                <p className="py-3 text-center text-xs text-muted-foreground">没有更早的通知</p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HelpDialog({ me }: { me?: Me }) {
  const { open, close } = useDialogParam("help");
  const canConnect = Boolean(me?.active.permissions.includes("shops.manage"));
  const links = [
    { href: "https://open.shopee.cn/developer-guide/4", title: "Shopee 开放平台", desc: "open.shopee.cn 开发者指南：建应用、Go Live、IP 白名单" },
    { href: "https://partner.tiktokshop.com/docv2/", title: "TikTok Shop 开发者文档", desc: "partner.tiktokshop.com：Custom app、授权与 scope" },
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>帮助</DialogTitle>
          <DialogDescription>接入店铺时用到的平台文档，以及联系 Shopilot 支持。</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel="noreferrer" className="state-layer focus-ring flex items-start gap-3 rounded-md p-2">
                <ExternalLinkIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="block text-sm font-medium">{l.title}</span>
                  <span className="block text-xs text-muted-foreground">{l.desc}</span>
                </span>
              </a>
            </li>
          ))}
          {canConnect && (
            <li>
              <Link href="/shops/connect" onClick={close} className="state-layer focus-ring flex items-start gap-3 rounded-md p-2">
                <ExternalLinkIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="block text-sm font-medium">连接店铺</span>
                  <span className="block text-xs text-muted-foreground">接入向导：准备清单、填凭证、授权、检查</span>
                </span>
              </Link>
            </li>
          )}
        </ul>
        <Button asChild variant="outline">
          <a href="mailto:support@shopilot.live">
            <MailIcon />
            联系支持
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function AccountDialog({ me }: { me?: Me }) {
  const { open, close } = useDialogParam("account");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const qc = useQueryClient();
  const router = useRouter();
  const switchMerchant = useMutation({
    mutationFn: (merchantId: string) => api.post<Me>("/api/v1/me/active-merchant", { merchantId }),
    onSuccess: () => {
      qc.clear();
      router.replace("/wb");
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const changePassword = useMutation({
    mutationFn: () => api.post("/api/v1/password/forgot", { email: me?.user.email }),
    onSuccess: () => toast.success(`修改密码的链接已发到 ${me?.user.email}，30 分钟内有效。`),
    onError: (e) => toast.error(errorText(e)),
  });
  const signOut = useMutation({
    mutationFn: () => api.post("/api/auth/sign-out", {}),
    onSuccess: () => {
      qc.clear();
      router.replace("/login");
      router.refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  if (!me) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => {
          // 初始焦点落在标题上：多按一次 Enter 不会发出改密邮件或切换商户
          e.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1} className="focus-visible:outline-none">
            {me.user.name}
          </DialogTitle>
          <DialogDescription>{me.user.email}</DialogDescription>
        </DialogHeader>
        {me.memberships.length > 1 && (
          <section>
            <h3 className="mb-2 text-sm font-medium">切换商户</h3>
            <ul className="flex flex-col gap-1">
              {me.memberships.map((m) => {
                const active = m.merchantId === me.active.merchantId;
                return (
                  <li key={m.merchantId}>
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      aria-disabled={m.status !== "active" || undefined}
                      disabled={!active && switchMerchant.isPending}
                      onClick={() => !active && m.status === "active" && switchMerchant.mutate(m.merchantId)}
                      className={cn("focus-ring flex w-full items-center justify-between rounded-md border px-3 py-2 text-left", active ? "border-transparent bg-accent" : "state-layer border-border")}
                    >
                      <span>
                        <span className="block text-sm font-medium">{m.merchantName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {ROLE_LABEL[m.role]} · {m.shopCount} 家店{m.status !== "active" ? " · 已停用" : ""}
                        </span>
                      </span>
                      {active && <CheckIcon className="size-4 text-(--semantic-color-text-link)" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <div className="flex flex-col gap-2">
          <Button variant="outline" disabled={changePassword.isPending} onClick={() => changePassword.mutate()}>
            修改密码（发送 30 分钟有效的链接）
          </Button>
          <Button asChild variant="outline">
            <Link href="/account/security" onClick={close} className="justify-between">
              账号安全
              <span className="text-xs font-normal text-muted-foreground">两步验证{me.user.twoFactorEnabled ? "已开启" : "未开启"} · 登录设备 · 偏好</span>
            </Link>
          </Button>
          <Button variant="ghost" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
            <LogOutIcon />
            退出登录
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GlobalDialogs({ me }: { me?: Me }) {
  return (
    <>
      <NotificationsDialog />
      <HelpDialog me={me} />
      <AccountDialog me={me} />
    </>
  );
}
