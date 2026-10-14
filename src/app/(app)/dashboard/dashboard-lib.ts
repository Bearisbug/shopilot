// 看板页的格式与图表轴配置（只在本页用）。
import type { BrandColors } from "@/components/charts/chart";
import type { Ratio } from "@/contracts/dashboard";
import { duration } from "@/lib/format";

export const num = (n: number) => n.toLocaleString("en-US");

/** 比率百分数；样本不足时为 null */
export const pct = (r: Ratio) => (r.rate === null ? null : Math.round(r.rate * 100));

/** 一小时内精确到秒（「3 分 12 秒」），更长的按 duration */
export function replyTime(sec: number | null): string {
  if (sec === null) return "—";
  const s = Math.max(0, Math.round(sec));
  if (s >= 3600) return duration(s);
  const m = Math.floor(s / 60);
  return m ? `${m} 分 ${String(s % 60).padStart(2, "0")} 秒` : `${s} 秒`;
}

/** 柱状图坐标轴：横向条形图把网格线放在 x 轴；堆叠时两轴都堆叠 */
export function axes(colors: BrandColors, opts: { horizontal?: boolean; stacked?: boolean } = {}) {
  const tick = { color: colors.muted, font: { size: 12 } };
  const value = { grid: { color: colors.border }, border: { display: false }, ticks: { ...tick, precision: 0 }, beginAtZero: true, stacked: opts.stacked };
  const category = { grid: { display: false }, border: { display: false }, ticks: tick, stacked: opts.stacked };
  return opts.horizontal ? { x: value, y: category } : { x: category, y: value };
}
