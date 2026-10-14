// Shopee 取消授权页（模拟）：GET /mock/shopee/{region}/api/v2/shop/cancel_auth_partner?partner_id&timestamp&sign&redirect
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { mockEnabled } from "@/mock/env";
import { inspectShopeeAuthLink } from "@/mock/shopee/authorize";
import { AuthCard, AuthError, ShopRows } from "@/app/mock/_ui/auth-card";
import { SubmitButton } from "@/app/mock/_ui/submit-button";

export const metadata: Metadata = { title: { absolute: "Shopee 取消授权 · 模拟平台" } };

type Props = { params: Promise<{ region: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ShopeeCancelAuthPage({ params, searchParams }: Props) {
  await connection();
  if (!mockEnabled()) notFound();
  const { region } = await params;
  const sp = await searchParams;
  const p = { partner_id: one(sp.partner_id), timestamp: one(sp.timestamp), sign: one(sp.sign), redirect: one(sp.redirect) };
  const view = await inspectShopeeAuthLink(region, "cancel_auth_partner", p);

  if (!view.ok) {
    return (
      <AuthCard platform="Shopee Open Platform" title="取消授权链接无效" facts={[["区域主机", region], ["Partner ID", p.partner_id || "（缺失）"]]}>
        <AuthError title={view.error} detail={view.message} />
      </AuthCard>
    );
  }

  return (
    <AuthCard platform="Shopee Open Platform" title={`取消「${view.app.name}」的店铺授权`} facts={[["Partner ID", view.app.appKey], ["主账号", view.mainAccountId || "—"]]}>
      {view.shops.length > 0 ? (
        <form method="post" action="/mock/auth-submit/shopee-cancel" className="flex flex-col gap-5">
          {Object.entries({ region, ...p }).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <div>
            <h2 className="mb-2 text-sm font-medium">将取消授权的店铺（{view.shops.length}）</h2>
            <ShopRows shops={view.shops} />
            <p className="mt-2 text-xs text-muted-foreground">取消后这些店的 token 立即失效，并向应用回调推送 code 2。</p>
          </div>
          <div>
            <SubmitButton variant="destructive">取消授权</SubmitButton>
          </div>
        </form>
      ) : (
        <AuthError title="没有已授权的店铺" detail="这个应用当前没有授权中的店铺，无需取消。" />
      )}
    </AuthCard>
  );
}
