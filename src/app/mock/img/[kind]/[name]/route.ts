// 模拟平台占位图：/mock/img/avatar/<种子>.svg、/mock/img/product/<商品 ID>.svg（MOCK_PLATFORM=0 时 404）
import { mockGate } from "@/mock/gate";
import { mockImageSvg } from "@/mock/images";

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string; name: string }> }): Promise<Response> {
  const blocked = await mockGate();
  if (blocked) return blocked;
  const { kind, name } = await ctx.params;
  if (kind !== "avatar" && kind !== "product") return new Response("not found", { status: 404 });
  const seed = decodeURIComponent(name).replace(/\.svg$/, "");
  return new Response(mockImageSvg(kind, seed), { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
