// 消息归一化：按 2026-10-13 用 OBSBOT 现网 token 只读拉到的真实消息形状（去掉了内容）
import { describe, expect, it } from "vitest";
import { normalizeShopeeMessage } from "./shopee";
import { normalizeTiktokMessage } from "./tiktok";

const SHOP = "1681280290";
const shopee = (message_type: string, content: Record<string, unknown>, fromShop: boolean) =>
  normalizeShopeeMessage(
    { message_id: "m1", conversation_id: "c1", message_type, content, from_shop_id: fromShop ? Number(SHOP) : 0, from_id: fromShop ? 1 : 2, to_id: fromShop ? 2 : 1, created_timestamp: 1791800000 },
    SHOP,
  );

describe("Shopee 消息归一化", () => {
  it("系统通知与打包消息不算买家发言、也不算卖家人工回复", () => {
    for (const [t, fromShop] of [["notification", true], ["notification", false], ["bundle_message", false], ["chatbot_msg", false], ["live_agent_transfer", true]] as const) {
      const m = shopee(t, { notification_type: 1 }, fromShop);
      expect(m.senderRole, t).toBe("system");
      expect(m.fromBuyer, t).toBe(false);
      expect(m.payload.platformType).toBe(t);
    }
  });
  it("faq_liveagent 是买家点的 FAQ 问题，按文字处理", () => {
    const m = shopee("faq_liveagent", { text: "How long is shipping?", question_id: 9 }, false);
    expect(m).toMatchObject({ type: "text", text: "How long is shipping?", senderRole: "buyer", fromBuyer: true });
  });
  it("拉取的文字消息也带平台译文", () => {
    const m = shopee("text", { text: "Bila sampai?", translation: { text: "什么时候到？", source: "mt" } }, false);
    expect(m.translation).toBe("什么时候到？");
  });
  it("券、商品规格卡、物流卡、退货卡映射到对应卡片", () => {
    expect(shopee("voucher", { voucher_id: 77, voucher_code: "ABC" }, true)).toMatchObject({ type: "coupon_card", payload: { couponId: "77" } });
    expect(shopee("variation_card", { product_id: 55 }, false)).toMatchObject({ type: "product_card", payload: { productId: "55" } });
    expect(shopee("logistics_card", {}, true).type).toBe("logistics_card");
    expect(shopee("return_refund_card", {}, false).type).toBe("return_card");
    expect(shopee("image_with_text", { url: "https://x/y.jpg", text: "see this" }, false)).toMatchObject({ type: "image", text: "see this" });
  });
});

const tiktok = (type: string, role: string, content: Record<string, unknown>) =>
  normalizeTiktokMessage({ id: "t1", conversation_id: "c1", type, content: JSON.stringify(content), sender: { role, im_user_id: "u1", nickname: "n" }, create_time: 1791800000 });

describe("TikTok 消息归一化", () => {
  it("通知、分配客服、OTHER 不管发送方是谁都是系统事件", () => {
    for (const [t, role] of [["NOTIFICATION", "CUSTOMER_SERVICE"], ["OTHER", "SHOP"], ["ALLOCATED_SERVICE", "SYSTEM"], ["BUYER_ENTER_FROM_TRANSFER", "SYSTEM"]] as const) {
      const m = tiktok(t, role, { content: "x" });
      expect(m.senderRole, `${t}/${role}`).toBe("system");
      expect(m.fromBuyer).toBe(false);
    }
  });
  it("买家文字、平台机器人文字保持原角色", () => {
    expect(tiktok("TEXT", "BUYER", { content: "hi" })).toMatchObject({ senderRole: "buyer", fromBuyer: true, text: "hi" });
    expect(tiktok("TEXT", "ROBOT", { content: "auto" })).toMatchObject({ senderRole: "platform_bot", fromBuyer: false });
  });
});
