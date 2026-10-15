// 文件下载（API-CONV-011）：按文件所属商户鉴权，导出包另要求商户设置权限、过期后 410；知识库原文件另要求 knowledge.manage。
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { and, eq, ne } from "drizzle-orm";
import type { MemberContext } from "../auth/context";
import { db, schema } from "../db/client";
import { Problem } from "../http/problem";
import { inTzText } from "../settings/data";
import { dataPath } from "./storage";

const EXPORT_GONE = "导出包已过期（24 小时有效），请在「商户设置 · 数据与隐私」重新导出。";

export async function downloadFile(ctx: MemberContext, id: string): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Problem("not-found");
  const [file] = await db().select().from(schema.file).where(and(eq(schema.file.id, id), eq(schema.file.merchantId, ctx.merchant.id)));
  if (!file) {
    // 过期导出包的文件行已随文件删除，导出任务还记着它
    const [job] = await db().select({ id: schema.exportJob.id }).from(schema.exportJob).where(and(eq(schema.exportJob.fileId, id), eq(schema.exportJob.merchantId, ctx.merchant.id)));
    if (job) throw new Problem("expired", { detail: EXPORT_GONE, code: "expired" });
    throw new Problem("not-found");
  }
  let filename = file.path.split("/").pop() ?? file.id;
  if (file.kind === "export_zip") {
    if (!ctx.can("settings.manage")) throw new Problem("forbidden", { detail: "导出包只对管理员开放。", code: "settings.manage" });
    const [job] = await db().select().from(schema.exportJob).where(eq(schema.exportJob.fileId, file.id));
    if (!job || job.status !== "done" || !job.expiresAt || job.expiresAt < new Date()) throw new Problem("expired", { detail: EXPORT_GONE, code: "expired" });
    filename = `shopilot-export-${inTzText(job.createdAt, ctx.merchant.timezone, "yyyyMMdd-HHmm")}.zip`;
  }
  if (file.kind === "knowledge_source") {
    // 知识库原文件只给有 knowledge.manage 的管理员与组长（§10）；资料删除中即视为不存在
    if (!ctx.can("knowledge.manage")) throw new Problem("forbidden", { detail: "知识库资料只对管理员与组长开放。", code: "knowledge.manage" });
    const [doc] = await db()
      .select({ name: schema.knowledgeDocument.name })
      .from(schema.knowledgeDocument)
      .where(and(eq(schema.knowledgeDocument.fileId, file.id), eq(schema.knowledgeDocument.merchantId, ctx.merchant.id), ne(schema.knowledgeDocument.status, "deleting")))
      .limit(1);
    if (!doc) throw new Problem("not-found", { detail: "文件已不存在。" });
    filename = doc.name;
  }
  const full = dataPath(file.path);
  const info = await stat(full).catch(() => null);
  if (!info) throw new Problem("not-found", { detail: "文件已不存在。" });
  const body = Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
  const inline = file.mime.startsWith("image/") || file.mime === "application/pdf";
  return new Response(body, {
    headers: {
      "content-type": file.mime,
      "content-length": String(info.size),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
