import { describe, expect, it } from "vitest";
import { AiError, parseJson } from "./client";

describe("模型 JSON 输出解析", () => {
  it("接受对象与 ```json 包裹", () => {
    expect(parseJson('{"reply":"hi","confidence":0.8}')).toEqual({ reply: "hi", confidence: 0.8 });
    expect(parseJson('```json\n{"reply":"hi"}\n```')).toEqual({ reply: "hi" });
  });
  it("非 JSON、数组、空串抛 invalid_json", () => {
    for (const bad of ["好的，这是文本", "[1,2]", ""]) {
      expect(() => parseJson(bad)).toThrow(AiError);
    }
  });
});
