// 知识库的只读平台工具（ADR-019）：会话学习用 learnTools，按卡体检用 reviewTools。商户、任务与卡在建工具时带进来，模型只传工具参数；
// 检索只查本商户已发布的卡与问答；自测走出稿同一条链路（simulateDraft），不存草稿、不计用量。模型写的卡由调用方的 toCard 整理成卡内容。
import { and, eq, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { CardContent, SimResult } from "@/contracts/cards";
import { simulateDraft } from "@/server/ai/simulate";
import { db, schema } from "@/server/db/client";
import { PROPOSAL_CARD_ID } from "@/server/knowledge/card-retrieve";
import { draftCase, type ReviewCase } from "@/server/knowledge/card-review";
import type { CardRow } from "@/server/knowledge/card-store";
import { cardContentOf } from "@/server/knowledge/card-store";
import { embedTexts } from "@/server/knowledge/embed";
import { simInputOf, type TaskRow } from "@/server/knowledge/retest";
import { defineTool, type AgentTool } from "./registry";

const C = schema.experienceCard;
const Q = schema.knowledgeQa;
/** 每次自测（simulate）最多几次 */
export const SIMULATE_MAX = 6;
const SEARCH_MAX = 5;

/** 卡给模型看的样子（与提交、自测的卡同一个结构） */
export const cardForModel = (c: CardContent) => ({
  title: c.title,
  conditions: c.conditions,
  condition_mode: c.conditionMode,
  steps: c.steps.map((s) => ({ text: s.text, branches: s.branches })),
  tips: c.tips,
  stage: c.stage,
});

/** 模型写的卡：宽松接收，超长、多出、跳转不合法的部分由 toCard 截断或丢掉 */
export const zModelCard = z.object({
  title: z.string(),
  conditions: z.array(z.string()),
  condition_mode: z.enum(["all", "any"]).optional(),
  steps: z.array(z.object({ text: z.string(), branches: z.array(z.object({ when: z.string(), action: z.string(), goto: z.number().optional() })).optional() })),
  tips: z.string().nullable().optional(),
  stage: z.string().optional(),
  product_codes: z.array(z.string()).nullable().optional(),
});

/** 卡整理不出来时退给模型的话（自测与提交共用） */
export const BAD_CARD = "卡内容不完整：需要标题、至少一条调用条件、至少一个步骤；跳转要指向本卡的另一步。";

/** 按一句话查本商户已发布的卡与问答，各取最近的 5 条；向量化失败时抛错（工具里会作为出错交给模型） */
export async function searchPublished(merchantId: string, text: string, opts: { market?: string | null; excludeCardId?: string } = {}) {
  const [vec] = await embedTexts([text]);
  const literal = `[${vec.join(",")}]`;
  const marketCond = (col: typeof C.markets | typeof Q.markets): SQL[] => (opts.market ? [sql`(${col} @> '["ALL"]'::jsonb or ${col} @> ${JSON.stringify([opts.market])}::jsonb)`] : []);
  const cd = sql<number>`(${C.embedding} <=> ${literal}::vector)`;
  const qd = sql<number>`(${Q.embedding} <=> ${literal}::vector)`;
  const [cards, qa] = await Promise.all([
    db()
      .select({ row: C, distance: cd })
      .from(C)
      .where(and(eq(C.merchantId, merchantId), eq(C.status, "published"), isNotNull(C.embedding), ...(opts.excludeCardId ? [ne(C.id, opts.excludeCardId)] : []), ...marketCond(C.markets)))
      .orderBy(cd)
      .limit(SEARCH_MAX),
    db()
      .select({ questions: Q.questions, answer: Q.answer, distance: qd })
      .from(Q)
      .where(and(eq(Q.merchantId, merchantId), eq(Q.status, "published"), isNotNull(Q.embedding), ...marketCond(Q.markets)))
      .orderBy(qd)
      .limit(SEARCH_MAX),
  ]);
  return { cards: cards.map((c) => ({ row: c.row, distance: Number(c.distance) })), qa: qa.map((q) => ({ questions: q.questions, answer: q.answer, distance: Number(q.distance) })) };
}

const round = (d: number) => Number(d.toFixed(3));

/** 本次运行看到过的卡：编号（S1…）→ 卡；会话学习提交改卡时只能指这些 */
export type CardKeys = Map<string, CardRow>;

function searchTool(scope: { merchantId: string; market: string | null; excludeCardId?: string; keys?: CardKeys }): AgentTool {
  return defineTool({
    name: "search_knowledge",
    description: "按一句话查本商户已发布的经验卡与问答（各最多 5 条，distance 越小越相近），看问题是不是别的内容已经覆盖",
    tier: "read",
    input: { query: z.string().min(1).max(200) },
    run: async ({ query }) => {
      const found = await searchPublished(scope.merchantId, query, { market: scope.market, excludeCardId: scope.excludeCardId });
      const keyOf = (row: CardRow) => {
        if (!scope.keys) return undefined;
        for (const [k, r] of scope.keys) if (r.id === row.id) return k;
        const k = `S${scope.keys.size + 1}`;
        scope.keys.set(k, row);
        return k;
      };
      return {
        result: {
          cards: found.cards.map((c) => ({ ...(scope.keys ? { id: keyOf(c.row) } : {}), ...cardForModel(cardContentOf(c.row)), distance: round(c.distance) })),
          qa: found.qa.map((q) => ({ questions: q.questions, answer: q.answer, distance: round(q.distance) })),
        },
        note: `查到 ${found.cards.length} 张卡、${found.qa.length} 条问答`,
      };
    },
  });
}

const brief = (r: SimResult) => ({ reply: r.reply, card_used: r.card ? { title: r.card.title, step: r.card.step, action: r.card.action } : null, handoff: r.handoff, insufficient: r.insufficient });
const usedNote = (r: SimResult, cardId: string) => (r.card?.cardId === cardId ? `用到这张卡第 ${r.card.step} 步${r.handoff ? "，转人工" : ""}` : r.card ? "用到了别的卡" : "没用到卡");

/**
 * 会话学习：get_conversation（任务快照、相似卡与相关问答，与运行前算好的一致）、search_knowledge、simulate（用拟发布的卡答这段会话里的问题）。
 * 相似卡与查到的卡编成 S1…，提交改卡时 target_card 写编号。
 */
export function learnTools(input: {
  task: TaskRow;
  market: string | null;
  conversation: Record<string, unknown>;
  keys: CardKeys;
  toCard: (raw: unknown, target: CardRow | null) => CardContent | null;
}): AgentTool[] {
  const { task } = input;
  return [
    defineTool({
      name: "get_conversation",
      description: "读这次要学习的会话：消息（selected=true 是客服勾选的）、客服备注、识别出的产品与阶段、最相似的经验卡（similar_cards）与相关问答（related_qa）",
      tier: "read",
      input: {},
      run: async () => ({
        result: input.conversation,
        note: `${task.messages.length} 条消息，相似卡 ${(input.conversation.similar_cards as unknown[] | undefined)?.length ?? 0} 张`,
      }),
    }),
    searchTool({ merchantId: task.merchantId, market: input.market, keys: input.keys }),
    defineTool({
      name: "simulate",
      description: "用拟发布的卡模拟 AI 回答这段会话里的买家问题，看会怎么回、用没用到这张卡、第几步；改已有卡时 target_card 写它的编号",
      tier: "read",
      max: SIMULATE_MAX,
      input: { card: zModelCard, target_card: z.string().nullish() },
      run: async ({ card, target_card }) => {
        const target = target_card ? input.keys.get(target_card) : undefined;
        if (target_card && !target) return { result: `没有编号为 ${target_card} 的卡，只能用 get_conversation 或 search_knowledge 里出现过的编号。`, note: "卡编号不对，没有模拟" };
        const content = input.toCard(card, target ?? null);
        if (!content) return { result: BAD_CARD, note: "卡不完整，没有模拟" };
        const r = await simulateDraft({ merchantId: task.merchantId, shopId: task.shopId, stage: task.stage, productIds: task.productIds, ...simInputOf(task), override: { cardId: target?.id ?? null, content } });
        return { result: brief(r), note: `拟${target ? "改" : "新建"}的卡：${usedNote(r, target?.id ?? PROPOSAL_CARD_ID)}` };
      },
    }),
  ];
}

/**
 * 按卡体检：get_card（卡与近 7 天处置统计）、list_cases（证据用例）、search_knowledge（不含这张卡）、simulate（第 n 个用例，用现在或拟改的卡）。
 */
export function reviewTools(input: {
  task: TaskRow;
  card: CardRow;
  cases: ReviewCase[];
  toCard: (raw: unknown) => CardContent | null;
}): AgentTool[] {
  const { task, card, cases } = input;
  return [
    defineTool({
      name: "get_card",
      description: "读这张经验卡的内容与近 7 天的处置统计（counts）",
      tier: "read",
      input: {},
      run: async () => ({ result: { card: cardForModel(cardContentOf(card)), counts: task.evidence?.counts ?? null }, note: "读卡与处置统计" }),
    }),
    defineTool({
      name: "list_cases",
      description: "列出近 7 天用到这张卡的用例（n 从 1 起）：买家问题、AI 草稿与第几步、客服最终发出的内容、处置、草稿与人工回复的对比",
      tier: "read",
      input: {},
      run: async () => ({
        result: cases.map((c, i) => ({
          n: i + 1,
          question: c.question,
          ai_reply: c.aiReply,
          step: c.step,
          action: c.action,
          disposition: c.mode === "shadow" ? "shadow" : c.disposition,
          human_reply: c.humanReply,
          compare: c.compare ? { edit_class: c.compare.editClass, consistency: c.compare.consistency, reason: c.compare.reason } : null,
        })),
        note: `${cases.length} 个用例`,
      }),
    }),
    searchTool({ merchantId: task.merchantId, market: null, excludeCardId: card.id }),
    defineTool({
      name: "simulate",
      description: "对第 case_n 个用例模拟 AI 出稿：给 card 时用拟改的卡，不给时用现在的卡；看会怎么回、用没用到这张卡、第几步",
      tier: "read",
      max: SIMULATE_MAX,
      input: { case_n: z.number().int().min(1), card: zModelCard.optional() },
      run: async ({ case_n, card: raw }) => {
        const c = cases[case_n - 1];
        if (!c) return { result: `没有第 ${case_n} 个用例，共 ${cases.length} 个。`, note: "用例编号不对，没有模拟" };
        const content = raw ? input.toCard(raw) : null;
        if (raw && !content) return { result: BAD_CARD, note: "卡不完整，没有模拟" };
        const sim = await draftCase(c.draftId);
        if (!sim) return { result: "这个用例的会话已删除或没有买家问题，换一个用例。", note: "用例已不可用" };
        const r = await simulateDraft({ merchantId: task.merchantId, shopId: sim.shopId, stage: sim.stage, productIds: sim.productIds, conversation: sim.conversation, question: sim.question, override: content ? { cardId: card.id, content } : null });
        return { result: brief(r), note: `第 ${case_n} 个用例 · ${content ? "拟改的卡" : "现在的卡"}：${usedNote(r, card.id)}` };
      },
    }),
  ];
}
