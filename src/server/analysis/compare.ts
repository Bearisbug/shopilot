// 会话分析层第一步：AI 草稿与人工回复对比（draft.compare 每 10 分钟一轮，架构文档 4.1）。
// 辅助草稿：原样发送直接记语义一致；修改后发送比发出的那条；忽略后比客服另行发出的回复。
// 影子回复：比人工另行发出的回复（Shopilot 成员或平台后台）。人工回复取触发消息之后、下一条买家消息之前的本方文字消息，最多 3 条；
// 没有人工回复不建记录。与问题提取一样不计入商户的出稿用量。
import { and, asc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { DRAFT_CONSISTENCIES, DRAFT_EDIT_CLASSES, type DraftConsistency, type DraftEditClass } from "@/contracts/dashboard";
import { chat, parseJson } from "@/server/ai/client";
import { db, schema } from "@/server/db/client";

const D = schema.draft;
const M = schema.message;
const R = schema.draftReview;
const C = schema.conversation;

/** 草稿生成满多久才对比（给人工回复留时间） */
export const COMPARE_MIN_AGE_MS = 15 * 60_000;
/** 定时补扫只看最近几天生成的草稿（更早的用补算脚本），每轮最多处理的份数与并发 */
const SWEEP_DAYS = 8;
const SWEEP_LIMIT = 50;
const SWEEP_CONCURRENCY = 4;
/** 人工回复最多取几条；给 AI 看的触发消息之前的上下文条数 */
export const HUMAN_MAX = 3;
const CONTEXT_MESSAGES = 6;
const REASON_MAX = 100;
const EVIDENCE_MAX = 200;
const COMPARED_STATUSES = ["sent", "edited_sent", "ignored", "shadow"] as const;

type DraftRow = typeof D.$inferSelect;
type MessageRow = typeof M.$inferSelect;
export type CompareResult = "done" | "no_reply" | "failed";

/** 对比起点：触发消息的时间；没有触发消息时用草稿生成时间 */
const anchorSql = sql`coalesce((select t.sent_at from message t where t.id = ${D.triggerMessageId}), ${D.createdAt})`;
/** 起点之后、下一条买家消息之前，有没有本方的文字回复（Shopilot 成员或平台后台，发送失败的不算） */
const hasHumanReply = sql`exists (
  select 1 from message h
  where h.conversation_id = ${D.conversationId}
    and h.sender_role in ('agent', 'platform_human') and h.type = 'text' and coalesce(h.send_status, 'sent') <> 'failed'
    and h.sent_at > ${anchorSql}
    and h.sent_at < coalesce((select min(b.sent_at) from message b where b.conversation_id = ${D.conversationId} and b.sender_role = 'buyer' and b.sent_at > ${anchorSql}), 'infinity'::timestamptz)
)`;

/** 草稿之后人工最终发给买家的回复：起点之后、下一条买家消息之前的本方文字消息，按时间取前 HUMAN_MAX 条 */
export async function humanReplies(draft: DraftRow): Promise<MessageRow[]> {
  const [trigger] = draft.triggerMessageId ? await db().select({ sentAt: M.sentAt }).from(M).where(eq(M.id, draft.triggerMessageId)).limit(1) : [];
  const anchor = trigger?.sentAt ?? draft.createdAt;
  const [next] = await db()
    .select({ at: sql<Date | null>`min(${M.sentAt})` })
    .from(M)
    .where(and(eq(M.conversationId, draft.conversationId), eq(M.senderRole, "buyer"), sql`${M.sentAt} > ${anchor}`));
  return db()
    .select()
    .from(M)
    .where(
      and(
        eq(M.conversationId, draft.conversationId),
        inArray(M.senderRole, ["agent", "platform_human"]),
        eq(M.type, "text"),
        sql`coalesce(${M.sendStatus}, 'sent') <> 'failed'`,
        sql`${M.sentAt} > ${anchor}`,
        next?.at ? lt(M.sentAt, new Date(next.at)) : undefined,
      ),
    )
    .orderBy(asc(M.sentAt), asc(M.createdAt))
    .limit(HUMAN_MAX);
}

const SYSTEM = [
  "你是电商客服质检助手。比较 AI 起草的回复与人工客服最终发给买家的回复。",
  "两者可能是不同语言：先在心里把两者都转成中文，再比较语义，不按字面或编辑距离判断。",
  '只输出 JSON：{"edit_class": "…", "consistency": "…", "reason": "…", "evidence": "…"}。',
  "edit_class 选最贴切的一个：same 语义一致（意思相同，措辞可不同）；polish 仅语言润色（称呼、语序、更地道的表达，事实与做法不变）；supplement 补充信息（人工多说了必要的事实或条件）；correction 事实更正（人工改了 AI 说错的事实，如时效、价格、政策、型号参数）；process 流程改变（处理步骤或做法不同，如 AI 直接答应退款而人工先要照片）；rewrite 弃用重写（完全不相关或整体换了一个回答）。",
  "consistency：same 两者给买家的信息与做法一致；partial 大体一致但有缺漏或差异；different 不一致。",
  "reason：一句简体中文，不超过 50 个字，说明差在哪里。evidence：从人工回复里原样摘一句最能说明差异的话，不超过 100 字。不写买家姓名、电话、地址、订单号。",
].join("\n");

const clip = (s: unknown, max: number) => {
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return null;
  const chars = [...t];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : t;
};

/** 模型输出 → 分类、一致性、理由与证据；分类或一致性不在取值表里时返回 null（不写库，下一轮再比） */
export function parseCompare(content: string): { editClass: DraftEditClass; consistency: DraftConsistency; reason: string | null; evidence: string | null } | null {
  const j = parseJson(content);
  const editClass = typeof j.edit_class === "string" ? j.edit_class.trim() : "";
  const consistency = typeof j.consistency === "string" ? j.consistency.trim() : "";
  if (!(DRAFT_EDIT_CLASSES as readonly string[]).includes(editClass) || !(DRAFT_CONSISTENCIES as readonly string[]).includes(consistency)) return null;
  return { editClass: editClass as DraftEditClass, consistency: consistency as DraftConsistency, reason: clip(j.reason, REASON_MAX), evidence: clip(j.evidence, EVIDENCE_MAX) };
}

/** 触发消息之前（含）的最近几条对话，给 AI 当上下文 */
async function context(draft: DraftRow): Promise<string[]> {
  const [trigger] = draft.triggerMessageId ? await db().select({ sentAt: M.sentAt }).from(M).where(eq(M.id, draft.triggerMessageId)).limit(1) : [];
  const rows = await db()
    .select({ role: M.senderRole, text: M.text, translation: M.translation })
    .from(M)
    .where(and(eq(M.conversationId, draft.conversationId), inArray(M.senderRole, ["buyer", "agent", "platform_human", "ai"]), eq(M.type, "text"), lte(M.sentAt, trigger?.sentAt ?? draft.createdAt)))
    .orderBy(sql`${M.sentAt} desc`, sql`${M.createdAt} desc`)
    .limit(CONTEXT_MESSAGES);
  return rows.reverse().map((m) => `${m.role === "buyer" ? "买家" : "客服"}：${m.text ?? ""}${m.translation ? `（译：${m.translation}）` : ""}`);
}

async function save(draft: DraftRow, conv: { merchantId: string }, humans: MessageRow[], humanText: string, r: { editClass: DraftEditClass; consistency: DraftConsistency; reason: string | null; evidence: string | null }, model: string) {
  await db()
    .insert(R)
    .values({
      merchantId: conv.merchantId,
      draftId: draft.id,
      conversationId: draft.conversationId,
      segmentId: draft.segmentId,
      kind: draft.mode === "shadow" ? "shadow" : "assist",
      draftStatus: draft.status,
      humanText,
      humanMessageIds: humans.map((m) => m.id),
      ...r,
      model,
    })
    .onConflictDoNothing({ target: R.draftId });
}

/** 对比一份草稿；没有人工回复返回 no_reply（不建记录），AI 超时、出错或输出不合规返回 failed（不写库，留给下一轮） */
export async function compareDraft(draftId: string): Promise<CompareResult> {
  const [row] = await db().select({ draft: D, merchantId: C.merchantId }).from(D).innerJoin(C, eq(C.id, D.conversationId)).where(eq(D.id, draftId)).limit(1);
  if (!row) return "failed";
  const { draft } = row;
  const sent = draft.sentMessageId && (draft.status === "sent" || draft.status === "edited_sent") ? (await db().select().from(M).where(eq(M.id, draft.sentMessageId)).limit(1))[0] : undefined;
  if (draft.status === "sent") {
    await save(draft, row, sent ? [sent] : [], sent?.text ?? draft.text, { editClass: "same", consistency: "same", reason: "原样发送", evidence: null }, "rule");
    return "done";
  }
  const humans = sent ? [sent] : await humanReplies(draft);
  if (humans.length === 0) return "no_reply";
  const humanText = humans.map((m) => m.text ?? "").join("\n");
  const payload = {
    buyer_context: await context(draft),
    draft: draft.text,
    human: humanText,
    ...(humans.some((m) => m.originalText) ? { human_original: humans.map((m) => m.originalText ?? m.text ?? "") } : {}),
  };
  try {
    const res = await chat(
      "compare",
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(payload) },
      ],
      { json: true, maxTokens: 300 },
    );
    const parsed = parseCompare(res.content);
    if (!parsed) throw new Error("输出的分类或一致性不在取值表里");
    await save(draft, row, humans, humanText, parsed, res.model);
    return "done";
  } catch (err) {
    console.warn(JSON.stringify({ t: new Date().toISOString(), level: "warn", msg: "draft compare failed", draftId, err: err instanceof Error ? err.message : String(err) }));
    return "failed";
  }
}

