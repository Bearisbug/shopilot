// 知识库页的纯函数：问答表单与 API-KB-014 请求体互转、标签文本解析、页签取值（PAGE-RECEPTION-KB）
import { z } from "zod";
import { KNOWLEDGE_MARKETS, qaBody, QA_STAGES, type KnowledgeMarket, type KnowledgeQa, type QaBody, type QaStage } from "@/contracts/knowledge";

/** 表单值：问法用对象数组（useFieldArray 要求），标签是一段文本 */
export type QaFormValues = {
  questions: Array<{ value: string }>;
  answer: string;
  productIds: string[];
  stage: QaStage;
  markets: KnowledgeMarket[];
  tagsText: string;
};

/** 标签：中英文逗号、顿号、分号或换行分隔，去空、去重，保留先后 */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const t of text.split(/[,，、;；\n]/)) {
    const s = t.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export function qaToForm(qa?: Pick<KnowledgeQa, "questions" | "answer" | "products" | "stage" | "markets" | "tags">): QaFormValues {
  if (!qa) return { questions: [{ value: "" }], answer: "", productIds: [], stage: "any", markets: ["ALL"], tagsText: "" };
  return {
    questions: qa.questions.map((value) => ({ value })),
    answer: qa.answer,
    productIds: qa.products.map((p) => p.id),
    stage: qa.stage,
    markets: qa.markets,
    tagsText: qa.tags.join("，"),
  };
}

export function formToBody(v: QaFormValues): z.input<typeof qaBody> {
  return {
    questions: v.questions.map((q) => q.value.trim()),
    answer: v.answer.trim(),
    productIds: v.productIds,
    stage: v.stage,
    markets: v.markets,
    tags: parseTags(v.tagsText),
  };
}

/** 契约的问题路径换成表单字段路径：questions.N → questions.N.value，tags.* → tagsText */
function formPath(path: PropertyKey[]): PropertyKey[] {
  const [head, i] = path;
  if (head === "questions" && typeof i === "number") return ["questions", i, "value"];
  if (head === "tags") return ["tagsText"];
  return [head];
}

/** 表单校验只用契约里的 qaBody，不另写一套规则 */
export const qaFormSchema = z
  .object({
    questions: z.array(z.object({ value: z.string() })),
    answer: z.string(),
    productIds: z.array(z.string()),
    stage: z.enum(QA_STAGES),
    markets: z.array(z.enum(KNOWLEDGE_MARKETS)),
    tagsText: z.string(),
  })
  .superRefine((v, ctx) => {
    const r = qaBody.safeParse(formToBody(v));
    if (r.success) return;
    for (const issue of r.error.issues) ctx.addIssue({ code: "custom", message: issue.message, path: formPath(issue.path) });
  });

export function toQaBody(v: QaFormValues): QaBody {
  return qaBody.parse(formToBody(v));
}

/** 页签：地址里不认识的值回到默认；带着资料抽屉参数打开时默认停在「资料」 */
export const KB_TABS = ["qa", "review", "docs", "products", "test"] as const;
export type KbTab = (typeof KB_TABS)[number];
export function kbTab(tab: string | null, hasDoc: boolean): KbTab {
  return (KB_TABS as readonly string[]).includes(tab ?? "") ? (tab as KbTab) : hasDoc ? "docs" : "qa";
}
