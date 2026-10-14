"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckIcon, ImageIcon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { AfterSaleAction, AfterSaleDetail, RejectReasons } from "@/contracts/orders";
import { SHOPEE_DISPUTE_REASONS } from "@/contracts/orders";
import { ErrorState, LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/hooks/use-me";
import { api, ApiError, errorText, newKey } from "@/lib/api";
import { inTz, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DECISION_LABEL, DueText, itemsText, KV, Notice, RETURN_TYPE_LABEL, useAfterSale, useOrdersInvalidate } from "./order-ui";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  afterSaleId: string | null;
  conversationId?: string | null;
  onDone?: (afterSale: AfterSaleDetail) => void;
};

/** 成功提示：「已 + 动作」 */
const DONE_TEXT: Record<string, string> = {
  approve_return: "已同意退货",
  reject_return: "已拒绝退货申请",
  approve_received: "已确认收货并同意退款",
  reject_received: "已拒收退货",
  confirm_refund: "已同意退款",
  dispute: "已发起争议",
};

const AFTER_HINT: Record<string, string> = {
  approve_return: "提交后工单进入「等买家寄回」，截止时间按平台下一步动作更新。",
  reject_return: "提交后退货申请关闭，买家可以向平台申诉。",
  approve_received: "确认收到退货并同意退款，平台随后退款，工单解决。",
  reject_received: "拒收后进入平台仲裁，工单等待平台结果。",
  confirm_refund: "同意退款后平台把款项退给买家，之后不能再发起争议。",
  dispute: "发起争议后 Shopee 介入判定，工单等待平台结果；需要时在 Shopee 卖家中心补充凭证。",
};

/** 处理退货退款（REQ-ORD-005，PAGE-WB-RETURN）：TikTok 同意 / 拒绝、收货后同意 / 拒收；Shopee 同意退款 / 发起争议 */
export function ReturnReviewSheet({ open, onOpenChange, afterSaleId, onDone }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overscroll-contain data-[side=right]:sm:max-w-lg" aria-describedby={undefined}>
        {open && afterSaleId && <ReturnBody afterSaleId={afterSaleId} close={() => onOpenChange(false)} onDone={onDone} />}
      </SheetContent>
    </Sheet>
  );
}

