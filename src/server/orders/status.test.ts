import { describe, expect, it } from "vitest";
import { afterSaleOpen, statusGroup } from "./status";

describe("订单状态组（§9.4）", () => {
  it("Shopee 平台状态", () => {
    expect(statusGroup("shopee", "READY_TO_SHIP")).toBe("to_ship");
    expect(statusGroup("shopee", "TO_CONFIRM_RECEIVE")).toBe("delivered");
    expect(statusGroup("shopee", "IN_CANCEL")).toBe("in_cancel");
    expect(statusGroup("shopee", "TO_RETURN")).toBe("returning");
  });
  it("TikTok 买家申请取消与退货中", () => {
    expect(statusGroup("tiktok", "AWAITING_SHIPMENT", { buyerRequestedCancel: true })).toBe("in_cancel");
    expect(statusGroup("tiktok", "DELIVERED", { openReturn: true })).toBe("returning");
    expect(statusGroup("tiktok", "CANCELLED", { openReturn: true })).toBe("cancelled");
  });
  it("售后是否未终结", () => {
    expect(afterSaleOpen("tiktok", "return", "AWAITING_BUYER_SHIP")).toBe(true);
    expect(afterSaleOpen("tiktok", "return", "RETURN_OR_REFUND_REQUEST_COMPLETE")).toBe(false);
    expect(afterSaleOpen("shopee", "return", "JUDGING")).toBe(true);
    expect(afterSaleOpen("shopee", "return", "CLOSED")).toBe(false);
    expect(afterSaleOpen("shopee", "cancel", "IN_CANCEL")).toBe(true);
  });
});
