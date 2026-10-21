// 复测（§12.17「会话学习」）：拟发布的卡内容只在模拟出稿里生效。通过 = 原问题的新回答用到了这张卡，
// 且这张卡以前发布过的学习任务（最近 3 个，回归用例）改后都不比改前差（DeepSeek judge 判定）。新卡没有回归用例。
import { createHash } from "node:crypto";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { CardContent, LearningRegression, LearningRetest, SimResult } from "@/contracts/cards";
import { chat, parseJson } from "@/server/ai/client";
import { JUDGE_PROMPT } from "@/server/ai/prompts";
import { simulateDraft, type SimTurn } from "@/server/ai/simulate";
import { db, schema } from "@/server/db/client";
import { PROPOSAL_CARD_ID } from "./card-retrieve";

const T = schema.learningTask;
export type TaskRow = typeof T.$inferSelect;
/** 每张卡最多取几个回归用例 */
export const REGRESSIONS_MAX = 3;

/** 拟发布内容的指纹：发布时要与最近一次复测的一致 */
export function proposalHash(content: CardContent, targetCardId: string | null): string {
  return createHash("sha256")
    .update(JSON.stringify({ content, targetCardId }))
    .digest("hex");
}

/** 用学习任务的快照拼模拟出稿的对话：截到勾选的最后一条买家文字（没勾选取最后一条买家文字），问题优先用 test_question */
export function simInputOf(task: Pick<TaskRow, "messages" | "testQuestion">): { conversation: SimTurn[]; question: string } {
  const msgs = task.messages;
  const isBuyerText = (m: (typeof msgs)[number]) => m.from === "buyer" && m.type === "text" && !!m.text.trim();
  let anchor = -1;
  for (let i = msgs.length - 1; i >= 0 && anchor < 0; i--) if (msgs[i].selected && isBuyerText(msgs[i])) anchor = i;
  for (let i = msgs.length - 1; i >= 0 && anchor < 0; i--) if (isBuyerText(msgs[i])) anchor = i;
  const upto = anchor >= 0 ? msgs.slice(0, anchor + 1) : msgs;
  const conversation = upto.map((m) => ({ from: m.from, type: m.type, text: m.text, at: m.at }));
  const question = task.testQuestion?.trim() || (anchor >= 0 ? msgs[anchor].text : "");
  return { conversation, question };
}

const brief = (r: SimResult) => ({ reply: r.reply, card: r.card ? `${r.card.title} · 第 ${r.card.step} 步（${r.card.action}）` : null, handoff: r.handoff, insufficient: r.insufficient });

async function judge(question: string, conversation: SimTurn[], before: SimResult, after: SimResult): Promise<{ notWorse: boolean; reason: string }> {
  const res = await chat(
    "judge",
    [
      { role: "system", content: JUDGE_PROMPT },
      { role: "user", content: JSON.stringify({ question, conversation: conversation.slice(-6), before: brief(before), after: brief(after) }) },
    ],
    { json: true, maxTokens: 200, stubHint: question },
  );
  const j = parseJson(res.content);
  return { notWorse: j.not_worse === true, reason: String(j.reason ?? "").trim().slice(0, 120) };
}

/** 复测；模拟出稿或判定出错时抛 AiError，由调用方处理 */
export async function retestProposal(task: TaskRow, content: CardContent, targetCardId: string | null): Promise<LearningRetest> {
  const base = { merchantId: task.merchantId, shopId: task.shopId, stage: task.stage, productIds: task.productIds };
  const override = { cardId: targetCardId, content };
  const own = simInputOf(task);
  const cases = targetCardId
    ? await db()
        .select()
        .from(T)
        .where(and(eq(T.merchantId, task.merchantId), eq(T.publishedCardId, targetCardId), eq(T.status, "published"), ne(T.id, task.id)))
        .orderBy(desc(sql`coalesce(${T.reviewedAt}, ${T.updatedAt}, ${T.createdAt})`))
        .limit(REGRESSIONS_MAX)
    : [];
  const [original, regressions] = await Promise.all([
    simulateDraft({ ...base, ...own, override }),
    Promise.all(
      cases.map(async (c): Promise<LearningRegression> => {
        const input = simInputOf(c);
        const caseBase = { merchantId: c.merchantId, shopId: c.shopId, stage: c.stage, productIds: c.productIds, ...input };
        const [before, after] = await Promise.all([simulateDraft(caseBase), simulateDraft({ ...caseBase, override })]);
        const v = await judge(input.question, input.conversation, before, after);
        return { taskId: c.id, question: input.question, before, after, notWorse: v.notWorse, reason: v.reason };
      }),
    ),
  ]);
  const usedCard = original.card?.cardId === (targetCardId ?? PROPOSAL_CARD_ID);
  const worse = regressions.find((r) => !r.notWorse);
  const failReason = !usedCard ? "原问题的新回答没有用到这张卡" : worse ? `以前测过的问题「${[...worse.question].slice(0, 30).join("")}」改后变差：${worse.reason}` : null;
  return { at: new Date().toISOString(), proposalHash: proposalHash(content, targetCardId), passed: failReason === null, failReason, original, regressions };
}
