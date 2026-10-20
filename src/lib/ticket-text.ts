// 工单上平台状态码与系统写的异常说明的中文说法（工单详情页与飞书工单卡共用）。认不出的状态码原样显示。
import { TYPE_LABEL, type TicketType } from "@/contracts/tickets";

/** 订单状态（Shopee get_order_detail.order_status、TikTok order status）与售后单状态 */
const STATUS_TEXT: Record<"shopee" | "tiktok", Record<string, string>> = {
  shopee: {
    UNPAID: "待付款",
    INVOICE_PENDING: "待开发票",
    READY_TO_SHIP: "待发货",
    PROCESSED: "已安排发货",
    RETRY_SHIP: "需重新发货",
    SHIPPED: "运输中",
    TO_CONFIRM_RECEIVE: "待买家确认收货",
    COMPLETED: "已完成",
    IN_CANCEL: "取消申请中",
    CANCELLED: "已取消",
    TO_RETURN: "退货中",
    REQUESTED: "买家已申请退货退款",
    ACCEPTED: "已同意退货退款",
    PROCESSING: "退货处理中",
    JUDGING: "平台判定中",
    SELLER_DISPUTE: "卖家申诉中",
    REFUND_PAID: "已退款",
    CLOSED: "已关闭",
  },
  tiktok: {
    UNPAID: "待付款",
    ON_HOLD: "暂缓发货",
    AWAITING_SHIPMENT: "待发货",
    PARTIALLY_SHIPPING: "部分发货",
    AWAITING_COLLECTION: "待揽收",
    IN_TRANSIT: "运输中",
    DELIVERED: "已送达",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
    RETURN_OR_REFUND_REQUEST_PENDING: "退货退款待处理",
    REFUND_OR_RETURN_REQUEST_REJECT: "已拒绝退货退款",
    AWAITING_BUYER_SHIP: "等买家寄回",
    BUYER_SHIPPED_ITEM: "买家已寄回",
    REJECT_RECEIVE_PACKAGE: "已拒收退货包裹",
    RETURN_OR_REFUND_REQUEST_SUCCESS: "退款中",
    RETURN_OR_REFUND_REQUEST_COMPLETE: "退款完成",
    RETURN_OR_REFUND_REQUEST_CANCEL: "买家已撤销退货退款",
    CANCELLATION_REQUEST_PENDING: "取消申请待处理",
    CANCELLATION_REQUEST_SUCCESS: "已同意取消",
    CANCELLATION_REQUEST_CANCEL: "买家已撤销取消",
    CANCELLATION_REQUEST_COMPLETE: "取消完成",
  },
};

export function platformStatusText(platform: "shopee" | "tiktok", status: string | null | undefined): string | null {
  if (!status) return null;
  return STATUS_TEXT[platform][status] ?? status;
}

const LOGISTICS_FAIL_TEXT: Record<string, string> = {
  LOGISTICS_PICKUP_FAILED: "揽收失败",
  LOGISTICS_DELIVERY_FAILED: "派送失败",
  LOGISTICS_LOST: "包裹丢失",
};

/** 系统建单时写的物流异常说明换成可读中文；买家填的退货原因等其余说明原样返回 */
export function ticketDescriptionText(description: string | null | undefined): string | null {
  if (!description) return null;
  if (description === "72 小时没有新的物流轨迹") return "物流轨迹 72 小时未更新";
  if (description === "订单重新发货（RETRY_SHIP）") return "订单需要重新发货";
  const pkg = /^包裹 (\S*) (LOGISTICS_[A-Z_]+)$/.exec(description);
  if (pkg) return [pkg[1] ? `包裹 ${pkg[1]}` : "包裹", LOGISTICS_FAIL_TEXT[pkg[2]] ?? pkg[2]].join(" ");
  return description;
}

/** 「物流异常 - 物流轨迹 72 小时未更新」：工单类型加说明 */
export function anomalyText(t: { type: TicketType; description: string | null }): string {
  const desc = ticketDescriptionText(t.description);
  return desc ? `${TYPE_LABEL[t.type]} - ${desc}` : TYPE_LABEL[t.type];
}
