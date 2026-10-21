"use client";

import { LockIcon } from "lucide-react";
import Link from "next/link";
import type { Me } from "@/contracts/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { ApiError, errorText } from "@/lib/api";
import { ROLE_LABEL, rolesWith, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** 内容区自身滚动（RESP-007：滚动根槽位恒定） */
export function PageScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("scroll-y -mr-6 min-h-0 flex-1 pr-6 pb-8", className)}>{children}</div>;
}

export function PageHeader({ title, facts, children, className }: { title: string; facts?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4 pt-2 pb-5", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {facts && <p className="mt-1 text-sm text-muted-foreground tabular-nums">{facts}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** 白色圆角面板（设计系统 v5 容器 20px 圆角）；只在需要分组时用 */
export function Panel({ children, className, as: As = "section", ...rest }: { children: React.ReactNode; className?: string; as?: "section" | "div" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cn("rounded-(--semantic-radius-lg) bg-card p-5", className)} {...rest}>
      {children}
    </As>
  );
}

export function PanelHeader({ title, description, children }: { title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "warn" | "error" }) {
  return (
    <Panel className="min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-[1.875rem] leading-tight font-semibold tracking-tight tabular-nums">{value}</p>
      {note && (
        <p className={cn("mt-1 text-xs", tone === "warn" ? "text-(--semantic-color-feedback-warning)" : tone === "error" ? "text-destructive" : "text-muted-foreground")}>{note}</p>
      )}
    </Panel>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: React.ComponentType<{ className?: string }>; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Icon className="size-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="font-medium">没有加载出来</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {error instanceof ApiError ? errorText(error) : "网络或服务暂时不可用。"}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          重试
        </Button>
      )}
    </div>
  );
}

export function LoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="加载中">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full animate-none rounded-md bg-muted motion-safe:animate-pulse" />
      ))}
    </div>
  );
}

/** 路由切换时的加载态（loading.tsx）：页头与首屏加载行和真实页面对位，换成真实页面时不跳动 */
export function RouteSkeleton({ aside = false }: { aside?: boolean }) {
  const bar = "animate-none bg-muted motion-safe:animate-pulse";
  return (
    <PageScroll>
      <div aria-busy="true">
        <span className="sr-only">正在打开页面</span>
        <div className="pt-2 pb-5" aria-hidden>
          <Skeleton className={cn(bar, "h-8 w-40")} />
          <Skeleton className={cn(bar, "mt-1 h-5 w-64 max-w-full")} />
        </div>
        {aside ? (
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[200px_minmax(0,1fr)]" aria-hidden>
            <Panel as="div" className="flex flex-col gap-1 p-3">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className={cn(bar, "h-9 w-full")} />
              ))}
            </Panel>
            <Panel as="div">
              <LoadingRows />
            </Panel>
          </div>
        ) : (
          <LoadingRows />
        )}
      </div>
    </PageScroll>
  );
}

function rolesText(perm: Permission) {
  return rolesWith(perm).map((r) => ROLE_LABEL[r]).join("、");
}

/** 整页受限：服务端照样鉴权，这里给无权成员一句说明（REQ-PERM-001） */
export function RequirePerm({ perm, children }: { perm: Permission; children: (me: Me) => React.ReactNode }) {
  const me = useMe();
  if (me.isPending) return <LoadingRows />;
  if (me.isError) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;
  if (!me.data.active.permissions.includes(perm)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <LockIcon className="size-8 text-muted-foreground" />
        <p className="text-lg font-semibold">这个页面只对{rolesText(perm)}开放</p>
        <p className="text-sm text-muted-foreground">你在「{me.data.active.merchantName}」的角色是{ROLE_LABEL[me.data.active.role]}。需要时请联系管理员调整角色。</p>
        <Button asChild variant="outline">
          <Link href="/wb">返回工作台</Link>
        </Button>
      </div>
    );
  }
  return <>{children(me.data)}</>;
}
