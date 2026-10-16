"use client";

import {
  ArrowUpRightIcon,
  BellIcon,
  BotIcon,
  ChevronRightIcon,
  CreditCardIcon,
  EyeIcon,
  FileTextIcon,
  LayersIcon,
  PencilIcon,
  PencilLineIcon,
  PlusIcon,
  ReceiptIcon,
  SendIcon,
  StoreIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Me } from "@/contracts/auth";
import type { BillingResponse } from "@/contracts/billing";
import { BrandChart, stripes, useBrandColors } from "@/components/charts/chart";
import { PageActions } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows, PageHeader, PageScroll, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inTz, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlertsDialog, InvoiceInfoDialog, OverageDialog, PaymentDialog, TopupDialog } from "./billing-dialogs";
import { CYCLE_LABEL, forecast, num, useBilling, useOpenDialog } from "./billing-lib";

const MODES = [
  { key: "auto", label: "自动发送", icon: SendIcon, note: "AI 直接回复买家", bar: "bg-(--semantic-color-data-viz-series-1)" },
  { key: "assist", label: "辅助草稿", icon: PencilLineIcon, note: "员工采纳或改写后发送", bar: "bg-(--semantic-color-data-viz-series-2)" },
  { key: "shadow", label: "影子生成", icon: EyeIcon, note: "只生成不发送，也计出稿", bar: "bg-(--semantic-color-data-viz-series-3)" },
] as const;

const DAY = 86_400_000;

/** 计费周期覆盖的每一天（商户时区，yyyy-MM-dd）：「本计费周期」视图按整个周期铺横轴，未到的日期留空 */
function periodDays(start: string, end: string, tz: string) {
  const last = inTz(new Date(new Date(end).getTime() - 1), tz, "yyyy-MM-dd");
  const days: string[] = [];
  for (let t = Date.parse(`${inTz(start, tz, "yyyy-MM-dd")}T00:00:00Z`); days.length < 400; t += DAY) {
    const day = new Date(t).toISOString().slice(0, 10);
    days.push(day);
    if (day >= last) break;
  }
  return days;
}

function useQueryParam(name: string, fallback: string) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(name) ?? fallback;
  const set = (v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v === fallback) next.delete(name);
    else next.set(name, v);
    router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
  };
  return [value, set] as const;
}

export function BillingClient({ me }: { me: Me }) {
  const [daily, setDaily] = useQueryParam("daily", "7d");
  const [shopsMonth, setShopsMonth] = useQueryParam("shopsMonth", "");
  const [statements, setStatements] = useQueryParam("statements", "3m");
  const qs = new URLSearchParams({ daily, statements, ...(shopsMonth ? { shopsMonth } : {}) }).toString();
  const data = useBilling(qs);
  const [now] = useState(() => Date.now());
  const d = data.data;
  const tz = me.active.timezone;

  return (
    <PageScroll>
      <PageActions>
        <Button asChild>
          <Link href="/billing/plans">
            <ArrowUpRightIcon />
            更换套餐
          </Link>
        </Button>
      </PageActions>
      <PageHeader
        title="用量与套餐"
        facts={d ? `${d.subscription.planName} · ${CYCLE_LABEL[d.subscription.cycle]} · 计费周期 ${inTz(d.period.start, tz, "MM-dd")} 至 ${inTz(d.period.end, tz, "MM-dd")}` : " "}
      />
      {data.isError ? (
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      ) : !d ? (
        <LoadingRows />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-4">
            <UsageOverview d={d} tz={tz} now={now} daily={daily} setDaily={setDaily} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <QuotaPanel d={d} />
              <ShadowPanel d={d} />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <ByShopPanel d={d} tz={tz} value={shopsMonth || d.byShopRange.month} onChange={(v) => setShopsMonth(v === d.shopsMonths[0]?.month ? "" : v)} />
              <ResolvedPanel d={d} tz={tz} />
              <SourcesPanel d={d} />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <PlanPanel d={d} tz={tz} me={me} />
            <StatementsPanel d={d} tz={tz} value={statements} onChange={setStatements} />
          </div>
        </div>
      )}
      {d && (
        <>
          <TopupDialog d={d} me={me} />
          <OverageDialog d={d} />
          <AlertsDialog d={d} />
          <PaymentDialog d={d} me={me} />
          <InvoiceInfoDialog d={d} me={me} />
        </>
      )}
    </PageScroll>
  );
}