/** 可对比的草稿：辅助或影子模式、已处置或是影子、生成满 15 分钟、还没对比；忽略与影子要已有人工回复（没有就不挑，免得每轮重复挑中） */
function eligible(createdBefore: Date) {
  return and(
    eq(C.buyerKind, "buyer"),
    inArray(D.mode, ["assist", "shadow"]),
    inArray(D.status, COMPARED_STATUSES),
    lte(D.createdAt, createdBefore),
    sql`not exists (select 1 from draft_review r where r.draft_id = ${D.id})`,
    sql`(${D.status} in ('sent', 'edited_sent') or ${hasHumanReply})`,
  );
}

async function runAll(ids: string[], concurrency: number) {
  const tally: Record<CompareResult, number> = { done: 0, no_reply: 0, failed: 0 };
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
      while (next < ids.length) tally[await compareDraft(ids[next++])] += 1;
    }),
  );
  return tally;
}

/** 定时补扫：最近 8 天生成的可对比草稿，最早的先比，每轮最多 50 份 */
export async function sweepDraftReviews(now = new Date()) {
  const rows = await db()
    .select({ id: D.id })
    .from(D)
    .innerJoin(C, eq(C.id, D.conversationId))
    .where(and(eligible(new Date(now.getTime() - COMPARE_MIN_AGE_MS)), gte(D.createdAt, new Date(now.getTime() - SWEEP_DAYS * 86_400_000))))
    .orderBy(asc(D.createdAt))
    .limit(SWEEP_LIMIT);
  return { picked: rows.length, ...(await runAll(rows.map((r) => r.id), SWEEP_CONCURRENCY)) };
}

