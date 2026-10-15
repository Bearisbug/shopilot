// 资料分类（API-KB-008 至 API-KB-011）：内置「未分类」不能改名、删除；删除分类时其中资料改归「未分类」，不重新解析。
import { and, asc, count, desc, eq, ne, sql } from "drizzle-orm";
import { KNOWLEDGE_CATEGORY_LIMIT, UNCATEGORIZED, type KnowledgeCategory, type KnowledgeCategoryDeleteResult, type KnowledgeCategoryList } from "@/contracts/knowledge";
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { db, schema, type Executor } from "@/server/db/client";
import { Problem, notFound } from "@/server/http/problem";
import { deniedByRule } from "./shared";

const c = schema.knowledgeCategory;
const d = schema.knowledgeDocument;

/** 商户的内置「未分类」；迁移与开通商户时已建，缺了就补建 */
export async function builtinCategoryId(merchantId: string, tx: Executor = db()): Promise<string> {
  const [row] = await tx.select({ id: c.id }).from(c).where(and(eq(c.merchantId, merchantId), eq(c.builtin, true))).limit(1);
  if (row) return row.id;
  await tx.insert(c).values({ merchantId, name: UNCATEGORIZED, builtin: true }).onConflictDoNothing();
  const [again] = await tx.select({ id: c.id }).from(c).where(and(eq(c.merchantId, merchantId), eq(c.builtin, true))).limit(1);
  return again.id;
}

async function loadCategory(merchantId: string, id: string, tx: Executor = db()) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  const [row] = await tx.select().from(c).where(and(eq(c.id, id), eq(c.merchantId, merchantId))).limit(1);
  if (!row) throw notFound();
  return row;
}

function duplicate(existingId: string): Problem {
  return new Problem("duplicate", { detail: "已有同名分类。", code: "category_duplicate", extra: { existingId } });
}

async function categoryView(tx: Executor, row: typeof c.$inferSelect): Promise<KnowledgeCategory> {
  const [n] = await tx.select({ n: count() }).from(d).where(and(eq(d.categoryId, row.id), ne(d.status, "deleting")));
  return { id: row.id, name: row.name, builtin: row.builtin, documentCount: n?.n ?? 0 };
}

/** API-KB-008：内置「未分类」排第一，其余按创建先后 */
export async function listCategories(ctx: MemberContext): Promise<KnowledgeCategoryList> {
  const merchantId = ctx.merchant.id;
  await builtinCategoryId(merchantId);
  const rows = await db().select().from(c).where(eq(c.merchantId, merchantId)).orderBy(desc(c.builtin), asc(c.createdAt), asc(c.id));
  const counts = await db()
    .select({ id: d.categoryId, n: count() })
    .from(d)
    .where(and(eq(d.merchantId, merchantId), ne(d.status, "deleting")))
    .groupBy(d.categoryId);
  const byId = new Map(counts.map((r) => [r.id, r.n]));
  return { items: rows.map((r) => ({ id: r.id, name: r.name, builtin: r.builtin, documentCount: byId.get(r.id) ?? 0 })) };
}

/** API-KB-009：同名 409 duplicate；已有 50 个 409 not-allowed */
export async function createCategory(ctx: MemberContext, name: string): Promise<KnowledgeCategory> {
  const merchantId = ctx.merchant.id;
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`knowledge-category:${merchantId}`}))`);
    await builtinCategoryId(merchantId, tx);
    const [same] = await tx.select({ id: c.id }).from(c).where(and(eq(c.merchantId, merchantId), eq(c.name, name))).limit(1);
    if (same) throw duplicate(same.id);
    const [n] = await tx.select({ n: count() }).from(c).where(eq(c.merchantId, merchantId));
    if ((n?.n ?? 0) >= KNOWLEDGE_CATEGORY_LIMIT) await deniedByRule(ctx, "API-KB-009", "category_quota", `分类最多 ${KNOWLEDGE_CATEGORY_LIMIT} 个。`);
    const [row] = await tx.insert(c).values({ merchantId, name }).returning();
    await audit(ctx.actor, { module: "reception", action: "knowledge_category_created", summary: `新增资料分类「${name}」`, targetType: "knowledge_category", targetId: row.id }, tx);
    return { id: row.id, name: row.name, builtin: false, documentCount: 0 };
  });
}

/** API-KB-010：「未分类」不能改名 */
export async function renameCategory(ctx: MemberContext, id: string, name: string): Promise<KnowledgeCategory> {
  const merchantId = ctx.merchant.id;
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`knowledge-category:${merchantId}`}))`);
    const cur = await loadCategory(merchantId, id, tx);
    if (cur.builtin) await deniedByRule(ctx, "API-KB-010", "builtin", `「${UNCATEGORIZED}」是内置分类，不能改名。`);
    if (cur.name === name) return categoryView(tx, cur);
    const [same] = await tx.select({ id: c.id }).from(c).where(and(eq(c.merchantId, merchantId), eq(c.name, name))).limit(1);
    if (same) throw duplicate(same.id);
    const [row] = await tx.update(c).set({ name, updatedAt: new Date() }).where(eq(c.id, cur.id)).returning();
    await audit(ctx.actor, { module: "reception", action: "knowledge_category_renamed", summary: `资料分类「${cur.name}」改名为「${name}」`, targetType: "knowledge_category", targetId: cur.id }, tx);
    return categoryView(tx, row);
  });
}

/** API-KB-011：其中资料改归「未分类」（含删除中的，避免外键挡住删除），不重新解析；重复删除 404 */
export async function deleteCategory(ctx: MemberContext, id: string): Promise<KnowledgeCategoryDeleteResult> {
  const merchantId = ctx.merchant.id;
  return db().transaction(async (tx) => {
    const cur = await loadCategory(merchantId, id, tx);
    if (cur.builtin) await deniedByRule(ctx, "API-KB-011", "builtin", `「${UNCATEGORIZED}」是内置分类，不能删除。`);
    // 行锁等正在往这个分类上传的事务提交（上传对分类加共享锁），之后上传的会 422
    const [locked] = await tx.select({ id: c.id }).from(c).where(eq(c.id, cur.id)).for("update");
    if (!locked) throw notFound();
    const target = await builtinCategoryId(merchantId, tx);
    const moved = await tx.update(d).set({ categoryId: target, updatedAt: new Date() }).where(eq(d.categoryId, cur.id)).returning({ id: d.id, status: d.status });
    await tx.delete(c).where(eq(c.id, cur.id));
    const movedDocuments = moved.filter((m) => m.status !== "deleting").length;
    await audit(ctx.actor, { module: "reception", action: "knowledge_category_deleted", summary: `删除资料分类「${cur.name}」，${movedDocuments} 份资料归入「${UNCATEGORIZED}」`, targetType: "knowledge_category", targetId: cur.id, data: { moved_documents: movedDocuments } }, tx);
    return { movedDocuments };
  });
}
