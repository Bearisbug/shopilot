// 看板统计范围（API-DASH-001）：预设按商户时区切日、自定义起止日的校验、平台口径窗口的取法；人工首响的工作时段秒数。
import { describe, expect, it } from "vitest";
import { dashboardQuery } from "@/contracts/dashboard";
import type { Schedule } from "@/server/db/schema";
import { platformPeriodOf, rangeBounds, replyWorkSeconds } from "./service";

const TZ = "Asia/Kuala_Lumpur";
// 2026-10-15（周四）10:00 吉隆坡时间
const NOW = new Date("2026-10-15T02:00:00Z");
const span = (spec: Parameters<typeof rangeBounds>[0]) => {
  const b = rangeBounds(spec, TZ, NOW);
  return [b.days[0], b.days[b.days.length - 1], b.days.length];
};

describe("预设范围按商户时区切日", () => {
  it.each([
    ["today", "2026-10-15", "2026-10-15", 1],
    ["yesterday", "2026-10-14", "2026-10-14", 1],
    ["7d", "2026-10-09", "2026-10-15", 7],
    ["28d", "2026-09-18", "2026-10-15", 28],
    ["this_week", "2026-10-12", "2026-10-15", 4],
    ["this_month", "2026-10-01", "2026-10-15", 15],
    ["last_month", "2026-09-01", "2026-09-30", 30],
    ["90d", "2026-07-18", "2026-10-15", 90],
  ] as const)("%s → %s 至 %s", (preset, from, to, days) => {
    expect(span({ preset })).toEqual([from, to, days]);
  });

  it("日界按商户时区：UTC 还是 14 日时吉隆坡已是 15 日", () => {
    const b = rangeBounds({ preset: "today" }, TZ, new Date("2026-10-14T16:30:00Z"));
    expect(b.days).toEqual(["2026-10-15"]);
    expect(b.start.toISOString()).toBe("2026-10-14T16:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-10-15T16:00:00.000Z");
  });

  it("本周从周一开始：周一当天只有一天", () => {
    expect(rangeBounds({ preset: "this_week" }, TZ, new Date("2026-10-12T02:00:00Z")).days).toEqual(["2026-10-12"]);
  });
});

describe("自定义起止日", () => {
  it("含首尾", () => {
    expect(span({ from: "2026-10-01", to: "2026-10-03" })).toEqual(["2026-10-01", "2026-10-03", 3]);
    expect(rangeBounds({ from: "2026-10-01", to: "2026-10-03" }, TZ, NOW)).toMatchObject({ preset: null, label: "2026-10-01 至 2026-10-03" });
  });

  it("结束日晚于今天、超过 180 天、开始晚于结束都拒绝", () => {
    expect(() => rangeBounds({ from: "2026-10-10", to: "2026-10-16" }, TZ, NOW)).toThrow(/不能晚于今天/);
    expect(() => rangeBounds({ from: "2026-04-18", to: "2026-10-15" }, TZ, NOW)).toThrow(/最多 180 天/);
    expect(rangeBounds({ from: "2026-04-19", to: "2026-10-15" }, TZ, NOW).days).toHaveLength(180);
    expect(() => rangeBounds({ from: "2026-10-05", to: "2026-10-04" }, TZ, NOW)).toThrow(/不能晚于结束日期/);
  });

  it("查询参数：只给一端、预设与起止同时给、格式不对都是 422", () => {
    expect(dashboardQuery.parse({})).toEqual({ spec: { preset: "this_month" }, format: "json" });
    expect(dashboardQuery.parse({ range: "28d" }).spec).toEqual({ preset: "28d" });
    expect(dashboardQuery.parse({ from: "2026-10-01", to: "2026-10-02", format: "csv" })).toEqual({ spec: { from: "2026-10-01", to: "2026-10-02" }, format: "csv" });
    expect(dashboardQuery.safeParse({ from: "2026-10-01" }).success).toBe(false);
    expect(dashboardQuery.safeParse({ range: "7d", from: "2026-10-01", to: "2026-10-02" }).success).toBe(false);
    expect(dashboardQuery.safeParse({ from: "2026/10/01", to: "2026-10-02" }).success).toBe(false);
    expect(dashboardQuery.safeParse({ from: "2026-10-03", to: "2026-10-02" }).success).toBe(false);
  });
});

describe("平台口径窗口", () => {
  it("本月、上月、近 7 天原样；其余 ≤ 7 天取近 7 天，更长取近 30 天", () => {
    const of = (spec: Parameters<typeof rangeBounds>[0]) => platformPeriodOf(rangeBounds(spec, TZ, NOW));
    expect(of({ preset: "this_month" })).toBe("this_month");
    expect(of({ preset: "last_month" })).toBe("last_month");
    expect(of({ preset: "7d" })).toBe("7d");
    expect(of({ preset: "today" })).toBe("7d");
    expect(of({ preset: "this_week" })).toBe("7d");
    expect(of({ preset: "28d" })).toBe("30d");
    expect(of({ preset: "90d" })).toBe("30d");
    expect(of({ from: "2026-10-01", to: "2026-10-07" })).toBe("7d");
    expect(of({ from: "2026-10-01", to: "2026-10-08" })).toBe("30d");
  });
});

describe("人工首响的工作时段秒数", () => {
  const nine = { on: true, start: "09:00", end: "18:00" };
  const schedule: Schedule = { mon: nine, tue: nine, wed: nine, thu: nine, fri: nine, sat: { ...nine, on: false }, sun: { ...nine, on: false } };
  const rc = { timezone: TZ, schedule, holidays: [] };
  const at = (iso: string) => new Date(`${iso}+08:00`);

  it("工作时间内开始：按工作时段累计，当场回复记 0 秒", () => {
    expect(replyWorkSeconds(rc, at("2026-10-15T10:00:00"), at("2026-10-15T10:05:00"))).toBe(300);
    expect(replyWorkSeconds(rc, at("2026-10-15T10:00:00"), at("2026-10-15T10:00:00"))).toBe(0);
    expect(replyWorkSeconds(rc, at("2026-10-15T17:50:00"), at("2026-10-16T09:10:00"))).toBe(1200);
  });

  it("工作时间外开始：上班后才回从上班起算，上班前就回的不进样本", () => {
    expect(replyWorkSeconds(rc, at("2026-10-15T20:00:00"), at("2026-10-16T09:05:00"))).toBe(300);
    expect(replyWorkSeconds(rc, at("2026-10-15T20:00:00"), at("2026-10-15T20:05:00"))).toBeNull();
    // 周六买家来消息、周六客服就回了
    expect(replyWorkSeconds(rc, at("2026-10-17T11:00:00"), at("2026-10-17T11:02:00"))).toBeNull();
  });
});