/** 补算历史：[from, to) 内生成的可对比草稿，按 perSecond 限速逐份对比，每 200 份一批按生成时间推进 */
export async function backfillDraftReviews(opts: { from: Date; to: Date; merchantId?: string; perSecond: number; log: (line: string) => void }) {
  const gap = 1000 / Math.max(0.1, opts.perSecond);
  const tally = { total: 0, done: 0, no_reply: 0, failed: 0 };
  const now = new Date();
  let after: { createdAt: Date; id: string } | null = null;
  for (;;) {
    const rows: Array<{ id: string; createdAt: Date }> = await db()
      .select({ id: D.id, createdAt: D.createdAt })
      .from(D)
      .innerJoin(C, eq(C.id, D.conversationId))
      .where(
        and(
          eligible(new Date(now.getTime() - COMPARE_MIN_AGE_MS)),
          gte(D.createdAt, opts.from),
          lt(D.createdAt, opts.to),
          opts.merchantId ? eq(D.merchantId, opts.merchantId) : undefined,
          after ? sql`(${D.createdAt}, ${D.id}) > (${after.createdAt}, ${after.id})` : undefined,
        ),
      )
      .orderBy(asc(D.createdAt), asc(D.id))
      .limit(200);
    if (rows.length === 0) break;
    for (const r of rows) {
      const t0 = Date.now();
      tally[await compareDraft(r.id)] += 1;
      tally.total += 1;
      if (tally.total % 50 === 0) opts.log(`已处理 ${tally.total} 份：对比 ${tally.done}，无人工回复 ${tally.no_reply}，失败 ${tally.failed}`);
      const wait = gap - (Date.now() - t0);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    }
    after = rows[rows.length - 1];
  }
  return tally;
}
