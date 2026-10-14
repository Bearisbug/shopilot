import { env } from "@/server/env";
import { route } from "@/server/http/route";
import { handleOAuthCallback, parsePlatform } from "@/server/shops/connect";

// API-SHOP-005：平台授权后浏览器回跳；鉴权 = 一次性 state。成功 302 到检查页（续期回店铺页），失败 302 回授权页带 reason
export const GET = route({
  auth: "public",
  handler: async ({ params, req }) => {
    const path = await handleOAuthCallback(parsePlatform(params.platform), new URL(req.url).searchParams);
    return new Response(null, { status: 302, headers: { location: `${env().APP_BASE_URL}${path}`, "cache-control": "no-store" } });
  },
});
