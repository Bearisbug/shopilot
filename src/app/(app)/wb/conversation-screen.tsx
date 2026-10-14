"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CancelOrderDialog } from "@/components/orders/cancel-order-dialog";
import { CancelRequestDialog } from "@/components/orders/cancel-request-dialog";
import { InvoiceSheet } from "@/components/orders/invoice-sheet";
import { ReturnReviewSheet } from "@/components/orders/return-review-sheet";
import { NewTicketDialog } from "@/components/tickets/new-ticket-dialog";
import { useMe } from "@/hooks/use-me";
import { ApiError } from "@/lib/api";
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
  // 只有本人处理中的会话才把取消、发票写进会话（API-ORD-004、API-INV-002）
  const myConversation = q.data?.conversation.handlingState === "human" && q.data.conversation.claimedBy?.id === me.data?.active.membershipId ? id : null;
  const claimer = q.data?.conversation.handlingState === "human" && !myConversation ? (q.data.conversation.claimedBy?.name ?? null) : null;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["conversation", id] });
    qc.invalidateQueries({ queryKey: ["conversations"] });
  };
  const closer = (open: boolean) => {
    if (!open) set({ dialog: null, order: null, afterSale: null });
  };
  return (
    <>
      <ConversationPane id={id} />
      {/* 会话看不到了（404）时右栏没有可显示的内容，对话栏已说明原因 */}
      {!(q.error instanceof ApiError && q.error.status === 404) && <BuyerColumn id={id} />}
      {q.data && <TransferDialog detail={q.data} />}
      {q.data && <EndDialog detail={q.data} />}
      {q.data && (
        <NewTicketDialog
          shopId={q.data.conversation.shop.id}
          conversationId={id}
          buyerName={q.data.conversation.buyerName}
          orders={buyer.data?.orders ?? []}
          orderId={params.get("order") ?? undefined}
          onCreated={refresh}
        />
      )}
      <CancelOrderDialog open={dialog === "cancel"} onOpenChange={closer} orderId={orderId} conversationId={myConversation} onDone={refresh} />
      <CancelRequestDialog open={dialog === "cancel-request"} onOpenChange={closer} afterSaleId={afterSaleId} onDone={refresh} />
      <ReturnReviewSheet open={dialog === "return-review"} onOpenChange={closer} afterSaleId={afterSaleId} onDone={refresh} />
      {/* 开票侧栏的默认值（发到聊天、可选订单）在挂载时按会话算：会话详情、买家订单与本人信息都到了再打开，从按钮打开和直接访问链接一致 */}
      <InvoiceSheet
        open={dialog === "invoice" && !!q.data && !buyer.isPending && !!me.data}
        onOpenChange={closer}
        orderId={orderId}
        conversation={q.data ? { id, buyerOrders: buyer.data?.orders ?? [], canSendToChat: myConversation !== null, claimerName: claimer } : null}
        onIssued={refresh}
      />
    </>
  );
}
