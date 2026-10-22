// 经验卡管理（API-KB-029 至 API-KB-037，§11 经验卡状态）：人写的保存即发布、每次内容变化写一个版本；下架不参与出稿；
// 回退 = 用旧版本内容写新版本；Agent 改过的卡标 agent_unseen，人看过（标为已看、编辑、回退）后清掉。
// 列表与详情带近 30 天效果：按 draft.card_id 汇总辅助模式草稿的处置、按卡转人工与建工单、影子回复与人工回复的对比；
// 辅助、自动模式按卡转人工时不存草稿，只写 handoff 审计（data.reason = card、data.card_id），这部分也计入调用与转人工。
import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { CardContent, CardDetail, CardList, CardListQuery, CardPatch, CardRollbackBody, CardStats, CardStatus, CardVersionView, ExperienceCard } from "@/contracts/cards";
import { CARD_VERSIONS_SHOWN, zCardContent } from "@/contracts/cards";
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { db, schema, type Executor } from "@/server/db/client";
import { conflict, notFound, Problem, validation } from "@/server/http/problem";
import { reviewHistory } from "./card-review";
import { cardContentOf, cardEmbedText, checkCardRefs, insertCard, needsEmbed, tryEmbedCard, writeCardVersion, type CardRow } from "./card-store";
import { EMBED_MODEL, embedTexts } from "./embed";

const c = schema.experienceCard;
const v = schema.experienceCardVersion;
const UUID = /^[0-9a-f-]{36}$/i;
const STATS_DAYS = 30;

const EMPTY_STATS: CardStats = { calls: 0, sent: 0, edited: 0, ignored: 0, handoffs: 0, shadowSame: 0, shadowPartial: 0, shadowDifferent: 0 };

/** 近 30 天每张卡的效果；没有用到过的卡全为 0 */
async function statsFor(merchantId: string, cardIds: string[], ex: Executor = db()): Promise<Map<string, CardStats>> {
  if (cardIds.length === 0) return new Map();
  const d = schema.draft;
  const r = schema.draftReview;
  const a = schema.auditLog;
  const cardIdOf = sql<string>`${a.data}->>'card_id'`;
  const handoffRows = ex
    .select({ cardId: cardIdOf, n: sql<number>`count(*)::int` })
    .from(a)
    .where(
      and(
        eq(a.merchantId, merchantId),
        eq(a.action, "handoff"),
        eq(a.targetType, "conversation"),
        sql`${a.data}->>'reason' = 'card'`,
        // 只数没留草稿的按卡转人工；自动模式按卡建工单既存了草稿（action=ticket）又写了转人工审计，草稿那边已经算过
        sql`${a.data}->>'card_action' = 'handoff'`,
        inArray(cardIdOf, cardIds),
        sql`${a.createdAt} >= now() - make_interval(days => ${STATS_DAYS})`,
      ),
    )
    .groupBy(cardIdOf);
  const draftRows = ex
    .select({
      cardId: d.cardId,
      calls: sql<number>`count(*)::int`,
      sent: sql<number>`count(*) filter (where ${d.status} = 'sent' and ${d.mode} = 'assist')::int`,
      edited: sql<number>`count(*) filter (where ${d.status} = 'edited_sent')::int`,
      ignored: sql<number>`count(*) filter (where ${d.status} = 'ignored')::int`,
      handoffs: sql<number>`count(*) filter (where ${d.card}->>'action' in ('handoff', 'ticket'))::int`,
      shadowSame: sql<number>`count(*) filter (where ${r.kind} = 'shadow' and ${r.consistency} = 'same')::int`,
      shadowPartial: sql<number>`count(*) filter (where ${r.kind} = 'shadow' and ${r.consistency} = 'partial')::int`,
      shadowDifferent: sql<number>`count(*) filter (where ${r.kind} = 'shadow' and ${r.consistency} = 'different')::int`,
    })
    .from(d)
    .leftJoin(r, eq(r.draftId, d.id))
    .where(and(eq(d.merchantId, merchantId), inArray(d.cardId, cardIds), sql`${d.createdAt} >= now() - make_interval(days => ${STATS_DAYS})`))
    .groupBy(d.cardId);
  const [drafts, handoffs] = await Promise.all([draftRows, handoffRows]);
  const out = new Map<string, CardStats>(drafts.map(({ cardId, ...s }) => [cardId!, s]));
  for (const h of handoffs) {
    const s = out.get(h.cardId) ?? { ...EMPTY_STATS };
    out.set(h.cardId, { ...s, calls: s.calls + h.n, handoffs: s.handoffs + h.n });
  }
  return out;
}

