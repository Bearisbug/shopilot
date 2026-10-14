"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckIcon, LoaderCircleIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import type { AfterSaleDetail, RejectReasons } from "@/contracts/orders";
import { ErrorState, LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError, errorText, newKey } from "@/lib/api";
import { useMe } from "@/hooks/use-me";
import { inTz, money } from "@/lib/format";
import { DueText, itemsText, KV, Notice, useAfterSale, useOrdersInvalidate } from "./order-ui";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  afterSaleId: string | null;
  conversationId?: string | null;
  onDone?: (afterSale: AfterSaleDetail) => void;
};

/** 处理买家取消申请（REQ-ORD-004，PAGE-ORDERS-CANCEL）：Shopee 订单须 IN_CANCEL；TikTok 拒绝要选平台原因 */
export function CancelRequestDialog({ open, onOpenChange, afterSaleId, onDone }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">{open && afterSaleId && <CancelRequestBody afterSaleId={afterSaleId} close={() => onOpenChange(false)} onDone={onDone} />}</DialogContent>
    </Dialog>
  );
}

function CancelRequestBody({ afterSaleId, close, onDone }: { afterSaleId: string; close: () => void; onDone?: (a: AfterSaleDetail) => void }) {
  const me = useMe();
  const tz = me.data?.active.timezone ?? "Asia/Kuala_Lumpur";
  const q = useAfterSale(afterSaleId);
  const invalidate = useOrdersInvalidate();
  // 不预选：同意取消会退款，必须由人主动选
  const [decision, setDecision] = useState<"accept" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [key, setKey] = useState(newKey);
  // 平台超时：结果未知，自动回读售后单，回读完成前不能再提交
  const [timedOut, setTimedOut] = useState(false);
  const [checking, setChecking] = useState(false);
  // 超时时平台可能仍在执行：等平台推送回写镜像后再读，间隔 4 秒、8 秒各读一次，避免读到旧状态就让人再提交一次
  async function recheck() {
    setChecking(true);
    for (const wait of [4000, 8000]) {
      await new Promise((r) => setTimeout(r, wait));
      await q.refetch();
    }
    setChecking(false);
  }
  const a = q.data;
  const tiktok = a?.platform === "tiktok";
  const reasons = useQuery({
    queryKey: ["after-sale", afterSaleId, "reject-reasons"],
    queryFn: () => api.get<RejectReasons>(`/api/v1/after-sales/${afterSaleId}/reject-reasons`),
    enabled: tiktok && decision === "reject",
  });
  const submit = useMutation({
    mutationFn: () => api.post<AfterSaleDetail>(`/api/v1/after-sales/${afterSaleId}/cancellation-decision`, { decision, ...(decision === "reject" && reason ? { reason } : {}) }, key),
    onSuccess: (r) => {
      toast.success(decision === "accept" ? "已同意取消，订单由平台取消并退款" : "已拒绝取消申请，订单继续发货");
      onDone?.(r);
      close();
    },
    onError: (e) => {
      const timeout = e instanceof ApiError && e.type === "platform-timeout";
      setTimedOut(timeout);
      setFailure(timeout ? null : errorText(e));
      if (timeout) void recheck();
      // 状态类拒绝换新键，重试类保留同一键
      if (e instanceof ApiError && e.status < 500) {
        setKey(newKey());
        void q.refetch();
      }
    },
    onSettled: invalidate,
  });

  const action = a?.actions.find((x) => x.decision === decision);
  const rereading = timedOut && (checking || q.isFetching);
  const canSubmit = !!action?.allowed && !(tiktok && decision === "reject" && !reason) && !rereading;
  const readOnly = !!a && !a.open && !rereading;

  return (
    <>
      <DialogHeader>
        <DialogTitle>处理买家取消申请</DialogTitle>
        <DialogDescription>{a ? `${a.platform === "shopee" ? "Shopee" : "TikTok"} 买家在发货前申请取消，需要卖家同意或拒绝。` : " "}</DialogDescription>
      </DialogHeader>
      {q.isPending ? (
        <LoadingRows rows={4} />
      ) : q.isError && !a ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <form
          id="cancel-request-form"
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!decision || rereading) return;
            if (tiktok && decision === "reject" && !reason) {
              setReasonError("请选择拒绝原因");
              return;
            }
            setFailure(null);
            submit.mutate();
          }}
        >
          <dl>
            <KV label="订单">
              <span className="tabular-nums">{a!.order.externalOrderId}</span> · {a!.shop.name}
            </KV>
            <KV label="买家">{a!.order.buyerName ?? "—"}</KV>
            <KV label="商品">
              {itemsText(a!.order.items) || "—"}
              {a!.order.total && a!.order.currency ? ` · ${money(a!.order.total, a!.order.currency)}` : ""}
            </KV>
            <KV label="状态">
              <span className="tabular-nums">{a!.platformStatus}</span>
              {a!.updatedAt ? ` · ${inTz(a!.updatedAt, tz)} 更新` : ""}
              {a!.reason ? ` · ${a!.reason}` : ""}
            </KV>
            <KV label="处理时限">
              {a!.ticket?.dueAt ? (
                <>
                  {a!.ticket.dueSource === "merchant" ? "商户时限" : "平台截止"} {inTz(a!.ticket.dueAt, tz)}（<DueText dueAt={a!.ticket.dueAt} />）
                  {a!.platform === "shopee" && <span className="block text-xs text-muted-foreground">Shopee 不提供截止字段，按商户 24 小时且不晚于最晚发货时间</span>}
                </>
              ) : a!.sellerDueAt ? (
                <>
                  平台截止 {inTz(a!.sellerDueAt, tz)}（<DueText dueAt={a!.sellerDueAt} />）
                </>
              ) : (
                "—"
              )}
              {a!.ticket && (
                <span className="block text-xs text-muted-foreground">
                  工单{" "}
                  <Link href={`/tickets/${a!.ticket.id}`} className="focus-ring rounded-sm font-semibold text-(--semantic-color-text-link) tabular-nums underline-offset-4 hover:underline">
                    {a!.ticket.number}
                  </Link>
                </span>
              )}
            </KV>
          </dl>

          {timedOut && (
            <Notice tone={rereading ? "warn" : "info"}>
              {rereading
                ? "平台没有及时响应，处理结果未知。平台可能仍在处理，正在核对结果（约 12 秒）…"
                : `平台没有及时响应。重新读取到的平台状态：${a!.platformStatus}。${a!.open ? "申请仍待处理，可以再提交一次。" : "申请已处理，不需要再提交。"}`}
            </Notice>
          )}
          {a!.open ? (
            <Field>
              <FieldLabel id="cr-decision-label">处理结果</FieldLabel>
              <RadioGroup value={decision ?? ""} onValueChange={(v) => setDecision(v as "accept" | "reject")} className="gap-3" aria-labelledby="cr-decision-label" aria-describedby={decision ? undefined : "cr-decision-hint"}>
                <div className="flex items-start gap-3">
                  <RadioGroupItem value="accept" id="cr-accept" className="mt-0.5" />
                  <Label htmlFor="cr-accept" className="flex flex-col items-start gap-0.5 font-normal">
                    <span className="font-medium">同意取消</span>
                    <span className="text-xs text-muted-foreground">订单取消，平台把货款退给买家</span>
                  </Label>
                </div>
                <div className="flex items-start gap-3">
                  <RadioGroupItem value="reject" id="cr-reject" className="mt-0.5" />
                  <Label htmlFor="cr-reject" className="flex flex-col items-start gap-0.5 font-normal">
                    <span className="font-medium">拒绝取消</span>
                    <span className="text-xs text-muted-foreground">订单继续发货；建议先在会话里和买家确认</span>
                  </Label>
                </div>
              </RadioGroup>
              {!decision && <FieldDescription id="cr-decision-hint">先选择处理结果</FieldDescription>}
            </Field>
          ) : timedOut ? null : (
            // 被拒（409）后回读到已不在申请中：只提示一处
            <Notice tone={failure ? "error" : "info"}>{failure ?? `订单已不在取消申请中（当前 ${a!.platformStatus}），不需要再处理。`}</Notice>
          )}

          {a!.open && tiktok && decision === "reject" && (
            <Field data-invalid={!!reasonError}>
              <FieldLabel htmlFor="cr-reason">拒绝原因</FieldLabel>
              <Select
                value={reason}
                onValueChange={(v) => {
                  setReason(v);
                  setReasonError(null);
                }}
              >
                <SelectTrigger id="cr-reason" className="w-full" aria-invalid={!!reasonError} disabled={reasons.isPending}>
                  <SelectValue placeholder={reasons.isPending ? "正在读取平台原因" : reasons.isError ? "原因没有读取出来" : "选择 TikTok 提供的原因"} />
                </SelectTrigger>
                <SelectContent>
                  {(reasons.data?.items ?? []).map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reasons.isError && <FieldError>{errorText(reasons.error)}</FieldError>}
              {reasonError && <FieldError>{reasonError}</FieldError>}
            </Field>
          )}
          {failure && a!.open && <Notice tone="error">{failure}</Notice>}
        </form>
      )}
      <DialogFooter>
        {readOnly ? (
          <Button variant="outline" onClick={close}>
            关闭
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={close}>
              取消
            </Button>
            <Button type="submit" form="cancel-request-form" disabled={!canSubmit || submit.isPending}>
              {submit.isPending ? <LoaderCircleIcon className="motion-safe:animate-spin" /> : <CheckIcon />}
              提交
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}
