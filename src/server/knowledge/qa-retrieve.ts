// 问答检索（§12.8「问答检索」）：改写后的中文问题与买家原话一起向量化（一次请求），两路各取 5 条，
// 只取商户内已发布、有向量、适用该店站点、阶段对得上（当前阶段或「全部阶段」）、产品对得上的问答，余弦距离 < 0.55；
// 两路交替合并去重取前 6 条，编号从 1 起，排在资料分块前面。向量化或查询失败、超时只降级（不带问答），不阻塞出稿。
import { and, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import type { QaStage } from "@/contracts/knowledge";
import { db, schema } from "@/server/db/client";
import { EMBED_TIMEOUT_MS, embedTexts } from "./embed";

export const QA_ROUTE_KEEP = 5;
export const QA_MERGED_KEEP = 6;
/** 余弦距离阈值（1 − 余弦相似度）：大于等于它的不算命中 */
export const QA_MAX_DISTANCE = 0.55;

const q = schema.knowledgeQa;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QaHitRow = { route: "rewritten" | "original"; qaId: string; questions: string[]; answer: string; distance: number };
export type QaOutcome = {
  latencyMs: number;
  error: string | null;
  stage: Exclude<QaStage, "any"> | null;
  productIds: string[];
  hits: QaHitRow[];
  merged: Array<{ n: number; hit: QaHitRow }>;
};

/** 已发布、有向量的问答；market 为 null（测试问答没选店铺）时不看站点 */
function usableQaWhere(merchantId: string, market: string | null): SQL[] {
  const where: SQL[] = [eq(q.merchantId, merchantId), eq(q.status, "published"), isNotNull(q.embedding)];
  if (market) where.push(sql`(${q.markets} @> '["ALL"]'::jsonb or ${q.markets} @> ${JSON.stringify([market])}::jsonb)`);
  return where;
}

export async function hasPublishedQa(merchantId: string, market: string | null): Promise<boolean> {
  const [row] = await db().select({ id: q.id }).from(q).where(and(...usableQaWhere(merchantId, market))).limit(1);
  return !!row;
}

/**
 * 过滤口径：
 * - 阶段：当前阶段已知时取「该阶段 + 全部阶段」，未知（unknown）时不过滤；
 * - 产品：识别出产品时取「通用 + 与识别出的产品有交集」；没识别出产品时不按产品过滤（产品专属的问答也可能就是买家在问的），只按相似度排。
 */
function filterWhere(merchantId: string, market: string | null, stage: QaOutcome["stage"], productIds: string[]): SQL[] {
  const where = usableQaWhere(merchantId, market);
  if (stage) where.push(sql`${q.stage} in (${stage}, 'any')`);
  // 产品 ID 来自库里的行或已校验的请求参数，这里再按 uuid 格式过一遍才拼进数组字面量
  const ids = productIds.filter((id) => UUID.test(id));
  if (ids.length) where.push(sql`(cardinality(${q.productIds}) = 0 or ${q.productIds} && ${sql.raw(`'{${ids.join(",")}}'`)}::uuid[])`);
  return where;
}

async function nearest(where: SQL[], vec: number[], route: QaHitRow["route"]): Promise<QaHitRow[]> {
  const literal = `[${vec.join(",")}]`;
  const distance = sql<number>`(${q.embedding} <=> ${literal}::vector)`;
  const rows = await db()
    .select({ qaId: q.id, questions: q.questions, answer: q.answer, distance })
    .from(q)
    .where(and(...where, sql`${distance} < ${QA_MAX_DISTANCE}`))
    .orderBy(distance)
    .limit(QA_ROUTE_KEEP);
  return rows.map((r) => ({ route, qaId: r.qaId, questions: r.questions, answer: r.answer, distance: Number(r.distance) }));
}

/** 两路按名次交替取，改写路在前，按问答去重，取前 6 条，编号 1–6 */
export function mergeQa(rewritten: QaHitRow[], original: QaHitRow[]): Array<{ n: number; hit: QaHitRow }> {
  const merged: Array<{ n: number; hit: QaHitRow }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < Math.max(rewritten.length, original.length) && merged.length < QA_MERGED_KEEP; i++) {
    for (const h of [rewritten[i], original[i]]) {
      if (!h || seen.has(h.qaId) || merged.length >= QA_MERGED_KEEP) continue;
      seen.add(h.qaId);
      merged.push({ n: merged.length + 1, hit: h });
    }
  }
  return merged;
}

export async function retrieveQa(input: {
  merchantId: string;
  market: string | null;
  stage: string | null;
  productIds: string[];
  rewritten: string | null;
  original: string | null;
}): Promise<QaOutcome> {
  const started = Date.now();
  const stage: QaOutcome["stage"] = input.stage === "presale" || input.stage === "insale" || input.stage === "aftersale" ? input.stage : null;
  const base = { stage, productIds: input.productIds };
  const routes = [
    ...(input.rewritten?.trim() ? [{ route: "rewritten" as const, text: input.rewritten.trim() }] : []),
    ...(input.original?.trim() ? [{ route: "original" as const, text: input.original.trim() }] : []),
  ];
  if (routes.length === 0) return { latencyMs: 0, error: null, ...base, hits: [], merged: [] };
  try {
    const vectors = await embedTexts(
      routes.map((r) => r.text),
      EMBED_TIMEOUT_MS,
    );
    const where = filterWhere(input.merchantId, input.market, stage, input.productIds);
    const lists = await Promise.all(routes.map((r, i) => nearest(where, vectors[i], r.route)));
    const byRoute = (route: QaHitRow["route"]) => lists[routes.findIndex((r) => r.route === route)] ?? [];
    return { latencyMs: Date.now() - started, error: null, ...base, hits: lists.flat(), merged: mergeQa(byRoute("rewritten"), byRoute("original")) };
  } catch (e) {
    return { latencyMs: Date.now() - started, error: e instanceof Error ? e.message : String(e), ...base, hits: [], merged: [] };
  }
}
