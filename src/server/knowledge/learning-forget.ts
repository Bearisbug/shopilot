// 学习任务的删除（INV-KB-009）：放在单独的文件里，买家删除数据与保留期清理引用它时不会把出稿、模拟出稿一串模块拉进来。
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { schema, type Executor } from "@/server/db/client";

const T = schema.learningTask;

/**
 * 学习任务随会话或会话段删除（买家删除数据、保留期清理）前调用：先删这些任务，再把别的任务复测记录里涉及它们的回归用例去掉——
 * 回归用例里存着那位买家的原话与模拟回复：以前发布过的学习任务按任务 ID 对，按卡体检加的原样发送用例按所在会话、会话段对。
 */
export async function forgetLearningTasks(tx: Executor, merchantId: string, scope: { conversationIds?: string[]; segmentIds?: string[] }): Promise<void> {
  const convs = new Set(scope.conversationIds ?? []);
  const segs = new Set(scope.segmentIds ?? []);
  const where = [convs.size ? inArray(T.conversationId, [...convs]) : undefined, segs.size ? inArray(T.segmentId, [...segs]) : undefined].filter(Boolean);
  if (where.length === 0) return;
  const gone = await tx
    .delete(T)
    .where(and(eq(T.merchantId, merchantId), sql`(${sql.join(where as SQL[], sql` or `)})`))
    .returning({ id: T.id });
  const ids = new Set(gone.map((g) => g.id));
  const keys = [...ids, ...convs, ...segs];
  const list = sql.join(
    keys.map((k) => sql`${k}`),
    sql`, `,
  );
  const refs = await tx
    .select({ id: T.id, retest: T.retest })
    .from(T)
    .where(
      and(
        eq(T.merchantId, merchantId),
        sql`exists (select 1 from jsonb_array_elements(coalesce(${T.retest}->'regressions', '[]'::jsonb)) r where r->>'taskId' in (${list}) or r->>'conversationId' in (${list}) or r->>'segmentId' in (${list}))`,
      ),
    );
  const hit = (x: { taskId: string | null; conversationId?: string; segmentId?: string | null }) =>
    (x.taskId !== null && ids.has(x.taskId)) || (!!x.conversationId && convs.has(x.conversationId)) || (!!x.segmentId && segs.has(x.segmentId));
  for (const r of refs) {
    if (!r.retest) continue;
    await tx
      .update(T)
      .set({ retest: { ...r.retest, regressions: r.retest.regressions.filter((x) => !hit(x)) } })
      .where(eq(T.id, r.id));
  }
}
