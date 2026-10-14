import { randomUUID } from "node:crypto";
import type { UploadedFile } from "@/contracts/conversations";
import { db, schema } from "@/server/db/client";
import { imageInfo } from "@/server/files/image";
import { writeDataFile } from "@/server/files/storage";
import { Problem } from "@/server/http/problem";
import { json, route } from "@/server/http/route";

const MAX = 10 * 1024 * 1024;

// API-CONV-010：聊天图片上传（JPG / PNG / WebP，≤ 10 MB）
export const POST = route({
  auth: "member",
  perm: "wb.handle",
  handler: async ({ ctx, req }) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new Problem("validation", { detail: "请用 multipart/form-data 上传，字段名 file。" });
    }
    const file = form.get("file");
    if (!file || typeof file === "string") throw new Problem("validation", { detail: "没有收到文件。", extra: { fields: { file: "请选择图片" } } });
    if (file.size > MAX) throw new Problem("too-large", { detail: "图片不能超过 10 MB。" });
    const buf = Buffer.from(await file.arrayBuffer());
    const info = imageInfo(buf);
    if (!info) throw new Problem("unsupported-type", { detail: "只支持 JPG、PNG、WebP 图片。" });
    const id = randomUUID();
    const path = `chat/${ctx.merchant.id}/${new Date().toISOString().slice(0, 7)}/${id}.${info.ext}`;
    await writeDataFile(path, buf);
    const [row] = await db()
      .insert(schema.file)
      .values({ id, merchantId: ctx.merchant.id, kind: "chat_image", path, mime: info.mime, size: buf.length, width: info.width || null, height: info.height || null, createdBy: ctx.membership.id })
      .returning();
    const out: UploadedFile = { id: row.id, url: `/api/v1/files/${row.id}`, width: row.width, height: row.height };
    return json(out, 201);
  },
});
