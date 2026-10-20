"use client";

// 看板各面板：只接 API-DASH-001 的响应渲染，口径说明写在面板上。
import { ArrowRightIcon, ClipboardCheckIcon, HeadsetIcon, MessagesSquareIcon, PencilLineIcon, StoreIcon, TriangleAlertIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { BrandChart, stripes, useBrandColors } from "@/components/charts/chart";
import { EmptyState, Panel, PanelHeader, Stat } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MIN_SAMPLE, type DashboardPlatformMetric, type DashboardResponse, type Ratio } from "@/contracts/dashboard";
import { duration, inTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { axes, num, pct, replyTime } from "./dashboard-lib";

const SERIES_BG = [
  "bg-(--semantic-color-data-viz-series-1)",
  "bg-(--semantic-color-data-viz-series-2)",
  "bg-(--semantic-color-data-viz-series-3)",
  "bg-(--semantic-color-data-viz-series-4)",
  "bg-(--semantic-color-data-viz-series-5)",
];

function Legend({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)} aria-label="图例">
      {items.map((label, i) => (
        <li key={label} className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
          <span className={cn("size-2.5 rounded-sm", SERIES_BG[i])} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}

/** 比率；样本不足时写「数据不足」，不写 0% 或 100% */
function RateValue({ r }: { r: Ratio }) {
  const p = pct(r);
  return p === null ? <span className="text-muted-foreground">数据不足</span> : <>{p}%</>;
}

const insufficient = (r: Ratio) => `样本 ${r.den}，满 ${MIN_SAMPLE} 才计算`;

// ---------- 会话段去向 ----------

const TREND_SERIES = [
  { key: "aiResolved", label: "AI 独立解决" },
  { key: "handedOff", label: "转人工" },
  { key: "shopilot", label: "Shopilot 回复" },
  { key: "platform", label: "平台后台回复" },
  { key: "pending", label: "未回复或进行中" },
] as const;

export function TrendPanel({ d, canConnect }: { d: DashboardResponse; canConnect: boolean }) {
  const colors = useBrandColors();
  const k = d.kpis;
  const perDay = k.segments / Math.max(1, d.period.days);
  const top = d.handoffReasons[0];
  return (
    <Panel className="flex min-w-0 flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1">
        <PanelHeader title="每日会话段去向" description="按会话段开始的日期；依次按 AI 独立解决、转人工、Shopilot 回复、平台后台回复判定" />
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div>
            <p className="text-[1.875rem] leading-tight font-semibold tracking-tight tabular-nums">{num(k.segments)}</p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">会话段 · 日均 {perDay >= 10 || perDay === 0 ? num(Math.round(perDay)) : perDay.toFixed(1)}</p>
          </div>
          {k.segments > 0 && <Legend items={TREND_SERIES.map((s) => s.label)} />}
        </div>
        <div className="mt-4">
          {d.shopCount === 0 ? (
            <EmptyState
              icon={StoreIcon}
              title="还没有接入店铺"
              description="接入 Shopee 或 TikTok Shop 店铺后，买家消息开始计入看板。"
              action={
                canConnect && (
                  <Button asChild variant="outline" size="sm">
                    <Link href="/shops/connect">去接入店铺</Link>
                  </Button>
                )
              }
            />
          ) : k.segments === 0 ? (
            <EmptyState icon={MessagesSquareIcon} title="这个范围内没有会话段" description="买家发来消息后开始一个会话段；接入时回补的历史会话不计入看板。" />
          ) : (
            colors && (
              <BrandChart
                type="bar"
                height={236}
                label={`每日会话段按去向堆叠：${d.trend.filter((t) => t.segments > 0).map((t) => `${t.date} 共 ${t.segments} 段，AI 独立解决 ${t.aiResolved}，转人工 ${t.handedOff}，Shopilot 回复 ${t.shopilot}，平台后台回复 ${t.platform}`).join("；")}`}
                data={{
                  labels: d.trend.map((t) => inTz(`${t.date}T12:00:00Z`, "UTC", "MM-dd")),
                  datasets: TREND_SERIES.map((s, i) => ({
                    label: s.label,
                    data: d.trend.map((t) => t[s.key]),
                    backgroundColor: i === 0 ? stripes(colors.series[0], colors.surface) : colors.series[i],
                    borderRadius: 4,
                    stack: "s",
                  })),
                }}
                options={{
                  interaction: { mode: "index", intersect: false },
                  scales: axes(colors, { stacked: true }),
                  plugins: { tooltip: { callbacks: { title: (items) => `${d.trend[items[0].dataIndex].date} · 共 ${d.trend[items[0].dataIndex].segments} 段` } } },
                }}
              />
            )
          )}
        </div>
      </div>
      <dl className="flex shrink-0 flex-col gap-5 py-1 sm:flex-row lg:w-48 lg:flex-col lg:justify-between">
        <div className="min-w-0 flex-1 lg:flex-none">
          <dt className="text-sm text-muted-foreground">AI 独立解决</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight whitespace-nowrap tabular-nums">
            <RateValue r={k.aiResolved} />
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground tabular-nums">
            {k.aiResolved.rate === null ? insufficient(k.aiResolved) : `${num(k.aiResolved.num)} 段，未经人工即结束`}
            <br />
            分母：已结束的 AI 接待段 {num(k.aiResolved.den)}
          </dd>
        </div>
        <div className="min-w-0 flex-1 lg:flex-none">
          <dt className="text-sm text-muted-foreground">人工首响平均</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight whitespace-nowrap tabular-nums">{replyTime(k.firstReplyAvgSec)}</dd>
          <dd className="mt-1 text-xs text-muted-foreground tabular-nums">
            买家等人工到首次人工回复，含平台后台回复
            <br />
            只累计工作时段 · 样本 {num(k.firstReplySamples)} 段
          </dd>
        </div>
        <div className="min-w-0 flex-1 lg:flex-none">
          <dt className="text-sm text-muted-foreground">12 小时回复率</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight whitespace-nowrap tabular-nums">
            <RateValue r={k.replied12h} />
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground tabular-nums">
            {k.replied12h.rate === null ? insufficient(k.replied12h) : `${num(k.replied12h.num)} / ${num(k.replied12h.den)} 段在买家首条消息后 12 小时内回复`}
            <br />
            人工、AI 与平台后台回复都算
          </dd>
        </div>
        <div className="min-w-0 flex-1 lg:flex-none">
          <dt className="text-sm text-muted-foreground">转人工</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight whitespace-nowrap tabular-nums">{num(k.handoffRate.num)} 段</dd>
          <dd className="mt-1 text-xs text-muted-foreground tabular-nums">
            {k.handoffRate.rate === null ? insufficient(k.handoffRate) : `占 AI 接待段 ${pct(k.handoffRate)}%`}
            {top && (
              <>
                <br />
                最多：{top.label} {top.count} 段
              </>
            )}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

// ---------- 草稿处置 ----------

export function DraftsPanel({ d }: { d: DashboardResponse }) {
  const colors = useBrandColors();
  const dr = d.drafts;
  const slices = [
    { label: "原样发送", value: dr.sent },
    { label: "改后发送", value: dr.editedSent },
    { label: "忽略", value: dr.ignored },
    { label: "过期未处理", value: dr.expired },
  ];
  const adopted = dr.sent + dr.editedSent;
  const disposed = slices.reduce((n, x) => n + x.value, 0);
  const shadowNote = dr.shadow > 0 && <p className="mt-3 text-xs text-muted-foreground tabular-nums">影子回复 {num(dr.shadow)} 份：只给管理员、组长看，不发送，不计入采纳率</p>;
  return (
    <Panel className="min-w-0">
      <PanelHeader title="辅助草稿处置" description={`${num(dr.generated)} 张辅助草稿，按生成日期统计`} />
      {dr.generated === 0 ? (
        <>
          <EmptyState icon={PencilLineIcon} title="这个范围内没有辅助草稿" description="接待模式为辅助草稿的店铺，AI 为买家消息起草回复，员工发送或忽略后计入这里。" />
          {shadowNote}
        </>
      ) : disposed === 0 ? (
        <>
          <EmptyState icon={PencilLineIcon} title="草稿都还没有处置" description={`${num(dr.other)} 张草稿还未处置、被新消息替代或发送失败；员工发送、忽略或草稿过期后计入这里。`} />
          {shadowNote}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2 xl:grid-cols-1">
            {colors && (
              <BrandChart
                type="doughnut"
                height={180}
                label={`草稿处置：${slices.map((s) => `${s.label} ${s.value}`).join("，")}`}
                data={{
                  labels: slices.map((s) => s.label),
                  datasets: [{ data: slices.map((s) => s.value), backgroundColor: slices.map((_, i) => (i === 0 ? stripes(colors.series[0], colors.surface) : colors.series[i])), borderWidth: 2, borderColor: colors.surface }],
                }}
                options={{ cutout: "62%" }}
              />
            )}
            <ul className="flex flex-col gap-1.5 text-sm">
              {slices.map((s, i) => (
                <li key={s.label} className="flex items-center gap-2">
                  <span className={cn("size-2.5 shrink-0 rounded-sm", SERIES_BG[i])} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  <span className="text-muted-foreground tabular-nums">{num(s.value)}</span>
                </li>
              ))}
            </ul>
          </div>
          {dr.other > 0 && <p className="mt-2 text-xs text-muted-foreground tabular-nums">另有 {num(dr.other)} 张还未处置、被新消息替代或发送失败，不计入上图。</p>}
          <p className="mt-3 text-xs text-muted-foreground tabular-nums">
            采纳率 =（原样 + 改后）/（原样 + 改后 + 忽略）= {num(adopted)} / {num(dr.adoptionRate.den)}
            {dr.adoptionRate.rate === null ? `，${insufficient(dr.adoptionRate)}` : ` = ${pct(dr.adoptionRate)}%`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            被改写率 = 改后 /（原样 + 改后）= {num(dr.editedSent)} / {num(adopted)}
            {dr.editRate.rate === null ? `，${insufficient(dr.editRate)}` : ` = ${pct(dr.editRate)}%`}
          </p>
          {shadowNote}
        </>
      )}
    </Panel>
  );
}

// ---------- 平台口径 ----------

const fmtRate = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Number(v.toFixed(2))}%`);

function MetricStatus({ m }: { m: DashboardPlatformMetric }) {
  if (m.status === "met")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-(--semantic-color-feedback-success)">
        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
        达标
      </span>
    );
  if (m.status === "below")
    return (
      <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-(--semantic-color-feedback-warning)">
        <TriangleAlertIcon className="size-3.5" aria-hidden="true" />
        低于目标
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {m.status === "not_returned" ? "接口未返回" : m.status === "no_data" ? "无数据" : "—"}
    </span>
  );
}

export function PlatformPanel({ d, platform, tz }: { d: DashboardResponse; platform: "shopee" | "tiktok"; tz: string }) {
  const rows = d.platformMetrics.filter((m) => m.platform === platform);
  const basis = rows.find((r) => r.basis)?.basis;
  const times = rows.map((r) => r.metricsAt).filter((t): t is string => !!t);
  const latest = times.length ? times.reduce((a, b) => (a > b ? a : b)) : null;
  const shopee = platform === "shopee";
  return (
    <Panel className="min-w-0">
      <PanelHeader
        title={shopee ? "Shopee · 平台口径" : "TikTok Shop · 平台口径"}
        description={shopee ? `${basis ?? "账户健康当期值，不随周期变化"}；目标由平台按店给出` : `回复率 = ${basis ?? "24 小时内首次响应的会话占比"}`}
      />
      {rows.length === 0 ? (
        <EmptyState icon={StoreIcon} title={`范围内没有 ${shopee ? "Shopee" : "TikTok Shop"} 店铺`} />
      ) : (
        <>
          <div className="-mx-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>店铺</TableHead>
                  <TableHead className="text-right">回复率</TableHead>
                  {shopee ? (
                    <>
                      <TableHead className="text-right">目标</TableHead>
                      <TableHead>状态</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="text-right">响应</TableHead>
                      <TableHead className="text-right">满意</TableHead>
                      <TableHead className="text-right">会话</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.shopId} className="h-12">
                    <TableCell className="max-w-48">
                      <span className="block truncate" title={m.shopName}>
                        {m.shopName}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtRate(m.value)}</TableCell>
                    {shopee ? (
                      <>
                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{typeof m.target === "number" ? `≥ ${m.target}%` : "—"}</TableCell>
                        <TableCell>
                          <MetricStatus m={m} />
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="text-right tabular-nums">{m.responseTimeMins === null || m.responseTimeMins === undefined ? "—" : `${m.responseTimeMins} 分`}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtRate(m.satisfaction)}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.sessions === null || m.sessions === undefined ? "—" : num(m.sessions)}</TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground tabular-nums">{latest ? `平台数据取于 ${inTz(latest, tz)}，每小时刷新` : "还没有取到平台数据，每小时刷新一次"}</p>
        </>
      )}
    </Panel>
  );
}

// ---------- 转人工原因 ----------

export function HandoffReasonsPanel({ d }: { d: DashboardResponse }) {
  const colors = useBrandColors();
  const rows = d.handoffReasons;
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <Panel className="min-w-0">
      <PanelHeader title="转人工原因" description={`${num(total)} 段 · 每段取最后一次转人工的原因`} />
      {total === 0 ? (
        <EmptyState icon={HeadsetIcon} title="这个范围内没有转人工的会话段" description="AI 接待中的会话因关键词、置信度低、买家要求人工等原因交给人工时计入。" />
      ) : (
        colors && (
          <BrandChart
            type="bar"
            height={Math.max(140, rows.length * 36 + 40)}
            label={`转人工原因：${rows.map((r) => `${r.label} ${r.count} 段`).join("，")}`}
            data={{
              labels: rows.map((r) => r.label),
              datasets: [{ label: "会话段", data: rows.map((r) => r.count), backgroundColor: rows.map((_, i) => (i === 0 ? stripes(colors.link, colors.surface) : colors.link)), borderRadius: 4, barPercentage: 0.7 }],
            }}
            options={{ indexAxis: "y", scales: axes(colors, { horizontal: true }) }}
          />
        )
      )}
    </Panel>
  );
}

// ---------- 按人统计 ----------

function RateCell({ r }: { r: Ratio }) {
  if (r.den === 0) return <span className="text-muted-foreground">—</span>;
  const p = pct(r);
  return p === null ? <span className="text-xs text-muted-foreground">数据不足</span> : <>{p}%</>;
}

export function PeoplePanel({ d, canSeeTeam }: { d: DashboardResponse; canSeeTeam: boolean }) {
  return (
    <Panel className="min-w-0">
      <PanelHeader title="按人统计" description="按会话段首个认领人统计；首响与 12 小时回复率只算本人在 Shopilot 的回复，平台接口不暴露子账号">
        {canSeeTeam && (
          <Button asChild variant="outline" size="sm">
            <Link href="/team">
              <ArrowRightIcon />
              团队与权限
            </Link>
          </Button>
        )}
      </PanelHeader>
      {d.people.length === 0 ? (
        <EmptyState icon={UsersIcon} title="这个范围内还没有人工处理" description="成员认领会话、转交会话或解决工单后出现在这里。" />
      ) : (
        <>
          <div className="-mx-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>客服</TableHead>
                  <TableHead className="text-right">会话段</TableHead>
                  <TableHead className="text-right">首响平均</TableHead>
                  <TableHead className="text-right">12 小时回复</TableHead>
                  <TableHead className="text-right">转交率</TableHead>
                  <TableHead className="text-right">工单按时</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.people.map((p) => (
                  <TableRow key={p.membershipId} className="h-12">
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                          {p.name.slice(0, 1)}
                        </span>
                        <span className="max-w-40 truncate">{p.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{num(p.segments)}</TableCell>
                    <TableCell className="text-right tabular-nums">{replyTime(p.firstReplyAvgSec)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <RateCell r={p.replied12h} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <RateCell r={p.transferRate} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <RateCell r={p.ticketsOnTimeRate} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">首响只累计工作时段，工作时间外开始、上班前已回复的段不计入；比率的分母不足 {MIN_SAMPLE} 时显示「数据不足」。</p>
        </>
      )}
    </Panel>
  );
}

// ---------- 工单 ----------

export function TicketStats({ d }: { d: DashboardResponse }) {
  const t = d.tickets;
  const noDue = t.noDue > 0 ? `；无时限 ${num(t.noDue)} 张不计` : "";
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="未结" value={`${num(t.open)} 张`} note={`6 小时内到期 ${t.due6h} · 已超时 ${t.overdue}`} />
      <Stat label="按时完成率" value={<RateValue r={t.onTimeRate} />} note={t.onTimeRate.rate === null ? `已解决 ${num(t.resolved)} 张，${insufficient(t.onTimeRate)}${noDue}` : `已解决 ${num(t.resolved)} 张，按时 ${num(t.onTimeRate.num)} 张${noDue}`} />
      <Stat label="解决时长中位" value={t.resolveMedianSec === null ? "—" : duration(t.resolveMedianSec)} note="从建单到已解决" />
      <Stat label="超时后被平台自动处理" value={`${num(t.platformAutoHandled)} 次`} note="Shopilot 推断：截止后由平台事件解决" />
    </div>
  );
}

const TYPE_SERIES = [
  { key: "onTime", label: "按时" },
  { key: "lateMerchant", label: "超商户时限" },
  { key: "latePlatform", label: "超平台截止" },
  { key: "noDue", label: "无时限" },
] as const;

export function TicketTypesPanel({ d }: { d: DashboardResponse }) {
  const colors = useBrandColors();
  const rows = d.tickets.byType;
  return (
    <Panel className="min-w-0">
      <PanelHeader title="按类型的时限达成" description={`已解决 ${num(d.tickets.resolved)} 张；平台类型按平台截止算，手动类型按商户时限算，没有截止时间的单列`}>
        {rows.length > 0 && <Legend items={TYPE_SERIES.map((s) => s.label)} />}
      </PanelHeader>
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardCheckIcon} title="这个范围内没有解决的工单" description="工单改为已解决后，按类型统计是否在时限内完成。" />
      ) : (
        colors && (
          <BrandChart
            type="bar"
            height={Math.max(140, rows.length * 40 + 40)}
            label={`已解决工单按类型的时限达成：${rows.map((r) => `${r.label} 按时 ${r.onTime}，超商户时限 ${r.lateMerchant}，超平台截止 ${r.latePlatform}，无时限 ${r.noDue}`).join("；")}`}
            data={{
              labels: rows.map((r) => r.label),
              datasets: TYPE_SERIES.map((s, i) => ({
                label: s.label,
                data: rows.map((r) => r[s.key]),
                backgroundColor: i === 0 ? stripes(colors.series[0], colors.surface) : colors.series[i],
                borderRadius: 4,
                barPercentage: 0.7,
                stack: "s",
              })),
            }}
            options={{ indexAxis: "y", interaction: { mode: "index", intersect: false }, scales: axes(colors, { horizontal: true, stacked: true }) }}
          />
        )
      )}
    </Panel>
  );
}
