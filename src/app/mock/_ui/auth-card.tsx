import { Checkbox } from "@/components/ui/checkbox";

/** 模拟平台授权页外框：只有一张卡片，不挂 Shopilot 导航（IA-008）。 */
export function AuthCard({ platform, title, facts, children }: { platform: string; title: string; facts?: Array<[string, string]>; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-background px-4 py-10 sm:items-center">
      <section className="w-full max-w-lg rounded-(--semantic-radius-lg) border border-border bg-card p-6">
        <p className="text-xs text-muted-foreground">{platform} · 模拟平台</p>
        <h1 className="mt-1 text-lg font-semibold text-balance">{title}</h1>
        {facts && facts.length > 0 && (
          <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            {facts.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="min-w-0 break-all tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-5">{children}</div>
      </section>
    </main>
  );
}

export function AuthError({ title, detail }: { title: string; detail: string }) {
  return (
    <div role="alert" className="rounded-lg bg-muted px-4 py-3 text-sm">
      <p className="font-medium text-destructive">{title}</p>
      <p className="mt-1 break-all text-muted-foreground">{detail}</p>
    </div>
  );
}

/** selectable 时每行带勾选框（name=shop_ids），默认全选；随表单提交 */
export function ShopRows({ shops, selectable = false }: { shops: Array<{ shopId: string; name: string; region: string; authStatus: string }>; selectable?: boolean }) {
  const label: Record<string, string> = { authorized: "已授权", unauthorized: "未授权", deauthorized: "已取消授权" };
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {shops.map((s) => (
        <li key={s.shopId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          {selectable && <Checkbox name="shop_ids" value={s.shopId} defaultChecked aria-label={`授权 ${s.name}`} />}
          <span className="min-w-0 flex-1">
            <span className="font-medium">{s.name}</span>
            <span className="ml-2 text-muted-foreground tabular-nums">
              {s.region} · {s.shopId}
            </span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{label[s.authStatus] ?? s.authStatus}</span>
        </li>
      ))}
    </ul>
  );
}
