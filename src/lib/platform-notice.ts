// 平台系统提示的中文显示（DESIGN §13 PAGE-WB「时间线里的平台系统提示」对照表）：只改显示，库里存平台原文。
// 名字部分（平台给的客服名）原样带出；没对上的返回 null，调用方照原文显示。

const NOTICES: Array<[RegExp, (...names: string[]) => string]> = [
  [/^\[Other\] Please check this message in seller center of TikTok shop\.?$/, () => "一条开放接口取不到的消息，请到 TikTok 卖家中心查看"],
  [/^The chat has been assigned to (.+?)\.?$/, (a) => `对话已分配给 ${a}`],
  [/^Chat ended by customer service agent\.?$/, () => "客服已结束对话"],
  [/^The chat timed out due to customer inactivity\.?$/, () => "买家长时间未回复，对话超时结束"],
  [/^The chat timed out due to customer service agent inactivity\.?$/, () => "客服长时间未回复，对话超时结束"],
  [/^The customer has requested manual customer service\./, () => "买家要求转人工客服，请尽快回复"],
  [/^There is no proper answer in the FAQ database, please reply manually\./, () => "FAQ 里没有合适的答案，请人工回复"],
  [/^Because no proper answer was found, the chat assistant has stopped/, () => "没找到合适的答案，TikTok 聊天助手已停止回复，请人工回复"],
  [/^(.+?) started the chat\.?$/, (a) => `${a} 开始接待`],
  [/^(.+?) transferred the conversation from (.+?) to (.+?)\.?$/, (a, b, c) => `${a} 把对话从 ${b} 转给 ${c}`],
  [/^(.+?) transferred the chat to (.+?)\.?$/, (a, b) => `${a} 把对话转给 ${b}`],
  [/^(.+?) assigned the chat to (.+?)\.?$/, (a, b) => `${a} 把对话分配给 ${b}`],
];

/** 平台系统提示的中文；不在对照表里返回 null */
export function platformNoticeText(text: string | null | undefined): string | null {
  const t = text?.trim();
  if (!t) return null;
  for (const [re, zh] of NOTICES) {
    const m = re.exec(t);
    if (m) return zh(...m.slice(1));
  }
  return null;
}
