import { describe, expect, it } from "vitest";
import { platformNoticeText } from "./platform-notice";

describe("平台系统提示的中文显示", () => {
  it("对照表里的提示（线上原文）", () => {
    const cases: Array<[string, string]> = [
      ["[Other] Please check this message in seller center of TikTok shop.", "一条开放接口取不到的消息，请到 TikTok 卖家中心查看"],
      ["The chat has been assigned to Customer Serviceyxy", "对话已分配给 Customer Serviceyxy"],
      ["Chat ended by customer service agent.", "客服已结束对话"],
      ["The chat timed out due to customer inactivity", "买家长时间未回复，对话超时结束"],
      ["The chat timed out due to customer service agent inactivity", "客服长时间未回复，对话超时结束"],
      ["OBSBOT Harry started the chat", "OBSBOT Harry 开始接待"],
      ["Yian transferred the conversation from OBSBOT-Yuiki to Yian", "Yian 把对话从 OBSBOT-Yuiki 转给 Yian"],
      ["Customer Service616 transferred the chat to wsy", "Customer Service616 把对话转给 wsy"],
      ["Customer Service3652 assigned the chat to Customer Service1173", "Customer Service3652 把对话分配给 Customer Service1173"],
      ["The customer has requested manual customer service. Please reply as soon as possible.", "买家要求转人工客服，请尽快回复"],
      [
        "There is no proper answer in the FAQ database, please reply manually. You can also add corresponding content in the FAQs for further bot reception.",
        "FAQ 里没有合适的答案，请人工回复",
      ],
      ["Because no proper answer was found, the chat assistant has stopped to reply to, please reply manually in time.", "没找到合适的答案，TikTok 聊天助手已停止回复，请人工回复"],
    ];
    for (const [raw, zh] of cases) expect(platformNoticeText(raw)).toBe(zh);
  });

  it("首尾空白不影响匹配", () => {
    expect(platformNoticeText("  Chat ended by customer service agent.\n")).toBe("客服已结束对话");
  });

  it("表外的提示、空文本、Shopilot 自己写的中文系统事件返回 null", () => {
    expect(platformNoticeText("Your chat was rated 5 stars")).toBeNull();
    expect(platformNoticeText("")).toBeNull();
    expect(platformNoticeText(null)).toBeNull();
    expect(platformNoticeText("平台侧已有人处理")).toBeNull();
  });
});
