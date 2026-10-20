// 输入框预翻译：缓存键、能否预翻译、缓存上限；发送请求里 translatedText 的校验（API-CONV-007）。
import { describe, expect, it } from "vitest";
import { sendBody } from "@/contracts/conversations";
import { canPretranslate, pretranslateKey, rememberTranslation } from "./pretranslate";

describe("预翻译缓存键与判定", () => {
  it("同一段文字（首尾空白不同）同一语言是同一个键，换语言就是新键", () => {
    expect(pretranslateKey(" 你好 ", "vi")).toBe(pretranslateKey("你好", "vi"));
    expect(pretranslateKey("你好", "vi")).not.toBe(pretranslateKey("你好", "th"));
    expect(pretranslateKey("你好", "vi")).not.toBe(pretranslateKey("你好呀", "vi"));
  });

  it("不翻译、空白、超过 2,000 字时不预翻译", () => {
    expect(canPretranslate("你好", "vi")).toBe(true);
    expect(canPretranslate("你好", "none")).toBe(false);
    expect(canPretranslate("   ", "vi")).toBe(false);
    expect(canPretranslate("字".repeat(2000), "vi")).toBe(true);
    expect(canPretranslate("字".repeat(2001), "vi")).toBe(false);
  });

  it("缓存超过上限丢最早的，重复记同一键算最新", () => {
    const cache = new Map<string, string>();
    rememberTranslation(cache, "a", "A", 2);
    rememberTranslation(cache, "b", "B", 2);
    rememberTranslation(cache, "a", "A2", 2);
    rememberTranslation(cache, "c", "C", 2);
    expect([...cache.entries()]).toEqual([
      ["a", "A2"],
      ["c", "C"],
    ]);
  });
});

describe("发送请求的预译文校验", () => {
  const base = { clientRequestId: "req-12345678", type: "text" as const, text: "你好" };
  it("随 translateTo 一起提交可以通过，首尾空白去掉", () => {
    const r = sendBody.safeParse({ ...base, translateTo: "vi", translatedText: " Xin chào " });
    expect(r.success && r.data.translatedText).toBe("Xin chào");
  });
  it("没有 translateTo、不是文字消息、为空或超过 2,000 字都不通过", () => {
    expect(sendBody.safeParse({ ...base, translatedText: "Xin chào" }).success).toBe(false);
    expect(sendBody.safeParse({ clientRequestId: "req-12345678", type: "image", fileId: "01a15a44-c2e1-727c-b8b9-aa80472e9682", translateTo: "vi", translatedText: "x" }).success).toBe(false);
    expect(sendBody.safeParse({ ...base, translateTo: "vi", translatedText: "  " }).success).toBe(false);
    expect(sendBody.safeParse({ ...base, translateTo: "vi", translatedText: "x".repeat(2001) }).success).toBe(false);
  });
});
