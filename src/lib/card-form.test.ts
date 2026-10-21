import { describe, expect, it } from "vitest";
import type { CardContent } from "@/contracts/cards";
import { cardFormSchema, contentToForm, diffCards, emptyBranch, toCardContent } from "./card-form";

const content: CardContent = {
  title: "摄像头识别不到",
  productIds: [],
  stage: "aftersale",
  markets: ["ALL"],
  tags: ["连接", "首次使用"],
  conditions: ["买家说已接上电脑", "软件找不到设备"],
  conditionMode: "all",
  steps: [
    { text: "问系统", branches: [{ when: "急用", action: "handoff" }] },
    { text: "换线", branches: [{ when: "换了也不行", action: "goto", goto: 1 }] },
  ],
  tips: null,
  qaIds: [],
};

describe("写卡表单", () => {
  it("内容与表单互转不丢东西；标签按逗号拆开，空提示存 null", () => {
    const form = contentToForm(content);
    expect(form.tagsText).toBe("连接，首次使用");
    expect(form.steps[1].branches[0]).toEqual({ when: "换了也不行", action: "goto", goto: "1" });
    expect(toCardContent(form)).toEqual(content);
    expect(toCardContent({ ...form, tips: "  " }).tips).toBeNull();
  });

  it("错误落在表单字段上：调用条件、标签、没选步号的跳转", () => {
    const form = contentToForm(content);
    const bad = cardFormSchema.safeParse({ ...form, conditions: [{ value: " " }], steps: [{ text: "一", branches: [{ ...emptyBranch(), when: "x", action: "goto" }] }, { text: "二", branches: [] }] });
    const paths = bad.error?.issues.map((i) => i.path.join("."));
    expect(paths).toContain("conditions.0.value");
    expect(paths).toContain("steps.0.branches.0.goto");
    expect(cardFormSchema.safeParse({ ...form, tagsText: "一二三四五六七八九十一二三四五六七八九十多" }).error?.issues.map((i) => i.path.join("."))).toContain("tagsText");
  });

  it("版本对比逐字段给出改前改后文字；产品与问答换成名字", () => {
    const after: CardContent = { ...content, productIds: ["p1"], steps: [content.steps[0]], tips: "先安抚" };
    const d = diffCards(content, after, { product: () => "Tail 2", qa: () => "", stage: () => "售后", markets: () => "全部站点" }).filter((x) => x.before !== x.after);
    expect(d.map((x) => x.key)).toEqual(["steps", "tips", "products"]);
    expect(d.find((x) => x.key === "steps")).toMatchObject({ before: "1. 问系统\n   如果急用 → 转人工\n2. 换线\n   如果换了也不行 → 跳到第 1 步", after: "1. 问系统\n   如果急用 → 转人工" });
    expect(d.find((x) => x.key === "products")).toMatchObject({ before: "通用", after: "Tail 2" });
  });
});
