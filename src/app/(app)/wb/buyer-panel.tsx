"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardListIcon, EyeOffIcon, LayoutGridIcon, PackageIcon, ReceiptIcon, TriangleAlertIcon, TruckIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { Tabs as TabsPrimitive } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { BuyerOrder, ConversationDetail, Stage } from "@/contracts/conversations";
import { STATUS_GROUP_LABEL, type StatusGroup } from "@/contracts/orders";
import { OrderItems } from "@/components/orders/order-items";
import { EmptyState, ErrorState, LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMe } from "@/hooks/use-me";
import { api, errorText } from "@/lib/api";
import { inTz, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar, latestEvent, remainText, STAGE_LABEL, useBuyer, useConversation, useSend, useWbParams } from "./wb-shared";

const TABS = [
  { value: "buyer", label: "买家与订单" },
  { value: "history", label: "历史会话" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const PRE_SHIP = new Set(["UNPAID", "READY_TO_SHIP", "PROCESSED", "INVOICE_PENDING", "ON_HOLD", "AWAITING_SHIPMENT", "AWAITING_COLLECTION", "PARTIALLY_SHIPPING"]);
const END_LABEL: Record<string, string> = { resolved: "已结束", idle: "72 小时无消息自动结束", backfill: "历史回补", shop_disconnected: "店铺断开" };

/**
 * 工作台容器（@container/wb）宽度 ≥ 68rem 时是第三栏，否则收成右侧抽屉（REQ-CONV-003，?panel=buyer）。
 * 68rem = 列表最宽 20rem + 对话栏最小 400px + 右栏最宽 21rem + 两道 1rem 间距：并排时对话栏一定不窄于 400px。
 */
export function BuyerColumn({ id }: { id: string }) {
  const { params, set } = useWbParams();
  const open = params.get("panel") === "buyer";
  // 抽屉渲染在容器外（portal），容器查询管不到它：右栏显示出来（宽度 > 0）时不开抽屉
  const asideRef = useRef<HTMLElement>(null);
  const [inline, setInline] = useState(false);
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setInline(el.offsetWidth > 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <>
      <aside ref={asideRef} aria-label="买家与订单" className="hidden min-h-0 w-[clamp(17rem,24vw,21rem)] shrink-0 flex-col rounded-xl bg-card @min-[68rem]/wb:flex">
        <BuyerPanelBody id={id} />
      </aside>
      <Sheet open={open && !inline} onOpenChange={(o) => !o && set({ panel: null })}>
        <SheetContent side="right" className="flex w-[min(24rem,92vw)] flex-col gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>买家与订单</SheetTitle>
            <SheetDescription>本段阶段、买家信息、工单与订单</SheetDescription>
          </SheetHeader>
          <BuyerPanelBody id={id} />
        </SheetContent>
      </Sheet>
    </>
  );
}

function BuyerPanelBody({ id }: { id: string }) {
  const { params, set } = useWbParams();
  const raw = params.get("side");
  const tab: Tab = raw === "history" ? "history" : "buyer";
  const conv = useConversation(id);
  // 标签计数只算已结束的段；进行中的当前段在列表里显示为「进行中」，不算历史
  const ended = conv.data?.history.filter((h) => h.endedAt).length ?? 0;
  // 与搜索页相同：line 变体的指示线会和 state-layer 的 ::after 冲突，直接用 Radix 触发器画底边线
  return (
    <Tabs value={tab} onValueChange={(v) => set({ side: v === "buyer" ? null : v })} className="min-h-0 flex-1 gap-0">
      <TabsList variant="line" aria-label="右栏" className="scroll-nav w-full shrink-0 justify-start gap-4 overflow-x-auto rounded-none border-b border-border px-4 pt-3 pb-0 group-data-[orientation=horizontal]/tabs:h-auto">
        {TABS.map((t) => (
          <TabsPrimitive.Trigger
            key={t.value}
            value={t.value}
            className="state-layer focus-ring -mb-px h-9 rounded-t-sm border-b-2 border-transparent px-1 text-xs whitespace-nowrap text-muted-foreground data-[state=active]:border-(--semantic-color-text-link) data-[state=active]:font-semibold data-[state=active]:text-(--semantic-color-text-link)"
          >
            {t.label}
            {t.value === "history" && ended ? <span className="ml-1 tabular-nums">{ended}</span> : null}
          </TabsPrimitive.Trigger>
        ))}
      </TabsList>
      {TABS.map((t) => (
        <TabsContent key={t.value} value={t.value} className="scroll-y min-h-0 flex-1 px-4 py-4">
          {conv.data ? t.value === "buyer" ? <BuyerTab d={conv.data} /> : <HistoryTab d={conv.data} /> : <LoadingRows rows={5} />}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function BuyerTab({ d }: { d: ConversationDetail }) {
  const c = d.conversation;
  const buyer = useBuyer(c.id);
  const me = useMe();
  const tz = me.data?.active.timezone ?? "Asia/Kuala_Lumpur";
  const qc = useQueryClient();
  const stage = useMutation({
    mutationFn: (s: Stage) => api.patch(`/api/v1/conversations/${c.id}/segment`, { stage: s }),
    onSuccess: (_, s) => toast.success(`本段阶段改为${STAGE_LABEL[s]}`, { description: "之后的出稿按新阶段取提示词，下一段重新自动判定。" }),
    onError: (e) => toast.error(errorText(e)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["conversation", c.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  const { set } = useWbParams();
  const seg = d.segment;
  const basis = seg ? `${seg.stageSource === "manual" ? "手动" : seg.stageSource === "keyword" ? "关键词" : "开段时自动判定"}：${seg.stageBasis ?? "—"}` : "还没有会话段";
  // 没认领的会话（员工）不能改判：在下拉旁说明原因
  const stageLocked = !d.permissions.canChangeStage && !!seg && c.handlingState !== "closed";

  return (
    <div className="flex flex-col gap-4">
      <section className="border-b border-border pb-4">
        <h2 className="text-sm font-medium">本段阶段</h2>
        <div className="mt-1.5 flex items-center gap-2">
          <Select value={seg?.stage ?? "unknown"} onValueChange={(v) => stage.mutate(v as Stage)} disabled={!d.permissions.canChangeStage || stage.isPending}>
            <SelectTrigger size="sm" aria-label="本段阶段" aria-describedby={stageLocked ? "wb-stage-locked" : undefined} className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STAGE_LABEL) as Stage[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STAGE_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {stageLocked && (
            <span id="wb-stage-locked" className="text-xs text-muted-foreground">
              认领后可改判
            </span>
          )}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{basis}</p>
      </section>

      <section className="flex items-start gap-3">
        <Avatar name={c.buyerName} src={c.buyerAvatarUrl} className="size-10" />
        <div className="min-w-0">
          <p className="truncate font-medium">{c.buyerName}</p>
          <p className="text-xs break-all text-muted-foreground">
            {c.shop.platform === "shopee" ? "Shopee 用户名" : "TikTok 昵称"} · 买家 ID {c.buyerExternalId}
          </p>
        </div>
      </section>
      {buyer.data?.piiMasked && (
        <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <EyeOffIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          收件人姓名、电话、地址由平台打码返回，Shopilot 只显示打码后的值。
        </p>
      )}
      {buyer.data && (
        <p className="text-xs text-muted-foreground tabular-nums">
          近 180 天 {buyer.data.totals.count180d} 单
          {buyer.data.totals.currency ? ` · ${money(buyer.data.totals.amount180d, buyer.data.totals.currency)}` : ""}
        </p>
      )}

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">工单</h2>
          <Link href="/tickets" className="text-xs text-(--semantic-color-text-link) underline-offset-4 hover:underline">
            全部工单
          </Link>
        </div>
        {d.openTickets.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">这个会话没有未结工单。</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {d.openTickets.map((t) => (
              <li key={t.id}>
                <Link href={`/tickets/${t.id}`} className="state-layer focus-ring flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    <ClipboardListIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                    {t.number}
                  </span>
                  {t.dueAt && (
                    <span className={cn("inline-flex items-center gap-1 text-xs", t.overdue ? "text-(--semantic-color-feedback-warning)" : "text-muted-foreground")}>
                      {t.overdue && <TriangleAlertIcon className="size-3.5" aria-hidden="true" />}
                      {remainText(t.dueAt, buyer.dataUpdatedAt || 0)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">订单</h2>
          {buyer.data?.syncedAt && <span className="text-xs text-muted-foreground">镜像 · {inTz(buyer.data.syncedAt, tz, "MM-dd HH:mm")} 同步</span>}
        </div>
        <div className="mt-2">
          <Button size="sm" variant="outline" className="w-full" onClick={() => set({ dialog: "invoice", order: buyer.data?.orders[0]?.id ?? null }, "push")}>
            <ReceiptIcon />
            开 Invoice / Receipt
          </Button>
        </div>
        {buyer.isPending ? (
          <LoadingRows rows={3} />
        ) : buyer.isError ? (
          <ErrorState error={buyer.error} onRetry={() => buyer.refetch()} />
        ) : buyer.data.orders.length === 0 ? (
          <EmptyState icon={PackageIcon} title="近 180 天没有订单" description="订单镜像按推送与每小时同步更新。" />
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {buyer.data.orders.map((o) => (
              <li key={o.id} className="py-3">
                <OrderItem o={o} d={d} tz={tz} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function OrderItem({ o, d, tz }: { o: BuyerOrder; d: ConversationDetail; tz: string }) {
  const c = d.conversation;
  const send = useSend(d);
  const { set } = useWbParams();
  const sendable = d.permissions.canSend && c.canReply && c.shop.platform === "tiktok";
  const tracking = o.tracking;
  const latest = tracking ? latestEvent(tracking.events) : null;
  const openSales = o.afterSales.filter((a) => a.open);
  const cancellable = PRE_SHIP.has(o.status);
  const open = (dialog: string, extra: Record<string, string>) => set({ dialog, ...extra }, "push");
  return (
    <div className="text-sm">
      <p className="flex items-center justify-between gap-2">
        <span className="truncate font-medium tabular-nums">{o.externalOrderId}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{STATUS_GROUP_LABEL[o.statusGroup as StatusGroup] ?? o.status}</span>
      </p>
      <OrderItems items={o.items} currency={o.currency} className="mt-2" />
      <p className="mt-2 text-xs text-muted-foreground">
        合计 <span className="tabular-nums">{money(o.total, o.currency)}</span> · {o.status} · {inTz(o.createdAt, tz, "MM-dd HH:mm")} 下单{o.shipByAt ? ` · 最晚 ${inTz(o.shipByAt, tz, "MM-dd")} 发货` : ""}
      </p>
      {(tracking?.carrier || tracking?.trackingNo) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {[tracking.carrier, tracking.trackingNo].filter(Boolean).join(" · ")}
        </p>
      )}
      {latest && (
        <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
          <TruckIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {latest.text} · {inTz(latest.at, tz, "MM-dd HH:mm")}
        </p>
      )}
      {openSales.map((a) => (
        <div key={a.id} className="mt-1 flex items-start justify-between gap-2">
          <p className="flex items-start gap-1 text-xs text-(--semantic-color-feedback-warning)">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {a.kind === "return" ? "退货" : "取消申请"} {a.platformStatus}
            {a.sellerDueAt ? ` · 卖家截止 ${inTz(a.sellerDueAt, tz, "MM-dd HH:mm")}` : ""}
          </p>
          <Button size="xs" variant="outline" className="shrink-0" onClick={() => open(a.kind === "return" ? "return-review" : "cancel-request", { afterSale: a.id })}>
            处理
          </Button>
        </div>
      ))}
      <div className="mt-2 flex flex-wrap gap-2">
        {o.statusGroup !== "cancelled" && o.statusGroup !== "completed" && (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* 置灰的按钮仍可悬停看原因（aria-disabled 而不是 disabled） */}
              <Button size="xs" variant="outline" aria-disabled={!cancellable || undefined} onClick={() => cancellable && open("cancel", { order: o.id })}>
                <XIcon />
                取消订单（买家要求）
              </Button>
            </TooltipTrigger>
            <TooltipContent>{cancellable ? "仅发货前可取消，原因记为买家要求" : "订单已发货，平台不允许卖家取消"}</TooltipContent>
          </Tooltip>
        )}
        <Button size="xs" variant="outline" onClick={() => open("invoice", { order: o.id })}>
          <ReceiptIcon />
          开票
        </Button>
        <Button size="xs" variant="outline" onClick={() => open("ticket", { order: o.id })}>
          <ClipboardListIcon />
          建工单
        </Button>
        {sendable && (
          <Button size="xs" variant="outline" disabled={send.isPending} onClick={() => send.mutate({ type: "order_card", orderId: o.externalOrderId }, { onSuccess: () => toast.success("已发订单卡") })}>
            <LayoutGridIcon />
            发订单卡
          </Button>
        )}
        {sendable && (tracking || !PRE_SHIP.has(o.status)) && o.statusGroup !== "cancelled" && (
          <Button
            size="xs"
            variant="outline"
            disabled={send.isPending}
            onClick={() => send.mutate({ type: "logistics_card", orderId: o.externalOrderId, ...(tracking?.packageId ? { packageId: tracking.packageId } : {}) }, { onSuccess: () => toast.success("已发物流卡") })}
          >
            <TruckIcon />
            发物流卡
          </Button>
        )}
      </div>
    </div>
  );
}

function HistoryTab({ d }: { d: ConversationDetail }) {
  const me = useMe();
  const tz = me.data?.active.timezone ?? "Asia/Kuala_Lumpur";
  if (d.history.length === 0) return <EmptyState icon={XIcon} title="没有历史会话段" />;
  return (
    <ul className="flex flex-col gap-2">
      {d.history.map((h) => (
        <li key={h.id} className="rounded-md border border-border px-3 py-2 text-sm">
          <p className="flex items-center justify-between gap-2">
            <span className="font-medium">{STAGE_LABEL[h.stage]}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {inTz(h.startedAt, tz, "MM-dd HH:mm")}
              {h.endedAt ? ` – ${inTz(h.endedAt, tz, "MM-dd HH:mm")}` : " 起"}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {h.endedAt ? (END_LABEL[h.endReason ?? ""] ?? "已结束") : "进行中"} · {h.messages} 条消息{h.claimedBy ? ` · ${h.claimedBy} 接待` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
