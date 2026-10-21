// 飞书卡片构造（卡片 JSON 2.0）：待认领卡橙色、待认领超时卡红色、测试卡蓝色。只放有值的字段，标签全中文；
// 买家、客服写的内容一律转义，不让其中的 * ~ < > 等字符被当成 markdown。
import type { FeishuCard } from "./client";

export type CardKind = "unclaimed" | "overdue";

export const PLATFORM_LABEL: Record<string, string> = { shopee: "Shopee", tiktok: "TikTok Shop" };
export const MARKET_LABEL: Record<string, string> = {
  MY: "马来西亚",
  TH: "泰国",
  VN: "越南",
  PH: "菲律宾",
  SG: "新加坡",
  ID: "印度尼西亚",
  TW: "中国台湾",
  BR: "巴西",
};

/** 转人工原因的中文；不是转人工（店铺未开 AI、影子模式直接进待认领）不显示 */
const HANDOFF_TEXT: Record<string, string> = {
  keyword: "命中转人工关键词",
  low_confidence: "AI 置信度低",
  non_text: "非文本消息",
  model_error: "模型出错",
  timeout: "模型超时",
  send_failed: "AI 回复发送失败",
  human_request: "买家要求人工",
  policy: "超出 AI 可处理范围",
  quota: "出稿用量已满",
  manual: "人工转交",
  card: "经验卡要求转人工",
};

/** 最近对话里的一条：role 是「买家」「客服」「AI」；text 已是要显示的原文，translation 是中文译文 */
export type CardLine = {
  role: "买家" | "客服" | "AI" | "Shopee AI";
  time: string | null;
  text: string | null;
  translation: string | null;
  /** 媒体：image 有 imageKey 时卡片里直接显示缩略图，否则显示占位文字；label 是「[视频 0:12]」「[商品] 名称」这类占位 */
  media: { kind: "image"; imageKey: string | null } | { kind: "label"; text: string; link: boolean } | null;
};

export type ConversationCardInput = {
  kind: CardKind;
  shopName: string;
  platform: string;
  market: string;
  buyerName: string;
  waitedSec: number | null;
  handoffReason: string | null;
  /** 超时卡：商户设定的提醒分钟数 */
  remindMinutes: number | null;
  summary: string | null;
  lines: CardLine[];
  claimUrl: string;
  openUrl: string;
};

const ESCAPES: Record<string, string> = {
  "&": "&#38;",
  "<": "&#60;",
  ">": "&#62;",
  "*": "&#42;",
  "~": "&sim;",
  "#": "&#35;",
  _: "&#95;",
  "`": "&#96;",
  "[": "&#91;",
  "]": "&#93;",
  "|": "&#124;",
};

