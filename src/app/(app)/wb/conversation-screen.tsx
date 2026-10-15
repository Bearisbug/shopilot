"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CancelOrderDialog } from "@/components/orders/cancel-order-dialog";
import { CancelRequestDialog } from "@/components/orders/cancel-request-dialog";
import { InvoiceDetailDialog } from "@/components/orders/invoice-detail-dialog";
import { InvoiceSheet } from "@/components/orders/invoice-sheet";
import { useOrderDetail } from "@/components/orders/order-ui";
import { ReturnReviewSheet } from "@/components/orders/return-review-sheet";
import { NewTicketDialog } from "@/components/tickets/new-ticket-dialog";
import { useMe } from "@/hooks/use-me";
import { ApiError } from "@/lib/api";
import { OrderSheet } from "../orders/order-drawer";
import { BuyerColumn } from "./buyer-panel";
import { ConversationPane } from "./conversation-pane";
import { EndDialog, TransferDialog } from "./wb-dialogs";
import { useBuyer, useConversation, useWbParams } from "./wb-shared";

export function ConversationScreen({ id }: { id: string }) {
  const q = useConversation(id);
  const buyer = useBuyer(id);
  const { params, set } = useWbParams();
  const qc = useQueryClient();
  const me = useMe();
  const dialog = params.get("dialog");
  const orderId = params.get("order");
  const afterSaleId = params.get("afterSale");
  // 订单详情侧栏（点右栏订单号打开）：?orderDetail=<订单 ID>，与弹层用的 order 分开
  const orderDetailId = params.get("orderDetail");
  const orderDetail = useOrderDetail(orderDetailId);
  // 深链同时带侧栏与弹层时，订单读到后再开弹层：两层同时挂载时，先开的一层会把后开的一层整个标成 aria-hidden
  const ready = !orderDetailId || !orderDetail.isPending;
  // 只有本人处理中的会话才把取消、发票写进会话（API-ORD-004、API-INV-002）
  const myConversation = q.data?.conversation.handlingState === "human" && q.data.conversation.claimedBy?.id === me.data?.active.membershipId ? id : null;
  const claimer = q.data?.conversation.handlingState === "human" && !myConversation ? (q.data.conversation.claimedBy?.name ?? null) : null;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["conversation", id] });
    qc.invalidateQueries({ queryKey: ["conversations"] });
  };
  const closer = (open: boolean) => {
    if (!open) set({ dialog: null, order: null, afterSale: null, invoice: null });
  };
  return (
    <>
      <ConversationPane id={id} />
      {/* 会话看不到了（404）时右栏没有可显示的内容，对话栏已说明原因 */}
      {!(q.error instanceof ApiError && q.error.status === 404) && <BuyerColumn id={id} />}
      {/* 侧栏里的操作打开本页弹层，弹层带上这张订单；关掉弹层回到侧栏 */}
      <OrderSheet
        orderId={orderDetailId}
        tz={me.data?.active.timezone ?? "Asia/Kuala_Lumpur"}
        open={(d, extra = {}) => set({ dialog: d, order: orderDetailId, ...extra }, "push")}
        close={() => set({ orderDetail: null, dialog: null, order: null, afterSale: null, invoice: null })}
        workbench
      />
      {q.data && <TransferDialog detail={q.data} />}
      {q.data && <EndDialog detail={q.data} />}
      {q.data && ready && (
        <NewTicketDialog
          shopId={q.data.conversation.shop.id}
          conversationId={id}
          buyerName={q.data.conversation.buyerName}
          orders={buyer.data?.orders ?? []}
          orderId={params.get("order") ?? undefined}
          onCreated={refresh}
        />
      )}
      <CancelOrderDialog open={ready && dialog === "cancel"} onOpenChange={closer} orderId={orderId} conversationId={myConversation} onDone={refresh} />
      <CancelRequestDialog open={ready && dialog === "cancel-request"} onOpenChange={closer} afterSaleId={afterSaleId} onDone={refresh} />
      <ReturnReviewSheet open={ready && dialog === "return-review"} onOpenChange={closer} afterSaleId={afterSaleId} onDone={refresh} />
      <InvoiceDetailDialog open={ready && dialog === "invoice-detail"} onOpenChange={closer} invoiceId={params.get("invoice")} orderId={orderId} />
      {/* 开票侧栏的默认值（发到聊天、可选订单）在挂载时按会话算：会话详情、买家订单与本人信息都到了再打开，从按钮打开和直接访问链接一致 */}
      <InvoiceSheet
        open={ready && dialog === "invoice" && !!q.data && !buyer.isPending && !!me.data}
        onOpenChange={closer}
        orderId={orderId}
        conversation={
          q.data
            ? {
                id,
                buyerOrders: buyer.data?.orders ?? [],
                canSendToChat: myConversation !== null,
                claimerName: claimer,
                chatBlockedReason: q.data.conversation.shop.readOnly ? "只读接入：发票不能发进平台聊天，只能发邮件" : null,
              }
            : null
        }
        onIssued={refresh}
      />
    </>
  );
}
