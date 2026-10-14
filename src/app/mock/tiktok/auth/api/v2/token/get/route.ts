// TikTok 换 token：GET /mock/tiktok/auth/api/v2/token/get?app_key&app_secret&auth_code&grant_type=authorized_code
import { mockGate } from "@/mock/gate";
import { tiktokTokenGet } from "@/mock/tiktok/authorize";

export async function GET(req: Request): Promise<Response> {
  const blocked = await mockGate();
  if (blocked) return blocked;
  return tiktokTokenGet(new URL(req.url).searchParams);
}