/** 卡片 markdown 转义：特殊字符换成 HTML 实体（飞书卡片 JSON 2.0 富文本组件的转义规则） */
export function escapeMd(s: string): string {
  return s.replace(/[&<>*~#_`[\]|]/g, (ch) => ESCAPES[ch]);
}

/** 按字符截断（不切开代理对），超出时末尾加省略号 */
export function truncate(s: string, max: number): string {
  const chars = Array.from(s.replace(/\s+/g, " ").trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
}

export function platformText(platform: string, market: string): string {
  const p = PLATFORM_LABEL[platform] ?? "";
  const m = MARKET_LABEL[market] ?? "";
  return [p, m].filter(Boolean).join(" · ");
}

/** 已等时长：不到 1 分钟、N 分钟、N 小时 M 分钟、N 天 M 小时 */
export function waitedText(sec: number): string {
  if (sec < 60) return "不到 1 分钟";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} 小时 ${min % 60} 分钟` : `${h} 小时`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} 天 ${h % 24} 小时` : `${d} 天`;
}

const md = (content: string) => ({ tag: "markdown", content });
const grey = (s: string) => `<font color='grey'>${s}</font>`;

function button(label: string, type: "primary" | "default", url: string) {
  return { tag: "button", text: { tag: "plain_text", content: label }, type, behaviors: [{ type: "open_url", default_url: url }] };
}

function card(title: string, template: string, summary: string, elements: unknown[]): FeishuCard {
  return {
    schema: "2.0",
    config: { update_multi: true, summary: { content: truncate(summary, 60) } },
    header: { template, title: { tag: "plain_text", content: truncate(title, 60) } },
    body: { elements },
  };
}

function lineElements(line: CardLine, openUrl: string): unknown[] {
  const head = `**${line.role}**${line.time ? ` ${grey(line.time)}` : ""}`;
  const parts: string[] = [];
  if (line.media?.kind === "label") parts.push(escapeMd(line.media.text) + (line.media.link ? ` [在 Shopilot 查看](${openUrl})` : ""));
  if (line.media?.kind === "image" && !line.media.imageKey) parts.push(`${escapeMd("[图片]")} [在 Shopilot 查看](${openUrl})`);
  if (line.text) parts.push(escapeMd(truncate(line.text, 200)));
  const out: unknown[] = [];
  let content = `${head}　${parts.join(" ") || (line.media?.kind === "image" ? escapeMd("[图片]") : "")}`;
  if (line.translation) content += `\n${grey(`译文：${escapeMd(truncate(line.translation, 200))}`)}`;
  out.push(md(content));
  if (line.media?.kind === "image" && line.media.imageKey) {
    out.push({ tag: "img", img_key: line.media.imageKey, alt: { tag: "plain_text", content: `${line.role}发来的图片` }, preview: true, scale_type: "crop_center", size: "160px 160px", corner_radius: "8px" });
  }
  return out;
}

/** 待认领卡 / 待认领超时卡 */
export function conversationCard(input: ConversationCardInput): FeishuCard {
  const overdue = input.kind === "overdue";
  const shop = truncate(input.shopName, 30);
  const title = `${overdue ? "待认领超时" : "待认领"} · ${shop}`;
  const elements: unknown[] = [];
  if (input.summary) elements.push(md(`**AI 总结**　${escapeMd(truncate(input.summary, 120))}`));

  const facts: string[] = [];
  const where = platformText(input.platform, input.market);
  if (where) facts.push(`**平台** ${where}`);
  facts.push(`**买家** ${escapeMd(truncate(input.buyerName, 40))}`);
  if (input.waitedSec !== null) facts.push(`**已等** ${waitedText(input.waitedSec)}`);
  const reason = input.handoffReason ? HANDOFF_TEXT[input.handoffReason] : undefined;
  let meta = facts.join("　");
  if (reason) meta += `\n**转人工原因** ${reason}`;
  if (overdue && input.remindMinutes) meta += `\n**提醒时长** 待认领超过 ${input.remindMinutes} 分钟`;
  elements.push(md(meta));

  if (input.lines.length) {
    elements.push({ tag: "hr" });
    elements.push(md("**最近对话**"));
    for (const line of input.lines) elements.push(...lineElements(line, input.openUrl));
  }
  elements.push({ tag: "hr" });
  elements.push({
    tag: "column_set",
    flex_mode: "none",
    horizontal_spacing: "8px",
    columns: [
      { tag: "column", width: "auto", elements: [button("认领", "primary", input.claimUrl)] },
      { tag: "column", width: "auto", elements: [button("打开会话", "default", input.openUrl)] },
    ],
  });
  elements.push(md(grey(overdue ? "Shopilot · 待认领超时提醒，同一段会话只推一次" : "Shopilot · 会话进入待认领，同一段会话只推一次，处理人取消认领后再推")));
  return card(title, overdue ? "red" : "orange", `${title} · ${truncate(input.buyerName, 20)}`, elements);
}

export type TicketCardInput = {
  number: string;
  /** 「物流异常 - 物流轨迹 72 小时未更新」 */
  anomaly: string;
  statusText: string;
  /** 平台状态的中文说法 */
  platformStatus: string | null;
  shopName: string;
  platform: string;
  market: string;
  buyerName: string | null;
  externalOrderId: string | null;
  items: Array<{ name: string; sku?: string; qty: number }>;
  /** 截止时间，已按商户时区格式化；剩余时长另给 */
  dueText: string | null;
  remainingSec: number | null;
  assigneeName: string | null;
  note: string | null;
  forwardedBy: string;
  ticketUrl: string;
  sellerUrl: string | null;
};

/** 工单详情页手动转发的工单卡（浅蓝）：订单号、异常与说明、订单内容、截止与备注 */
export function ticketCard(input: TicketCardInput): FeishuCard {
  const title = `工单 ${input.number} · ${input.anomaly}`;
  const elements: unknown[] = [md(`**异常** ${escapeMd(truncate(input.anomaly, 120))}`)];

  const facts: string[] = [];
  if (input.externalOrderId) facts.push(`**订单号** ${escapeMd(input.externalOrderId)}`);
  const where = platformText(input.platform, input.market);
  facts.push(`**店铺** ${escapeMd(truncate(input.shopName, 30))}${where ? `　${grey(where)}` : ""}`);
  if (input.buyerName) facts.push(`**买家** ${escapeMd(truncate(input.buyerName, 40))}`);
  facts.push([`**状态** ${escapeMd(input.statusText)}`, input.platformStatus ? `**平台状态** ${escapeMd(input.platformStatus)}` : null].filter(Boolean).join("　"));
  if (input.dueText) {
    const left = input.remainingSec === null ? "" : input.remainingSec < 0 ? `，已超时 ${waitedText(-input.remainingSec)}` : `，剩 ${waitedText(input.remainingSec)}`;
    facts.push(`**截止** ${escapeMd(input.dueText)}${left}`);
  }
  facts.push(`**负责人** ${escapeMd(input.assigneeName ?? "未指派")}`);
  elements.push(md(facts.join("\n")));

  if (input.items.length) {
    elements.push({ tag: "hr" });
    const lines = input.items.slice(0, 10).map((i) => `· ${escapeMd(truncate(i.name, 80))}${i.sku ? `　${grey(`规格 ${escapeMd(truncate(i.sku, 40))}`)}` : ""}　×${i.qty}`);
    if (input.items.length > 10) lines.push(grey(`另有 ${input.items.length - 10} 件商品，到 Shopilot 查看`));
    elements.push(md(`**订单内容**\n${lines.join("\n")}`));
  }
  if (input.note) elements.push(md(`**备注** ${escapeMd(truncate(input.note, 200))}`));

  elements.push({ tag: "hr" });
  const columns = [{ tag: "column", width: "auto", elements: [button("在 Shopilot 打开", "primary", input.ticketUrl)] }];
  if (input.sellerUrl) columns.push({ tag: "column", width: "auto", elements: [button("打开卖家后台订单", "default", input.sellerUrl)] });
  elements.push({ tag: "column_set", flex_mode: "none", horizontal_spacing: "8px", columns });
  elements.push(md(grey(`Shopilot · ${escapeMd(truncate(input.forwardedBy, 20))} 从工单详情页转发`)));
  return card(title, "wathet", `${title} · ${truncate(input.shopName, 20)}`, elements);
}

/** 设置页「发测试卡片」：说明这个群之后会收到什么；带一张图片时同时验证图片上传 */
export function testCard(input: { merchantName: string; targetName: string; settingsUrl: string; imageKey: string | null; imageError: string | null }): FeishuCard {
  const elements: unknown[] = [
    md(`这是一张测试卡片，确认「${escapeMd(truncate(input.targetName, 40))}」能收到 Shopilot 的推送。`),
    md(`之后会话进入待认领时，这里会收到${"**橙色**"}的待认领卡；待认领超过提醒时长，会再收到一张${"**红色**"}的超时卡。卡片上点「认领」即在 Shopilot 工作台认领。`),
  ];
  if (input.imageKey) {
    elements.push(md("下面这张图片用来确认买家图片能显示在卡片里："));
    elements.push({ tag: "img", img_key: input.imageKey, alt: { tag: "plain_text", content: "图片上传测试" }, preview: true, scale_type: "crop_center", size: "160px 96px", corner_radius: "8px" });
  } else if (input.imageError) {
    elements.push(md(grey(`图片上传没有成功：${escapeMd(truncate(input.imageError, 120))}。待认领卡里的买家图片会显示成「在 Shopilot 查看」链接。`)));
  }
  elements.push({ tag: "hr" });
  elements.push(button("打开通知设置", "default", input.settingsUrl));
  elements.push(md(grey(`Shopilot · ${escapeMd(truncate(input.merchantName, 40))}`)));
  return card(`测试卡片 · ${input.merchantName}`, "blue", `Shopilot 测试卡片 · ${input.targetName}`, elements);
}
