"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRingIcon, Building2Icon, DatabaseIcon, ScrollTextIcon, ShieldCheckIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import type { MerchantView } from "@/contracts/settings";
import { PageHeader, PageScroll, Panel } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, errorText } from "@/lib/api";
import { inTz } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/settings", label: "商户资料", icon: Building2Icon },
  { href: "/settings/notify", label: "通知", icon: BellRingIcon },
  { href: "/settings/security", label: "安全与登录", icon: ShieldCheckIcon },
  { href: "/settings/data", label: "数据与隐私", icon: DatabaseIcon },
  { href: "/settings/audit", label: "审计日志", icon: ScrollTextIcon },
] as const;

export function useMerchant() {
  return useQuery({ queryKey: ["merchant"], queryFn: () => api.get<MerchantView>("/api/v1/merchant") });
}

/** 页内筛选写进 URL（INT-020）；等于默认值时从 URL 去掉 */
export function useQueryParam(name: string, fallback: string) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(name) ?? fallback;
  const set = (v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v === fallback) next.delete(name);
    else next.set(name, v);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return [value, set] as const;
}

/** 待删除横幅（PAGE-SETTINGS 页态）：显示清除日期，所有者可撤销 */
function DeletionBanner({ me }: { me: Me }) {
  const merchant = useMerchant();
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => api.post("/api/v1/merchant/deletion/cancel"),
    onSuccess: () => {
      toast.success("已撤销删除。成员保持停用，需要时在团队与权限逐个重新启用；店铺需要重新授权。");
      qc.invalidateQueries({ queryKey: ["merchant"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const deletion = merchant.data?.deletion;
  if (!deletion) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-(--semantic-radius-lg) border border-border bg-card px-5 py-4">
      <TriangleAlertIcon className="size-5 shrink-0 text-(--semantic-color-feedback-warning)" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">商户待删除，{inTz(deletion.purgeAt, me.active.timezone, "yyyy-MM-dd HH:mm")} 清除全部业务数据</p>
        <p className="text-sm text-muted-foreground">店铺已断开，除所有者外的成员已停用。清除前所有者可以撤销；撤销后成员保持停用，店铺需要重新授权。</p>
      </div>
      {me.active.isOwner && (
        <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
          {cancel.isPending && <Spinner />}
          撤销删除
        </Button>
      )}
    </div>
  );
}

/** 商户设置的公共骨架：标题、待删除横幅、左侧子导航（原型 200px 列），可选右侧栏 */
export function SettingsFrame({ me, facts, aside, children }: { me: Me; facts?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <PageScroll>
      <PageHeader title="商户设置" facts={facts ?? " "} />
      <DeletionBanner me={me} />
      <div className={cn("grid grid-cols-1 items-start gap-4 lg:grid-cols-[200px_minmax(0,1fr)]", aside && "xl:grid-cols-[200px_minmax(0,1fr)_300px]")}>
        <Panel as="div" className="p-3 lg:sticky lg:top-0">
          <nav aria-label="商户设置分组">
            <ul className="flex flex-col gap-1">
              {NAV.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn("state-layer focus-ring flex items-center gap-3 rounded-md px-3 py-2 text-sm", active ? "bg-accent font-semibold text-(--semantic-color-text-link)" : "text-foreground")}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </Panel>
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
        {aside && <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 xl:col-start-auto">{aside}</div>}
      </div>
    </PageScroll>
  );
}
