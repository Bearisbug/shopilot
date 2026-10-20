// 整理成问答（API-KB-028、knowledge.qa_extract）：读资料的解析分块，约 6,000 字一批交给 DeepSeek，产出待审核的问答候选。
// 候选只是来源材料，审核通过才发布（需求稿二、10-19 答复第 3 项）。同一资料重新整理时先删掉它尚未审核的候选；
// 与已有待审核、已发布问答的向量余弦相似度 ≥ 0.92 时标「疑似重复」，本轮候选之间这么相近的只留第一条。
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { QA_ANSWER_MAX, QA_EXTRACT_MAX, QA_QUESTION_MAX, QA_QUESTIONS_MAX } from "@/contracts/knowledge";
import { AiError, chat, parseJson } from "@/server/ai/client";
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { db, schema } from "@/server/db/client";
import { conflict, notFound } from "@/server/http/problem";
import { enqueue } from "@/server/jobs/boss";
import { documentView } from "./documents";
import { EMBED_MODEL, embedTexts, qaEmbedText } from "./embed";

const d = schema.knowledgeDocument;
const q = schema.knowledgeQa;

/** 每批最多多少字 */
export const QA_EXTRACT_BATCH_CHARS = 6_000;
/** 余弦距离 ≤ 0.08（相似度 ≥ 0.92）算疑似重复 */
export const QA_DUPLICATE_DISTANCE = 0.08;
/** 「整理中」超过 30 分钟视为任务已中断，可以重新发起 */
const STALE_RUNNING_MS = 30 * 60_000;
const EXCERPT_MAX = 2_000;

export const QA_EXTRACT_PROMPT = `你是电商客服知识整理员。把给你的资料片段整理成买家会问的问答，供客服 AI 回答买家时引用。
要求：
1. 只根据资料内容整理，不编造资料里没有的信息；资料里没有可问答的内容时返回空列表。
2. 每条问答一个主题：questions 写 1–3 个买家可能的问法（中文，口语化，每个不超过 60 字），answer 写客服可直接参考的完整回复（中文，不超过 500 字）。
3. stage 取 presale（售前：选购、参数、兼容、价格）、insale（售中：付款后发货前，改地址、催发货）、aftersale（售后：使用、故障、退换、保修）或 any（不分阶段）。
4. product_codes 只能从给你的产品清单里选物料编码（code）；资料说的是通用政策或说不清是哪个产品时给空数组。
5. excerpt 摘出支撑这条回复的资料原文（不超过 300 字）。
只输出 JSON：{"items":[{"questions":["…"],"answer":"…","stage":"aftersale","product_codes":["…"],"excerpt":"…"}]}`;

type Candidate = { questions: string[]; answer: string; stage: "presale" | "insale" | "aftersale" | "any"; productIds: string[]; excerpt: string };

/** API-KB-028：资料解析完成才可以整理；正在整理时 409 */
export async function startQaExtract(ctx: MemberContext, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  const [doc] = await db()
    .select()
    .from(d)
    .where(and(eq(d.id, id), eq(d.merchantId, ctx.merchant.id), sql`${d.status} <> 'deleting'`))
    .limit(1);
  if (!doc) throw notFound();
  if (doc.status !== "ready") throw conflict(doc.status === "failed" ? "这份资料解析失败，请先重新解析。" : "这份资料还在解析，解析完成后再整理。", { status: doc.status }, "not_ready");
  const stale = new Date(Date.now() - STALE_RUNNING_MS);
  const [updated] = await db()
    .update(d)
    .set({ qaExtractStatus: "running", qaExtractError: null, updatedAt: new Date() })
    .where(and(eq(d.id, doc.id), sql`(${d.qaExtractStatus} <> 'running' or ${d.updatedAt} < ${stale})`))
    .returning();
  if (!updated) throw conflict("这份资料正在整理成问答，请稍候。", { qaExtractStatus: "running" }, "extract_running");
  await enqueue("knowledge.qa_extract", { documentId: doc.id }, { singletonKey: doc.id });
  await audit(ctx.actor, { module: "reception", action: "knowledge_qa_extract", summary: `整理资料「${doc.name}」为问答`, targetType: "knowledge_document", targetId: doc.id });
  return { document: await documentView(updated) };
}

