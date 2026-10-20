// 看板「问题提取」：会话段里买家停止发言 30 分钟后，由 DeepSeek 写一句中文问题总结并归到商户的一个问题类别；
// 买家之后又发言，再停 30 分钟会重新提取。与飞书卡片的 AI 总结一样不计入商户的出稿用量。
import { and, asc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { charCount } from "@/contracts/reception";
import { ISSUE_OTHER, ISSUE_SUMMARY_MAX, type IssueCategory } from "@/contracts/issues";
import { chat, parseJson } from "@/server/ai/client";
import { db, schema } from "@/server/db/client";
import { transcript } from "@/server/feishu/content";
import { categoriesOf, otherCategoryId } from "./categories";

const G = schema.segment;
const M = schema.message;

/** 买家停止发言多久后提取 */
export const ISSUE_QUIET_MS = 30 * 60_000;
/** 定时补扫每轮最多处理的段数、并发数，只看最近几天开始的段（更早的用补算脚本） */
const SWEEP_LIMIT = 50;
const SWEEP_CONCURRENCY = 4;
const SWEEP_DAYS = 8;
/** 给 AI 看的最近消息条数 */
const TRANSCRIPT_MESSAGES = 30;

const squash = (s: string) => s.replace(/[\s（）()、，,]/g, "");

/** 模型输出 → 总结与类别：类别名先按原样、再忽略空白与括号标点匹配，匹配不上归「其他」；总结压成一行并截到上限 */
export function parseIssue(content: string, categories: IssueCategory[]): { summary: string | null; categoryId: string } {
  const j = parseJson(content);
  const name = typeof j.category === "string" ? j.category.trim() : "";
  const other = categories.find((c) => c.builtin) ?? categories.find((c) => c.name === ISSUE_OTHER);
  const hit = categories.find((c) => c.name === name) ?? (name ? categories.find((c) => squash(c.name) === squash(name)) : undefined);
  const raw = typeof j.summary === "string" ? j.summary.replace(/\s+/g, " ").trim() : "";
  const summary = raw ? (charCount(raw) > ISSUE_SUMMARY_MAX ? `${[...raw].slice(0, ISSUE_SUMMARY_MAX - 1).join("")}…` : raw) : null;
  return { summary, categoryId: (hit ?? other)!.id };
}

function prompt(categories: IssueCategory[]): string {
  return [
    "你是电商客服数据分析助手。阅读一段买家与店铺的对话，找出买家这次来咨询的主要问题。",
    '只输出 JSON：{"summary": "…", "category": "…"}。',
    "summary：一句简体中文，不超过 40 个字，写买家想要什么或遇到了什么问题，例如「买家询问 Tiny 3 是否有现货」；不写买家姓名、订单号、电话、地址。",
    `category：从下面的类别里选一个最贴切的，原样照抄类别名；都不贴切时选「${ISSUE_OTHER}」。`,
    `类别：${categories.map((c) => c.name).join("、")}`,
  ].join("\n");
}

export type ExtractResult = "done" | "no_buyer" | "failed";

/** 提取一个会话段的问题；AI 超时、出错或输出不合规时不写库，留给下一轮 */
export async function extractIssue(segmentId: string, now = new Date()): Promise<ExtractResult> {
  const [row] = await db()
    .select({ seg: G, shopId: schema.conversation.shopId })
    .from(G)
    .innerJoin(schema.conversation, eq(schema.conversation.id, G.conversationId))
    .where(eq(G.id, segmentId))
    .limit(1);
  if (!row) return "failed";
  const { seg, shopId } = row;
  const msgs = await db()
    .select()
    .from(M)
    .where(and(eq(M.conversationId, seg.conversationId), eq(M.segmentId, seg.id), inArray(M.senderRole, ["buyer", "agent", "platform_human", "ai"])))
    .orderBy(sql`${M.sentAt} desc`, sql`${M.createdAt} desc`)
    .limit(TRANSCRIPT_MESSAGES * 2);
  const recent = msgs.reverse();
  if (!recent.some((m) => m.senderRole === "buyer")) {
    await db()
      .update(G)
      .set({ issueSummary: null, issueCategoryId: await otherCategoryId(seg.merchantId), issueExtractedAt: now })
      .where(eq(G.id, seg.id));
    return "no_buyer";
  }
  const categories = await categoriesOf(seg.merchantId);
  const text = await transcript(shopId, recent.slice(-TRANSCRIPT_MESSAGES));
  try {
    const res = await chat(
      "issue",
      [
        { role: "system", content: prompt(categories) },
        { role: "user", content: text },
      ],
      { json: true, maxTokens: 200, stubHint: text },
    );
    const parsed = parseIssue(res.content, categories);
    await db().update(G).set({ issueSummary: parsed.summary, issueCategoryId: parsed.categoryId, issueExtractedAt: now }).where(eq(G.id, seg.id));
    return "done";
  } catch (err) {
    console.warn(JSON.stringify({ t: new Date().toISOString(), level: "warn", msg: "issue extract failed", segmentId, err: err instanceof Error ? err.message : String(err) }));
    return "failed";
  }
}

/** 段内最后一条买家消息的时刻 */
const lastBuyerAt = sql<Date>`(select max(m.sent_at) from message m where m.conversation_id = ${G.conversationId} and m.segment_id = ${G.id} and m.sender_role = 'buyer')`;

async function runAll(ids: string[], concurrency: number, now: Date) {
  const tally = { done: 0, no_buyer: 0, failed: 0 } as Record<ExtractResult, number>;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
      while (next < ids.length) tally[await extractIssue(ids[next++], now)] += 1;
    }),
  );
  return tally;
}

