import { describe, expect, it } from "vitest";
import type { KnowledgeQa } from "@/contracts/knowledge";
import { formToBody, kbTab, parseTags, qaFormSchema, qaToForm, toQaBody } from "./qa-form";

const PID = "01a13b78-c4e7-724d-b158-9ef4894435bd";

describe("问答表单", () => {
  it("标签按中英文逗号、顿号、分号、换行分隔，去空去重保序", () => {
    expect(parseTags("连接，macOS, 连接、退款；\n 急用 ;")).toEqual(["连接", "macOS", "退款", "急用"]);
    expect(parseTags("  ")).toEqual([]);
  });

  it("新建的默认值：一个空问法、全部阶段、全部站点、通用", () => {
    expect(qaToForm()).toEqual({ questions: [{ value: "" }], answer: "", productIds: [], stage: "any", markets: ["ALL"], tagsText: "" });
  });

  it("已有问答回填表单再转回请求体，内容不变", () => {
    const qa = { questions: ["保修多久", "warranty?"], answer: "一年", products: [{ id: PID, code: "TL2", name: "Tail 2" }], stage: "aftersale", markets: ["MY", "TH"], tags: ["保修"] } as Pick<
      KnowledgeQa,
      "questions" | "answer" | "products" | "stage" | "markets" | "tags"
    >;
    expect(toQaBody(qaToForm(qa))).toEqual({ questions: ["保修多久", "warranty?"], answer: "一年", productIds: [PID], stage: "aftersale", markets: ["MY", "TH"], tags: ["保修"] });
  });

  it("提交前去掉问法与回复的首尾空白", () => {
    expect(formToBody({ ...qaToForm(), questions: [{ value: "  保修多久 " }], answer: " 一年 " })).toMatchObject({ questions: ["保修多久"], answer: "一年" });
  });

  it("校验沿用契约：空问法报在对应的问法上，重复问法、没选站点、标签过长都报错", () => {
    const r = qaFormSchema.safeParse({ ...qaToForm(), questions: [{ value: "保修" }, { value: "" }], answer: "一年" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join("."))).toContain("questions.1.value");

    const dup = qaFormSchema.safeParse({ ...qaToForm(), questions: [{ value: "a" }, { value: "a" }], answer: "x" });
    expect(dup.error?.issues[0].message).toBe("问法不能重复");

    const noMarket = qaFormSchema.safeParse({ ...qaToForm(), questions: [{ value: "a" }], answer: "x", markets: [] });
    expect(noMarket.error?.issues.map((i) => i.path.join("."))).toContain("markets");

    const longTag = qaFormSchema.safeParse({ ...qaToForm(), questions: [{ value: "a" }], answer: "x", tagsText: "一二三四五六七八九十一二三四五六七八九十多" });
    expect(longTag.error?.issues.map((i) => i.path.join("."))).toContain("tagsText");

    expect(qaFormSchema.safeParse({ ...qaToForm(), questions: [{ value: "a" }], answer: "x" }).success).toBe(true);
  });
});

describe("知识库页签", () => {
  it("认识的页签原样返回，不认识的回到默认；带资料抽屉参数时默认停在资料", () => {
    expect(kbTab("review", false)).toBe("review");
    expect(kbTab("products", true)).toBe("products");
    expect(kbTab(null, false)).toBe("qa");
    expect(kbTab("bogus", false)).toBe("qa");
    expect(kbTab(null, true)).toBe("docs");
  });
});
