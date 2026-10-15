"use client";

import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { AlertTriangleIcon, DownloadIcon, EyeIcon, FilePlusIcon, FileTextIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import type { InvoiceListItem, InvoicesResponse, InvoiceSummary } from "@/contracts/orders";
import { SendStatus, useOrdersInvalidate } from "@/components/orders/order-ui";
import { PdfPreview } from "@/components/orders/pdf-preview";
import { PageActions } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows, PageHeader, PageScroll, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorText, newKey } from "@/lib/api";
import { inTz, money } from "@/lib/format";
import { OrdersDialogs } from "../orders-dialogs";
import { OrdersTabs, useUrlParams } from "../orders-frame";

const RESENDABLE = new Set(["failed", "bounced", "skipped"]);

export function InvoicesClient({ me }: { me: Me }) {
  const tz = me.active.timezone;
  const { params, update } = useUrlParams();
  const kind = params.get("kind") ?? "all";
  const invalidate = useOrdersInvalidate();
  const list = useInfiniteQuery({
    queryKey: ["invoices", kind],
    queryFn: ({ pageParam }) => api.get<InvoicesResponse>(`/api/v1/invoices?${kind !== "all" ? `kind=${kind}&` : ""}${pageParam ? `cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const first = list.data?.pages[0];
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const bounced = items.filter((i) => i.emailStatus === "bounced");

  const resend = useMutation({
    mutationFn: (i: InvoiceListItem) => api.post<InvoiceSummary>(`/api/v1/invoices/${i.id}/resend-email`, {}, newKey()),
    onSuccess: (r) => (r.emailStatus === "sent" ? toast.success(`${r.number} 已重新发到 ${r.emailTo}`) : toast.error(`${r.number} 重发没有成功`, { description: r.emailError ?? undefined })),
    onError: (e) => toast.error("没有重发", { description: errorText(e) }),
    onSettled: invalidate,
  });

  const openDetail = (i: InvoiceListItem) => i.orderId && update({ dialog: "invoice-detail", invoice: i.id, order: i.orderId }, "push");

  return (
    <PageScroll>
      <PageActions>
        <Button variant="outline" onClick={() => update({ dialog: "invoice", order: null }, "push")}>
          <FilePlusIcon />
          新建发票
        </Button>
      </PageActions>
      <PageHeader title="订单与开票" facts={first ? `本月开票 ${first.stats.thisMonth} 张 · 累计 ${first.stats.total} 张 · 编号 INV / RCT-年份-6 位序号` : " "} />
      <OrdersTabs />
      <Panel>
        <PanelHeader title="发票记录" description="Invoice 与 Receipt 分开连续编号；发送状态分聊天、邮件两路如实记录">
          <Select value={kind} onValueChange={(v) => update({ kind: v === "all" ? null : v })}>
            <SelectTrigger size="sm" aria-label="按类型筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="invoice">Invoice</SelectItem>
              <SelectItem value="receipt">Receipt</SelectItem>
            </SelectContent>
          </Select>
        </PanelHeader>
        {list.isError && !first ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !first ? (
          <LoadingRows rows={6} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={FileTextIcon}
            title={kind === "all" ? "还没有开过发票" : "没有这个类型的发票"}
            description="在会话右栏或订单详情里点「开票」，生成的发票会记在这里。"
            action={
              <Button variant="outline" onClick={() => update({ dialog: "invoice", order: null }, "push")}>
                新建发票
              </Button>
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>编号</TableHead>
                  <TableHead className="hidden xl:table-cell">类型</TableHead>
                  <TableHead>买家 / 订单</TableHead>
                  <TableHead className="hidden 2xl:table-cell">店铺</TableHead>
                  <TableHead className="text-right">金额</TableHead>
                  <TableHead>发送</TableHead>
                  <TableHead className="hidden xl:table-cell">开具时间</TableHead>
                  {/* 操作列定宽并贴右：宽屏放得下预览、PDF 与重发一行，窄屏放得下预览与 PDF、重发折到第二行；有没有「重发」都不改列宽，窄屏横滚时按钮仍可见 */}
                  <TableHead className="sticky right-0 w-44 bg-card xl:w-64">
                    <span className="sr-only">操作</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id} className="state-layer cursor-pointer" onClick={() => openDetail(i)}>
                    <TableCell>
                      <button
                        type="button"
                        className="focus-ring rounded-sm font-medium tabular-nums"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(i);
                        }}
                      >
                        {i.number}
                      </button>
                      <span className="block text-xs whitespace-nowrap text-muted-foreground tabular-nums xl:hidden">
                        {i.kind === "invoice" ? "Invoice" : "Receipt"} · {inTz(i.createdAt, tz)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-xs xl:table-cell">{i.kind === "invoice" ? "Invoice" : "Receipt"}</TableCell>
                    <TableCell className="max-w-36 xl:max-w-48">
                      <span className="block truncate">{i.buyerName}</span>
                      <span className="block truncate text-xs text-muted-foreground tabular-nums">{i.externalOrderId ?? "—"}</span>
                      <span className="block truncate text-xs text-muted-foreground 2xl:hidden">{i.shop.name}</span>
                    </TableCell>
                    <TableCell className="hidden max-w-40 truncate text-xs text-muted-foreground 2xl:table-cell">{i.shop.name}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{money(i.amount, i.currency)}</TableCell>
                    <TableCell className="max-w-56 min-w-32 whitespace-normal xl:min-w-44">
                      <SendStatus channel="聊天" status={i.chatStatus} error={i.chatError} />
                      <SendStatus channel="邮件" status={i.emailStatus} error={i.emailStatus === "failed" ? i.emailError : null} />
                      {i.ticket && (
                        <Link
                          href={`/tickets/${i.ticket.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="focus-ring mt-0.5 inline-block rounded-sm pl-5 text-xs font-semibold text-(--semantic-color-text-link) tabular-nums underline-offset-4 hover:underline"
                        >
                          工单 {i.ticket.number}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-xs whitespace-nowrap text-muted-foreground tabular-nums xl:table-cell">{inTz(i.createdAt, tz)}</TableCell>
                    <TableCell className="sticky right-0 w-44 bg-card xl:w-64" onClick={(e) => e.stopPropagation()}>
                      <div className="flex min-w-40 flex-wrap justify-end gap-2">
                        <PdfPreview url={i.pdfUrl} title={i.number}>
                          <Button variant="outline" size="sm" aria-label={`预览 ${i.number} 的 PDF`}>
                            <EyeIcon />
                            预览
                          </Button>
                        </PdfPreview>
                        <Button asChild variant="outline" size="sm">
                          <a href={i.pdfUrl} download aria-label={`下载 ${i.number} 的 PDF`}>
                            <DownloadIcon />
                            PDF
                          </a>
                        </Button>
                        {RESENDABLE.has(i.emailStatus) && (
                          <Button variant="outline" size="sm" disabled={resend.isPending && resend.variables?.id === i.id} onClick={() => resend.mutate(i)} aria-label={`重发 ${i.number} 的邮件`}>
                            {resend.isPending && resend.variables?.id === i.id ? <Spinner /> : <SendIcon />}
                            重发
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {list.hasNextPage && (
              <div className="mt-3 flex justify-center">
                <Button variant="outline" size="sm" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
                  {list.isFetchingNextPage && <Spinner />}
                  加载更多
                </Button>
              </div>
            )}
            {bounced.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {bounced.map((i) => (
                  <li key={i.id} role="status" className="flex items-start gap-2 rounded-md bg-(--semantic-color-surface-warm) px-3 py-2.5 text-sm">
                    <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-(--semantic-color-feedback-warning)" aria-hidden />
                    <p className="min-w-0">
                      {i.number} 邮件退信：{i.emailError ?? "邮件被退回"}。
                      {i.ticket ? (
                        <>
                          已自动建工单 {i.ticket.number} 跟进重发。
                          <Link href={`/tickets/${i.ticket.id}`} className="ml-1 font-semibold text-(--semantic-color-text-link) underline-offset-4 hover:underline">
                            查看工单
                          </Link>
                        </>
                      ) : (
                        "确认买家邮箱后点「重发」。"
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Panel>
      <OrdersDialogs keepOrder={false} />
    </PageScroll>
  );
}
