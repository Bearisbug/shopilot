"use client";

import { CancelOrderDialog } from "@/components/orders/cancel-order-dialog";
import { CancelRequestDialog } from "@/components/orders/cancel-request-dialog";
import { InvoiceDetailDialog } from "@/components/orders/invoice-detail-dialog";
import { InvoiceSheet } from "@/components/orders/invoice-sheet";
import { useOrderDetail } from "@/components/orders/order-ui";
import { ReturnReviewSheet } from "@/components/orders/return-review-sheet";
import { useUrlParams } from "./orders-frame";

/**
 * 订单页与发票页的弹层：?dialog=cancel|cancel-request|return-review|invoice|invoice-detail，
 * 配 order=<订单 ID>、afterSale=<售后单 ID>、invoice=<发票 ID>。关闭时去掉 dialog 与它带来的 afterSale / invoice；
 * 订单页保留 order（抽屉还开着），发票页没有抽屉，keepOrder = false 时一并去掉。
 */
export function OrdersDialogs({ keepOrder = true }: { keepOrder?: boolean }) {
  const { params, update } = useUrlParams();
  const dialog = params.get("dialog");
  const orderId = params.get("order");
  const afterSaleId = params.get("afterSale");
  const invoiceId = params.get("invoice");
  const detail = useOrderDetail(orderId);
  // 只有本人处理中的会话才把取消写进会话；开票侧栏按订单详情自己判断能否发到聊天
  const conversationId = detail.data?.conversation?.claimedByMe ? detail.data.conversation.id : null;
  // 深链同时带 order（抽屉）与 dialog 时，订单读到后再开弹层：两层同时挂载时，先开的一层会把后开的一层整个标成 aria-hidden
  const ready = !orderId || !detail.isPending;
  const closer = (extra: Record<string, null> = {}) => (open: boolean) => {
    if (!open) update({ dialog: null, ...extra, ...(keepOrder ? {} : { order: null }) });
  };
  return (
    <>
      <CancelOrderDialog open={ready && dialog === "cancel"} onOpenChange={closer()} orderId={orderId} conversationId={conversationId} />
      <CancelRequestDialog open={ready && dialog === "cancel-request"} onOpenChange={closer({ afterSale: null })} afterSaleId={afterSaleId} />
      <ReturnReviewSheet open={ready && dialog === "return-review"} onOpenChange={closer({ afterSale: null })} afterSaleId={afterSaleId} />
      <InvoiceSheet open={ready && dialog === "invoice"} onOpenChange={closer()} orderId={orderId} />
      <InvoiceDetailDialog open={ready && dialog === "invoice-detail"} onOpenChange={closer({ invoice: null })} invoiceId={invoiceId} orderId={orderId} />
    </>
  );
}
