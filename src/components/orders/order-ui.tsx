"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { AlertTriangleIcon, CheckIcon, LoaderCircleIcon, MinusIcon, XIcon } from "lucide-react";
import type { AfterSaleDetail, InvoiceSummary, OrderDetail, OrderListItem } from "@/contracts/orders";
import { STATUS_GROUP_LABEL } from "@/contracts/orders";
import { DueStatus } from "@/components/tickets/ticket-ui";
import { api } from "@/lib/api";
import { inTz } from "@/lib/format";
import { cn } from "@/lib/utils";

export const TICKET_TYPE_LABEL: Record<string, string> = {
  return_refund: "退货退款",
  cancel_request: "取消申请",
  logistics: "物流异常",
  invoice: "开票",
  stock: "缺货 / 到货跟进",
  handover: "跨班交接",
  internal: "内部确认",
};

export const DECISION_LABEL: Record<string, string> = {
  accept: "同意取消",
  reject: "拒绝取消",
  approve_return: "同意退货",
  reject_return: "拒绝",
  approve_received: "收货后同意退款",
  reject_received: "拒收",
  confirm_refund: "同意退款",
  dispute: "发起争议",
};

export const RETURN_TYPE_LABEL: Record<string, string> = { RETURN_AND_REFUND: "退货退款", REFUND: "仅退款", REPLACEMENT: "换货" };

export const itemsText = (items: Array<{ name: string; qty: number }>) => items.map((i) => `${i.name} ×${i.qty}`).join("、");

/** 写操作成功后失效订单页与工作台的相关查询（DESIGN §16 read-after-write） */
export function useOrdersInvalidate() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["orders", "order", "after-sale", "invoices", "tickets", "conversation", "conversations", "nav-summary"]) qc.invalidateQueries({ queryKey: [key] });
  };
}

export function useOrderDetail(orderId: string | null | undefined) {
  return useQuery({ queryKey: ["order", orderId], queryFn: () => api.get<OrderDetail>(`/api/v1/orders/${orderId}`), enabled: !!orderId });
}

export function useAfterSale(afterSaleId: string | null | undefined) {
  return useQuery({ queryKey: ["after-sale", afterSaleId], queryFn: () => api.get<AfterSaleDetail>(`/api/v1/after-sales/${afterSaleId}`), enabled: !!afterSaleId });
}

/** 列表与抽屉里的「进展」一行 */
export function progressText(o: OrderListItem, tz: string): string {
  const ev = o.tracking?.lastEvent;
  const track = [o.tracking?.carrier, ev ? `${inTz(ev.at, tz)} ${ev.text}` : null].filter(Boolean).join(" · ");
  if (o.statusGroup === "in_cancel" || (o.afterSale?.kind === "cancel" && o.afterSale.open)) return "买家申请取消，待卖家处理";
  if (o.statusGroup === "returning" && o.afterSale) return `售后：${o.afterSale.kind === "return" ? "退货退款" : "取消"} ${o.afterSale.platformStatus}`;
  if (o.statusGroup === "unpaid") return "买家还没付款";
  if (o.statusGroup === "to_ship") return o.shipByAt ? `最晚 ${inTz(o.shipByAt, tz)} 发货` : "等待发货";
  if (o.statusGroup === "cancelled") return "";
  return track;
}

/** 状态组：文字 + 圆点；退货与取消申请中用警示三角 */
export function StatusGroupText({ group, className }: { group: OrderListItem["statusGroup"]; className?: string }) {
  const warn = group === "returning" || group === "in_cancel";
  const ok = group === "completed" || group === "delivered";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", warn ? "text-(--semantic-color-feedback-warning)" : ok ? "text-(--semantic-color-feedback-success)" : "text-foreground", className)}>
      {warn ? <AlertTriangleIcon className="size-3.5" aria-hidden /> : <span className={cn("size-1.5 rounded-full", ok ? "bg-current" : "bg-muted-foreground")} aria-hidden />}
      {STATUS_GROUP_LABEL[group]}
    </span>
  );
}

// 当前时间按 30 秒取整，倒计时随之刷新
const TICK_MS = 30_000;
const nowTick = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;
function subscribeTick(cb: () => void) {
  const t = setInterval(cb, TICK_MS);
  return () => clearInterval(t);
}
export function useNow(): number {
  return useSyncExternalStore(subscribeTick, nowTick, nowTick);
}

/** 截止倒计时：与工单页同一写法（剩 N / 已超时 N，临近到期带三角） */
export function DueText({ dueAt, className }: { dueAt: string | null; className?: string }) {
  const now = useNow();
  if (!dueAt) return <span className={cn("text-muted-foreground", className)}>无截止</span>;
  return <DueStatus dueAt={dueAt} now={now} className={className} />;
}

const SEND_TEXT: Record<string, string> = { sent: "已发送", skipped: "未发送（跳过）", failed: "失败", bounced: "退信", pending: "发送中" };

/** 发票一路发送的状态：图标 + 渠道 + 状态文字 */
export function SendStatus({ channel, status, error }: { channel: string; status: InvoiceSummary["chatStatus"] | InvoiceSummary["emailStatus"]; error?: string | null }) {
  const bad = status === "failed" || status === "bounced";
  const Icon = status === "sent" ? CheckIcon : status === "skipped" ? MinusIcon : status === "pending" ? LoaderCircleIcon : XIcon;
  return (
    <span className={cn("flex items-start gap-1.5 text-xs", bad ? "text-destructive" : status === "sent" ? "text-(--semantic-color-feedback-success)" : "text-muted-foreground")}>
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", status === "pending" && "motion-safe:animate-spin")} aria-hidden />
      <span className="min-w-0">
        {channel}
        {SEND_TEXT[status]}
        {error && bad ? (
          <span className="line-clamp-2 text-muted-foreground [overflow-wrap:anywhere]" title={error}>
            {error}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** 抽屉、弹层里的「标签：值」行 */
export function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** 弹层内的错误或提示块（常驻，非 toast） */
export function Notice({ tone = "warn", children }: { tone?: "warn" | "error" | "info"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-2 rounded-md px-3 py-2.5 text-sm", tone === "info" ? "bg-muted" : "bg-(--semantic-color-surface-warm)", tone === "error" && "text-destructive")}
    >
      {tone !== "info" && <AlertTriangleIcon className={cn("mt-0.5 size-4 shrink-0", tone === "warn" && "text-(--semantic-color-feedback-warning)")} aria-hidden />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
