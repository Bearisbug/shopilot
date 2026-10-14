// TikTok Shop Open API 模拟主机：/mock/tiktok/open-api/...
import { mockGate } from "@/mock/gate";
import { handleTiktokApi } from "@/mock/tiktok/api";

async function handle(req: Request): Promise<Response> {
  const blocked = await mockGate();
  if (blocked) return blocked;
  // 签名用的 path 是去掉模拟主机前缀后的原始路径
  return handleTiktokApi(req, new URL(req.url).pathname.replace(/^\/mock\/tiktok\/open-api/, ""));
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
