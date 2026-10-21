// 学习任务的删除（INV-KB-009）：放在单独的文件里，买家删除数据与保留期清理引用它时不会把出稿、模拟出稿一串模块拉进来。
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { schema, type Executor } from "@/server/db/client";

const T = schema.learningTask;

/**
 * 学习任务随会话或会话段删除（买家删除数据、保留期清理）前调用：先删这些任务，再把别的任务复测记录里引用它们的回归用例去掉——
 * 回归用例里存着那位买家的原话与模拟回复。
 */
export async function forgetLearningTasks(tx: Executor, merchantId: string, scope: { conversationIds?: string[]; segmentIds?: string[] }): Promise<void> {
  const where = [scope.conversationIds?.length ? inArray(T.conversationId, scope.conversationIds) : undefined, scope.segmentIds?.length ? inArray(T.segmentId, scope.segmentIds) : undefined].filter(Boolean);
  if (where.length === 0) return;
  const gone = await tx
    .delete(T)
    .where(and(eq(T.merchantId, merchantId), sql`(${sql.join(where as SQL[], sql` or `)})`))
    .returning({ id: T.id });
  if (gone.length === 0) return;
  const ids = new Set(gone.map((g) => g.id));
  const refs = await tx
    .select({ id: T.id, retest: T.retest })
    .from(T)
    .where(and(eq(T.merchantId, merchantId), sql`exists (select 1 from jsonb_array_elements(coalesce(${T.retest}->'regressions', '[]'::jsonb)) r where r->>'taskId' in (${sql.join([...ids].map((id) => sql`${id}`), sql`, `)}))`));
  for (const r of refs) {
    if (!r.retest) continue;
    await tx
      .update(T)
      .set({ retest: { ...r.retest, regressions: r.retest.regressions.filter((x) => !ids.has(x.taskId)) } })
      .where(eq(T.id, r.id));
  }
}