function UsageOverview({ d, tz, now, daily, setDaily }: { d: BillingResponse; tz: string; now: number; daily: string; setDaily: (v: string) => void }) {
  const colors = useBrandColors();
  const f = forecast(d, now);
  const overageAmount = Number(d.overage.amount);
  const near = f.projectedPct >= 90;
  const byDate = new Map(d.daily.map((r) => [r.date, r]));
  const days = daily === "period" ? periodDays(d.period.start, d.period.end, tz) : d.daily.map((r) => r.date);
  const labels = days.map((day) => inTz(`${day}T12:00:00Z`, "UTC", "MM-dd"));
  return (
    <Panel className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[1.875rem] leading-tight font-semibold tracking-tight tabular-nums">{num(d.usage.used)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              本期 AI 出稿（次）· {inTz(d.period.start, tz, "MM-dd")} 至今
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <Select value={daily} onValueChange={setDaily}>
              <SelectTrigger size="sm" aria-label="每日出稿的统计范围">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">近 7 天</SelectItem>
                <SelectItem value="period">本计费周期</SelectItem>
              </SelectContent>
            </Select>
            <ul className={cn("flex items-center gap-3", d.usage.used === 0 && "invisible")} aria-label="图例">
              {MODES.map((m) => (
                <li key={m.key} className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
                  <span className={cn("size-2.5 rounded-sm", m.bar)} aria-hidden />
                  {m.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-4">
          {d.usage.used === 0 ? (
            <EmptyState
              icon={BotIcon}
              title="本期还没有 AI 出稿"
              description="店铺的接待模式设为影子、辅助或自动后，AI 每起草一份回复计 1 次出稿，这里按天、按模式显示。"
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/reception">去接待设置</Link>
                </Button>
              }
            />
          ) : (
            colors && (
              <BrandChart
                type="bar"
                height={236}
                label={`每日 AI 出稿按模式堆叠：${d.daily.map((r) => `${r.date} 共 ${r.auto + r.assist + r.shadow} 次`).join("，")}`}
                data={{
                  labels,
                  datasets: MODES.map((m, i) => ({
                    label: m.label,
                    data: days.map((day) => byDate.get(day)?.[m.key] ?? null),
                    backgroundColor: colors.series[i],
                    borderColor: colors.surface,
                    borderWidth: 0,
                    borderRadius: 4,
                    maxBarThickness: 32,
                    stack: "s",
                  })),
                }}
                options={{
                  interaction: { mode: "index", intersect: false },
                  scales: {
                    x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: colors.muted, font: { size: 12 }, maxRotation: 0 } },
                    y: { stacked: true, beginAtZero: true, grid: { color: colors.border }, border: { display: false }, ticks: { color: colors.muted, font: { size: 12 }, precision: 0 } },
                  },
                  plugins: { tooltip: { callbacks: { title: (items) => `${days[items[0].dataIndex]} · 共 ${items.reduce((s, it) => s + Number(it.raw ?? 0), 0)} 次` } } },
                }}
              />
            )
          )}
        </div>
      </div>
      <dl className="flex shrink-0 flex-col justify-between gap-5 py-1 lg:w-44">
        <div>
          <dt className="text-sm text-muted-foreground">本期费用</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight whitespace-nowrap tabular-nums">{money(Number(d.plan.price) + overageAmount, "USD")}</dd>
          <dd className="mt-1 text-xs text-muted-foreground tabular-nums">
            {d.plan.name}
            {d.plan.cycle === "yearly" ? "年费" : "月费"} · 超量 {money(overageAmount, "USD")}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">预计周期末出稿</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight whitespace-nowrap tabular-nums">{d.usage.used === 0 ? "—" : `${num(f.projected)} 次`}</dd>
          <dd className={cn("mt-1 inline-flex items-center gap-1 text-xs tabular-nums", near ? "text-(--semantic-color-feedback-warning)" : "text-muted-foreground")}>
            {near && <TriangleAlertIcon className="size-3.5" />}
            {d.usage.used === 0 ? "有出稿后按日均推算" : `${near ? "接近上限 · " : "额度的 "}${f.projectedPct}%`}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">日均出稿</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight whitespace-nowrap tabular-nums">{num(Math.round(f.perDay))} 次</dd>
          <dd className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <TrendingUpIcon className="size-3.5" />
            本期还剩 {f.daysLeft} 天
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

function QuotaPanel({ d }: { d: BillingResponse }) {
  const openDialog = useOpenDialog();
  const total = d.usage.quota + d.usage.topup;
  const pct = total > 0 ? Math.min(100, (d.usage.used / total) * 100) : 0;
  const policy =
    d.overage.policy === "stop"
      ? "用尽后停止 AI 出稿，新会话直接进入待认领"
      : `用尽后继续出稿，${money(d.overage.price, "USD")} / 次，预算 ${money(d.overage.budget ?? 0, "USD")}`;
  return (
    <Panel>
      <PanelHeader title="本期出稿额度" description={policy}>
        <Button variant="ghost" size="icon-sm" aria-label="修改超量策略" onClick={() => openDialog("overage")}>
          <PencilIcon />
        </Button>
      </PanelHeader>
      <div className="flex h-7 gap-1" role="img" aria-label={`已用 ${num(d.usage.used)} / ${num(total)} 次，${Math.round(pct)}%`}>
        {pct > 0 && <div className="rounded-sm bg-primary" style={{ width: `${Math.max(pct, 1)}%` }} />}
        <div className="flex-1 rounded-sm bg-muted" />
      </div>
      <div className="mt-2 flex justify-between text-sm tabular-nums">
        <span>已用 {num(d.usage.used)} 次</span>
        <span className="text-muted-foreground">{num(total)} 次</span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">套餐额度</dt>
          <dd className="tabular-nums">{num(d.usage.quota)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">加购额度</dt>
          <dd className="tabular-nums">{num(d.usage.topup)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{d.overage.drafts > 0 ? "超量" : "剩余"}</dt>
          <dd className={cn("tabular-nums", d.overage.drafts > 0 && "text-(--semantic-color-feedback-warning)")}>
            {d.overage.drafts > 0 ? `${num(d.overage.drafts)} 次 · ${money(d.overage.amount, "USD")}` : num(d.usage.remaining)}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

function ShadowPanel({ d }: { d: BillingResponse }) {
  const shadow = d.usage.byMode.shadow;
  const share = d.usage.used > 0 ? Math.round((shadow / d.usage.used) * 100) : 0;
  return (
    <Panel className="flex flex-col bg-(--semantic-color-surface-warm)">
      <h2 className="text-lg font-semibold">影子模式也计入出稿</h2>
      <p className="mt-2 flex-1 text-sm text-pretty text-muted-foreground">
        {shadow > 0
          ? `本期影子生成 ${num(shadow)} 次，占出稿的 ${share}%。影子草稿不发送、不给员工看；店铺跑稳后可以转为辅助草稿，或在接待设置里关闭。`
          : "影子模式下 AI 起草的回复不发送、不给员工看，但同样计 1 次出稿。新接入的店默认是影子模式。"}
      </p>
      <Link href="/reception" className="focus-ring mt-3 inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-(--semantic-color-text-link)">
        去接待设置
        <ChevronRightIcon className="size-4" />
      </Link>
    </Panel>
  );
}

function ByShopPanel({ d, tz, value, onChange }: { d: BillingResponse; tz: string; value: string; onChange: (v: string) => void }) {
  const colors = useBrandColors();
  const total = d.byShop.reduce((s, r) => s + r.drafts, 0);
  const top = d.byShop.slice(0, 5);
  const rest = d.byShop.slice(5);
  const restTotal = rest.reduce((s, r) => s + r.drafts, 0);
  const rows = [...top.map((r, i) => ({ key: r.shopId, label: `${r.name}`, drafts: r.drafts, color: colors?.series[i] })), ...(rest.length ? [{ key: "rest", label: `其他 ${rest.length} 家`, drafts: restTotal, color: colors?.muted }] : [])];
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  return (
    <Panel className="min-w-0">
      <PanelHeader title="按店铺用量" description={`${inTz(d.byShopRange.start, tz, "MM-dd")} 至 ${inTz(d.byShopRange.end, tz, "MM-dd")}`}>
        {d.shopsMonths.length > 1 && (
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger size="sm" aria-label="按计费周期统计">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {d.shopsMonths.map((m, i) => (
                <SelectItem key={m.month} value={m.month}>
                  {i === 0 ? "本期" : `${inTz(m.start, tz, "MM-dd")} 起`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </PanelHeader>
      <p className="text-2xl font-semibold tabular-nums">{num(total)} 次</p>
      {value === d.shopsMonths[0]?.month && erasedOf(d) > 0 && <p className="mt-1 text-xs text-muted-foreground tabular-nums">本期另有 {num(erasedOf(d))} 次出稿的草稿已随买家数据删除，不按店铺统计。</p>}
      {total === 0 ? (
        <EmptyState icon={StoreIcon} title="这个周期还没有出稿" description="有出稿后按店铺显示占比。" />
      ) : (
        <>
          <div className="mt-3 flex h-6 gap-0.5 overflow-hidden rounded-sm" role="img" aria-label={`按店铺出稿占比：${rows.map((r) => `${r.label} ${pct(r.drafts)}%`).join("，")}`}>
            {rows.map((r) => (
              <div key={r.key} className="h-full" style={{ width: `${(r.drafts / total) * 100}%`, backgroundColor: r.color }} />
            ))}
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                <span className="text-muted-foreground tabular-nums">{num(r.drafts)}</span>
                <span className="w-9 text-right tabular-nums">{pct(r.drafts)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function ResolvedPanel({ d, tz }: { d: BillingResponse; tz: string }) {
  const colors = useBrandColors();
  const { resolved, total } = d.aiResolvedSegments;
  const rate = total > 0 ? Math.round((resolved / total) * 100) : 0;
  return (
    <Panel className="min-w-0">
      <PanelHeader title="AI 独立解决" description="会话段结束时没有人工参与" />
      <p className="text-2xl font-semibold tabular-nums">{num(resolved)} 段</p>
      {total === 0 ? (
        <EmptyState icon={BotIcon} title="还没有结束的 AI 接待段" description="本期有开段时为辅助或自动模式的会话段结束后，这里显示 AI 独立解决的占比。" />
      ) : (
        <>
          <div className="relative mt-3">
            {colors && (
              <BrandChart
                type="doughnut"
                height={120}
                label={`AI 独立解决率 ${rate}%`}
                data={{ datasets: [{ data: [resolved, total - resolved], backgroundColor: [stripes(colors.link, colors.surface), colors.surface], borderWidth: 0, borderRadius: 4 }] }}
                options={{ rotation: -90, circumference: 180, cutout: "68%", events: [], plugins: { tooltip: { enabled: false } } }}
              />
            )}
            <div className="absolute inset-x-0 bottom-1 text-center">
              <p className="text-2xl font-semibold tabular-nums">{rate}%</p>
              <p className="text-xs text-muted-foreground">占已结束的 AI 接待段</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground tabular-nums">
            按 {inTz(d.period.start, tz, "MM-dd")} 至今结束的 {num(total)} 个 AI 接待段计算（开段时为辅助或自动模式）
          </p>
        </>
      )}
    </Panel>
  );
}

// 已用是计费口径（删除买家数据不退回）；分模式、分店铺按现存草稿统计，差额就是被删掉的那部分
function erasedOf(d: BillingResponse) {
  return Math.max(0, d.usage.used - (d.usage.byMode.auto + d.usage.byMode.assist + d.usage.byMode.shadow));
}

function SourcesPanel({ d }: { d: BillingResponse }) {
  const openDialog = useOpenDialog();
  const erased = erasedOf(d);
  return (
    <Panel className="min-w-0">
      <PanelHeader title="出稿来源" description="本期，按接待模式">
        <Button variant="outline" size="sm" onClick={() => openDialog("alerts")}>
          <BellIcon />
          提醒
        </Button>
      </PanelHeader>
      <ul className="flex flex-col gap-4">
        {MODES.map((m) => {
          const v = d.usage.byMode[m.key];
          const w = d.usage.used > 0 ? (v / d.usage.used) * 100 : 0;
          return (
            <li key={m.key}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <m.icon className="size-4" />
                  {m.label}
                </span>
                <span className="tabular-nums">
                  {num(v)}
                  <span className="text-muted-foreground"> / {num(d.usage.used)}</span>
                </span>
              </div>
              <div className="mt-1.5 flex h-2 gap-1">
                {w > 0 && <div className={cn("rounded-sm", m.bar)} style={{ width: `${w}%` }} />}
                <div className="flex-1 rounded-sm bg-muted" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{m.note}</p>
            </li>
          );
        })}
      </ul>
      {erased > 0 && <p className="mt-4 text-xs text-muted-foreground tabular-nums">另有 {num(erased)} 次出稿的草稿已随买家数据删除：计入已用，不再分模式统计。</p>}
    </Panel>
  );
}

function PlanPanel({ d, tz, me }: { d: BillingResponse; tz: string; me: Me }) {
  const openDialog = useOpenDialog();
  const s = d.subscription;
  const end = inTz(s.periodEnd, tz, "MM-dd");
  const pending = [s.pendingPlanName, s.pendingCycle && CYCLE_LABEL[s.pendingCycle]].filter(Boolean).join(" · ");
  const actions = [
    { key: "topup", label: "加购", icon: PlusIcon },
    { key: "payment", label: "付款", icon: CreditCardIcon },
    { key: "invoice-info", label: "发票", icon: FileTextIcon },
    { key: "alerts", label: "提醒", icon: BellIcon },
  ] as const;
  return (
    <Panel>
      <PanelHeader title="当前套餐" description={s.autoRenew ? `${end} 自动续费` : "本期结束后不再扣款"}>
        <Button variant="outline" size="sm" onClick={() => openDialog("payment")}>
          续费设置
        </Button>
      </PanelHeader>
      {s.status === "readonly" && (
        <p role="alert" className="mb-3 flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-(--semantic-color-feedback-warning)" />
          <span>
            {s.autoRenew ? "上次续费扣款没有成功，订阅处于只读状态。" : "自动续费已关闭，上个周期结束后没有续费，订阅处于只读状态。"}
            {me.active.isOwner ? "更换付款方式并打开自动续费后，下次续费扣款成功即恢复。" : `请联系账号所有者 ${d.owner.name} 处理。`}
          </span>
        </p>
      )}
      <div className="flex h-36 flex-col rounded-(--semantic-radius-lg) bg-primary p-4 text-primary-foreground">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium">{d.plan.name}</span>
          <span className="text-sm font-semibold tabular-nums">
            {money(d.plan.price, "USD")} / {d.plan.cycle === "yearly" ? "年" : "月"}
          </span>
        </div>
        <LayersIcon className="mt-3 size-6" />
        <div className="mt-auto flex items-end justify-between gap-2 text-xs tabular-nums">
          <span>
            店铺 {d.shops.used} / {d.shops.limit}
            <br />
            出稿 {num(d.plan.draftQuota)} 次 / 月
          </span>
          <span>至 {end}</span>
        </div>
      </div>
      {pending && (
        <p className="mt-3 text-xs text-muted-foreground">
          下个周期（{end} 起）改为 {pending}
        </p>
      )}
      <div className="mt-5 grid grid-cols-5 gap-1">
        {actions.map((a) => (
          <button key={a.key} type="button" onClick={() => openDialog(a.key)} className="state-layer focus-ring flex flex-col items-center gap-1.5 rounded-md py-1 text-xs">
            <span className="flex size-11 items-center justify-center rounded-md border border-border">
              <a.icon className="size-5" />
            </span>
            {a.label}
          </button>
        ))}
        <Link href="/billing/plans" className="state-layer focus-ring flex flex-col items-center gap-1.5 rounded-md py-1 text-xs">
          <span className="flex size-11 items-center justify-center rounded-md border border-border">
            <LayersIcon className="size-5" />
          </span>
          套餐
        </Link>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <h3 className="text-sm font-medium">用量提醒发给</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{d.alerts.thresholds.map((t) => `${t}%`).join("、")}</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-4">
        {d.alerts.recipients.map((r) => (
          <li key={r.membershipId} className="flex w-12 flex-col items-center gap-1.5">
            <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-xs font-semibold" aria-hidden>
              {r.name.slice(0, 1)}
            </span>
            <span className="w-full truncate text-center text-xs">{r.name}</span>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => openDialog("alerts")} className="state-layer focus-ring flex w-12 flex-col items-center gap-1.5 rounded-md text-xs">
            <span className="flex size-11 items-center justify-center rounded-full border border-dashed border-input text-muted-foreground">
              <PlusIcon className="size-4" />
            </span>
            {d.alerts.recipients.length ? "调整" : "添加"}
          </button>
        </li>
      </ul>
    </Panel>
  );
}

function StatementsPanel({ d, tz, value, onChange }: { d: BillingResponse; tz: string; value: string; onChange: (v: string) => void }) {
  return (
    <Panel>
      <PanelHeader title="账单记录">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger size="sm" aria-label="账单时间范围">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3m">近 3 月</SelectItem>
            <SelectItem value="12m">近 12 月</SelectItem>
          </SelectContent>
        </Select>
      </PanelHeader>
      {d.statements.length === 0 ? (
        <EmptyState icon={ReceiptIcon} title={`${value === "3m" ? "近 3 个月" : "近 12 个月"}没有账单`} description="续费、加购出稿包与超量结算都会在这里生成账单。" />
      ) : (
        <ul className="flex flex-col">
          {d.statements.map((s) => (
            <li key={s.id} className="flex items-start gap-3 py-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <ReceiptIcon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-pretty">{s.description}</p>
                <p className="truncate text-xs text-muted-foreground tabular-nums">
                  {inTz(s.createdAt, tz, "yyyy-MM-dd")}
                  {s.invoiceCompany ? ` · ${s.invoiceCompany}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm whitespace-nowrap tabular-nums">{money(s.amount, s.currency)}</p>
                <p className={cn("text-xs whitespace-nowrap", s.status === "paid" ? "text-(--semantic-color-feedback-success)" : "text-destructive")}>{s.status === "paid" ? "已支付" : "扣款失败"}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
