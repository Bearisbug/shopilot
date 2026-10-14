import { describe, expect, it } from "vitest";
import { mapAfterSale } from "./platform";

const due = new Date("2026-10-14T10:00:00Z");
const a = (platform: "shopee" | "tiktok", kind: "return" | "cancel", platformStatus: string, raw: Record<string, unknown> = {}) => ({ platform, kind, platformStatus, sellerDueAt: due, raw });

describe("平台售后 → 工单状态（§11.4 映射表）", () => {
  it("TikTok 退货", () => {
    expect(mapAfterSale(a("tiktok", "return", "RETURN_OR_REFUND_REQUEST_PENDING"))).toEqual({ status: "open", phase: "待审核", dueAt: due });
    expect(mapAfterSale(a("tiktok", "return", "AWAITING_BUYER_SHIP"))).toMatchObject({ status: "waiting", waitingOn: "buyer", dueAt: null });
    expect(mapAfterSale(a("tiktok", "return", "BUYER_SHIPPED_ITEM"))).toMatchObject({ status: "in_progress", phase: "待验货" });
    expect(mapAfterSale(a("tiktok", "return", "REJECT_RECEIVE_PACKAGE"))).toMatchObject({ status: "waiting", waitingOn: "platform" });
    expect(mapAfterSale(a("tiktok", "return", "BUYER_SHIPPED_ITEM", { arbitration_status: "IN_PROGRESS" })).status).toBe("in_progress");
    expect(mapAfterSale(a("tiktok", "return", "RETURN_OR_REFUND_REQUEST_SUCCESS"))).toMatchObject({ status: "waiting", waitingOn: "platform", phase: "退款中" });
    expect(mapAfterSale(a("tiktok", "return", "RETURN_OR_REFUND_REQUEST_COMPLETE"))).toMatchObject({ status: "resolved", phase: "退款完成" });
  });
  it("TikTok 取消：两种拼写都算已解决", () => {
    expect(mapAfterSale(a("tiktok", "cancel", "CANCELLATION_REQUEST_PENDING")).status).toBe("open");
    expect(mapAfterSale(a("tiktok", "cancel", "CANCELLATION_REQUEST_CANCEL")).status).toBe("resolved");
    expect(mapAfterSale(a("tiktok", "cancel", "CANCELLATION_REQUEST_CANCELLED")).status).toBe("resolved");
  });
  it("Shopee 退货与取消申请", () => {
    expect(mapAfterSale(a("shopee", "return", "REQUESTED")).status).toBe("open");
    expect(mapAfterSale(a("shopee", "return", "PROCESSING"))).toMatchObject({ status: "waiting", waitingOn: "buyer" });
    expect(mapAfterSale(a("shopee", "return", "JUDGING"))).toMatchObject({ status: "waiting", waitingOn: "platform" });
    expect(mapAfterSale(a("shopee", "return", "ACCEPTED"))).toMatchObject({ status: "resolved", phase: "已退款" });
    expect(mapAfterSale(a("shopee", "cancel", "IN_CANCEL")).status).toBe("open");
    expect(mapAfterSale(a("shopee", "cancel", "CANCELLED"))).toMatchObject({ status: "resolved", phase: "已取消" });
    expect(mapAfterSale(a("shopee", "cancel", "READY_TO_SHIP"))).toMatchObject({ status: "resolved", phase: "已拒绝" });
  });
});
