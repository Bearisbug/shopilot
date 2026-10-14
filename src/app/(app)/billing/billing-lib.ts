"use client";

// 用量与套餐两页共用：查询、推算、打开对话框
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { BillingResponse } from "@/contracts/billing";
import { api } from "@/lib/api";

export const CYCLE_LABEL = { monthly: "月付", yearly: "年付" } as const;
export const num = (v: number) => v.toLocaleString("en-US");
const DAY = 86_400_000;

export function useOpenDialog() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  return (dialog: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("dialog", dialog);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
}

/** 本期推算：日均与按日均推算的周期末出稿 */
export function forecast(d: BillingResponse, now: number) {
  const start = new Date(d.period.start).getTime();
  const end = new Date(d.period.end).getTime();
  const elapsedDays = Math.max(1, Math.ceil((now - start) / DAY));
  const totalDays = Math.max(1, Math.round((end - start) / DAY));
  const perDay = d.usage.used / elapsedDays;
  const projected = Math.round(perDay * totalDays);
  const total = d.usage.quota + d.usage.topup;
  return { perDay, projected, projectedPct: total > 0 ? Math.round((projected / total) * 100) : 0, total, daysLeft: Math.max(0, Math.ceil((end - now) / DAY)) };
}

export function useBilling(query = "") {
  return useQuery({ queryKey: ["billing", query], queryFn: () => api.get<BillingResponse>(`/api/v1/billing${query ? `?${query}` : ""}`) });
}
