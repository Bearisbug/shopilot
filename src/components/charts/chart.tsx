"use client";

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type ChartType,
} from "chart.js";
import { useMemo, useSyncExternalStore } from "react";
import { Chart } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler);

/** 图表配色只取 brand/ 的 tokens（VIS-014）：单系列主数据用焦糖 text.link + 斜纹；多系列用 dataViz.series */
export type BrandColors = { link: string; muted: string; text: string; border: string; surface: string; raised: string; series: string[]; success: string; warning: string; error: string; decorative: string };

function read(): BrandColors | null {
  if (typeof document === "undefined") return null;
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    link: v("--semantic-color-text-link"),
    muted: v("--semantic-color-text-secondary"),
    text: v("--semantic-color-text-primary"),
    border: v("--semantic-color-border-subtle"),
    surface: v("--semantic-color-surface-sunken"),
    raised: v("--semantic-color-surface-raised"),
    decorative: v("--semantic-color-surface-decorative"),
    success: v("--semantic-color-feedback-success"),
    warning: v("--semantic-color-feedback-warning"),
    error: v("--semantic-color-feedback-error"),
    series: [1, 2, 3, 4, 5, 6].map((i) => v(`--semantic-color-data-viz-series-${i}`)),
  };
}

/** 全局默认：字体与正文同一套，tooltip 白底细边框圆角 8（与原型一致）。各页传入的 options 覆盖不到这里，不会退回 Chart.js 的默认黑底 */
function applyDefaults(c: BrandColors | null): BrandColors | null {
  if (!c) return c;
  ChartJS.defaults.font.family = getComputedStyle(document.body).fontFamily;
  ChartJS.defaults.font.size = 12;
  ChartJS.defaults.color = c.muted;
  Object.assign(ChartJS.defaults.plugins.tooltip, {
    backgroundColor: c.raised,
    titleColor: c.text,
    bodyColor: c.text,
    footerColor: c.muted,
    borderColor: c.border,
    borderWidth: 1,
    cornerRadius: 8,
    padding: 8,
    titleFont: { size: 12, weight: 600 },
    bodyFont: { size: 12 },
    footerFont: { size: 12 },
  });
  return c;
}

let cached: BrandColors | null = null;
const subscribe = () => () => {};
export function useBrandColors(): BrandColors | null {
  return useSyncExternalStore(
    subscribe,
    () => (cached ??= applyDefaults(read())),
    () => null,
  );
}

/** 斜纹填充：设计系统 v5「斜纹填充用于主数据」 */
export function stripes(color: string, bg?: string): CanvasPattern | string {
  if (typeof document === "undefined") return color;
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const g = c.getContext("2d");
  if (!g) return color;
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, 8, 8);
  }
  g.strokeStyle = color;
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(-2, 10);
  g.lineTo(10, -2);
  g.moveTo(-2, 2);
  g.lineTo(2, -2);
  g.moveTo(6, 10);
  g.lineTo(10, 6);
  g.stroke();
  return g.createPattern(c, "repeat") ?? color;
}

export function BrandChart<T extends ChartType>({ type, data, options, label, height = 240 }: { type: T; data: ChartData<T>; options?: ChartOptions<T>; label: string; height?: number }) {
  const colors = useBrandColors();
  const merged = useMemo(() => {
    const base = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      plugins: {
        legend: { display: false, labels: { color: colors?.muted, boxWidth: 10, boxHeight: 10, font: { size: 12 } } },
      },
      scales:
        type === "doughnut" || type === "pie"
          ? undefined
          : {
              x: { grid: { display: false }, border: { display: false }, ticks: { color: colors?.muted, font: { size: 12 } } },
              y: { grid: { color: colors?.border }, border: { display: false }, ticks: { color: colors?.muted, font: { size: 12 }, precision: 0 }, beginAtZero: true },
            },
    };
    return { ...base, ...options, plugins: { ...base.plugins, ...(options as { plugins?: object })?.plugins } } as ChartOptions<T>;
  }, [colors, options, type]);
  if (!colors) return <div style={{ height }} className="rounded-md bg-muted motion-safe:animate-pulse" aria-busy="true" />;
  return (
    <div style={{ height }} className="relative">
      <Chart type={type} data={data} options={merged} aria-label={label} role="img" />
    </div>
  );
}