/** 定时补扫：最近几天开始、买家已停 30 分钟、还没提取或提取后买家又发过言的段（回补段、达人会话不提取） */
export async function sweepIssues(now = new Date()) {
  const rows = await db()
    .select({ id: G.id })
    .from(G)
    .innerJoin(schema.conversation, eq(schema.conversation.id, G.conversationId))
    .where(
      and(
        eq(schema.conversation.buyerKind, "buyer"),
        eq(G.backfilled, false),
        gte(G.startedAt, new Date(now.getTime() - SWEEP_DAYS * 86_400_000)),
        sql`${lastBuyerAt} <= ${new Date(now.getTime() - ISSUE_QUIET_MS)}`,
        or(isNull(G.issueExtractedAt), sql`${G.issueExtractedAt} < ${lastBuyerAt}`),
      ),
    )
    .orderBy(asc(G.startedAt))
    .limit(SWEEP_LIMIT);
  const ids = rows.map((r) => r.id);
  return { picked: ids.length, ...(await runAll(ids, SWEEP_CONCURRENCY, now)) };
}

/**
 * 补算历史：[from, to) 内开始、有买家消息的段；默认只算还没提取的，force 时全部重算。
 * 按 perSecond 限速逐段调用（默认每秒 1 段），每 200 段一批按开始时间推进。
 */
export async function backfillIssues(opts: { from: Date; to: Date; merchantId?: string; force?: boolean; perSecond?: number; log?: (line: string) => void }) {
  const gap = 1000 / Math.max(0.1, opts.perSecond ?? 1);
  const tally = { total: 0, done: 0, no_buyer: 0, failed: 0 };
  let after: { startedAt: Date; id: string } | null = null;
  for (;;) {
    const rows: Array<{ id: string; startedAt: Date }> = await db()
      .select({ id: G.id, startedAt: G.startedAt })
      .from(G)
      .innerJoin(schema.conversation, eq(schema.conversation.id, G.conversationId))
      .where(
        and(
          eq(schema.conversation.buyerKind, "buyer"),
          eq(G.backfilled, false),
          gte(G.startedAt, opts.from),
          lt(G.startedAt, opts.to),
          sql`${lastBuyerAt} is not null`,
          opts.merchantId ? eq(G.merchantId, opts.merchantId) : undefined,
          opts.force ? undefined : isNull(G.issueExtractedAt),
          after ? sql`(${G.startedAt}, ${G.id}) > (${after.startedAt}, ${after.id})` : undefined,
        ),
      )
      .orderBy(asc(G.startedAt), asc(G.id))
      .limit(200);
    if (rows.length === 0) break;
    for (const r of rows) {
      const t0 = Date.now();
      const res = await extractIssue(r.id);
      tally.total += 1;
      tally[res] += 1;
      if (tally.total % 50 === 0) opts.log?.(`已处理 ${tally.total} 段：成功 ${tally.done}，无买家消息 ${tally.no_buyer}，失败 ${tally.failed}`);
      const wait = gap - (Date.now() - t0);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    }
    after = rows[rows.length - 1];
  }
  return tally;
}
