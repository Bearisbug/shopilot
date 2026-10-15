// 后台任务 knowledge.purge（§11.14 deleting → [*]、§17）：先删检索服务里的条目，全部成功后再删分块、条目、原文件与资料记录
// （INV-KB-003）。失败抛出由 pg-boss 重试 5 次；仍失败的留在 deleting，等每小时补扫。商户清除时删整个检索实例。
import { and, eq, lt } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { removeDataFile } from "@/server/files/storage";
import { enqueue } from "@/server/jobs/boss";
import { sweepIngest } from "./ingest";
import { searchService } from "./search-service";
import type { KnowledgeSearchService } from "./types";

const d = schema.knowledgeDocument;

/** 任务入口：{ documentId } 删一份资料；{ instance } 删一个检索实例；空载荷是每小时的补扫 */
export async function purgeJob(data: Record<string, unknown>): Promise<void> {
  if (typeof data.instance === "string") return purgeInstance(data.instance);
  if (typeof data.documentId === "string") return purgeDocument(data.documentId);
  return sweepPurge();
}

export async function purgeDocument(documentId: string, svc: KnowledgeSearchService = searchService()): Promise<void> {
  const [doc] = await db().select().from(d).where(eq(d.id, documentId)).limit(1);
  if (!doc || doc.status !== "deleting") return;
  const [idx] = await db().select().from(schema.knowledgeIndex).where(eq(schema.knowledgeIndex.merchantId, doc.merchantId)).limit(1);
  if (idx) {
    const parts = await db().select().from(schema.knowledgePart).where(eq(schema.knowledgePart.documentId, doc.id));
    for (const part of parts) {
      // 删除不存在的条目视为成功（§16）
      const item = await svc.findItem(idx.instanceName, part.itemKey);
      if (item) await svc.deleteItem(idx.instanceName, item.id);
    }
  }
  const path = await db().transaction(async (tx) => {
    const [gone] = await tx.delete(d).where(and(eq(d.id, doc.id), eq(d.status, "deleting"))).returning({ fileId: d.fileId });
    if (!gone) return null;
    const [f] = await tx.delete(schema.file).where(eq(schema.file.id, gone.fileId)).returning({ path: schema.file.path });
    return f?.path ?? null;
  });
  if (path) await removeDataFile(path);
}

export async function purgeInstance(name: string, svc: KnowledgeSearchService = searchService()): Promise<void> {
  await svc.deleteInstance(name);
}

/** 每小时补扫：停在 deleting 超过 10 分钟的资料重新排删除；顺带补扫入库（见 sweepIngest） */
export async function sweepPurge(): Promise<void> {
  const stale = await db()
    .select({ id: d.id })
    .from(d)
    .where(and(eq(d.status, "deleting"), lt(d.updatedAt, new Date(Date.now() - 10 * 60_000))))
    .limit(500);
  for (const row of stale) await enqueue("knowledge.purge", { documentId: row.id }, { singletonKey: `doc:${row.id}` });
  await sweepIngest();
}
