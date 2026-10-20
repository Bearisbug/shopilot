import { randomUUID } from "node:crypto";
import type { UploadedFile } from "@/contracts/conversations";
import { db, schema } from "@/server/db/client";
import { imageInfo, isMp4 } from "@/server/files/image";
import { writeDataFile } from "@/server/files/storage";
import { Problem } from "@/server/http/problem";
import { json, route } from "@/server/http/route";

const IMAGE_MAX = 10 * 1024 * 1024;
/** Shopee 聊天视频的上限没有文档，6.2 MB 实测通过；先限 30 MB，更大的由平台报错为准 */
const VIDEO_MAX = 30 * 1024 * 1024;

// API-CONV-010：聊天图片（JPG / PNG / WebP，≤ 10 MB）与视频（MP4，≤ 30 MB，只有 Shopee 店能发）上传
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
    if (!file || typeof file === "string") throw new Problem("validation", { detail: "没有收到文件。", extra: { fields: { file: "请选择图片或视频" } } });
    if (file.size > VIDEO_MAX) throw new Problem("too-large", { detail: "视频不能超过 30 MB，图片不能超过 10 MB。" });
    const buf = Buffer.from(await file.arrayBuffer());
    const image = imageInfo(buf);
    const video = !image && isMp4(buf);
    if (!image && !video) throw new Problem("unsupported-type", { detail: "只支持 JPG、PNG、WebP 图片和 MP4 视频。" });
    if (image && buf.length > IMAGE_MAX) throw new Problem("too-large", { detail: "图片不能超过 10 MB。" });
    const id = randomUUID();
    const ext = image ? image.ext : "mp4";
    const path = `chat/${ctx.merchant.id}/${new Date().toISOString().slice(0, 7)}/${id}.${ext}`;
    await writeDataFile(path, buf);
    const [row] = await db()
      .insert(schema.file)
      .values({
        id,
        merchantId: ctx.merchant.id,
        kind: image ? "chat_image" : "chat_video",
        path,
        mime: image ? image.mime : "video/mp4",
        size: buf.length,
        width: image?.width || null,
        height: image?.height || null,
        createdBy: ctx.membership.id,
      })
      .returning();
    const out: UploadedFile = { id: row.id, url: `/api/v1/files/${row.id}`, width: row.width, height: row.height, kind: image ? "image" : "video" };
    return json(out, 201);
  },
});
