// 订单状态推进：两个平台的状态链、物流轨迹、截止字段与时间点。
import type { MockOrderItem, MockPlatform, MockTrackingEvent } from "./db/schema";
import { SHOPEE_DAYS_TO_SHIP } from "./fixtures";
import { shopeePackageNumber, shopeeTrackingNo, tiktokPackageId, tiktokTrackingNo } from "./ids";

export const SHOPEE_ORDER_FLOW = ["UNPAID", "READY_TO_SHIP", "PROCESSED", "SHIPPED", "TO_CONFIRM_RECEIVE", "COMPLETED"] as const;
export const TIKTOK_ORDER_FLOW = ["UNPAID", "AWAITING_SHIPMENT", "AWAITING_COLLECTION", "IN_TRANSIT", "DELIVERED", "COMPLETED"] as const;

/** 发货前（可取消）的状态 */
export const SHOPEE_PRE_SHIP = ["UNPAID", "READY_TO_SHIP", "PROCESSED", "RETRY_SHIP"];
export const TIKTOK_PRE_SHIP = ["UNPAID", "ON_HOLD", "AWAITING_SHIPMENT", "AWAITING_COLLECTION"];

export function flowOf(platform: MockPlatform): readonly string[] {
  return platform === "shopee" ? SHOPEE_ORDER_FLOW : TIKTOK_ORDER_FLOW;
}

/** 状态链里的下一步；不在链上或已到末尾返回 null。RETRY_SHIP 的下一步是 SHIPPED。 */
export function nextStatus(platform: MockPlatform, status: string): string | null {
  if (platform === "shopee" && status === "RETRY_SHIP") return "SHIPPED";
  const flow = flowOf(platform);
  const i = flow.indexOf(status);
  return i >= 0 && i < flow.length - 1 ? flow[i + 1] : null;
}

export function carrierFor(platform: MockPlatform, region: string): string {
  if (platform === "shopee") return region === "SG" ? "SPX Express (SG)" : region === "PH" ? "SPX Express (PH)" : "SPX Express (MY)";
  if (region === "TH") return "Flash Express";
  if (region === "VN") return "J&T Express (VN)";
  return "J&T Express";
}

const HUB: Record<string, string> = { MY: "Shah Alam Hub", SG: "Jurong Sort Centre", TH: "Bang Na Hub, Bangkok", VN: "Kho Tân Bình, TP. Hồ Chí Minh", PH: "Pasig Hub" };

type OrderLike = {
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  packageNumber: string | null;
  tracking: MockTrackingEvent[];
  deadlines: Record<string, number>;
  times: Record<string, number>;
  logisticsStatus: string | null;
};

export type OrderPatch = Partial<OrderLike> & { status: string };

function paidDeadlines(platform: MockPlatform, paid: number, created: number): Record<string, number> {
  if (platform === "shopee") return { ship_by_date: paid + SHOPEE_DAYS_TO_SHIP * 86400, days_to_ship: SHOPEE_DAYS_TO_SHIP };
  return {
    rts_sla_time: paid + 2 * 86400,
    tts_sla_time: paid + 3 * 86400,
    shipping_due_time: paid + 3 * 86400,
    collection_due_time: paid + 4 * 86400,
    delivery_due_time: paid + 10 * 86400,
    delivery_sla_time: paid + 10 * 86400,
    cancel_order_sla_time: created + 86400,
  };
}

