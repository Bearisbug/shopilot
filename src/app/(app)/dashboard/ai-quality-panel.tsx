"use client";

// 「AI 质量」面板（API-KB-045）：最近 12 周的辅助草稿采纳率、影子回复一致率、AI 接待段转人工率，每点带样本数；
// 全商户口径、按 UTC 自然周，不随看板的时间范围变。顶部写 Agent 自动改卡是否暂停。
import { ActivityIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { BrandChart, useBrandColors } from "@/components/charts/chart";
import { EmptyState, ErrorState, LoadingRows, Panel, PanelHeader } from "@/components/shell/page";
import type { AgentStatus } from "@/contracts/cards";
import { MIN_SAMPLE } from "@/contracts/dashboard";
import { inTz } from "@/lib/format";
import { useAgentStatus } from "../reception/knowledge/cards-ui";
import { num } from "./dashboard-lib";

type Week = AgentStatus["weeks"][number];
type R = Week["adoption"];

/** 三条线除颜色外再用点的形状区分（VIS-014 第二编码） */
const SERIES = [
  { key: "adoption", label: "辅助草稿采纳率", shape: "circle" },
  { key: "consistency", label: "影子回复一致率", shape: "rect" },
  { key: "handoff", label: "转人工率", shape: "triangle" },
] as const;

const rate = (r: R) => (r.den >= MIN_SAMPLE ? Math.round((r.num / r.den) * 100) : null);
const rateText = (r: R) => (r.den === 0 ? "没有样本" : r.den < MIN_SAMPLE ? `数据不足（样本 ${num(r.den)}）` : `${rate(r)}%（样本 ${num(r.den)}）`);
const weekText = (w: Week) => `${w.weekStart.slice(5)} 至 ${inTz(new Date(Date.parse(`${w.weekStart}T00:00:00Z`) + 6 * 86400_000), "UTC", "MM-dd")}`;

function Marker({ shape, color }: { shape: (typeof SERIES)[number]["shape"]; color: string }) {
  return (
    <svg viewBox="0 0 16 10" className="h-2.5 w-4" aria-hidden="true">
      <line x1="0" y1="5" x2="16" y2="5" stroke={color} strokeWidth="2" />
      {shape === "circle" && <circle cx="8" cy="5" r="3.5" fill={color} />}
      {shape === "rect" && <rect x="4.5" y="1.5" width="7" height="7" fill={color} />}
      {shape === "triangle" && <path d="M8 1 L12 9 L4 9 Z" fill={color} />}
    </svg>
  );
}

export function AiQualityPanel({ tz }: { tz: string }) {
  const q = useAgentStatus();
  const colors = useBrandColors();
  const s = q.data;
  const weeks = s?.weeks ?? [];
  const last = weeks.at(-1);
  return (
    <Panel className="min-w-0">
      <PanelHeader title="AI 质量" description="最近 12 周，按 UTC 自然周（周一到周日）、全商户口径，不随上方的时间范围变；每周一算上一周，样本不到 10 的周不画点" />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !s ? (
        <LoadingRows rows={4} />
      ) : (
        <div className="flex flex-col gap-4">
          {s.paused ? (
            <div role="status" className="flex items-start gap-2 rounded-md bg-(--semantic-color-surface-warm) px-3 py-2.5 text-sm">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-(--semantic-color-feedback-warning)" aria-hidden />
              <p className="min-w-0 [overflow-wrap:anywhere]">
                Agent 自动改卡已暂停：{s.paused.reason ?? "AI 质量周指标连续回落"}（{inTz(s.paused.at, tz, "M 月 d 日")}起）。改卡改为先审，管理员在
                <Link href="/reception/knowledge?tab=cards" className="focus-ring mx-1 rounded-sm text-(--semantic-color-text-link) underline-offset-2 hover:underline">
                  知识库「经验卡」
                </Link>
                恢复。
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground tabular-nums">
              Agent 改卡复测通过即生效 · 今天已直接改卡 {s.todayApplied} / {s.dailyLimit} 次。采纳率或一致率连续两周各降 5 个百分点以上（三周样本都满 20）时自动暂停。
            </p>
          )}
          {weeks.length === 0 ? (
            <EmptyState icon={ActivityIcon} title="还没有周指标" description="每周一 00:30（UTC）算上一周；有辅助草稿、影子回复或 AI 接待的会话后开始有数。" />
          ) : (
            <>
              {last && (
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {SERIES.map((x, i) => (
                    <div key={x.key} className="min-w-0">
                      <dt className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        {colors && <Marker shape={x.shape} color={colors.series[i]} />}
                        {x.label}
                      </dt>
                      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{rate(last[x.key]) === null ? <span className="text-muted-foreground">数据不足</span> : `${rate(last[x.key])}%`}</dd>
                      <dd className="text-xs text-muted-foreground tabular-nums">
                        {weekText(last)} · 样本 {num(last[x.key].den)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {colors && (
                <BrandChart
                  type="line"
                  height={220}
                  label={`AI 质量周曲线：${weeks.map((w) => `${weekText(w)} ${SERIES.map((x) => `${x.label} ${rateText(w[x.key])}`).join("，")}`).join("；")}`}
                  data={{
                    // 三项都不足的周在横轴上直接写「数据不足」
                    labels: weeks.map((w) => (SERIES.every((x) => rate(w[x.key]) === null) ? [w.weekStart.slice(5), "数据不足"] : w.weekStart.slice(5))),
                    datasets: SERIES.map((x, i) => ({
                      label: x.label,
                      data: weeks.map((w) => rate(w[x.key])),
                      borderColor: colors.series[i],
                      backgroundColor: colors.series[i],
                      pointStyle: x.shape,
                      pointRadius: 4,
                      pointHoverRadius: 5,
                      borderWidth: 2,
                      spanGaps: false,
                    })),
                  }}
                  options={{
                    interaction: { mode: "index", intersect: false },
                    scales: {
                      x: { grid: { display: false }, border: { display: false }, ticks: { color: colors.muted, font: { size: 12 } } },
                      y: { min: 0, max: 100, grid: { color: colors.border }, border: { display: false }, ticks: { color: colors.muted, font: { size: 12 }, stepSize: 25, callback: (v) => `${v}%` } },
                    },
                    plugins: {
                      tooltip: {
                        usePointStyle: true,
                        callbacks: {
                          title: (items) => weekText(weeks[items[0].dataIndex]),
                          label: (item) => `${SERIES[item.datasetIndex].label} ${rateText(weeks[item.dataIndex][SERIES[item.datasetIndex].key])}`,
                          // 没画点的那几项（样本不到 10）补在下面，样本数照样写出来
                          footer: (items) => {
                            const w = weeks[items[0].dataIndex];
                            return SERIES.filter((x) => rate(w[x.key]) === null).map((x) => `${x.label} ${rateText(w[x.key])}`);
                          },
                        },
                      },
                    },
                  }}
                />
              )}
              <p className="text-xs text-muted-foreground">
                采纳率 =（原样发送 + 改后发送）/ 处置过的辅助草稿；一致率 = 一致 / 对比过的影子回复；转人工率 = 转人工的 AI 接待段 / AI 接待段（开段时店铺为辅助或自动模式）。
              </p>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
