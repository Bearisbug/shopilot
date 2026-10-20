import { describe, expect, it } from "vitest";
import { quickReplyBody, quickReplyPatch } from "@/contracts/reception";
import { quickReplyInsert, quickReplyVersion } from "./quick-reply";

const reply = { text: "您好，有什么可以帮到您？", variants: [{ lang: "vi" as const, text: "Xin chào, tôi có thể giúp gì cho bạn?" }, { lang: "th" as const, text: "สวัสดีค่ะ" }] };

describe("快捷回复选版本", () => {
  it("目标语言有版本用它，没有或不翻译用默认版本", () => {
    expect(quickReplyVersion(reply, "vi")).toEqual({ text: reply.variants[0].text, lang: "vi" });
    expect(quickReplyVersion(reply, "ms")).toEqual({ text: reply.text, lang: null });
    expect(quickReplyVersion(reply, "none")).toEqual({ text: reply.text, lang: null });
    expect(quickReplyVersion({ text: "旧数据", variants: [] }, "vi")).toEqual({ text: "旧数据", lang: null });
  });

  it("空输入框：插目标语言版本并改为不翻译；没有版本插默认、照常翻译", () => {
    expect(quickReplyInsert(reply, { target: "vi", draftLang: null, hasText: false })).toEqual({ text: reply.variants[0].text, draftLang: "vi" });
    expect(quickReplyInsert(reply, { target: "ms", draftLang: null, hasText: false })).toEqual({ text: reply.text, draftLang: null });
  });

  it("已有文字且照常翻译：插默认版本，一起翻译", () => {
    expect(quickReplyInsert(reply, { target: "vi", draftLang: null, hasText: true })).toEqual({ text: reply.text, draftLang: null });
  });

  it("已有语言版本的草稿：同语言有就接着插；没有就插默认并恢复翻译", () => {
    expect(quickReplyInsert(reply, { target: "vi", draftLang: "vi", hasText: true })).toEqual({ text: reply.variants[0].text, draftLang: "vi" });
    expect(quickReplyInsert({ text: "默认", variants: [] }, { target: "vi", draftLang: "vi", hasText: true })).toEqual({ text: "默认", draftLang: null });
  });
});

describe("快捷回复接口校验", () => {
  const base = { title: "问候语", stage: "any" as const, text: "您好" };
  it("语言版本可省略；同一语言不能有两个版本；版本内容不能为空", () => {
    expect(quickReplyBody.safeParse(base).success).toBe(true);
    expect(quickReplyBody.safeParse({ ...base, variants: [{ lang: "vi", text: "Xin chào" }] }).success).toBe(true);
    const dup = quickReplyBody.safeParse({ ...base, variants: [{ lang: "vi", text: "a" }, { lang: "vi", text: "b" }] });
    expect(dup.success).toBe(false);
    expect(dup.error?.issues[0].message).toBe("同一种语言只能有一个版本");
    const empty = quickReplyBody.safeParse({ ...base, variants: [{ lang: "th", text: "  " }] });
    expect(empty.error?.issues[0].path).toEqual(["variants", 0, "text"]);
    expect(quickReplyBody.safeParse({ ...base, variants: [{ lang: "fr", text: "Bonjour" }] }).success).toBe(false);
  });
  it("只改语言版本也算修改", () => {
    expect(quickReplyPatch.safeParse({ variants: [] }).success).toBe(true);
    expect(quickReplyPatch.safeParse({}).success).toBe(false);
  });
});
