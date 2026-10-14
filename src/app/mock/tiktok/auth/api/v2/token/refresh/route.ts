// TikTok 刷新 token：GET /mock/tiktok/auth/api/v2/token/refresh?app_key&app_secret&refresh_token&grant_type=refresh_token
import { mockGate } from "@/mock/gate";
import { tiktokTokenRefresh } from "@/mock/tiktok/authorize";

export async function GET(req: Request): Promise<Response> {
  const blocked = await mockGate();
  if (blocked) return blocked;
  return tiktokTokenRefresh(new URL(req.url).searchParams);
}
