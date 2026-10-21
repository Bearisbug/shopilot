// 写卡表单与 CardContent 互转（PAGE-RECEPTION-KB 经验卡页签，API-KB-030、API-KB-032、API-KB-012 带卡测试）：
// 调用条件用对象数组（useFieldArray 要求），跳转步号在表单里是字符串（Select 取值），标签是一段文本；校验只用契约里的 zCardContent。
import { z } from "zod";
import { BRANCH_ACTIONS, CONDITION_MODES, zCardContent, type BranchAction, type CardContent, type ConditionMode, type ExperienceCard } from "@/contracts/cards";
import { KNOWLEDGE_MARKETS, QA_STAGES, type KnowledgeMarket, type QaStage } from "@/contracts/knowledge";
import { parseTags } from "./qa-form";

export type CardBranchValues = { when: string; action: BranchAction; goto: string };
export type CardStepValues = { text: string; branches: CardBranchValues[] };
export type CardFormValues = {
  title: string;
  productIds: string[];
  stage: QaStage;
  markets: KnowledgeMarket[];
  tagsText: string;
  conditions: Array<{ value: string }>;
  conditionMode: ConditionMode;
  steps: CardStepValues[];
  tips: string;
  qaIds: string[];
};

export const emptyStep = (): CardStepValues => ({ text: "", branches: [] });
export const emptyBranch = (): CardBranchValues => ({ when: "", action: "handoff", goto: "" });

export function cardToForm(c?: Pick<ExperienceCard, "title" | "products" | "stage" | "markets" | "tags" | "conditions" | "conditionMode" | "steps" | "tips" | "qa">): CardFormValues {
  if (!c) return { title: "", productIds: [], stage: "aftersale", markets: ["ALL"], tagsText: "", conditions: [{ value: "" }], conditionMode: "all", steps: [emptyStep()], tips: "", qaIds: [] };
  return contentToForm({ ...c, productIds: c.products.map((p) => p.id), qaIds: c.qa.map((q) => q.id) });
}

export function contentToForm(c: CardContent): CardFormValues {
  return {
    title: c.title,
    productIds: c.productIds,
    stage: c.stage,
    markets: c.markets,
    tagsText: c.tags.join("，"),
    conditions: c.conditions.map((value) => ({ value })),
    conditionMode: c.conditionMode,
    steps: c.steps.map((s) => ({ text: s.text, branches: s.branches.map((b) => ({ when: b.when, action: b.action, goto: b.goto ? String(b.goto) : "" })) })),
    tips: c.tips ?? "",
    qaIds: c.qaIds,
  };
}

export function formToContent(v: CardFormValues): z.input<typeof zCardContent> {
  return {
    title: v.title.trim(),
    productIds: v.productIds,
    stage: v.stage,
    markets: v.markets,
    tags: parseTags(v.tagsText),
    conditions: v.conditions.map((c) => c.value.trim()),
    conditionMode: v.conditionMode,
    steps: v.steps.map((s) => ({
      text: s.text.trim(),
      branches: s.branches.map((b) => ({ when: b.when.trim(), action: b.action, ...(b.action === "goto" ? { goto: Number(b.goto) || 0 } : {}) })),
    })),
    tips: v.tips.trim() || null,
    qaIds: v.qaIds,
  };
}

/** 契约的问题路径换成表单字段路径：conditions.N → conditions.N.value，tags.* → tagsText，goto 为 0 时报在 goto 上 */
function formPath(path: PropertyKey[]): PropertyKey[] {
  const [head, i] = path;
  if (head === "conditions" && typeof i === "number") return ["conditions", i, "value"];
  if (head === "tags") return ["tagsText"];
  return path;
}

export const cardFormSchema = z
  .object({
    title: z.string(),
    productIds: z.array(z.string()),
    stage: z.enum(QA_STAGES),
    markets: z.array(z.enum(KNOWLEDGE_MARKETS)),
    tagsText: z.string(),
    conditions: z.array(z.object({ value: z.string() })),
    conditionMode: z.enum(CONDITION_MODES),
    steps: z.array(z.object({ text: z.string(), branches: z.array(z.object({ when: z.string(), action: z.enum(BRANCH_ACTIONS), goto: z.string() })) })),
    tips: z.string(),
    qaIds: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    const r = zCardContent.safeParse(formToContent(v));
    if (r.success) return;
    for (const issue of r.error.issues) ctx.addIssue({ code: "custom", message: issue.message, path: formPath(issue.path) });
  });

export function toCardContent(v: CardFormValues): CardContent {
  return zCardContent.parse(formToContent(v));
}

/** 两版内容逐字段比较用的文本；产品与问答换成名字（删了的显示「已删除」） */
export type CardDiffField = { key: string; label: string; before: string; after: string };
export function diffCards(
  a: CardContent,
  b: CardContent,
  names: { product: (id: string) => string; qa: (id: string) => string; stage: (s: QaStage) => string; markets: (m: KnowledgeMarket[]) => string },
): CardDiffField[] {
  const modeText = (m: ConditionMode) => (m === "all" ? "全部满足" : "满足任一");
  const branchText = (br: CardContent["steps"][number]["branches"][number]) => `如果${br.when} → ${br.action === "handoff" ? "转人工" : br.action === "ticket" ? "建工单" : `跳到第 ${br.goto} 步`}`;
  const stepsText = (c: CardContent) => c.steps.map((s, i) => [`${i + 1}. ${s.text}`, ...s.branches.map((br) => `   ${branchText(br)}`)].join("\n")).join("\n");
  const fields: Array<[string, string, (c: CardContent) => string]> = [
    ["title", "标题与目标", (c) => c.title],
    ["conditions", "调用条件", (c) => `${modeText(c.conditionMode)}\n${c.conditions.map((x) => `· ${x}`).join("\n")}`],
    ["steps", "处理步骤", stepsText],
    ["tips", "沟通提示", (c) => c.tips ?? "（无）"],
    ["products", "产品", (c) => (c.productIds.length ? c.productIds.map(names.product).join("、") : "通用")],
    ["stage", "服务阶段", (c) => names.stage(c.stage)],
    ["markets", "适用站点", (c) => names.markets(c.markets)],
    ["tags", "标签", (c) => (c.tags.length ? c.tags.join("，") : "（无）")],
    ["qa", "关联问答", (c) => (c.qaIds.length ? c.qaIds.map(names.qa).join("\n") : "（无）")],
  ];
  return fields.map(([key, label, f]) => ({ key, label, before: f(a), after: f(b) }));
}
