// 模拟平台图片：上传的文件（24 位十六进制 ID）或按种子生成的示例图（sample-<seed>）。
import { mockGate } from "@/mock/gate";
import { notFoundResponse } from "@/mock/http";
import { readUpload, samplePng } from "@/mock/uploads";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const blocked = await mockGate();
  if (blocked) return blocked;
  const { id } = await ctx.params;
  if (/^sample-[A-Za-z0-9-]{1,80}$/.test(id)) {
    return new Response(new Uint8Array(samplePng(id)), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
  }
  const file = await readUpload(id);
  if (!file) return notFoundResponse();
  return new Response(new Uint8Array(file.data), { headers: { "content-type": file.mime, "cache-control": "public, max-age=86400" } });
}
