// Shopee 授权页（模拟）：GET /mock/shopee/{region}/api/v2/shop/auth_partner?partner_id&timestamp&sign&redirect
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mockEnabled } from "@/mock/env";
import { inspectShopeeAuthLink } from "@/mock/shopee/authorize";
import { AuthCard, AuthError, ShopRows } from "@/app/mock/_ui/auth-card";
import { SubmitButton } from "@/app/mock/_ui/submit-button";

export const metadata: Metadata = { title: { absolute: "Shopee 店铺授权 · 模拟平台" } };

type Props = { params: Promise<{ region: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ShopeeAuthPartnerPage({ params, searchParams }: Props) {
  await connection();
  if (!mockEnabled()) notFound();
  const { region } = await params;
  const sp = await searchParams;
  const p = { partner_id: one(sp.partner_id), timestamp: one(sp.timestamp), sign: one(sp.sign), redirect: one(sp.redirect) };
  const view = await inspectShopeeAuthLink(region, "auth_partner", p);

  if (!view.ok) {
    return (
      <AuthCard platform="Shopee Open Platform" title="授权链接无效" facts={[["区域主机", region], ["Partner ID", p.partner_id || "（缺失）"]]}>
        <AuthError title={view.error} detail={view.message} />
      </AuthCard>
    );
  }

  const back = new URL(view.redirect);
  return (
    <AuthCard
      platform="Shopee Open Platform"
      title={`授权「${view.app.name}」访问你的店铺`}
      facts={[
        ["Partner ID", view.app.appKey],
        ["区域主机", region],
        ["主账号", view.mainAccountId || "—"],
        ["授权后回到", `${back.origin}${back.pathname}`],
      ]}
    >
      <form method="post" action="/mock/auth-submit/shopee-authorize" className="flex flex-col gap-5">
        {Object.entries({ region, ...p }).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {view.shops.length > 0 ? (
          <>
            <div>
              <h2 className="mb-2 text-sm font-medium">主账号下的店铺（{view.shops.length}）</h2>
              <ShopRows shops={view.shops} selectable />
              <p className="mt-2 text-xs text-muted-foreground">主账号授权一次接入勾选的店铺，回调带 main_account_id；授权有效期 365 天。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="mode" value="main">
                授权勾选的店铺
              </SubmitButton>
              <SubmitButton name="mode" value="reject" variant="ghost">
                模拟拒绝
              </SubmitButton>
            </div>
            <fieldset className="border-t border-border pt-4">
              <legend className="sr-only">模拟子账号授权</legend>
              <h2 className="text-sm font-medium">模拟子账号授权</h2>
              <p className="mt-0.5 mb-2 text-xs text-muted-foreground">只授权一家店，回调只带 shop_id，用来验证 Shopilot 的子账号提示。</p>
              <div className="flex flex-wrap items-center gap-2">
                <Select name="sub_shop_id" defaultValue={view.shops[0].shopId}>
                  <SelectTrigger className="min-w-48" aria-label="子账号授权的店铺">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {view.shops.map((s) => (
                      <SelectItem key={s.shopId} value={s.shopId}>
                        {s.name} · {s.shopId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <SubmitButton name="mode" value="sub" variant="outline">
                  以子账号授权
                </SubmitButton>
              </div>
            </fieldset>
          </>
        ) : (
          <>
            <AuthError title="这个主账号下没有店铺" detail="沙箱应用没有登记店铺，可以点模拟拒绝回到 Shopilot。" />
            <div>
              <SubmitButton name="mode" value="reject" variant="outline">
                模拟拒绝
              </SubmitButton>
            </div>
          </>
        )}
      </form>
    </AuthCard>
  );
}