/** 资料分块按顺序拼成不超过 6,000 字的批次（单个分块超长就单独成批并截断） */
export function batchChunks(texts: string[], max = QA_EXTRACT_BATCH_CHARS): string[] {
  const out: string[] = [];
  let cur = "";
  for (const t of texts.map((x) => x.trim()).filter(Boolean)) {
    const piece = [...t].length > max ? [...t].slice(0, max).join("") : t;
    if (cur && [...cur].length + [...piece].length + 2 > max) {
      out.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n\n${piece}` : piece;
  }
  if (cur) out.push(cur);
  return out;
}

const cut = (s: string, n: number) => [...s].slice(0, n).join("");

/** 解析并收紧一批模型输出：问法去重截断、回复截断、阶段与产品编码只认合法值 */
export function parseCandidates(j: Record<string, unknown>, codeToId: Map<string, string>): Candidate[] {
  const items = Array.isArray(j.items) ? j.items : [];
  const out: Candidate[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const questions = [...new Set((Array.isArray(it.questions) ? it.questions : []).map((x) => cut(String(x ?? "").trim(), QA_QUESTION_MAX)).filter(Boolean))].slice(0, QA_QUESTIONS_MAX);
    const answer = cut(String(it.answer ?? "").trim(), QA_ANSWER_MAX);
    if (!questions.length || !answer) continue;
    const stage = ["presale", "insale", "aftersale", "any"].includes(String(it.stage)) ? (String(it.stage) as Candidate["stage"]) : "any";
    const codes = Array.isArray(it.product_codes) ? it.product_codes.map((c) => String(c ?? "").trim().toUpperCase()) : [];
    const productIds = [...new Set(codes.map((c) => codeToId.get(c)).filter((v): v is string => !!v))];
    out.push({ questions, answer, stage, productIds, excerpt: cut(String(it.excerpt ?? "").trim(), EXCERPT_MAX) });
  }
  return out;
}

/** knowledge.qa_extract 任务 */
export async function extractQa(data: Record<string, unknown>): Promise<void> {
  const documentId = String(data.documentId ?? "");
  const [doc] = await db().select().from(d).where(eq(d.id, documentId)).limit(1);
  if (!doc || doc.status !== "ready" || doc.qaExtractStatus !== "running") return;
  try {
    const chunks = await db().select({ text: schema.knowledgeChunk.text }).from(schema.knowledgeChunk).where(eq(schema.knowledgeChunk.documentId, doc.id)).orderBy(asc(schema.knowledgeChunk.no));
    const products = await db().select({ id: schema.product.id, code: schema.product.code, name: schema.product.name, aliases: schema.product.aliases }).from(schema.product).where(eq(schema.product.merchantId, doc.merchantId));
    const codeToId = new Map(products.map((p) => [p.code.trim().toUpperCase(), p.id]));
    const productList = products.map((p) => ({ code: p.code, name: p.name, aliases: p.aliases }));

    const candidates: Candidate[] = [];
    for (const text of batchChunks(chunks.map((c) => c.text))) {
      if (candidates.length >= QA_EXTRACT_MAX) break;
      const res = await chat(
        "qa_extract",
        [
          { role: "system", content: QA_EXTRACT_PROMPT },
          { role: "user", content: JSON.stringify({ document_name: doc.name, products: productList, text }) },
        ],
        { json: true, maxTokens: 4000, stubHint: text },
      );
      candidates.push(...parseCandidates(parseJson(res.content), codeToId));
    }
    const kept = candidates.slice(0, QA_EXTRACT_MAX);

    // 向量化失败不阻塞：候选照样写入（不判重复），向量由 knowledge.qa_embed 补
    let vectors: Array<number[] | null> = kept.map(() => null);
    try {
      vectors = await embedTexts(
        kept.map((c) => qaEmbedText(c.questions)),
        10_000,
      );
    } catch {
      // 保持 null
    }

    await db().transaction(async (tx) => {
      await tx.delete(q).where(and(eq(q.sourceDocumentId, doc.id), eq(q.status, "pending")));
      let n = 0;
      for (const [i, c] of kept.entries()) {
        const vec = vectors[i];
        let duplicateOf: string | null = null;
        if (vec) {
          const literal = `[${vec.join(",")}]`;
          // 本轮已写入的候选也在库里（同一事务），所以和它们太近的直接丢掉；和别的问答太近的标「疑似重复」
          const [near] = await tx
            .select({ id: q.id, doc: q.sourceDocumentId, status: q.status, distance: sql<number>`(${q.embedding} <=> ${literal}::vector)` })
            .from(q)
            .where(and(eq(q.merchantId, doc.merchantId), inArray(q.status, ["pending", "published"]), sql`${q.embedding} is not null`, sql`(${q.embedding} <=> ${literal}::vector) <= ${QA_DUPLICATE_DISTANCE}`))
            .orderBy(sql`${q.embedding} <=> ${literal}::vector`)
            .limit(1);
          if (near && near.doc === doc.id && near.status === "pending") continue;
          duplicateOf = near?.id ?? null;
        }
        await tx.insert(q).values({
          merchantId: doc.merchantId,
          questions: c.questions,
          answer: c.answer,
          productIds: c.productIds,
          stage: c.stage,
          markets: doc.markets,
          status: "pending",
          source: "import",
          sourceDocumentId: doc.id,
          sourceExcerpt: c.excerpt || null,
          duplicateOf,
          embedding: vec,
          embeddingModel: vec ? EMBED_MODEL : null,
        });
        n += 1;
      }
      await tx.update(d).set({ qaExtractStatus: "done", qaExtractCount: n, qaExtractError: null, qaExtractedAt: new Date(), updatedAt: new Date() }).where(eq(d.id, doc.id));
    });
  } catch (e) {
    const reason = e instanceof AiError ? (e.kind === "timeout" ? "AI 整理超时，请稍后重试。" : "AI 暂时不可用，请稍后重试。") : "整理失败，请稍后重试。";
    console.log(JSON.stringify({ t: new Date().toISOString(), level: "warn", job: "knowledge.qa_extract", documentId: doc.id, err: e instanceof Error ? e.message : String(e) }));
    await db().update(d).set({ qaExtractStatus: "failed", qaExtractError: reason, updatedAt: new Date() }).where(eq(d.id, doc.id));
  }
}

/** 「整理中」卡住（任务中断）超过 30 分钟的标失败，供每小时补扫调用 */
export async function failStaleExtracts(): Promise<number> {
  const rows = await db()
    .update(d)
    .set({ qaExtractStatus: "failed", qaExtractError: "整理任务中断，请重新整理。", updatedAt: new Date() })
    .where(and(eq(d.qaExtractStatus, "running"), lt(d.updatedAt, new Date(Date.now() - STALE_RUNNING_MS))))
    .returning({ id: d.id });
  return rows.length;
}
