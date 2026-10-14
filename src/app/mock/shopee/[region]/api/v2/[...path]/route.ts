// Shopee Open Platform v2 模拟主机：/mock/shopee/{cn|sg|br|sandbox}/api/v2/...
import { mockGate } from "@/mock/gate";
import { handleShopeeApi } from "@/mock/shopee/api";

type Ctx = { params: Promise<{ region: string; path: string[] }> };

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const blocked = await mockGate();
  if (blocked) return blocked;
  const { region, path } = await ctx.params;
  return handleShopeeApi(req, region, path);
}

export const GET = handle;
export const POST = handle;
