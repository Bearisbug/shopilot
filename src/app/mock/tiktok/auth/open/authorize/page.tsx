// TikTok Shop 授权页（模拟）：GET /mock/tiktok/auth/open/authorize?app_key&state&shop_region
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { mockEnabled } from "@/mock/env";
import { inspectTiktokAuth } from "@/mock/tiktok/authorize";
import { AuthCard, AuthError, ShopRows } from "@/app/mock/_ui/auth-card";
import { SubmitButton } from "@/app/mock/_ui/submit-button";

export const metadata: Metadata = { title: { absolute: "TikTok Shop 授权 · 模拟平台" } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function TiktokAuthorizePage({ searchParams }: Props) {
  await connection();
  if (!mockEnabled()) notFound();
  const sp = await searchParams;
  const appKey = one(sp.app_key);
  const view = await inspectTiktokAuth(appKey, one(sp.shop_region), one(sp.state));

  if (!view.ok) {
    return (
      <AuthCard platform="TikTok Shop Partner Center" title="授权链接无效" facts={[["App Key", appKey ?? "（缺失）"]]}>
        <AuthError title="无法打开授权页" detail={view.message} />
      </AuthCard>
    );
  }

  return (
    <AuthCard platform="TikTok Shop Partner Center" title={`授权「${view.app.name}」访问 ${view.region} 站点的店铺`} facts={[["App Key", view.app.appKey], ["站点", view.region]]}>
      <form method="post" action="/mock/auth-submit/tiktok-authorize" className="flex flex-col gap-5">
        <input type="hidden" name="app_key" value={view.app.appKey} />
        <input type="hidden" name="shop_region" value={view.region} />
        <input type="hidden" name="state" value={view.state} />
        {view.shops.length > 0 ? (
          <div>
            <h2 className="mb-2 text-sm font-medium">该站点可授权的店铺（{view.shops.length}）</h2>
            <ShopRows shops={view.shops} />
            <p className="mt-2 text-xs text-muted-foreground">授权后回跳应用登记的 redirect_url，带 code 与 state；code 30 分钟内有效、只能用一次。</p>
          </div>
        ) : (
          <AuthError title={`${view.region} 站点没有店铺`} detail="换一个 shop_region 重新生成授权链接，或点模拟拒绝返回。" />
        )}
        <div className="flex flex-wrap gap-2">
          {view.shops.length > 0 && (
            <SubmitButton name="mode" value="authorize">
              授权
            </SubmitButton>
          )}
          <SubmitButton name="mode" value="reject" variant="ghost">
            模拟拒绝
          </SubmitButton>
        </div>
      </form>
    </AuthCard>
  );
}
