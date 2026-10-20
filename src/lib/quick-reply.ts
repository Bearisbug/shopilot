// 快捷回复插入哪一版（REQ-CONV-009）。draftLang 是这条草稿已插入的语言版本：非空时本条发送不翻译。
import type { QuickReply, QuickReplyLang } from "@/contracts/reception";

/** 某个语言有对应版本就用它，否则用默认版本（target 为 none 时一定是默认版本） */
export function quickReplyVersion(r: Pick<QuickReply, "text" | "variants">, target: string): { text: string; lang: QuickReplyLang | null } {
  const v = r.variants.find((x) => x.lang === target);
  return v ? { text: v.text, lang: v.lang } : { text: r.text, lang: null };
}

/**
 * - 输入框里没有别的字：按会话的发送目标语言选版本；选中语言版本时本条改为不翻译，默认版本则照常翻译。
 * - 已有别的字、草稿已是某个语言版本：同语言版本有就接着插；没有就插默认版本并恢复翻译，整段一起译成目标语言。
 * - 已有别的字、草稿照常翻译：插默认版本，和已有的字一起翻译。
 */
export function quickReplyInsert(
  r: Pick<QuickReply, "text" | "variants">,
  { target, draftLang, hasText }: { target: string; draftLang: QuickReplyLang | null; hasText: boolean },
): { text: string; draftLang: QuickReplyLang | null } {
  const v = quickReplyVersion(r, hasText ? (draftLang ?? "none") : target);
  return { text: v.text, draftLang: v.lang };
}
