"use client";

import { useMutation } from "@tanstack/react-query";
import { LoaderCircleIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { OrderDetail } from "@/contracts/orders";
import { ErrorState, LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError, errorText, newKey } from "@/lib/api";
import { Notice, useOrderDetail, useOrdersInvalidate } from "./order-ui";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  /** 从会话里取消时传入：系统事件写进这个会话 */
  conversationId?: string | null;
  onDone?: (order: OrderDetail) => void;
};

/** 取消订单（REQ-ORD-002，PAGE-WB-CANCEL）：仅发货前，原因固定「买家要求」 */
export function CancelOrderDialog({ open, onOpenChange, orderId, conversationId, onDone }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && orderId && <CancelOrderBody orderId={orderId} conversationId={conversationId ?? undefined} close={() => onOpenChange(false)} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function CancelOrderBody({ orderId, conversationId, close, onDone }: { orderId: string; conversationId?: string; close: () => void; onDone?: (o: OrderDetail) => void }) {
  const q = useOrderDetail(orderId);
  const invalidate = useOrdersInvalidate();
  // 同一次弹层复用一个幂等键：平台超时后点「重试」不会重复取消
  const [key] = useState(newKey);
  const [failure, setFailure] = useState<string | null>(null);
  // 平台超时：结果未知，自动回读订单，回读完成前不能再提交
  const [timedOut, setTimedOut] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api.post<OrderDetail>(`/api/v1/orders/${orderId}/cancel`, { reason: "buyer_request", ...(conversationId ? { conversationId } : {}) }, key),
    onSuccess: (d) => {
      toast.success(`订单 ${d.order.externalOrderId} 已取消`);
      onDone?.(d);
      close();
    },
    onError: (e) => {
      const timeout = e instanceof ApiError && e.type === "platform-timeout";
      setTimedOut(timeout);
      setFailure(timeout ? null : errorText(e));
      if (timeout || (e instanceof ApiError && e.type === "not-allowed")) void q.refetch();
    },
    onSettled: invalidate,
  });

  const d = q.data;
  const allowed = !!d?.cancel.allowed;
  const rereading = timedOut && q.isFetching;
  return (
    <>
      <DialogHeader>
        <DialogTitle>取消订单</DialogTitle>
        <DialogDescription>卖家代买家取消，适合换型号、重新下单。退款由平台处理。</DialogDescription>
      </DialogHeader>
      {q.isPending ? (
        <LoadingRows rows={3} />
      ) : q.isError && !d ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            订单 <span className="font-medium tabular-nums">{d!.order.externalOrderId}</span> · {d!.order.shop.name}
          </p>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">取消原因</p>
            <p className="text-sm">买家要求</p>
            <p className="text-xs text-muted-foreground">{d!.order.shop.platform === "shopee" ? "Shopee 原因代码 CUSTOMER_REQUEST" : "TikTok 原因代码 buyer_requested_cancellation"}</p>
          </div>
          {timedOut ? (
            <Notice tone={rereading || allowed ? "warn" : "info"}>
              {rereading
                ? "平台没有及时响应，取消结果未知，正在重新读取订单状态…"
                : `平台没有及时响应。重新读取到的订单状态：${d!.order.platformStatus}。${allowed ? "订单仍可取消，可以再提交一次。" : `${d!.cancel.reason ?? "当前状态不能取消"}，不需要再提交。`}`}
            </Notice>
          ) : allowed ? (
            <Notice>只能在发货前取消，取消后不能恢复；退款由平台处理。</Notice>
          ) : (
            // 被拒（409）后回读到不能取消：只提示一处
            <Notice tone="error">{failure ?? `${d!.cancel.reason}，不能取消。`}</Notice>
          )}
          {failure && allowed && !timedOut && <Notice tone="error">{failure}</Notice>}
        </div>
      )}
      <DialogFooter>
        {d && !allowed && !rereading ? (
          <Button variant="outline" onClick={close}>
            关闭
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={close}>
              先不取消
            </Button>
            <Button variant="destructive" disabled={!allowed || cancel.isPending || rereading} onClick={() => cancel.mutate()}>
              {cancel.isPending ? <LoaderCircleIcon className="motion-safe:animate-spin" /> : <XIcon />}
              取消订单
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}
