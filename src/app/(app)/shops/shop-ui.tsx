"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertTriangleIcon, CheckCircle2Icon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DiagnoseResult, ShopMetric, ShopRow } from "@/contracts/shops";
import { PlatformBadge } from "@/components/common/platform-badge";
import { api } from "@/lib/api";

export const PERIODS = [
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
  { value: "this_month", label: "本月" },
  { value: "last_month", label: "上月" },
] as const;

/** 页内筛选与抽屉写进 URL（INT-020）：参数微调用 replace，打开对象用 push */
export function useQueryParam(name: string, fallback: string) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(name) ?? fallback;
  const set = (v: string | null, mode: "push" | "replace" = "replace") => {
    const next = new URLSearchParams(params.toString());
    if (v === null || v === fallback) next.delete(name);
    else next.set(name, v);
    const url = next.toString() ? `${pathname}?${next.toString()}` : pathname;
    if (mode === "push") router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  };
  return [value, set] as const;
}

/** 打开某个对话框并带上参数（如 shop） */
export function useOpenDialog() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  return (dialog: string, extra: Record<string, string> = {}) => {
    const next = new URLSearchParams(params.toString());
    next.set("dialog", dialog);
    for (const [k, v] of Object.entries(extra)) next.set(k, v);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
}

export function useDiagnose() {
  return useMutation({ mutationFn: (shopIds?: string[]) => api.post<DiagnoseResult>("/api/v1/shops/diagnose", shopIds ? { shopIds } : {}) });
}

export const MODE_LABEL: Record<string, string> = { off: "off", shadow: "shadow", assist: "assist", auto: "auto" };

export function StatusText({ row }: { row: Pick<ShopRow, "status" | "issues" | "zeroInbound7d"> }) {
  if (row.status === "disconnected") return <span className="text-sm text-muted-foreground">已断开</span>;
  if (row.status === "auth_expired")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-destructive">
        <XCircleIcon className="size-3.5" aria-hidden />
        授权失效
      </span>
    );
  if (row.issues.length > 0) {
    const first = row.issues[0];
    const reason = first.key === "zero_inbound" ? "7 天零入站" : first.key === "chat_unavailable" ? "聊天不可用" : first.key === "metric_low" ? "指标不达标" : first.key === "auth_expiring" ? "授权快到期" : null;
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-(--semantic-color-feedback-warning)">
        <AlertTriangleIcon className="size-3.5 shrink-0" aria-hidden />
        需处理{reason ? ` · ${reason}` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-(--semantic-color-feedback-success)">
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      正常
    </span>
  );
}

export function rateText(m: ShopMetric | null): string {
  if (!m || m.responseRate === null || m.responseRate === undefined) return "—";
  return `${Number(m.responseRate).toFixed(m.responseRate % 1 === 0 ? 0 : 2)}%`;
}

/** 回复率下面一行：Shopee 写目标与口径，TikTok 写会话数 */
export function rateSub(m: ShopMetric | null): string {
  if (!m) return "等待首次同步";
  if (m.currentOnly) return typeof m.target === "number" ? `目标 ≥ ${m.target}% · 当期值` : "当期值";
  return m.sessions !== null && m.sessions !== undefined ? `${m.sessions} 个会话` : "无数据";
}

export function metricText(m: ShopMetric | null): string {
  if (!m) return "—";
  const parts: string[] = [];
  if (m.currentOnly) {
    if (typeof m.rating === "number") parts.push(`总评 ${m.rating}`);
    if (typeof m.responseTimeDays === "number") parts.push(`响应 ${m.responseTimeDays} 天`);
    if (typeof m.nonResponded === "number") parts.push(`未回复 ${m.nonResponded}`);
  } else {
    if (typeof m.responseTimeMins === "number") parts.push(`响应 ${m.responseTimeMins} 分钟`);
    if (typeof m.satisfaction === "number") parts.push(`满意 ${m.satisfaction}%`);
  }
  return parts.join(" · ") || "—";
}

const CHECK_LABEL: Record<string, string> = { shop_info: "店铺信息", conversations: "会话列表", orders: "订单列表", push_config: "推送配置" };

/** 检查连接的结果：逐店逐项，失败项给原因与处理入口 */
export function DiagnoseList({ result, compact }: { result: DiagnoseResult; compact?: boolean }) {
  return (
    <ul className="flex flex-col">
      {result.results.map((r) => (
        <li key={r.shopId} className="border-b border-border py-3 last:border-0">
          {!compact && (
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              {r.name}
              <PlatformBadge platform={r.platform} market={r.market} />
              <span className="text-xs font-normal text-muted-foreground">{r.checks.every((c) => c.ok) ? "全部通过" : `${r.checks.filter((c) => !c.ok).length} 项不通过`}</span>
            </p>
          )}
          <ul className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
            {r.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2 text-sm">
                {c.ok ? (
                  <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-(--semantic-color-feedback-success)" aria-hidden />
                ) : (
                  <XCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                )}
                <span className="min-w-0">
                  {CHECK_LABEL[c.key]}
                  <span className="sr-only">{c.ok ? "：通过" : "：不通过"}</span>
                  {!c.ok && c.reason && <span className="block text-xs [overflow-wrap:anywhere] text-muted-foreground">{c.reason}</span>}
                  {!c.ok && c.fixLink && (
                    <Link href={c.fixLink} className="focus-ring rounded-sm text-xs font-medium text-(--semantic-color-text-link)">
                      去处理
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