function ReturnBody({ afterSaleId, close, onDone }: { afterSaleId: string; close: () => void; onDone?: (a: AfterSaleDetail) => void }) {
  const me = useMe();
  const tz = me.data?.active.timezone ?? "Asia/Kuala_Lumpur";
  const q = useAfterSale(afterSaleId);
  const invalidate = useOrdersInvalidate();
  const a = q.data;
  // 不预选：退款等动作不可逆，必须由人主动选
  const [decision, setDecision] = useState<string | null>(null);
  const action = a?.actions.find((x) => x.decision === decision) ?? null;
  const [reasonCode, setReasonCode] = useState("");
  const [comment, setComment] = useState("");
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

  const tiktokReasons = useQuery({
    queryKey: ["after-sale", afterSaleId, "reject-reasons", a?.platformStatus],
    queryFn: () => api.get<RejectReasons>(`/api/v1/after-sales/${afterSaleId}/reject-reasons`),
    enabled: a?.platform === "tiktok" && !!action?.needsReason,
  });
  const reasonOptions = a?.platform === "shopee" ? SHOPEE_DISPUTE_REASONS.map((r) => ({ code: r.code, text: r.text })) : (tiktokReasons.data?.items ?? []);

  const submit = useMutation({
    mutationFn: () =>
      api.post<AfterSaleDetail>(
        `/api/v1/after-sales/${afterSaleId}/return-decision`,
        { decision, ...(action?.needsReason ? { reasonCode } : {}), ...(action?.needsReason && comment.trim() ? { comment: comment.trim() } : {}) },
        key,
      ),
    onSuccess: (r) => {
      toast.success(`${DONE_TEXT[decision!]}${r.ticket ? `，工单 ${r.ticket.number} 现在${r.ticket.phase ? `「${r.ticket.phase}」` : "已更新"}` : ""}`);
      onDone?.(r);
      close();
    },
    onError: (e) => {
      const timeout = e instanceof ApiError && e.type === "platform-timeout";
      setTimedOut(timeout);
      setFailure(timeout ? null : errorText(e));
      if (timeout) void recheck();
      if (e instanceof ApiError && e.status < 500) {
        setKey(newKey());
        void q.refetch();
      }
    },
    onSettled: invalidate,
  });

  if (!a)
    return (
      <>
        <SheetHeader>
          <SheetTitle>处理退货退款申请</SheetTitle>
        </SheetHeader>
        <div className="px-4">{q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <LoadingRows rows={6} />}</div>
      </>
    );

  const d = a;
  const rereading = timedOut && (checking || q.isFetching);
  // 截止只对还在进行的售后有意义：有工单看工单是否未结，没有工单看平台状态
  const live = d.ticket ? ["open", "in_progress", "waiting"].includes(d.ticket.status) : d.open;
  const due = live ? (d.ticket?.dueAt ?? d.sellerDueAt) : null;
  const anyAllowed = d.actions.some((x) => x.allowed);
  return (
    <>
      <SheetHeader className="border-b border-border pr-12">
        <SheetTitle className="text-lg">处理退货退款申请</SheetTitle>
        <SheetDescription>
          {[d.order.buyerName, `${d.platform === "shopee" ? "Shopee" : "TikTok"} ${d.shop.market}`, d.updatedAt ? `更新于 ${inTz(d.updatedAt, tz)}` : null, d.ticket ? `工单 ${d.ticket.number}` : null].filter(Boolean).join(" · ")}
        </SheetDescription>
      </SheetHeader>
      <form
        id="return-review-form"
        noValidate
        className="scroll-y flex min-h-0 flex-1 flex-col gap-5 px-4 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!decision || !action?.allowed || rereading) return;
          if (action.needsReason && !reasonCode) {
            setReasonError(d.platform === "shopee" ? "请选择争议原因" : "请选择原因");
            return;
          }
          setFailure(null);
          submit.mutate();
        }}
      >
        <dl>
          <KV label="订单">
            <span className="tabular-nums">{d.order.externalOrderId}</span> · {d.shop.name}
          </KV>
          <KV label="商品">{itemsText(d.order.items) || "—"}</KV>
          <KV label="类型">
            {(d.returnType && RETURN_TYPE_LABEL[d.returnType]) ?? "退货退款"}
            <span className="block text-xs break-all text-muted-foreground">{d.platformStatus}</span>
          </KV>
          {d.reason && <KV label="原因">{d.reason}（买家填写）</KV>}
          {d.amount && <KV label="退款金额">{money(d.amount, d.currency ?? d.order.currency ?? "")}</KV>}
          <KV label="平台截止">
            {due ? (
              <>
                {inTz(due, tz)} · <DueText dueAt={due} />
                {d.dueField && <span className="block text-xs text-muted-foreground">来源字段 {d.dueField}</span>}
              </>
            ) : (
              live ? "无（等待买家或平台）" : "无（售后已结束）"
            )}
          </KV>
        </dl>

        {d.evidence.length > 0 && (
          <section aria-labelledby="rr-evidence">
            <h3 id="rr-evidence" className="mb-2 text-sm font-semibold">
              买家凭证
            </h3>
            <ul className="flex flex-wrap gap-2">
              {d.evidence.map((url, i) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noreferrer" className="state-layer focus-ring flex size-16 items-center justify-center rounded-md bg-muted" aria-label={`打开凭证 ${i + 1}`}>
                    <ImageIcon className="size-5 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {timedOut && (
          <Notice tone={rereading ? "warn" : "info"}>
            {rereading
              ? "平台没有及时响应，处理结果未知。平台可能仍在处理，正在核对结果（约 12 秒）…"
              : `平台没有及时响应。重新读取到的平台状态：${d.platformStatus}${d.updatedAt ? `（${inTz(d.updatedAt, tz)} 更新）` : ""}。${anyAllowed ? "仍待卖家处理，可以再提交一次。" : "这一步已处理，不需要再提交。"}`}
          </Notice>
        )}
        {anyAllowed ? (
          <>
            <Field>
              <FieldLabel id="rr-decision-label">处理结果</FieldLabel>
              <RadioGroup
                value={decision ?? ""}
                onValueChange={(v) => {
                  setDecision(v);
                  setReasonCode("");
                  setReasonError(null);
                }}
                className="gap-3"
                aria-labelledby="rr-decision-label"
                aria-describedby={decision ? undefined : "rr-decision-hint"}
              >
                {d.actions.map((x) => (
                  <div key={x.decision} className="flex min-h-8 items-start gap-3">
                    <RadioGroupItem value={x.decision} id={`rr-${x.decision}`} disabled={!x.allowed} className="mt-0.5" />
                    <Label htmlFor={`rr-${x.decision}`} className={cn("flex flex-col items-start gap-0.5 font-normal", !x.allowed && "text-muted-foreground")}>
                      <span className="font-medium">{DECISION_LABEL[x.decision]}</span>
                      <span className="text-xs leading-normal text-muted-foreground">{x.allowed ? AFTER_HINT[x.decision] : `不可用：${x.reason ?? "当前状态不能这样处理"}`}</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              {!decision && <FieldDescription id="rr-decision-hint">先选择处理结果</FieldDescription>}
            </Field>
            {action?.needsReason && (
              <>
                <Field data-invalid={!!reasonError}>
                  <FieldLabel htmlFor="rr-reason">{d.platform === "shopee" ? "争议原因" : "原因"}</FieldLabel>
                  <Select
                    value={reasonCode}
                    onValueChange={(v) => {
                      setReasonCode(v);
                      setReasonError(null);
                    }}
                  >
                    <SelectTrigger id="rr-reason" className="w-full" aria-invalid={!!reasonError} disabled={d.platform === "tiktok" && tiktokReasons.isPending}>
                      <SelectValue placeholder={d.platform === "shopee" ? "选择 Shopee 定义的争议原因" : tiktokReasons.isPending ? "正在读取平台原因" : "选择原因"} />
                    </SelectTrigger>
                    <SelectContent>
                      {reasonOptions.map((r) => (
                        <SelectItem key={r.code} value={r.code}>
                          {r.text}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {d.platform === "tiktok" && tiktokReasons.isError && <FieldError>{errorText(tiktokReasons.error)}</FieldError>}
                  {reasonError && <FieldError>{reasonError}</FieldError>}
                </Field>
                <Field>
                  <FieldLabel htmlFor="rr-comment">{d.platform === "shopee" ? "争议说明（选填）" : "给买家的说明（选填）"}</FieldLabel>
                  <Textarea id="rr-comment" rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="例如：商品包装已拆、配件缺失，附图已在平台上传" />
                </Field>
              </>
            )}
          </>
        ) : timedOut ? null : (
          // 被拒（409）后回读到已不需要处理：只提示一处
          <Notice tone={failure ? "error" : "info"}>{failure ?? `${d.actions[0]?.reason ?? `当前 ${d.platformStatus}，不需要卖家处理`}。`}</Notice>
        )}
        {!anyAllowed && d.platform === "shopee" && <DisabledActions actions={d.actions} />}
      </form>
      {failure && anyAllowed && (
        <div className="px-4">
          <Notice tone="error">{failure}</Notice>
        </div>
      )}
      <SheetFooter className="flex-row justify-end border-t border-border">
        {anyAllowed || rereading ? (
          <>
            <Button variant="outline" onClick={close}>
              取消
            </Button>
            <Button type="submit" form="return-review-form" disabled={!action?.allowed || submit.isPending || rereading}>
              {submit.isPending ? <LoaderCircleIcon className="motion-safe:animate-spin" /> : <CheckIcon />}
              提交处理
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={close}>
            关闭
          </Button>
        )}
      </SheetFooter>
    </>
  );
}

/** 全部不可用时仍列出动作并说明原因（如 Shopee 已同意退款后「发起争议」不可用） */
function DisabledActions({ actions }: { actions: AfterSaleAction[] }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {actions.map((x) => (
        <li key={x.decision} className="flex items-baseline gap-2">
          <span className="font-medium text-muted-foreground">「{DECISION_LABEL[x.decision]}」不可用</span>
        </li>
      ))}
    </ul>
  );
}
