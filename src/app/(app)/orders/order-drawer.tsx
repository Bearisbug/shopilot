"use client";

import { ClipboardPlusIcon, FileTextIcon, MessageSquareIcon, PackageXIcon, XIcon } from "lucide-react";
import Link from "next/link";
import type { OrderDetail } from "@/contracts/orders";
import { PlatformBadge } from "@/components/common/platform-badge";
import { DueText, KV, progressText, SendStatus, StatusGroupText, TICKET_TYPE_LABEL, useOrderDetail } from "@/components/orders/order-ui";
import { EmptyState, ErrorState, LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";
import { inTz, money } from "@/lib/format";
import { useUrlParams } from "./orders-frame";

const TICKET_STATUS: Record<string, string> = { open: "待处理", in_progress: "处理中", waiting: "等待中", resolved: "已解决", closed: "已关闭", void: "已作废" };

/** 订单详情抽屉（REQ-ORD-003）：?order=<订单 ID> */
export function OrderDrawer({ tz }: { tz: string }) {
  const { params, update } = useUrlParams();
  const orderId = params.get("order");
  const close = () => update({ order: null, dialog: null, afterSale: null, invoice: null });
  return (
    <Sheet open={!!orderId} onOpenChange={(o) => !o && close()}>
      <SheetContent className="w-full overscroll-contain data-[side=right]:sm:max-w-lg" aria-describedby={undefined}>
        {orderId && <DrawerBody key={orderId} orderId={orderId} tz={tz} open={(dialog, extra = {}) => update({ dialog, ...extra }, "push")} close={close} />}
      </SheetContent>
    </Sheet>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="mb-1 text-sm font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DrawerBody({ orderId, tz, open, close }: { orderId: string; tz: string; open: (dialog: string, extra?: Record<string, string>) => void; close: () => void }) {
  const q = useOrderDetail(orderId);
  // 404（含地址里的订单 ID 不合法）是确定结果，只给关闭；其他错误才给重试
  const notFound = q.error instanceof ApiError && (q.error.type === "not-found" || q.error.type === "validation");
  if (q.isPending || q.isError)
    return (
      <>
        <SheetHeader>
          <SheetTitle>订单详情</SheetTitle>
        </SheetHeader>
        <div className="px-4">
          {q.isPending ? (
            <LoadingRows rows={6} />
          ) : notFound ? (
            <EmptyState
              icon={PackageXIcon}
              title="找不到这张订单"
              description="它可能不存在，或不在你负责的店铺里。"
              action={
                <Button variant="outline" onClick={close}>
                  关闭
                </Button>
              }
            />
          ) : (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          )}
        </div>
      </>
    );
  const d: OrderDetail = q.data;
  const o = d.order;
  const r = o.recipient;
  return (
    <>
      <SheetHeader className="border-b border-border pr-12">
        <SheetTitle className="text-lg tabular-nums">{o.externalOrderId}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-2">
          <PlatformBadge platform={o.shop.platform} market={o.shop.market} />
          {o.shop.name}
        </SheetDescription>
      </SheetHeader>
      <div className="scroll-y flex min-h-0 flex-1 flex-col gap-5 px-4 pb-4">
        <dl>
          <KV label="买家">{o.buyerName ?? "—"}</KV>
          <KV label="商品">
            <ul>
              {o.items.map((i, idx) => (
                <li key={idx}>
                  {i.name}
                  {i.sku ? <span className="text-muted-foreground"> · {i.sku}</span> : null} ×{i.qty}
                </li>
              ))}
            </ul>
          </KV>
          <KV label="金额">{money(o.total, o.currency)}</KV>
          <KV label="状态">
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <StatusGroupText group={o.statusGroup} />
              <span className="text-muted-foreground tabular-nums">{o.platformStatus}</span>
            </span>
          </KV>
          {progressText(o, tz) && o.statusGroup !== "to_ship" && <KV label="进展">{progressText(o, tz)}</KV>}
          {o.shipByAt && (o.statusGroup === "to_ship" || o.statusGroup === "unpaid" || o.statusGroup === "in_cancel") && <KV label="最晚发货">{inTz(o.shipByAt, tz, "yyyy-MM-dd HH:mm")}</KV>}
          <KV label="下单">{inTz(o.createdAt, tz, "yyyy-MM-dd HH:mm")}</KV>
          <KV label="更新">{`${inTz(o.updatedAt, tz, "yyyy-MM-dd HH:mm")} · 镜像同步于 ${inTz(d.order.syncedAt, tz)}`}</KV>
          <KV label="关联工单">
            {d.tickets.length === 0 ? (
              "没有"
            ) : (
              <ul className="flex flex-col gap-0.5">
                {d.tickets.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tickets/${t.id}`} className="focus-ring rounded-sm text-(--semantic-color-text-link) underline-offset-4 hover:underline">
                      {t.number}
                    </Link>{" "}
                    {TICKET_TYPE_LABEL[t.type] ?? t.type} · {TICKET_STATUS[t.status] ?? t.status}
                    {t.phase && t.phase !== TICKET_STATUS[t.status] ? ` · ${t.phase}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </KV>
        </dl>

        {d.afterSales.length > 0 && (
          <Section id="od-aftersale" title="售后单">
            <ul className="flex flex-col divide-y divide-border">
              {d.afterSales.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block">
                      {a.kind === "cancel" ? "取消申请" : "退货退款"} · <span className="tabular-nums">{a.platformStatus}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {a.externalId}
                      {a.open && a.sellerDueAt ? (
                        <>
                          {" · "}
                          <DueText dueAt={a.sellerDueAt} />
                        </>
                      ) : null}
                    </span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => open(a.kind === "cancel" ? "cancel-request" : "return-review", { afterSale: a.id })}>
                    {a.actionable ? "处理" : "查看"}
                  </Button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {d.order.trackingEvents.length > 0 && (
          <Section id="od-track" title="物流轨迹">
            <p className="mb-1 text-xs text-muted-foreground">{[o.tracking?.carrier, o.tracking?.trackingNo].filter(Boolean).join(" · ")}</p>
            <ol className="flex flex-col gap-1.5 border-l border-border pl-3">
              {d.order.trackingEvents.map((e, i) => (
                <li key={i} className="text-sm">
                  <span className="block text-xs text-muted-foreground tabular-nums">{inTz(e.at, tz)}</span>
                  {e.text}
                </li>
              ))}
            </ol>
          </Section>
        )}

        {d.invoices.length > 0 && (
          <Section id="od-invoices" title="发票">
            <ul className="flex flex-col divide-y divide-border">
              {d.invoices.map((inv) => (
                <li key={inv.id}>
                  <button type="button" onClick={() => open("invoice-detail", { invoice: inv.id })} className="state-layer focus-ring flex w-full items-start justify-between gap-3 rounded-md px-1 py-2 text-left text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium tabular-nums">{inv.number}</span>
                      <span className="block text-xs text-muted-foreground">
                        {inv.kind === "invoice" ? "Invoice" : "Receipt"} · {money(inv.amount, inv.currency)} · {inTz(inv.createdAt, tz)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col gap-0.5">
                      <SendStatus channel="聊天" status={inv.chatStatus} />
                      <SendStatus channel="邮件" status={inv.emailStatus} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section id="od-recipient" title="收件人">
          {r ? (
            <p className="text-sm [overflow-wrap:anywhere]">{[r.name, r.phone, r.address].filter(Boolean).join(" · ")}</p>
          ) : (
            <p className="text-sm text-muted-foreground">平台没有返回收件人</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{r?.masked ? "平台已打码（未开通敏感数据），按平台返回展示。" : "按平台返回展示。"}</p>
        </Section>
      </div>
      <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t border-border">
        {d.conversation ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/wb/${d.conversation.id}`}>
              <MessageSquareIcon />
              打开会话
            </Link>
          </Button>
        ) : (
          <DisabledButton icon={MessageSquareIcon} label="打开会话" reason="这位买家在本店没有你能看到的会话" />
        )}
        <Button variant="outline" size="sm" onClick={() => open("invoice")}>
          <FileTextIcon />
          开票
        </Button>
        {d.cancel.allowed ? (
          <Button variant="outline" size="sm" onClick={() => open("cancel")}>
            <XIcon />
            取消订单
          </Button>
        ) : (
          <DisabledButton icon={XIcon} label="取消订单" reason={d.cancel.reason ?? "当前状态不能取消"} />
        )}
        <Button asChild variant="outline" size="sm">
          <Link href={`/tickets?dialog=ticket&order=${o.id}`}>
            <ClipboardPlusIcon />
            建工单
          </Link>
        </Button>
      </SheetFooter>
    </>
  );
}

function DisabledButton({ icon: Icon, label, reason }: { icon: React.ComponentType; label: string; reason: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="sm" aria-disabled="true" aria-label={`${label}（不可用：${reason}）`} onClick={(e) => e.preventDefault()}>
          <Icon />
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
