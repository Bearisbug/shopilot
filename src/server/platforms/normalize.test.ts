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
  it("图片、带文字的图片存地址与尺寸", () => {
    const content = { url: "https://cf.shopee.sg/file/abc", thumb_url: "abc_tn", thumb_width: 400, thumb_height: 711 };
    expect(shopee("image", content, false)).toMatchObject({ type: "image", text: null, payload: { url: "https://cf.shopee.sg/file/abc", width: 400, height: 711 } });
    expect(shopee("image_with_text", { ...content, text: "this one" }, false)).toMatchObject({ type: "image", text: "this one", payload: { url: "https://cf.shopee.sg/file/abc", width: 400, height: 711 } });
  });
  it("贴纸存地址与尺寸；只有图片 ID 时拼成 CDN 地址，取不到的字段不存", () => {
    expect(shopee("sticker", { url: "https://cf.shopee.sg/file/st1", thumb_width: 160, thumb_height: 160 }, false).payload).toEqual({ url: "https://cf.shopee.sg/file/st1", width: 160, height: 160 });
    expect(shopee("sticker", { thumb_url: "sg-11134201-st2", thumb_width: 120, thumb_height: 120 }, false)).toMatchObject({
      type: "sticker",
      payload: { url: "https://down-my.img.susercontent.com/file/sg-11134201-st2", width: 120, height: 120 },
    });
    expect(JSON.parse(JSON.stringify(shopee("sticker", { sticker_id: "9" }, false).payload))).toEqual({});
  });
  it("视频存地址、封面（图片 ID 拼成 CDN 地址）、尺寸与时长", () => {
    const m = shopee("video", { video_url: "https://down-ws-sg.vod.susercontent.com/v.mp4", thumb_url: "vn-11134231-cover", thumb_width: 720, thumb_height: 1280, duration_seconds: 15 }, false);
    expect(m).toMatchObject({
      type: "video",
      payload: { url: "https://down-ws-sg.vod.susercontent.com/v.mp4", cover: "https://down-my.img.susercontent.com/file/vn-11134231-cover", width: 720, height: 1280, duration: 15 },
    });
    expect(shopee("video", { video_url: "https://v/x.mp4", thumb_url: "https://cdn/x.jpg" }, false).payload.cover).toBe("https://cdn/x.jpg");
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
  it("图片存地址与尺寸，表情归为贴纸并存地址与尺寸", () => {
    expect(tiktok("IMAGE", "BUYER", { url: "https://p16/i.jpeg", width: 1080, height: 1920 })).toMatchObject({ type: "image", payload: { url: "https://p16/i.jpeg", width: 1080, height: 1920 } });
    expect(tiktok("EMOTICONS", "BUYER", { url: "https://p16/e.png", width: 200, height: 180 })).toMatchObject({ type: "sticker", payload: { url: "https://p16/e.png", width: 200, height: 180 } });
  });
  it("视频存地址、封面、尺寸、时长与过期时间", () => {
    const m = tiktok("VIDEO", "BUYER", { url: "https://v16/v.mp4?x-expires=1", cover: "https://p16/c.jpeg", width: 720, height: 1280, duration: "12.5", expire_time: "1681980481", vid: "v1" });
    expect(m).toMatchObject({ type: "video", payload: { url: "https://v16/v.mp4?x-expires=1", cover: "https://p16/c.jpeg", width: 720, height: 1280, duration: "12.5", expireTime: 1681980481 } });
    expect(tiktok("VIDEO", "BUYER", { url: "https://v16/v.mp4" }).payload.expireTime).toBeUndefined();
  });
});
