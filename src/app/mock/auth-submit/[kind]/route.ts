// 模拟授权页的表单提交：普通 POST，算出回跳地址后 303 跳转（真实平台授权页也是整页跳回 redirect）。
import { mockEnabled } from "@/mock/env";
import { confirmShopeeAuth, confirmShopeeCancel, rejectShopeeAuth, type ShopeeAuthParams } from "@/mock/shopee/authorize";
import { confirmTiktokAuth, rejectTiktokAuth } from "@/mock/tiktok/authorize";

function shopeeParams(f: FormData): { region: string; p: ShopeeAuthParams } {
  return {
    region: String(f.get("region") ?? ""),
    p: { partner_id: String(f.get("partner_id") ?? ""), timestamp: String(f.get("timestamp") ?? ""), sign: String(f.get("sign") ?? ""), redirect: String(f.get("redirect") ?? "") },
  };
}

export async function POST(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  if (!mockEnabled()) return new Response("Not Found", { status: 404 });
  const { kind } = await ctx.params;
  const f = await req.formData();
  let url: string;
  try {
    if (kind === "shopee-authorize") {
      const { region, p } = shopeeParams(f);
      const mode = String(f.get("mode") ?? "main");
      url =
        mode === "reject"
          ? await rejectShopeeAuth(region, p)
          : await confirmShopeeAuth(region, p, mode === "sub" ? "sub" : "main", String(f.get("sub_shop_id") ?? ""), f.getAll("shop_ids").map(String));
    } else if (kind === "shopee-cancel") {
      const { region, p } = shopeeParams(f);
      url = await confirmShopeeCancel(region, p);
    } else if (kind === "tiktok-authorize") {
      const appKey = String(f.get("app_key") ?? "");
      const state = String(f.get("state") ?? "");
      url = f.get("mode") === "reject" ? await rejectTiktokAuth(appKey, state) : await confirmTiktokAuth(appKey, String(f.get("shop_region") ?? ""), state);
    } else {
      return new Response("Not Found", { status: 404 });
    }
  } catch (e) {
    return new Response(`授权没有完成：${e instanceof Error ? e.message : String(e)}`, { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response(null, { status: 303, headers: { location: url } });
}