/** 把订单推进到 to，补齐物流单号、轨迹、截止字段与时间点。at 为发生时刻（秒）。 */
export function applyOrderStatus(platform: MockPlatform, region: string, order: OrderLike, to: string, at: number, created: number): OrderPatch {
  const times = { ...order.times };
  let deadlines = { ...order.deadlines };
  const tracking = [...order.tracking];
  let carrier = order.carrier;
  let trackingNumber = order.trackingNumber;
  let packageNumber = order.packageNumber;
  const carrierName = carrierFor(platform, region);
  const ev = (time: number, description: string, status: string) => tracking.push({ time, description, status });

  const flow = flowOf(platform);
  const toIdx = flow.indexOf(to);
  const reached = (s: string) => toIdx >= flow.indexOf(s);

  if (to !== "UNPAID" && to !== "CANCELLED" && to !== "IN_CANCEL" && !times.paid) {
    times.paid = at;
    deadlines = { ...deadlines, ...paidDeadlines(platform, at, created) };
  }
  if (!packageNumber && times.paid) packageNumber = platform === "shopee" ? shopeePackageNumber() : tiktokPackageId();

  const arranged = platform === "shopee" ? "PROCESSED" : "AWAITING_COLLECTION";
  const shipped = platform === "shopee" ? "SHIPPED" : "IN_TRANSIT";
  const delivered = platform === "shopee" ? "TO_CONFIRM_RECEIVE" : "DELIVERED";

  if (toIdx >= 0 && reached(arranged) && !trackingNumber) {
    carrier = carrierName;
    trackingNumber = platform === "shopee" ? shopeeTrackingNo(region) : tiktokTrackingNo();
    times.rts = at;
    ev(at, "Seller has arranged shipment. Waiting for courier to pick up the parcel.", "ORDER_CREATED");
  }
  if (toIdx >= 0 && reached(shipped) && !times.collection) {
    times.collection = at;
    ev(at, `Parcel has been picked up by ${carrierName}.`, "PICKED_UP");
    ev(at + 60, `Parcel has arrived at ${HUB[region] ?? "sorting centre"}.`, "DELIVERY_PENDING");
  }
  if (toIdx >= 0 && reached(delivered) && !times.delivery) {
    times.delivery = at;
    ev(at, "Parcel has been delivered to the recipient.", "DELIVERED");
  }
  if (to === "RETRY_SHIP") {
    ev(at, "Courier failed to pick up the parcel. Pickup will be retried.", "PICKUP_RETRY");
  }
  if (to === "CANCELLED") times.cancel = at;

  return { status: to, carrier, trackingNumber, packageNumber, tracking, deadlines, times, logisticsStatus: to === "RETRY_SHIP" ? "LOGISTICS_PICKUP_RETRY" : order.logisticsStatus };
}

/** 一次物流异常：发货前为揽收失败，发货后为派送失败。返回新增轨迹与 Shopee 包裹状态。 */
export function logisticsException(order: OrderLike, at: number): { tracking: MockTrackingEvent[]; logisticsStatus: string; fulfillmentStatus: string } {
  const shipped = !!order.times.collection;
  const fulfillmentStatus = shipped ? "LOGISTICS_DELIVERY_FAILED" : "LOGISTICS_PICKUP_FAILED";
  const description = shipped ? "Delivery attempt failed: recipient not available. Parcel is being returned to hub." : "Courier failed to pick up the parcel from seller.";
  return {
    tracking: [...order.tracking, { time: at, description, status: shipped ? "FAILED_DELIVERED" : "FAILED_PICKED_UP" }],
    logisticsStatus: fulfillmentStatus,
    fulfillmentStatus,
  };
}

/** Shopee 包裹 logistics_status（订单级派生，异常时用覆盖值） */
export function shopeeLogisticsStatus(status: string, override: string | null, prevStatus: string | null): string {
  if (override) return override;
  const s = status === "IN_CANCEL" ? prevStatus ?? "READY_TO_SHIP" : status;
  switch (s) {
    case "UNPAID":
    case "PENDING":
      return "LOGISTICS_NOT_START";
    case "READY_TO_SHIP":
      return "LOGISTICS_READY";
    case "PROCESSED":
      return "LOGISTICS_REQUEST_CREATED";
    case "RETRY_SHIP":
      return "LOGISTICS_PICKUP_RETRY";
    case "SHIPPED":
      return "LOGISTICS_PICKUP_DONE";
    case "CANCELLED":
      return "LOGISTICS_REQUEST_CANCELED";
    default:
      return "LOGISTICS_DELIVERY_DONE";
  }
}

export function orderTotals(items: MockOrderItem[], shippingFee: string): { subtotal: string; total: string } {
  const decimals = items.some((i) => i.price.includes(".")) || shippingFee.includes(".") ? 2 : 0;
  const sub = items.reduce((s, i) => s + Number(i.price) * i.qty, 0);
  return { subtotal: sub.toFixed(decimals), total: (sub + Number(shippingFee)).toFixed(decimals) };
}

/** 按状态链回放：从 UNPAID 推进到链上的 target，生成种子订单的历史轨迹（时间均匀分布在 created..now）。 */
export function replayToStatus(platform: MockPlatform, region: string, target: string, created: number, now: number): OrderPatch {
  let order: OrderLike = { status: "UNPAID", carrier: null, trackingNumber: null, packageNumber: null, tracking: [], deadlines: {}, times: {}, logisticsStatus: null };
  const flow = flowOf(platform);
  const steps = flow.slice(1, Math.max(flow.indexOf(target), 0) + 1);
  const span = Math.max(60, now - created);
  steps.forEach((s, i) => {
    const at = i === 0 ? created + 120 : created + Math.floor((span * i) / steps.length);
    order = { ...order, ...applyOrderStatus(platform, region, order, s, at, created) };
  });
  return { ...order, status: target };
}
