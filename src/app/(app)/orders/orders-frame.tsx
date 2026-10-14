"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/** 改 URL 查询参数（INT-020）：值为 null 或空串时删除该参数；打开弹层用 push，筛选与关闭用 replace */
export function useUrlParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const update = (patch: Record<string, string | null>, mode: "push" | "replace" = "replace") => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (mode === "push") router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  };
  return { params, update };
}

const TABS = [
  { href: "/orders", label: "订单" },
  { href: "/orders/invoices", label: "发票记录" },
] as const;

/** 订单与开票的两个子页：下划线标签（原型 orders / orders-invoices） */
export function OrdersTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="订单与开票" className="mb-4 flex items-end gap-5 border-b border-border">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-ring -mb-px inline-flex h-9 items-center border-b-2 px-1 text-sm whitespace-nowrap",
              active ? "border-(--semantic-color-text-link) font-semibold text-(--semantic-color-text-link)" : "border-transparent text-muted-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
