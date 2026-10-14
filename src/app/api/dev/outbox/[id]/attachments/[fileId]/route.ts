import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { mockPlatformEnabled } from "@/server/env";
import { dataPath } from "@/server/files/storage";

// 发件箱附件下载（开发者用）：只给这封邮件列出的附件
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; fileId: string }> }) {
  if (!mockPlatformEnabled()) return new Response("Not Found", { status: 404 });
  const { id, fileId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(fileId)) return new Response("Not Found", { status: 404 });
  const [mail] = await db().select().from(schema.emailOutbox).where(eq(schema.emailOutbox.id, id)).limit(1);
  const att = mail?.attachments.find((a) => a.fileId === fileId);
  if (!att) return new Response("Not Found", { status: 404 });
  const [file] = await db().select().from(schema.file).where(eq(schema.file.id, fileId)).limit(1);
  const full = file ? dataPath(file.path) : null;
  const info = full ? await stat(full).catch(() => null) : null;
  if (!file || !full || !info) return new Response("文件已不存在", { status: 404 });
  return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>, {
    headers: { "content-type": file.mime, "content-length": String(info.size), "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(att.name)}`, "cache-control": "no-store" },
  });
}