/** 卡视图：产品、关联问答（删掉的不列）、创建与最近改动的人、当前版本的作者、近 30 天效果 */
export async function cardViews(rows: CardRow[], ex: Executor = db()): Promise<ExperienceCard[]> {
  if (rows.length === 0) return [];
  const merchantId = rows[0].merchantId;
  const productIds = [...new Set(rows.flatMap((r) => r.productIds))];
  const qaIds = [...new Set(rows.flatMap((r) => r.qaIds))];
  const memberIds = [...new Set(rows.flatMap((r) => [r.createdBy, r.updatedBy]).filter((x): x is string => !!x))];
  const [products, qa, names, latest, stats] = await Promise.all([
    productIds.length ? ex.select({ id: schema.product.id, code: schema.product.code, name: schema.product.name }).from(schema.product).where(inArray(schema.product.id, productIds)) : [],
    qaIds.length ? ex.select({ id: schema.knowledgeQa.id, questions: schema.knowledgeQa.questions, status: schema.knowledgeQa.status }).from(schema.knowledgeQa).where(inArray(schema.knowledgeQa.id, qaIds)) : [],
    memberIds.length ? ex.select({ id: schema.membership.id, name: schema.user.name }).from(schema.membership).innerJoin(schema.user, eq(schema.user.id, schema.membership.userId)).where(inArray(schema.membership.id, memberIds)) : [],
    ex
      .select({ cardId: v.cardId, author: v.author })
      .from(v)
      .innerJoin(c, and(eq(c.id, v.cardId), eq(c.version, v.version)))
      .where(
        inArray(
          v.cardId,
          rows.map((r) => r.id),
        ),
      ),
    statsFor(
      merchantId,
      rows.map((r) => r.id),
      ex,
    ),
  ]);
  const productOf = new Map(products.map((p) => [p.id, p]));
  const qaOf = new Map(qa.map((q) => [q.id, q]));
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  const authorOf = new Map(latest.map((l) => [l.cardId, l.author]));
  return rows.map((r) => {
    const content = cardContentOf(r);
    return {
      id: r.id,
      title: content.title,
      stage: content.stage,
      markets: content.markets,
      tags: content.tags,
      conditions: content.conditions,
      conditionMode: content.conditionMode,
      steps: content.steps,
      tips: content.tips,
      products: r.productIds.map((id) => productOf.get(id)).filter((p): p is NonNullable<typeof p> => !!p),
      qa: r.qaIds.flatMap((id) => {
        const q = qaOf.get(id);
        return q ? [{ id: q.id, question: q.questions[0] ?? "", status: q.status }] : [];
      }),
      status: r.status,
      source: r.source,
      version: r.version,
      agentUnseen: r.agentUnseen,
      embedded: r.embedding !== null,
      lastAuthor: authorOf.get(r.id) ?? r.source,
      createdByName: r.createdBy ? (nameOf.get(r.createdBy) ?? null) : null,
      updatedByName: r.updatedBy ? (nameOf.get(r.updatedBy) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt?.toISOString() ?? null,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      stats: stats.get(r.id) ?? EMPTY_STATS,
    };
  });
}

async function view(row: CardRow) {
  return { card: (await cardViews([row]))[0] };
}

export async function loadCard(merchantId: string, id: string, ex: Executor = db()): Promise<CardRow> {
  if (!UUID.test(id)) throw notFound();
  const [row] = await ex.select().from(c).where(and(eq(c.id, id), eq(c.merchantId, merchantId))).limit(1);
  if (!row) throw notFound("经验卡不存在或已删除。");
  return row;
}

function checkVersion(row: CardRow, version: number) {
  if (row.version !== version) throw conflict("这张经验卡刚被别人改过，请刷新后再操作。", { version: row.version }, "version_conflict");
}

const sortKey = sql<string>`to_char(coalesce(${c.updatedAt}, ${c.createdAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`;
const encodeCursor = (at: string, id: string) => Buffer.from(JSON.stringify([at, id])).toString("base64url");
function decodeCursor(cursor: string): { at: string; id: string } {
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown[];
    if (typeof at === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(at) && typeof id === "string" && UUID.test(id)) return { at, id };
  } catch {}
  throw new Problem("validation", { detail: "分页参数无效，请刷新后重试。" });
}

