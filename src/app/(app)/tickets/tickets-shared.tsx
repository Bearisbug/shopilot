"use client";

// 工单列表与看板共用：页头（统计摘要）、列表 / 看板切换、新建工单入口、改状态。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardPlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { STATUS_LABEL, WAITING_LABEL, statusText, type TicketItem, type TicketStats, type WaitingOn } from "@/contracts/tickets";
import { useOrderDetail } from "@/components/orders/order-ui";
import { NewTicketDialog } from "@/components/tickets/new-ticket-dialog";
import { PageActions } from "@/components/shell/app-shell";
import { useDialogParam } from "@/components/shell/global-dialogs";
import { PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { ApiError, api, errorText } from "@/lib/api";
import { cn } from "@/lib/utils";

/** 列表与看板最近一次的地址（含筛选），工单详情的「返回列表」用 */
export const LIST_URL_KEY = "shopilot:tickets-list-url";

/** 列表与看板轮询 10 秒，标签页不可见时暂停（DESIGN §15） */
export const ticketsPoll = () => (typeof document !== "undefined" && document.visibilityState === "hidden" ? false : 10_000);

/** 页内筛选写进 URL（INT-020）；回到默认值时删掉参数 */
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

export function statsFacts(s: TicketStats | undefined): string {
  if (!s) return " ";
  return `未结 ${s.open} · 6 小时内到期 ${s.due6h} · 已超时 ${s.overdue} · 平台截止 ${s.openPlatformDue} 张 / 商户时限 ${s.openMerchantDue} 张`;
}

const VIEWS = [
  { href: "/tickets", label: "列表" },
  { href: "/tickets/board", label: "看板" },
] as const;

export function TicketsFrame({ stats, children }: { stats: TicketStats | undefined; children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const dialog = useDialogParam("ticket");

  // 工单详情的「返回列表」回到带筛选的这一页
  useEffect(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("dialog");
    next.delete("order");
    const qs = next.toString();
    sessionStorage.setItem(LIST_URL_KEY, qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, params]);
  return (
    <>
      <PageActions>
        <Button onClick={dialog.openIt}>
          <ClipboardPlusIcon />
          新建工单
        </Button>
      </PageActions>
      <PageHeader title="工单" facts={statsFacts(stats)} className="pb-3" />
      <nav aria-label="工单视图" className="mb-5 border-b border-border">
        <ul className="flex gap-2">
          {VIEWS.map((v) => {
            const active = pathname === v.href;
            return (
              <li key={v.href}>
                <Link
                  href={v.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "state-layer focus-ring -mb-px inline-flex h-10 items-center rounded-t-md border-b-2 px-3 text-sm",
                    active ? "border-(--semantic-color-text-link) font-semibold text-(--semantic-color-text-link)" : "border-transparent text-muted-foreground",
                  )}
                >
                  {v.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
      <NewTicketEntry />
    </>
  );
}

/** 建工单弹层；从订单抽屉进来时带 ?order=，读到订单后预填店铺与关联订单 */
function NewTicketEntry() {
  const { open } = useDialogParam("ticket");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const orderParam = params.get("order");
  const order = useOrderDetail(open ? orderParam : null);

  // 弹层关掉后去掉它带来的 order，下次「新建工单」不再预填
  useEffect(() => {
    if (open || !orderParam) return;
    const next = new URLSearchParams(params.toString());
    next.delete("order");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [open, orderParam, params, pathname, router]);

  if (!open || !orderParam || order.isError) return <NewTicketDialog />;
  if (!order.data) return null;
  const o = order.data.order;
  return (
    <NewTicketDialog
      shopId={o.shop.id}
      buyerName={o.buyerName ?? undefined}
      orderId={o.id}
      orders={[
        {
          id: o.id,
          externalOrderId: o.externalOrderId,
          status: o.platformStatus,
          total: o.total,
          currency: o.currency,
          items: o.items,
          afterSales: order.data.afterSales.map((a) => ({ id: a.id, kind: a.kind, externalId: a.externalId, platformStatus: a.platformStatus, open: a.open })),
        },
      ]}
    />
  );
}

export const STATUS_OPTIONS: Array<{ status: "in_progress" | "waiting" | "resolved"; waitingOn?: WaitingOn; label: string }> = [
  { status: "in_progress", label: STATUS_LABEL.in_progress },
  { status: "waiting", waitingOn: "buyer", label: `等待中 · ${WAITING_LABEL.buyer}` },
  { status: "waiting", waitingOn: "platform", label: `等待中 · ${WAITING_LABEL.platform}` },
  { status: "waiting", waitingOn: "internal", label: `等待中 · ${WAITING_LABEL.internal}` },
  { status: "resolved", label: STATUS_LABEL.resolved },
];

/** 手动类改状态（API-TKT-004）：409 冲突时提示并刷新 */
export function useChangeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { ticket: Pick<TicketItem, "id" | "number" | "version">; status: "in_progress" | "waiting" | "resolved"; waitingOn?: WaitingOn }) =>
      api.post<TicketItem>(`/api/v1/tickets/${v.ticket.id}/status`, { status: v.status, waitingOn: v.waitingOn, version: v.ticket.version }),
    onSuccess: (t) => toast.success(`${t.number} 已改为 ${t.status === "waiting" && t.waitingOn ? `等待中 · ${WAITING_LABEL[t.waitingOn]}` : STATUS_LABEL[t.status]}`),
    onError: (e) => {
      if (e instanceof ApiError && e.type === "conflict") {
        const cur = (e.problem.extra as { current?: { status: TicketItem["status"]; waitingOn: WaitingOn | null } } | undefined)?.current;
        toast.error("工单刚被别人改过，已刷新", { description: cur ? `现在是「${statusText(cur)}」` : undefined });
      } else toast.error("没有改成", { description: errorText(e) });
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["ticket", v.ticket.id] });
      qc.invalidateQueries({ queryKey: ["nav-summary"] });
    },
  });
}
