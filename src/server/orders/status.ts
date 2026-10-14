// 平台订单状态 → 归一状态组（DESIGN §9.4 statusGroup），与 §11.13 阶段判定用的状态集合。
export type StatusGroup = "unpaid" | "to_ship" | "shipped" | "delivered" | "completed" | "cancelled" | "in_cancel" | "returning";

const SHOPEE: Record<string, StatusGroup> = {
  UNPAID: "unpaid",
  INVOICE_PENDING: "unpaid",
  READY_TO_SHIP: "to_ship",
  PROCESSED: "to_ship",
  RETRY_SHIP: "to_ship",
  SHIPPED: "shipped",
  TO_CONFIRM_RECEIVE: "delivered",
  COMPLETED: "completed",
  IN_CANCEL: "in_cancel",
  CANCELLED: "cancelled",
  TO_RETURN: "returning",
};

const TIKTOK: Record<string, StatusGroup> = {
  UNPAID: "unpaid",
  ON_HOLD: "to_ship",
  AWAITING_SHIPMENT: "to_ship",
  PARTIALLY_SHIPPING: "to_ship",
  AWAITING_COLLECTION: "to_ship",
  IN_TRANSIT: "shipped",
  DELIVERED: "delivered",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

/** 买家申请取消中的 TikTok 单归 in_cancel；有未终结退货的单归 returning */
export function statusGroup(platform: "shopee" | "tiktok", status: string, flags: { buyerRequestedCancel?: boolean; openReturn?: boolean } = {}): StatusGroup {
  const base = (platform === "shopee" ? SHOPEE : TIKTOK)[status] ?? "to_ship";
  if (flags.openReturn && base !== "cancelled") return "returning";
  if (platform === "tiktok" && flags.buyerRequestedCancel && base !== "cancelled" && base !== "completed") return "in_cancel";
  return base;
}

/** §11.13 规则 3：未完结订单 */
export const ACTIVE_ORDER: Record<"shopee" | "tiktok", Set<string>> = {
  shopee: new Set(["UNPAID", "READY_TO_SHIP", "PROCESSED", "RETRY_SHIP", "SHIPPED", "IN_CANCEL"]),
  tiktok: new Set(["UNPAID", "ON_HOLD", "AWAITING_SHIPMENT", "PARTIALLY_SHIPPING", "AWAITING_COLLECTION", "IN_TRANSIT"]),
};

/** §11.13 规则 4：近 60 天算售后的完成态 */
export const DONE_ORDER: Record<"shopee" | "tiktok", Set<string>> = {
  shopee: new Set(["COMPLETED", "TO_CONFIRM_RECEIVE"]),
  tiktok: new Set(["COMPLETED", "DELIVERED"]),
};

/** 发货前（可取消）的状态 */
export const PRE_SHIP: Record<"shopee" | "tiktok", Set<string>> = {
  shopee: new Set(["UNPAID", "READY_TO_SHIP", "PROCESSED", "INVOICE_PENDING"]),
  tiktok: new Set(["UNPAID", "ON_HOLD", "AWAITING_SHIPMENT", "AWAITING_COLLECTION", "PARTIALLY_SHIPPING"]),
};

/** §11.13 规则 2：TikTok 退货终态；Shopee 未终结退货状态 */
export const TIKTOK_RETURN_FINAL = new Set([
  "REFUND_OR_RETURN_REQUEST_REJECT",
  "RETURN_OR_REFUND_REQUEST_CANCEL",
  "RETURN_OR_REFUND_REQUEST_COMPLETE",
  "REPLACEMENT_REQUEST_REJECT",
  "REPLACEMENT_REQUEST_REFUND_SUCCESS",
  "REPLACEMENT_REQUEST_CANCEL",
  "REPLACEMENT_REQUEST_COMPLETE",
  "EXCHANGE_REQUEST_REFUND_SUCCESS",
  "EXCHANGE_REQUEST_CANCEL",
  "EXCHANGE_REQUEST_COMPLETE",
]);
export const SHOPEE_RETURN_OPEN = new Set(["REQUESTED", "ACCEPTED", "PROCESSING", "JUDGING", "SELLER_DISPUTE"]);

export function afterSaleOpen(platform: "shopee" | "tiktok", kind: "return" | "cancel", status: string): boolean {
  if (kind === "cancel") return platform === "tiktok" ? status === "CANCELLATION_REQUEST_PENDING" : status === "IN_CANCEL";
  return platform === "tiktok" ? !TIKTOK_RETURN_FINAL.has(status) : SHOPEE_RETURN_OPEN.has(status);
}
