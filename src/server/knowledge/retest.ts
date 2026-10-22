// 复测（§12.17「会话学习」、§12.18「按卡体检」）：拟发布的卡内容只在模拟出稿里生效。通过 = 原问题的新回答用到了这张卡，
// 且回归用例改后都不比改前差（DeepSeek judge 判定）：这张卡以前发布过的学习任务（最近 3 个），按卡体检另加证据里原样发送的用例（最多 3 个）。
// 新卡没有回归用例。
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

/** 要改的卡与复测时它的版本；新卡为 null */
export type RetestTarget = { id: string; version: number } | null;

/** 拟发布内容的指纹：内容、要改的卡与它当时的版本；发布时要与最近一次复测的一致，卡在复测后被改过也要重新复测 */
export function proposalHash(content: CardContent, target: RetestTarget): string {
  return createHash("sha256")
    .update(JSON.stringify({ content, targetCardId: target?.id ?? null, targetVersion: target?.version ?? null }))
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

/** 额外的回归用例：按卡体检证据里原样发送的草稿，按出稿时的对话复原 */
export type RegressionCase = {
  draftId: string;
  conversationId: string;
  segmentId: string | null;
  shopId: string;
  stage: string;
  productIds: string[];
  question: string;
  conversation: SimTurn[];
};

/** 复测；模拟出稿或判定出错时抛 AiError，由调用方处理。extra 是按卡体检加的原样发送用例（最多 3 个） */
export async function retestProposal(task: TaskRow, content: CardContent, target: RetestTarget, extra: RegressionCase[] = []): Promise<LearningRetest> {
  const targetCardId = target?.id ?? null;
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
  const regress = async (ref: Pick<LearningRegression, "taskId" | "draftId" | "conversationId" | "segmentId">, caseBase: Parameters<typeof simulateDraft>[0]): Promise<LearningRegression> => {
    const [before, after] = await Promise.all([simulateDraft(caseBase), simulateDraft({ ...caseBase, override })]);
    const v = await judge(caseBase.question, caseBase.conversation, before, after);
    return { ...ref, question: caseBase.question, before, after, notWorse: v.notWorse, reason: v.reason };
  };
  const [original, regressions] = await Promise.all([
    simulateDraft({ ...base, ...own, override }),
    Promise.all([
      ...cases.map((c) =>
        regress({ taskId: c.id, conversationId: c.conversationId, segmentId: c.segmentId }, { merchantId: c.merchantId, shopId: c.shopId, stage: c.stage, productIds: c.productIds, ...simInputOf(c) }),
      ),
      ...extra.map((x) =>
        regress(
          { taskId: null, draftId: x.draftId, conversationId: x.conversationId, segmentId: x.segmentId },
          { merchantId: task.merchantId, shopId: x.shopId, stage: x.stage, productIds: x.productIds, conversation: x.conversation, question: x.question },
        ),
      ),
    ]),
  ]);
  const usedCard = original.card?.cardId === (targetCardId ?? PROPOSAL_CARD_ID);
  const worse = regressions.find((r) => !r.notWorse);
  const what = worse?.draftId ? "原样发送过的问题" : "以前测过的问题";
  const failReason = !usedCard ? "原问题的新回答没有用到这张卡" : worse ? `${what}「${[...worse.question].slice(0, 30).join("")}」改后变差：${worse.reason}` : null;
  return { at: new Date().toISOString(), proposalHash: proposalHash(content, target), passed: failReason === null, failReason, original, regressions };
}
