"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { DownloadIcon, EyeIcon, LoaderCircleIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { zEmail } from "@/contracts/common";
import type { InvoicesResponse, InvoiceSummary } from "@/contracts/orders";
import { ErrorState, LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useMe } from "@/hooks/use-me";
import { api, ApiError, errorText, newKey } from "@/lib/api";
import { inTz, money } from "@/lib/format";
import { KV, Notice, SendStatus, useOrderDetail, useOrdersInvalidate } from "./order-ui";
import { PdfPreview } from "./pdf-preview";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
  /** 发票所属订单（详情从订单详情 API-ORD-002 取）；深链没带时按发票记录找 */
  orderId: string | null;
  conversationId?: string | null;
};

/** 发票详情：编号、两路发送结果、图片预览、下载 PDF、重发邮件（REQ-ORD-006） */
export function InvoiceDetailDialog({ open, onOpenChange, invoiceId, orderId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">{open && <DetailBody invoiceId={invoiceId} givenOrderId={orderId} close={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

const LOCATE_PAGES = 10;

/** 地址里只有 invoice 时：翻发票记录（每页 100 张，最多 10 页）找到它所属的订单；找不到返回 null */
function useInvoiceOrderId(invoiceId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["invoices", "locate", invoiceId],
    enabled: enabled && !!invoiceId,
    queryFn: async () => {
      let cursor = "";
      for (let page = 0; page < LOCATE_PAGES; page++) {
        const r = await api.get<InvoicesResponse>(`/api/v1/invoices?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
        const hit = r.items.find((i) => i.id === invoiceId);
        if (hit) return hit.orderId;
        if (!r.nextCursor) break;
        cursor = r.nextCursor;
      }
      return null;
    },
  });
}

function DetailBody({ invoiceId, givenOrderId, close }: { invoiceId: string | null; givenOrderId: string | null; close: () => void }) {
  const me = useMe();
  const tz = me.data?.active.timezone ?? "Asia/Kuala_Lumpur";
  const locate = useInvoiceOrderId(invoiceId, !givenOrderId);
  const orderId = givenOrderId ?? locate.data ?? null;
  const q = useOrderDetail(orderId);
  const invalidate = useOrdersInvalidate();
  const inv = q.data?.invoices.find((i) => i.id === invoiceId);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [key, setKey] = useState(newKey);
  const markEmail = (msg: string) => {
    setEmailError(msg);
    emailRef.current?.focus();
  };
  const resend = useMutation({
    mutationFn: () => api.post<InvoiceSummary>(`/api/v1/invoices/${invoiceId}/resend-email`, email.trim() ? { email: email.trim() } : {}, key),
    onSuccess: (r) => {
      toast.success(r.emailStatus === "sent" ? `已重新发到 ${r.emailTo}` : `重发没有成功：${r.emailError ?? ""}`);
      setKey(newKey());
      setEmail("");
    },
    onError: (e) => {
      setKey(newKey());
      const fieldMsg = e instanceof ApiError && e.type === "validation" ? (e.problem.extra?.fields as Record<string, string> | undefined)?.email : undefined;
      if (fieldMsg) markEmail(fieldMsg);
      else toast.error("没有重发", { description: errorText(e) });
    },
    onSettled: invalidate,
  });

  const notFound =
    !invoiceId ||
    (!givenOrderId && locate.isSuccess && !locate.data) ||
    (q.error instanceof ApiError && q.error.type === "not-found") ||
    (q.isSuccess && !inv);
  if (notFound)
    return (
      <>
        <DialogHeader>
          <DialogTitle>找不到这张发票</DialogTitle>
          <DialogDescription>它可能已被删除，或不在你负责的店铺里。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            返回
          </Button>
        </DialogFooter>
      </>
    );
  if (locate.isError || q.isError)
    return (
      <>
        <DialogHeader>
          <DialogTitle>发票详情</DialogTitle>
        </DialogHeader>
        <ErrorState error={locate.error ?? q.error} onRetry={() => (locate.isError ? locate.refetch() : q.refetch())} />
      </>
    );
  if (!inv || !q.data)
    return (
      <>
        <DialogHeader>
          <DialogTitle>发票详情</DialogTitle>
          <DialogDescription>正在读取发票…</DialogDescription>
        </DialogHeader>
        <LoadingRows rows={5} />
      </>
    );
  const o = q.data.order;
  const canResend = inv.emailStatus !== "pending";
  return (
    <>
      <DialogHeader>
        <DialogTitle className="tabular-nums">{inv.number}</DialogTitle>
        <DialogDescription>
          {inv.kind === "invoice" ? "Invoice" : "Receipt"} · {inTz(inv.createdAt, tz, "yyyy-MM-dd HH:mm")} 开具
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
        <dl>
          <KV label="抬头">{inv.buyerName}</KV>
          <KV label="订单">
            <span className="tabular-nums">{o.externalOrderId}</span> · {o.shop.name}
          </KV>
          <KV label="金额">{money(inv.amount, inv.currency)}</KV>
          <KV label="聊天">
            <SendStatus channel="" status={inv.chatStatus} error={inv.chatError} />
          </KV>
          <KV label="邮件">
            <SendStatus channel="" status={inv.emailStatus} error={inv.emailError} />
            {inv.emailTo && <span className="block text-xs text-muted-foreground">{inv.emailTo}</span>}
          </KV>
        </dl>
        {inv.imageUrl && (
          <a href={inv.imageUrl} target="_blank" rel="noreferrer" className="focus-ring block self-start overflow-hidden rounded-md border border-border" aria-label="打开发票图片">
            {/* eslint-disable-next-line @next/next/no-img-element -- 发票图片走带会话鉴权的文件接口，next/image 优化器取不到 */}
            <img src={inv.imageUrl} alt={`${inv.number} 图片`} className="h-auto w-full" loading="lazy" />
          </a>
        )}
      </div>
      {inv.emailStatus === "bounced" && <Notice>邮件被退回，已按规则建「开票」工单。确认买家邮箱后在下面重发。</Notice>}
      <form
        id="invoice-resend"
        noValidate
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = email.trim();
          if (v && !zEmail.safeParse(v).success) {
            markEmail("邮箱格式不对");
            return;
          }
          setEmailError(null);
          resend.mutate();
        }}
      >
        <Field data-invalid={!!emailError}>
          <FieldLabel htmlFor="inv-resend-email">重发邮件</FieldLabel>
          <Input
            ref={emailRef}
            id="inv-resend-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(null);
            }}
            placeholder={inv.emailTo ?? "填写接收邮箱"}
            aria-invalid={!!emailError}
            aria-describedby="inv-resend-email-desc"
          />
          {emailError ? <FieldError id="inv-resend-email-desc">{emailError}</FieldError> : <FieldDescription id="inv-resend-email-desc">{inv.emailTo ? "留空时发到原邮箱" : "这张发票没有接收邮箱，填写后再重发"}</FieldDescription>}
        </Field>
      </form>
      <DialogFooter className="sm:justify-between">
        <Button asChild variant="link" className="px-0">
          <Link href={`/orders?order=${o.id}`}>查看订单</Link>
        </Button>
        <div className="flex flex-wrap justify-end gap-2">
          <PdfPreview url={inv.pdfUrl} title={inv.number}>
            <Button variant="outline">
              <EyeIcon />
              预览
            </Button>
          </PdfPreview>
          <Button asChild variant="outline">
            <a href={inv.pdfUrl} download>
              <DownloadIcon />
              PDF
            </a>
          </Button>
          <Button type="submit" form="invoice-resend" variant="outline" disabled={!canResend || resend.isPending}>
            {resend.isPending ? <LoaderCircleIcon className="motion-safe:animate-spin" /> : <SendIcon />}
            重发
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
