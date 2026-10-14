"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon, EyeOffIcon, KeyRoundIcon, MessageSquareOffIcon, PackageXIcon, PlusIcon, RefreshCwIcon, StethoscopeIcon, StoreIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import type { ShopsResponse } from "@/contracts/shops";
import { BrandChart, stripes, useBrandColors } from "@/components/charts/chart";
import { PlatformBadge } from "@/components/common/platform-badge";
import { PageActions } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows, PageHeader, PageScroll, Panel, PanelHeader } from "@/components/shell/page";
import { CopyValue } from "./connect/connect-ui";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorText } from "@/lib/api";
import { inTz, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ShopDrawer } from "./shop-drawer";
import { DisconnectDialog, ReauthDialog, RotateKeyDialog } from "./shops-dialogs";
import { DiagnoseList, metricText, PERIODS, rateSub, rateText, StatusText, useDiagnose, useOpenDialog, useQueryParam } from "./shop-ui";

const PLATFORM_LABEL = { shopee: "Shopee", tiktok: "TikTok Shop" } as const;
const PLATFORM_SHORT = { shopee: "Shopee", tiktok: "TikTok" } as const;

export function ShopsClient({ me }: { me: Me }) {
  const [period, setPeriod] = useQueryParam("period", "7d");
  const [platform, setPlatform] = useQueryParam("platform", "all");
  const [status, setStatus] = useQueryParam("status", "all");
  const [shopParam, setShop] = useQueryParam("shop", "");
  const params = useSearchParams();
  const router = useRouter();
  const openDialog = useOpenDialog();
  const colors = useBrandColors();
  const diagnose = useDiagnose();

  // 只按周期取全量；平台、状态筛选在前端做（规则同 API-SHOP-001），页头的店铺数与断开数保持全局值
  const data = useQuery({
    queryKey: ["shops", period],
    queryFn: () => api.get<ShopsResponse>(`/api/v1/shops?period=${period}`),
  });

  // 从平台续期回来（API-SHOP-005 302 带 renewed=1）：提示一次后去掉参数；固定 id 防止重复弹出
  const renewed = params.get("renewed");
  useEffect(() => {
    if (!renewed) return;
    toast.success("授权已续期，店铺恢复收发", { id: "shop-renewed" });
    const next = new URLSearchParams(params.toString());
    next.delete("renewed");
    router.replace(`/shops?${next.toString()}`, { scroll: false });
  }, [renewed, params, router]);

  const d = data.data;
  const periodLabel = PERIODS.find((p) => p.value === period)?.label ?? "近 7 天";
  const items = (d?.items ?? []).filter(
    (s) =>
      (platform === "all" || s.platform === platform) &&
      (status === "all" || (status === "attention" ? s.status !== "disconnected" && s.issues.length > 0 : s.status === "connected" && s.issues.length === 0)),
  );
  const disconnectedCount = d?.items.filter((s) => s.status === "disconnected").length ?? 0;
  // 图表与上方最低回复率同一口径：筛选后、未断开、有回复率的店
  const rated = items.filter((s) => s.status !== "disconnected" && typeof s.metrics?.responseRate === "number");
  const lowest = rated.reduce<(typeof rated)[number] | null>((lo, s) => (!lo || Number(s.metrics!.responseRate) < Number(lo.metrics!.responseRate) ? s : lo), null);
  const shortName = (s: (typeof rated)[number]) => {
    const base = `${PLATFORM_SHORT[s.platform]} ${s.market}`;
    const same = rated.filter((x) => x.platform === s.platform && x.market === s.market);
    return same.length > 1 ? `${base} ${same.indexOf(s) + 1}` : base;
  };
  const needShopee = d?.items.filter((s) => s.platform === "shopee" && s.status !== "disconnected" && s.caps.piiMasked) ?? [];
  const needTiktok = d?.items.filter((s) => s.platform === "tiktok" && s.status !== "disconnected" && !s.caps.productScope) ?? [];
  const needChat = d?.items.filter((s) => s.status === "connected" && !s.caps.chat) ?? [];
  const runDiagnose = () => diagnose.mutate(undefined, { onError: (e) => toast.error(errorText(e)) });

  return (
    <PageScroll>
      <PageActions>
        <Button asChild>
          <Link href="/shops/connect">
            <PlusIcon />
            接入平台应用
          </Link>
        </Button>
      </PageActions>
      <PageHeader
        title="店铺与连接"
        facts={
          d
            ? `${me.active.merchantName} · ${d.apps.length} 个平台应用 · ${d.summary.total} 家店（Shopee ${d.summary.byPlatform.shopee} · TikTok Shop ${d.summary.byPlatform.tiktok}${disconnectedCount ? `；另有 ${disconnectedCount} 家已断开` : ""}）${d.summary.metricsAt ? ` · 指标更新于 ${inTz(d.summary.metricsAt, me.active.timezone)}` : ""}`
            : " "
        }
      />
      {data.isError ? (
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      ) : !d ? (
        <LoadingRows />
      ) : d.summary.total === 0 && d.items.length === 0 ? (
        <Panel>
          <EmptyState
            icon={StoreIcon}
            title="还没有接入店铺"
            description="先在 Shopee 或 TikTok Shop 建一个应用，再把店铺授权给 Shopilot；接入后买家消息进工作台。"
            action={
              <Button asChild variant="outline">
                <Link href="/shops/connect">去接入平台应用</Link>
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 min-[1440px]:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_200px]">
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[1.875rem] leading-tight font-semibold tabular-nums">{lowest ? rateText(lowest.metrics) : "—"}</p>
                    <p className="text-sm text-muted-foreground">
                      {lowest
                        ? `最低平台回复率 · ${lowest.name}（${PLATFORM_LABEL[lowest.platform]}）${platform !== "all" || status !== "all" ? " · 筛选条件下" : ""}`
                        : items.length === 0
                          ? "筛选条件下没有店铺"
                          : "平台回复率等待首次同步"}
                    </p>
                  </div>
                  <Select value={period} onValueChange={(v) => setPeriod(v)}>
                    <SelectTrigger size="sm" aria-label="指标周期">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIODS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {rated.length === 0 ? (
                  <p className="mt-6 rounded-md bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
                    {items.length === 0 ? "筛选条件下没有店铺，清除筛选后再看。" : "还没有平台指标。接入后每小时同步一次。"}
                  </p>
                ) : (
                  colors && (
                    <div className="mt-4">
                      <BrandChart
                        type="bar"
                        height={220}
                        label={`各店平台回复率（${periodLabel}，Shopee 为当期值）：${rated.map((s) => `${s.name} ${rateText(s.metrics)}`).join("，")}`}
                        data={{
                          labels: rated.map((s) => s.name),
                          datasets: (["shopee", "tiktok"] as const)
                            .filter((p) => rated.some((s) => s.platform === p))
                            .map((p, i) => ({
                              label: PLATFORM_LABEL[p],
                              data: rated.map((s) => (s.platform === p ? Number(s.metrics!.responseRate) : null)),
                              backgroundColor: i === 0 ? stripes(colors.series[0], colors.surface) : colors.series[1],
                              borderRadius: 6,
                              skipNull: true,
                            })),
                        }}
                        options={{
                          plugins: { legend: { display: true, position: "top", align: "end" } },
                          scales: {
                            x: {
                              grid: { display: false },
                              border: { display: false },
                              // 每根柱子都标短名（平台 + 站点），一行放不下时拆成两行；tooltip 仍是店铺全名
                              ticks: {
                                color: colors.muted,
                                font: { size: 12 },
                                autoSkip: false,
                                maxRotation: 0,
                                callback(_v, i) {
                                  const s = rated[i];
                                  if (!s) return "";
                                  const label = shortName(s);
                                  const room = (this.chart.chartArea?.width ?? this.chart.width) / rated.length;
                                  return label.length * 7 + 8 <= room ? label : label.split(" ");
                                },
                              },
                            },
                            y: { min: 0, max: 100, grid: { color: colors.border }, border: { display: false }, ticks: { color: colors.muted, font: { size: 12 }, callback: (v) => `${v}%` } },
                          },
                        }}
                      />
                    </div>
                  )
                )}
              </div>
              <dl className="flex flex-col gap-5">
                <div>
                  <dt className="text-sm text-muted-foreground">授权有效</dt>
                  <dd className="text-2xl font-semibold tabular-nums">
                    {d.summary.authValid} / {d.summary.total} 家
                  </dd>
                  <dd className="text-xs text-muted-foreground">
                    {d.apps
                      .filter((a) => a.authExpiresAt)
                      .map((a) => `${PLATFORM_LABEL[a.platform]} 最早到期 ${inTz(a.authExpiresAt, me.active.timezone, "yyyy-MM-dd")}`)
                      .join("；") || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">需处理</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{d.summary.attention} 家店</dd>
                  {d.summary.attentionText.length > 0 && (
                    <dd className="flex items-start gap-1 text-xs text-(--semantic-color-feedback-warning)">
                      <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
                      {d.summary.attentionText.join(" · ")}
                    </dd>
                  )}
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">今日入站</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{d.summary.todayInbound} 段</dd>
                  <dd className="text-xs text-muted-foreground">{d.summary.lastInbound ? `最近 ${relative(d.summary.lastInbound.at)} · ${d.summary.lastInbound.shopName}` : "还没有入站消息"}</dd>
                </div>
              </dl>
            </Panel>

            {(diagnose.data || diagnose.isPending) && (
              <Panel aria-live="polite">
                <PanelHeader title="连接检查" description={diagnose.data ? `检查于 ${inTz(diagnose.data.checkedAt, me.active.timezone, "HH:mm:ss")} · 按店调店铺信息、会话列表、订单列表，并核对推送配置` : "正在逐店检查……"}>
                  <Button variant="ghost" size="icon-sm" aria-label="收起检查结果" onClick={() => diagnose.reset()}>
                    <XIcon />
                  </Button>
                </PanelHeader>
                {diagnose.isPending ? <LoadingRows rows={3} /> : diagnose.data && <DiagnoseList result={diagnose.data} />}
              </Panel>
            )}

            <Panel>
              <PanelHeader title="店铺" description="点一行看详情。回复率按平台口径分开写：Shopee 取账户健康当期值；TikTok 为所选周期内 24 小时首次响应的会话占比">
                <Select value={platform} onValueChange={(v) => setPlatform(v)}>
                  <SelectTrigger size="sm" aria-label="按平台筛选">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部平台</SelectItem>
                    <SelectItem value="shopee">Shopee</SelectItem>
                    <SelectItem value="tiktok">TikTok Shop</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={(v) => setStatus(v)}>
                  <SelectTrigger size="sm" aria-label="按状态筛选">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="attention">需处理</SelectItem>
                    <SelectItem value="ok">正常</SelectItem>
                  </SelectContent>
                </Select>
              </PanelHeader>
              {items.length === 0 ? (
                <EmptyState
                  icon={StoreIcon}
                  title="没有符合筛选条件的店铺"
                  action={
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPlatform("all");
                        setStatus("all");
                      }}
                    >
                      清除筛选
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>店铺</TableHead>
                      <TableHead>连接</TableHead>
                      <TableHead>平台回复率</TableHead>
                      <TableHead className="hidden min-[1440px]:table-cell">平台指标</TableHead>
                      <TableHead>接待模式</TableHead>
                      <TableHead>最近入站</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((s) => {
                      const gone = s.status === "disconnected";
                      return (
                        <TableRow key={s.id} className={cn("state-layer h-14 cursor-pointer", s.id === shopParam && "bg-accent")} onClick={() => setShop(s.id, "push")}>
                          <TableCell>
                            <button type="button" className="focus-ring rounded-sm text-left text-sm font-medium" onClick={(e) => (e.stopPropagation(), setShop(s.id, "push"))}>
                              {s.name}
                            </button>
                            <span className="mt-1 flex">
                              <PlatformBadge platform={s.platform} market={s.market} />
                            </span>
                          </TableCell>
                          <TableCell>
                            <StatusText row={s} />
                            <span className="block text-xs text-muted-foreground tabular-nums">{s.status === "disconnected" ? "授权已删除" : `授权至 ${inTz(s.authExpiresAt, me.active.timezone, "yyyy-MM-dd")}`}</span>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            <span className="block text-sm">{gone ? "—" : rateText(s.metrics)}</span>
                            {!gone && <span className="block text-xs text-muted-foreground">{rateSub(s.metrics)}</span>}
                          </TableCell>
                          <TableCell className="hidden max-w-48 text-sm whitespace-normal text-muted-foreground min-[1440px]:table-cell">{gone ? "—" : metricText(s.metrics)}</TableCell>
                          <TableCell className="text-sm">
                            {gone ? (
                              "—"
                            ) : (
                              <>
                                <span className="tabular-nums">
                                  {s.modes.inHours} / {s.modes.offHours}
                                </span>
                                <span className="block text-xs text-muted-foreground">工作时间内 / 外</span>
                              </>
                            )}
                          </TableCell>
                          <TableCell className={cn("text-sm", s.zeroInbound7d ? "text-(--semantic-color-feedback-warning)" : "text-muted-foreground")}>{s.lastInboundAt ? relative(s.lastInboundAt) : "从未"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Panel>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <Panel>
              <PanelHeader title="平台应用" description="你在平台建的应用，密钥由 Shopilot 加密保存" />
              {d.apps.length === 0 ? (
                <p className="text-sm text-muted-foreground">还没有平台应用。</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {d.apps.map((a) => (
                    <li key={a.id} className="rounded-md bg-(--semantic-color-surface-warm) px-4 py-3">
                      <p className="text-xs text-muted-foreground">{PLATFORM_LABEL[a.platform]} 应用</p>
                      <p className="text-sm font-medium">
                        {a.platform === "shopee" ? "Partner ID" : "App Key"} {a.appKey}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {a.shopCount} 家店{a.authExpiresAt ? ` · 最早授权至 ${inTz(a.authExpiresAt, me.active.timezone, "yyyy-MM-dd")}` : ""}
                        {a.keyExpiresAt ? ` · 应用密钥至 ${a.keyExpiresAt}` : ""}
                        {a.status !== "verified" ? " · 凭证未校验" : ""}
                      </p>
                      <CopyValue label="推送地址（本商户专属）" value={a.webhookUrl} />
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 grid grid-cols-4 gap-1">
                {[
                  { label: "添加店铺", icon: PlusIcon, href: "/shops/connect" },
                  { label: "续期授权", icon: RefreshCwIcon, onClick: () => openDialog("reauth") },
                  { label: "更新应用密钥", icon: KeyRoundIcon, onClick: () => openDialog("rotate-key") },
                  { label: "检查连接", icon: StethoscopeIcon, onClick: runDiagnose },
                ].map((a) => {
                  const inner = (
                    <>
                      <span className="flex size-10 items-center justify-center rounded-full border border-border bg-card">
                        {a.label === "检查连接" && diagnose.isPending ? <Spinner /> : <a.icon className="size-4" aria-hidden />}
                      </span>
                      <span className="text-xs">{a.label}</span>
                    </>
                  );
                  const cls = "state-layer focus-ring flex flex-col items-center gap-1.5 rounded-md py-2 text-center";
                  // 检查中用 aria-disabled：原生 disabled 会让键盘焦点掉回 body
                  const busy = a.label === "检查连接" && diagnose.isPending;
                  return a.href ? (
                    <Link key={a.label} href={a.href} className={cls}>
                      {inner}
                    </Link>
                  ) : (
                    <button key={a.label} type="button" onClick={busy ? undefined : a.onClick} disabled={d.apps.length === 0} aria-disabled={busy || undefined} className={cls}>
                      {inner}
                    </button>
                  );
                })}
              </div>
            </Panel>

            {(needShopee.length > 0 || needTiktok.length > 0 || needChat.length > 0) && (
              <Panel>
                <PanelHeader title="需要你在平台后台处理" description="只能由你本人在平台控制台操作" />
                <ul className="flex flex-col">
                  {needChat.length > 0 && (
                    <TodoItem
                      icon={MessageSquareOffIcon}
                      title={`${needChat.map((s) => s.name).join("、")} 不能收发聊天`}
                      desc="平台没有给这些店聊天接口权限；申请批下来后续期授权即可。"
                      href={`/shops/connect/${needChat[0].platform}/guide#item-4`}
                    />
                  )}
                  {needShopee.length > 0 && (
                    <TodoItem icon={EyeOffIcon} title="买家姓名地址被隐藏" desc={`${needShopee.length} 家 Shopee 店的订单收件人打码，开票时带不出收件信息；在 Shopee 控制台开 IP 白名单后可见。`} href="/shops/connect/shopee/guide#item-5" />
                  )}
                  {needTiktok.length > 0 && (
                    <TodoItem icon={PackageXIcon} title="TikTok 店铺没给商品权限" desc={`${needTiktok.length} 家店商品卡选不了商品；在 Partner Center 勾选商品权限后让店铺续期授权即可补上，不影响接客服。`} href="/shops/connect/tiktok/guide#item-4" />
                  )}
                </ul>
              </Panel>
            )}

            <Panel>
              <PanelHeader title="连接事件" description="近 7 天" />
              {d.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">近 7 天没有连接事件。</p>
              ) : (
                <ul className="flex flex-col">
                  {d.events.map((e) => (
                    <li key={e.id} className="border-b border-border py-2.5 last:border-0">
                      <button type="button" onClick={() => setShop(e.shopId, "push")} className="focus-ring rounded-sm text-left text-sm font-medium">
                        {e.shopName}
                      </button>
                      <p className="text-sm">{e.text}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{inTz(e.createdAt, me.active.timezone)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
      <ShopDrawer me={me} shopId={shopParam || null} period={period} onClose={() => setShop(null)} />
      <RotateKeyDialog apps={d?.apps ?? []} />
      <ReauthDialog me={me} shops={d?.items ?? []} />
      <DisconnectDialog shops={d?.items ?? []} />
    </PageScroll>
  );
}

function TodoItem({ icon: Icon, title, desc, href }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string; href: string }) {
  return (
    <li className="flex items-start gap-3 border-b border-border py-3 last:border-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium">{title}</span>
          <Link href={href} className="focus-ring shrink-0 rounded-sm text-sm font-medium text-(--semantic-color-text-link)">
            查看方法
          </Link>
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{desc}</span>
      </span>
    </li>
  );
}
