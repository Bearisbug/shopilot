import { describe, expect, it } from "vitest";
import { handoffVerdict, parseModelOutput } from "@/server/ai/draft";
import { citationsFrom, mergeRoutes, type RetrievalOutcome, type RetrievedChunk } from "./retrieve";
import { stubChunkTexts, stubTokens } from "./stub";

const chunk = (id: string, doc = `doc-${id}`): RetrievedChunk => ({ chunkId: id, documentId: doc, name: `${doc}.pdf`, fileId: "f", chunkNo: 1, text: id, score: 0.5, vectorScore: 0.5, keywordScore: null, rerankingScore: null });

describe("两路合并（§12.8）", () => {
  it("按名次交替取、改写路在前、按分块去重、最多 8 段并编号 1–8", () => {
    const a = ["a1", "a2", "s", "a3", "a4", "a5", "a6"].map((x) => chunk(x));
    const b = ["b1", "s", "b2", "b3", "b4"].map((x) => chunk(x));
    const merged = mergeRoutes(a, b);
    expect(merged.map((m) => m.chunk.chunkId)).toEqual(["a1", "b1", "a2", "s", "b2", "a3", "b3", "a4"]);
    expect(merged.map((m) => m.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("一路失败时只用另一路", () => {
    expect(mergeRoutes(null, [chunk("b1"), chunk("b2")]).map((m) => m.chunk.chunkId)).toEqual(["b1", "b2"]);
    expect(mergeRoutes([chunk("a1")], null).map((m) => m.n)).toEqual([1]);
  });
});

describe("依据与转人工判定", () => {
  const outcome = { merged: mergeRoutes([chunk("a1", "保修"), chunk("a2", "保修")], [chunk("b1", "型号")]) } as RetrievalOutcome;

  it("依据只收合并结果里的编号，按资料去重", () => {
    expect(citationsFrom(outcome, [2, 1, 9, 3])).toEqual([
      { n: 2, kind: "document", documentId: "型号", name: "型号.pdf" },
      { n: 1, kind: "document", documentId: "保修", name: "保修.pdf" },
    ]);
    expect(citationsFrom(null, [1])).toEqual([]);
  });

  it("资料不足时不论阈值一律转人工，原因记 low_confidence（RULE-KB-003）", () => {
    const base = parseModelOutput({ reply: "保修 12 个月", confidence: 0.9, handoff: false, reason: "none", insufficient: false, used_sources: [1, 1, "x", 0] });
    expect(base.usedSources).toEqual([1]);
    expect(handoffVerdict(base, 0.5)).toBeNull();
    expect(handoffVerdict({ ...base, insufficient: true }, 0.5)).toBe("low_confidence");
    expect(handoffVerdict({ ...base, confidence: 0.4 }, 0.5)).toBe("low_confidence");
    expect(handoffVerdict({ ...base, handoff: true, reason: "human_request" }, 0.5)).toBe("human_request");
    expect(handoffVerdict({ ...base, handoff: true, reason: "weird" }, 0.5)).toBe("policy");
    expect(handoffVerdict({ ...base, reply: "" }, 0.5)).toBe("model_error");
  });

  it("旧格式输出（没有 insufficient、used_sources）按资料充足、无依据处理", () => {
    expect(parseModelOutput({ reply: "好的", confidence: 0.8, handoff: false, reason: "none" })).toMatchObject({ insufficient: false, usedSources: [] });
  });
});

describe("检索替身（API-MOCK-010）", () => {
  it("文本类按 1,500 字切块，其余格式生成「替身解析：<文件名>」", () => {
    const text = new TextEncoder().encode("保".repeat(3200));
    expect(stubChunkTexts("d/1.md", text, "说明.md").map((t) => t.length)).toEqual([1500, 1500, 200]);
    expect(stubChunkTexts("d/1.pdf", new Uint8Array([1]), "保修政策.pdf")).toEqual(["替身解析：保修政策.pdf"]);
  });

  it("关键词：拉丁按词、中文按相邻两字", () => {
    expect([...stubTokens("Berapa lama waranti?")]).toEqual(["berapa", "lama", "waranti"]);
    expect([...stubTokens("保修多久")]).toEqual(["保修", "修多", "多久"]);
  });
});
