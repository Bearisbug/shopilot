// 飞书卡片构造：标题与颜色、按钮链接、中文标签、空值不显示、截断与 markdown 转义、图片与占位。
import { describe, expect, it } from "vitest";
import { conversationCard, escapeMd, platformText, testCard, truncate, waitedText, type ConversationCardInput } from "./card";

type El = { tag: string; content?: string; img_key?: string; columns?: Array<{ elements: Array<{ text: { content: string }; type: string; behaviors: Array<{ default_url: string }> }> }> };
const elements = (card: Record<string, unknown>) => (card.body as { elements: El[] }).elements;
const texts = (card: Record<string, unknown>) => elements(card).filter((e) => e.tag === "markdown").map((e) => e.content ?? "").join("\n");

const base: ConversationCardInput = {
  kind: "unclaimed",
  shopName: "OBSBOT 越南店",
  platform: "shopee",
  market: "VN",
  buyerName: "Nguyen Van A",
  waitedSec: 12 * 60 + 5,
  handoffReason: "human_request",
  remindMinutes: null,
  summary: "买家问 Tiny 2 能否连 Mac，已发来 2 张设备照片。",
  lines: [
    { role: "买家", time: "10:21", text: "Can it work with Mac?", translation: "能连 Mac 吗？", media: null },
    { role: "买家", time: "10:22", text: null, translation: null, media: { kind: "image", imageKey: "img_v3_abc" } },
    { role: "买家", time: "10:23", text: null, translation: null, media: { kind: "image", imageKey: null } },
    { role: "AI", time: "10:23", text: null, translation: null, media: { kind: "label", text: "[视频 0:12]", link: true } },
  ],
  claimUrl: "https://shopilot.live/wb/c1?claim=1&m=m1",
  openUrl: "https://shopilot.live/wb/c1?m=m1",
};

describe("conversationCard", () => {
  it("待认领卡：JSON 2.0、橙色标题「待认领 · 店铺名」、认领与打开会话两个按钮", () => {
    const card = conversationCard(base);
    expect(card.schema).toBe("2.0");
    expect(card.header).toEqual({ template: "orange", title: { tag: "plain_text", content: "待认领 · OBSBOT 越南店" } });
    const row = elements(card).find((e) => e.tag === "column_set")!;
    const buttons = row.columns!.map((c) => c.elements[0]);
    expect(buttons.map((b) => [b.text.content, b.type, b.behaviors[0].default_url])).toEqual([
      ["认领", "primary", "https://shopilot.live/wb/c1?claim=1&m=m1"],
      ["打开会话", "default", "https://shopilot.live/wb/c1?m=m1"],
    ]);
  });

  it("超时卡：红色标题「待认领超时 · 店铺名」，写出提醒时长", () => {
    const card = conversationCard({ ...base, kind: "overdue", remindMinutes: 10 });
    expect((card.header as { template: string; title: { content: string } }).template).toBe("red");
    expect((card.header as { title: { content: string } }).title.content).toBe("待认领超时 · OBSBOT 越南店");
    expect(texts(card)).toContain("待认领超过 10 分钟");
  });

  it("AI 总结在最上面；平台与站点、已等、转人工原因都是中文", () => {
    const card = conversationCard(base);
    expect(elements(card)[0].content).toBe("**AI 总结**　买家问 Tiny 2 能否连 Mac，已发来 2 张设备照片。");
    const all = texts(card);
    expect(all).toContain("**平台** Shopee · 越南");
    expect(all).toContain("**已等** 12 分钟");
    expect(all).toContain("**转人工原因** 买家要求人工");
    expect(all).not.toMatch(/human_request|shopee|VN\b/);
  });

  it("没有值的字段不显示：无总结、无等待、店铺未开 AI 与影子模式不写转人工原因、未知站点只写平台", () => {
    for (const reason of ["shop_off", "shadow", null]) {
      const card = conversationCard({ ...base, summary: null, waitedSec: null, handoffReason: reason, market: "OTHER", lines: [] });
      const all = texts(card);
      expect(all).not.toContain("AI 总结");
      expect(all).not.toContain("已等");
      expect(all).not.toContain("转人工原因");
      expect(all).not.toContain("最近对话");
      expect(all).toContain("**平台** Shopee　");
    }
  });

  it("最近对话：角色、时间、译文；有 image_key 的图片直接显示，没有的显示「[图片]」与查看链接；视频带链接", () => {
    const card = conversationCard(base);
    const els = elements(card);
    const all = texts(card);
    expect(all).toContain("**买家** <font color='grey'>10:21</font>　Can it work with Mac?\n<font color='grey'>译文：能连 Mac 吗？</font>");
    expect(els.filter((e) => e.tag === "img").map((e) => e.img_key)).toEqual(["img_v3_abc"]);
    expect(all).toContain(`&#91;图片&#93; [在 Shopilot 查看](${base.openUrl})`);
    expect(all).toContain(`**AI** <font color='grey'>10:23</font>　&#91;视频 0:12&#93; [在 Shopilot 查看](${base.openUrl})`);
    expect(all).not.toContain("[system]");
  });

  it("买家写的内容转义 markdown 并截断", () => {
    const evil = "**加粗** <at id=all></at> [链接](https://x.y) ~删除~ #标题 _斜_ `代码`";
    const card = conversationCard({ ...base, buyerName: "*Bob*", lines: [{ role: "买家", time: null, text: evil + "长".repeat(300), translation: null, media: null }] });
    const all = texts(card);
    expect(all).toContain("**买家** &#42;Bob&#42;");
    expect(all).not.toContain("<at id=all>");
    expect(all).not.toContain("**加粗**");
    expect(all).not.toContain("[链接](https://x.y)");
    const line = all.split("\n").find((l) => l.startsWith("**买家**　"))!;
    expect(line.endsWith("…")).toBe(true);
  });
});

describe("工具函数", () => {
  it("escapeMd 把 markdown 特殊字符换成实体", () => {
    expect(escapeMd("a*b_c~d<e>f#g[h]i`j|k&l")).toBe("a&#42;b&#95;c&sim;d&#60;e&#62;f&#35;g&#91;h&#93;i&#96;j&#124;k&#38;l");
  });
  it("truncate 按字符截断、不切开 emoji", () => {
    expect(truncate("😀😀😀😀", 3)).toBe("😀😀…");
    expect(truncate("  多个   空白 ", 10)).toBe("多个 空白");
  });
  it("waitedText", () => {
    expect(waitedText(30)).toBe("不到 1 分钟");
    expect(waitedText(65 * 60)).toBe("1 小时 5 分钟");
    expect(waitedText(26 * 3600)).toBe("1 天 2 小时");
  });
  it("platformText 用中文站点名", () => {
    expect(platformText("tiktok", "TH")).toBe("TikTok Shop · 泰国");
    expect(platformText("shopee", "OTHER")).toBe("Shopee");
  });
  it("测试卡：蓝色，带图片或写明图片上传失败原因", () => {
    const ok = testCard({ merchantName: "Demo", targetName: "客服群", settingsUrl: "https://x/settings/notify", imageKey: "img_1", imageError: null });
    expect((ok.header as { template: string }).template).toBe("blue");
    expect(elements(ok).some((e) => e.tag === "img" && e.img_key === "img_1")).toBe(true);
    const bad = testCard({ merchantName: "Demo", targetName: "客服群", settingsUrl: "https://x/settings/notify", imageKey: null, imageError: "缺少 im:resource 权限" });
    expect(texts(bad)).toContain("图片上传没有成功：缺少 im:resource 权限");
  });
});
