// 看板问题类别：管理员增删改名；内置「其他」不能改名、删除；删除类别时其中会话段改归「其他」，不重新提取。
import { and, asc, count, eq, isNotNull, sql } from "drizzle-orm";
import { DEFAULT_ISSUE_CATEGORIES, ISSUE_CATEGORY_LIMIT, ISSUE_OTHER, type IssueCategory, type IssueCategoryDeleteResult, type IssueCategoryList } from "@/contracts/issues";
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { db, schema, type Executor } from "@/server/db/client";
import { Problem, notAllowed, notFound } from "@/server/http/problem";

const c = schema.issueCategory;
const g = schema.segment;

/** 开通商户时建默认类别（迁移给已有商户建过同一组） */
export async function seedIssueCategories(tx: Executor, merchantId: string): Promise<void> {
  await tx
    .insert(c)
    .values(DEFAULT_ISSUE_CATEGORIES.map((name, position) => ({ merchantId, name, builtin: name === ISSUE_OTHER, position })))
    .onConflictDoNothing();
}

/** 商户的内置「其他」；缺了就补建 */
export async function otherCategoryId(merchantId: string, tx: Executor = db()): Promise<string> {
  const [row] = await tx.select({ id: c.id }).from(c).where(and(eq(c.merchantId, merchantId), eq(c.builtin, true))).limit(1);
  if (row) return row.id;
  await tx.insert(c).values({ merchantId, name: ISSUE_OTHER, builtin: true, position: 1000 }).onConflictDoNothing();
  const [again] = await tx.select({ id: c.id }).from(c).where(and(eq(c.merchantId, merchantId), eq(c.builtin, true))).limit(1);
  return again.id;
}

/** 类别表：「其他」最后，其余按位置与创建先后 */
export async function categoriesOf(merchantId: string, tx: Executor = db()): Promise<IssueCategory[]> {
  await otherCategoryId(merchantId, tx);
  const rows = await tx.select().from(c).where(eq(c.merchantId, merchantId)).orderBy(asc(c.builtin), asc(c.position), asc(c.createdAt), asc(c.id));
  return rows.map((r) => ({ id: r.id, name: r.name, builtin: r.builtin }));
}

export async function listIssueCategories(ctx: MemberContext): Promise<IssueCategoryList> {
  const items = await categoriesOf(ctx.merchant.id);
  const counts = await db()
    .select({ id: g.issueCategoryId, n: count() })
    .from(g)
    .where(and(eq(g.merchantId, ctx.merchant.id), isNotNull(g.issueCategoryId)))
    .groupBy(g.issueCategoryId);
  const byId = new Map(counts.map((r) => [r.id, r.n]));
  return { items: items.map((c) => ({ ...c, segmentCount: byId.get(c.id) ?? 0 })) };
}

async function load(merchantId: string, id: string, tx: Executor) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  const [row] = await tx.select().from(c).where(and(eq(c.id, id), eq(c.merchantId, merchantId))).limit(1);
  if (!row) throw notFound();
  return row;
}

const duplicate = (existingId: string) => new Problem("duplicate", { detail: "已有同名类别。", code: "category_duplicate", extra: { existingId } });
const lock = (tx: Executor, merchantId: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`issue-category:${merchantId}`}))`);

/** 同名 409 duplicate；满 30 个 409 not-allowed；新类别排在「其他」之前的最后 */
export async function createIssueCategory(ctx: MemberContext, name: string): Promise<IssueCategory> {
  const merchantId = ctx.merchant.id;
  return db().transaction(async (tx) => {
    await lock(tx, merchantId);
    await otherCategoryId(merchantId, tx);
    const [same] = await tx.select({ id: c.id }).from(c).where(and(eq(c.merchantId, merchantId), eq(c.name, name))).limit(1);
    if (same) throw duplicate(same.id);
    const [n] = await tx.select({ n: count(), max: sql<number>`coalesce(max(${c.position}) filter (where not ${c.builtin}), -1)::int` }).from(c).where(eq(c.merchantId, merchantId));
    if ((n?.n ?? 0) >= ISSUE_CATEGORY_LIMIT) throw notAllowed(`问题类别最多 ${ISSUE_CATEGORY_LIMIT} 个。`, "category_quota");
    const [row] = await tx.insert(c).values({ merchantId, name, position: (n?.max ?? -1) + 1 }).returning();
    await audit(ctx.actor, { module: "reception", action: "issue_category_created", summary: `新增问题类别「${name}」`, targetType: "issue_category", targetId: row.id }, tx);
    return { id: row.id, name: row.name, builtin: false };
  });
}

/** 「其他」不能改名 */
export async function renameIssueCategory(ctx: MemberContext, id: string, name: string): Promise<IssueCategory> {
  const merchantId = ctx.merchant.id;
  return db().transaction(async (tx) => {
    await lock(tx, merchantId);
    const cur = await load(merchantId, id, tx);
    if (cur.builtin) throw notAllowed(`「${ISSUE_OTHER}」是内置类别，不能改名。`, "builtin");
    if (cur.name === name) return { id: cur.id, name: cur.name, builtin: false };
    const [same] = await tx.select({ id: c.id }).from(c).where(and(eq(c.merchantId, merchantId), eq(c.name, name))).limit(1);
    if (same) throw duplicate(same.id);
    const [row] = await tx.update(c).set({ name, updatedAt: new Date() }).where(eq(c.id, cur.id)).returning();
    await audit(ctx.actor, { module: "reception", action: "issue_category_renamed", summary: `问题类别「${cur.name}」改名为「${name}」`, targetType: "issue_category", targetId: cur.id }, tx);
    return { id: row.id, name: row.name, builtin: false };
  });
}

/** 其中会话段改归「其他」，不重新提取；「其他」不能删除 */
export async function deleteIssueCategory(ctx: MemberContext, id: string): Promise<IssueCategoryDeleteResult> {
  const merchantId = ctx.merchant.id;
  return db().transaction(async (tx) => {
    await lock(tx, merchantId);
    const cur = await load(merchantId, id, tx);
    if (cur.builtin) throw notAllowed(`「${ISSUE_OTHER}」是内置类别，不能删除。`, "builtin");
    const other = await otherCategoryId(merchantId, tx);
    const moved = await tx.update(g).set({ issueCategoryId: other }).where(eq(g.issueCategoryId, cur.id)).returning({ id: g.id });
    await tx.delete(c).where(eq(c.id, cur.id));
    await audit(ctx.actor, { module: "reception", action: "issue_category_deleted", summary: `删除问题类别「${cur.name}」，${moved.length} 个会话段归入「${ISSUE_OTHER}」`, targetType: "issue_category", targetId: cur.id, data: { moved_segments: moved.length } }, tx);
    return { movedSegments: moved.length };
  });
}
