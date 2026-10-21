// 出稿候选经验卡（RULE-KB-005，§12.8「经验卡」）：与问答共用改写问题与买家原话的向量，两路各取 3 张、余弦距离 < 0.6，
// 交替合并去重取前 3 张；只取商户内已发布、有向量、适用该店站点、阶段与产品对得上的卡（口径同问答）。
// 本段上一份草稿正在用的卡（active）一定带上；模拟出稿的拟发布内容（override）一定带上，替换同一张卡或作为新卡 "proposal"。
import { and, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import type { CardContent } from "@/contracts/cards";
import { db, schema } from "@/server/db/client";
import { cardContentOf } from "./card-store";
import type { RouteVector } from "./qa-retrieve";

export const CARD_ROUTE_KEEP = 3;
export const CARD_MERGED_KEEP = 3;
/** 余弦距离阈值（1 − 余弦相似度）：大于等于它的不算命中 */
export const CARD_MAX_DISTANCE = 0.6;
/** 模拟出稿里还没保存的拟发布卡 */
export const PROPOSAL_CARD_ID = "proposal";

const c = schema.experienceCard;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 模拟出稿时生效的卡内容：cardId 给了 = 替换这张已有卡；不给 = 当作一张新卡 */
export type CardOverride = { cardId?: string | null; content: CardContent };
/** key 是交给模型的卡编号（K1…）；cardId 为 "proposal" 表示拟发布的新卡 */
export type CardCandidate = { key: string; cardId: string; version: number; content: CardContent; distance: number | null; active: boolean };
export type CardOutcome = {
  latencyMs: number;
  error: string | null;
  hits: Array<{ route: RouteVector["route"]; cardId: string; distance: number }>;
  candidates: CardCandidate[];
  /** 本段上一份草稿做到的那一步（active 卡仍在候选里时） */
  activeStep: number | null;
};

function usableCardWhere(merchantId: string, market: string | null): SQL[] {
  const where: SQL[] = [eq(c.merchantId, merchantId), eq(c.status, "published"), isNotNull(c.embedding)];
  if (market) where.push(sql`(${c.markets} @> '["ALL"]'::jsonb or ${c.markets} @> ${JSON.stringify([market])}::jsonb)`);
  return where;
}

export async function hasPublishedCards(merchantId: string, market: string | null): Promise<boolean> {
  const [row] = await db().select({ id: c.id }).from(c).where(and(...usableCardWhere(merchantId, market))).limit(1);
  return !!row;
}

/** 阶段已知时取「该阶段 + 全部阶段」；识别出产品时取「通用 + 有交集」，没识别出不按产品过滤（同问答） */
function filterWhere(merchantId: string, market: string | null, stage: string | null, productIds: string[]): SQL[] {
  const where = usableCardWhere(merchantId, market);
  if (stage === "presale" || stage === "insale" || stage === "aftersale") where.push(sql`${c.stage} in (${stage}, 'any')`);
  const ids = productIds.filter((id) => UUID.test(id));
  if (ids.length) where.push(sql`(cardinality(${c.productIds}) = 0 or ${c.productIds} && ${sql.raw(`'{${ids.join(",")}}'`)}::uuid[])`);
  return where;
}

async function nearest(where: SQL[], v: RouteVector) {
  const distance = sql<number>`(${c.embedding} <=> ${`[${v.vec.join(",")}]`}::vector)`;
  const rows = await db()
    .select({ row: c, distance })
    .from(c)
    .where(and(...where, sql`${distance} < ${CARD_MAX_DISTANCE}`))
    .orderBy(distance)
    .limit(CARD_ROUTE_KEEP);
  return rows.map((r) => ({ route: v.route, row: r.row, distance: Number(r.distance) }));
}

export async function retrieveCards(input: {
  merchantId: string;
  market: string | null;
  stage: string | null;
  productIds: string[];
  vectors: RouteVector[];
  /** 向量化已失败：只带 active 与 override */
  embedError?: string | null;
  active?: { cardId: string; step: number } | null;
  override?: CardOverride | null;
}): Promise<CardOutcome> {
  const started = Date.now();
  let error = input.embedError ?? null;
  let lists: Array<Awaited<ReturnType<typeof nearest>>> = [];
  if (!error && input.vectors.length) {
    try {
      const where = filterWhere(input.merchantId, input.market, input.stage, input.productIds);
      lists = await Promise.all(input.vectors.map((v) => nearest(where, v)));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  // 两路按名次交替取，改写路在前，按卡去重
  const picked: Array<{ cardId: string; version: number; content: CardContent; distance: number | null }> = [];
  const byRoute = (route: RouteVector["route"]) => lists.find((l) => l[0]?.route === route) ?? [];
  const [a, b] = [byRoute("rewritten"), byRoute("original")];
  for (let i = 0; i < Math.max(a.length, b.length) && picked.length < CARD_MERGED_KEEP; i++) {
    for (const h of [a[i], b[i]]) {
      if (!h || picked.some((p) => p.cardId === h.row.id) || picked.length >= CARD_MERGED_KEEP) continue;
      picked.push({ cardId: h.row.id, version: h.row.version, content: cardContentOf(h.row), distance: h.distance });
    }
  }

  // 本段正在用的卡：仍是已发布的才带上
  let activeId: string | null = null;
  if (input.active && UUID.test(input.active.cardId)) {
    const hit = picked.find((p) => p.cardId === input.active!.cardId);
    if (hit) activeId = hit.cardId;
    else {
      const [row] = await db()
        .select()
        .from(c)
        .where(and(eq(c.id, input.active.cardId), eq(c.merchantId, input.merchantId), eq(c.status, "published")))
        .limit(1);
      if (row) {
        picked.unshift({ cardId: row.id, version: row.version, content: cardContentOf(row), distance: null });
        activeId = row.id;
      }
    }
  }

  // 拟发布内容：替换同一张卡，或作为新卡排在最前
  const o = input.override;
  if (o) {
    const target = o.cardId ? picked.find((p) => p.cardId === o.cardId) : undefined;
    if (target) target.content = o.content;
    else if (o.cardId) {
      const [row] = await db()
        .select({ version: c.version })
        .from(c)
        .where(and(eq(c.id, o.cardId), eq(c.merchantId, input.merchantId)))
        .limit(1);
      picked.unshift({ cardId: o.cardId, version: row?.version ?? 0, content: o.content, distance: null });
    } else picked.unshift({ cardId: PROPOSAL_CARD_ID, version: 0, content: o.content, distance: null });
  }

  const candidates = picked.map((p, i) => ({ key: `K${i + 1}`, ...p, active: p.cardId === activeId }));
  return {
    latencyMs: Date.now() - started,
    error,
    hits: lists.flat().map((h) => ({ route: h.route, cardId: h.row.id, distance: h.distance })),
    candidates,
    activeStep: activeId ? input.active!.step : null,
  };
}

/** 出稿载荷里的 cards 与 active_card；关联问答列第一个问法（删除或下架的不列）。没有候选卡时都不带 */
export async function cardsPayload(o: CardOutcome | null, merchantId: string) {
  if (!o || o.candidates.length === 0) return {};
  const qaIds = [...new Set(o.candidates.flatMap((x) => x.content.qaIds))];
  const rows = qaIds.length
    ? await db()
        .select({ id: schema.knowledgeQa.id, questions: schema.knowledgeQa.questions })
        .from(schema.knowledgeQa)
        .where(and(eq(schema.knowledgeQa.merchantId, merchantId), eq(schema.knowledgeQa.status, "published"), inArray(schema.knowledgeQa.id, qaIds)))
    : [];
  const question = new Map(rows.map((r) => [r.id, r.questions[0]]));
  const active = o.candidates.find((x) => x.active);
  return {
    cards: o.candidates.map((x) => {
      const related = x.content.qaIds.map((id) => question.get(id)).filter((q): q is string => !!q);
      return {
        id: x.key,
        title: x.content.title,
        conditions: x.content.conditions,
        condition_mode: x.content.conditionMode,
        steps: x.content.steps.map((st, i) => ({
          n: i + 1,
          text: st.text,
          branches: st.branches.map((b) => ({ when: b.when, then: b.action === "handoff" ? "转人工" : b.action === "ticket" ? "建工单" : `跳到第 ${b.goto} 步` })),
        })),
        ...(x.content.tips ? { tips: x.content.tips } : {}),
        ...(related.length ? { related_qa: related } : {}),
      };
    }),
    ...(active && o.activeStep !== null ? { active_card: { id: active.key, step: o.activeStep } } : {}),
  };
}

/** 模型声明用到的卡对到候选：编号不在候选里当没用卡；步号夹在 1 到最后一步之间 */
export function cardUsed(o: CardOutcome | null, m: { key: string; step: number; reason: string; action: "continue" | "handoff" | "ticket"; ticketSummary: string | null } | null) {
  if (!o || !m) return null;
  const hit = o.candidates.find((x) => x.key === m.key);
  if (!hit) return null;
  const step = Math.min(Math.max(1, m.step), hit.content.steps.length);
  return { cardId: hit.cardId, version: hit.version, title: hit.content.title, step, action: m.action, reason: m.reason, ticketSummary: m.ticketSummary };
}