/** API-KB-029 */
export async function listCards(ctx: MemberContext, query: CardListQuery): Promise<CardList> {
  const merchantId = ctx.merchant.id;
  const where: SQL[] = [eq(c.merchantId, merchantId)];
  if (query.status) where.push(eq(c.status, query.status));
  if (query.stage) where.push(eq(c.stage, query.stage));
  if (query.productId === "none") where.push(sql`cardinality(${c.productIds}) = 0`);
  else if (query.productId) where.push(sql`${query.productId}::uuid = any(${c.productIds})`);
  if (query.market === "ALL") where.push(sql`${c.markets} @> '["ALL"]'::jsonb`);
  else if (query.market) where.push(sql`(${c.markets} @> '["ALL"]'::jsonb or ${c.markets} @> ${JSON.stringify([query.market])}::jsonb)`);
  if (query.unseen) where.push(eq(c.agentUnseen, true));
  if (query.q) {
    const like = `%${query.q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
    where.push(sql`(${c.title} ilike ${like} or array_to_string(${c.conditions}, ' ') ilike ${like})`);
  }
  if (query.cursor) {
    const cur = decodeCursor(query.cursor);
    where.push(sql`(coalesce(${c.updatedAt}, ${c.createdAt}), ${c.id}) < (${cur.at}::timestamp at time zone 'UTC', ${cur.id}::uuid)`);
  }
  const rows = await db()
    .select({ row: c, at: sortKey })
    .from(c)
    .where(and(...where))
    .orderBy(desc(sql`coalesce(${c.updatedAt}, ${c.createdAt})`), desc(c.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const [byStatus, [unseen]] = await Promise.all([
    db().select({ status: c.status, n: count() }).from(c).where(eq(c.merchantId, merchantId)).groupBy(c.status),
    db()
      .select({ n: count() })
      .from(c)
      .where(and(eq(c.merchantId, merchantId), eq(c.status, "published"), eq(c.agentUnseen, true))),
  ]);
  const counts: Record<CardStatus, number> = { published: 0, archived: 0 };
  for (const r of byStatus) counts[r.status as CardStatus] = r.n;
  const last = page[page.length - 1];
  return { items: await cardViews(page.map((r) => r.row)), counts, unseenCount: unseen?.n ?? 0, nextCursor: rows.length > query.limit && last ? encodeCursor(last.at, last.row.id) : null };
}

/** API-KB-031：卡与版本（倒序，最多 50 个） */
export async function getCard(ctx: MemberContext, id: string): Promise<CardDetail> {
  const row = await loadCard(ctx.merchant.id, id);
  const versions = await db()
    .select()
    .from(v)
    .where(eq(v.cardId, row.id))
    .orderBy(desc(v.version))
    .limit(CARD_VERSIONS_SHOWN);
  const memberIds = [...new Set(versions.flatMap((x) => [x.memberId, x.seenBy]).filter((x): x is string => !!x))];
  const names = memberIds.length
    ? await db().select({ id: schema.membership.id, name: schema.user.name }).from(schema.membership).innerJoin(schema.user, eq(schema.user.id, schema.membership.userId)).where(inArray(schema.membership.id, memberIds))
    : [];
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  const items: CardVersionView[] = versions.map((x) => ({
    version: x.version,
    snapshot: x.snapshot,
    author: x.author,
    memberName: x.memberId ? (nameOf.get(x.memberId) ?? null) : null,
    learningTaskId: x.learningTaskId,
    note: x.note,
    retest: x.retest,
    seenByName: x.seenBy ? (nameOf.get(x.seenBy) ?? null) : null,
    seenAt: x.seenAt?.toISOString() ?? null,
    createdAt: x.createdAt.toISOString(),
  }));
  return { card: (await cardViews([row]))[0], versions: items, reviews: await reviewHistory(ctx.merchant.id, row.id) };
}

/** API-KB-030：保存即发布，写第 1 版 */
export async function createCard(ctx: MemberContext, body: CardContent) {
  await checkCardRefs(ctx.merchant.id, body);
  const vec = await tryEmbedCard(body);
  const row = await db().transaction(async (tx) => {
    const r = await insertCard(tx, { merchantId: ctx.merchant.id, content: body, author: { kind: "member", memberId: ctx.membership.id }, vec });
    await audit(ctx.actor, { module: "reception", action: "knowledge_card_created", summary: `新增经验卡「${body.title}」`, targetType: "experience_card", targetId: r.id, data: { stage: body.stage, steps: body.steps.length, products: body.productIds.length } }, tx);
    return r;
  });
  return view(row);
}

/** Agent 写的当前版本被人看过：给那一行记看过的人与时间 */
async function markSeen(tx: Executor, row: CardRow, memberId: string) {
  if (!row.agentUnseen) return;
  await tx
    .update(v)
    .set({ seenBy: memberId, seenAt: new Date() })
    .where(and(eq(v.cardId, row.id), eq(v.version, row.version)));
}

/** 库里读出的 jsonb 键序与请求体不同（分支的 goto 在前），先按契约的结构整理一遍再比 */
const normalized = (c: CardContent) => {
  const p = zCardContent.safeParse(c);
  return JSON.stringify(p.success ? p.data : c);
};
const same = (a: CardContent, b: CardContent) => normalized(a) === normalized(b);

/** API-KB-032：整张卡提交；内容没变时不写新版本；标题或调用条件变了才重算向量 */
export async function updateCard(ctx: MemberContext, id: string, body: CardPatch) {
  const row = await loadCard(ctx.merchant.id, id);
  checkVersion(row, body.version);
  if (same(cardContentOf(row), body.card)) return view(row);
  await checkCardRefs(ctx.merchant.id, body.card);
  const vec = needsEmbed(row, body.card) ? await tryEmbedCard(body.card) : undefined;
  const updated = await db().transaction(async (tx) => {
    await markSeen(tx, row, ctx.membership.id);
    const u = await writeCardVersion(tx, { row, content: body.card, author: { kind: "member", memberId: ctx.membership.id }, vec });
    await audit(ctx.actor, { module: "reception", action: "knowledge_card_updated", summary: `修改经验卡「${u.title}」`, targetType: "experience_card", targetId: row.id, data: { version: u.version } }, tx);
    return u;
  });
  return view(updated);
}

/** API-KB-036：用第 toVersion 版的内容写新版本；那一版关联的产品或问答后来删了就不带 */
export async function rollbackCard(ctx: MemberContext, id: string, body: CardRollbackBody) {
  const row = await loadCard(ctx.merchant.id, id);
  checkVersion(row, body.version);
  if (body.toVersion >= row.version) throw validation("只能回退到比当前更早的版本。", { toVersion: "只能回退到更早的版本" });
  const [target] = await db()
    .select()
    .from(v)
    .where(and(eq(v.cardId, row.id), eq(v.version, body.toVersion)))
    .limit(1);
  if (!target) throw notFound(`第 ${body.toVersion} 版不存在。`);
  const content = await withExistingRefs(ctx.merchant.id, target.snapshot);
  const vec = needsEmbed(row, content) ? await tryEmbedCard(content) : undefined;
  const updated = await db().transaction(async (tx) => {
    await markSeen(tx, row, ctx.membership.id);
    const u = await writeCardVersion(tx, { row, content, author: { kind: "member", memberId: ctx.membership.id }, vec, note: `回退到第 ${body.toVersion} 版` });
    await audit(ctx.actor, { module: "reception", action: "knowledge_card_rolled_back", summary: `经验卡「${u.title}」回退到第 ${body.toVersion} 版`, targetType: "experience_card", targetId: row.id, data: { from: row.version, to: body.toVersion, version: u.version } }, tx);
    return u;
  });
  return view(updated);
}

/** 旧版本里关联的产品、问答只留现在还在的 */
async function withExistingRefs(merchantId: string, snap: CardContent): Promise<CardContent> {
  const [products, qa] = await Promise.all([
    snap.productIds.length
      ? db()
          .select({ id: schema.product.id })
          .from(schema.product)
          .where(and(eq(schema.product.merchantId, merchantId), inArray(schema.product.id, snap.productIds)))
      : [],
    snap.qaIds.length
      ? db()
          .select({ id: schema.knowledgeQa.id })
          .from(schema.knowledgeQa)
          .where(and(eq(schema.knowledgeQa.merchantId, merchantId), inArray(schema.knowledgeQa.id, snap.qaIds)))
      : [],
  ]);
  const p = new Set(products.map((x) => x.id));
  const q = new Set(qa.map((x) => x.id));
  return { ...snap, productIds: snap.productIds.filter((x) => p.has(x)), qaIds: snap.qaIds.filter((x) => q.has(x)) };
}

/** API-KB-037：标为已看（当前版本） */
export async function markCardSeen(ctx: MemberContext, id: string, version: number) {
  const row = await loadCard(ctx.merchant.id, id);
  checkVersion(row, version);
  if (!row.agentUnseen) return view(row);
  const updated = await db().transaction(async (tx) => {
    await markSeen(tx, row, ctx.membership.id);
    const [u] = await tx
      .update(c)
      .set({ agentUnseen: false })
      .where(and(eq(c.id, row.id), eq(c.version, row.version)))
      .returning();
    if (!u) throw conflict("这张经验卡刚被别人改过，请刷新后再操作。", undefined, "version_conflict");
    await audit(ctx.actor, { module: "reception", action: "knowledge_card_seen", summary: `看过经验卡「${row.title}」第 ${row.version} 版`, targetType: "experience_card", targetId: row.id, data: { version: row.version } }, tx);
    return u;
  });
  return view(updated);
}

const STATUS_TEXT: Record<CardStatus, string> = { published: "已发布", archived: "已下架" };

/** 下架与恢复只改状态，不写版本（版本只记内容变化）；version 仍作并发校验 */
async function setStatus(ctx: MemberContext, id: string, version: number, from: CardStatus, to: CardStatus, action: string, verb: string) {
  const row = await loadCard(ctx.merchant.id, id);
  checkVersion(row, version);
  if (row.status !== from) throw conflict(`这张经验卡现在是「${STATUS_TEXT[row.status]}」，不能${verb}。`, { status: row.status }, "invalid_state");
  const updated = await db().transaction(async (tx) => {
    const [u] = await tx
      .update(c)
      .set({ status: to, updatedAt: new Date(), ...(to === "published" ? { publishedAt: new Date() } : {}) })
      .where(and(eq(c.id, row.id), eq(c.version, row.version), eq(c.status, from)))
      .returning();
    if (!u) throw conflict("这张经验卡刚被别人改过，请刷新后再操作。", undefined, "version_conflict");
    await audit(ctx.actor, { module: "reception", action, summary: `${verb}经验卡「${row.title}」`, targetType: "experience_card", targetId: row.id, data: { from, to } }, tx);
    return u;
  });
  return view(updated);
}

/** API-KB-034：已发布 → 已下架（不参与出稿） */
export const archiveCard = (ctx: MemberContext, id: string, version: number) => setStatus(ctx, id, version, "published", "archived", "knowledge_card_archived", "下架");
/** API-KB-035：已下架 → 已发布 */
export const restoreCard = (ctx: MemberContext, id: string, version: number) => setStatus(ctx, id, version, "archived", "published", "knowledge_card_restored", "恢复发布");

/** API-KB-033：任何状态都可删；版本一起删，草稿里的卡快照保留 */
export async function deleteCard(ctx: MemberContext, id: string) {
  const row = await loadCard(ctx.merchant.id, id);
  await db().transaction(async (tx) => {
    await tx.delete(c).where(eq(c.id, row.id));
    await audit(ctx.actor, { module: "reception", action: "knowledge_card_deleted", summary: `删除经验卡「${row.title}」`, targetType: "experience_card", targetId: row.id, data: { status: row.status, version: row.version } }, tx);
  });
}

/** knowledge.qa_embed 顺带：补已发布卡的空向量，每轮最多 200 张；向量化失败留到下一轮 */
export async function embedMissingCards(limit = 200): Promise<{ picked: number; embedded: number }> {
  const rows = await db()
    .select({ id: c.id, title: c.title, conditions: c.conditions, version: c.version })
    .from(c)
    .where(and(sql`${c.embedding} is null`, eq(c.status, "published")))
    .orderBy(c.createdAt)
    .limit(limit);
  let embedded = 0;
  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20);
    let vecs: number[][];
    try {
      vecs = await embedTexts(
        batch.map((r) => cardEmbedText(r)),
        10_000,
      );
    } catch {
      break;
    }
    for (const [j, r] of batch.entries()) {
      // 版本没变才写，避免覆盖期间改过的内容
      await db()
        .update(c)
        .set({ embedding: vecs[j], embeddingModel: EMBED_MODEL })
        .where(and(eq(c.id, r.id), eq(c.version, r.version), sql`${c.embedding} is null`));
      embedded += 1;
    }
  }
  return { picked: rows.length, embedded };
}
