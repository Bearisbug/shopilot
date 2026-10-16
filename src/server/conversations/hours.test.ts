import { describe, expect, it } from "vitest";
import type { Schedule } from "@/server/db/schema";
import { addBusinessDays, hitKeyword, isInHours, nextShiftStart, workSeconds } from "./hours";

const day = (on: boolean, start = "09:00", end = "18:00") => ({ on, start, end });
const schedule: Schedule = { mon: day(true), tue: day(true), wed: day(true), thu: day(true), fri: day(true), sat: day(false), sun: day(false) };
const rc = { timezone: "Asia/Kuala_Lumpur", schedule, holidays: ["2026-10-13"] };
// 2026-10-12 是周一；吉隆坡 UTC+8
const kl = (iso: string) => new Date(`${iso}+08:00`);

describe("工作时间（商户时区）", () => {
  it("工作日时段内外", () => {
    expect(isInHours(rc, kl("2026-10-12T09:00:00"))).toBe(true);
    expect(isInHours(rc, kl("2026-10-12T18:00:00"))).toBe(true);
    expect(isInHours(rc, kl("2026-10-12T18:01:00"))).toBe(false);
    expect(isInHours(rc, kl("2026-10-12T08:59:00"))).toBe(false);
  });
  it("节假日与休息日整天不在", () => {
    expect(isInHours(rc, kl("2026-10-13T10:00:00"))).toBe(false);
    expect(isInHours(rc, kl("2026-10-17T10:00:00"))).toBe(false);
  });
  it("跨午夜时段", () => {
    const night = { ...rc, holidays: [], schedule: { ...schedule, mon: day(true, "22:00", "02:00") } };
    expect(isInHours(night, kl("2026-10-12T23:30:00"))).toBe(true);
    expect(isInHours(night, kl("2026-10-12T12:00:00"))).toBe(false);
  });
  it("工作时段秒数：跨下班、跨休息日与节假日只累计工作时段", () => {
    // 周一 17:50 → 周二节假日 → 周三 09:10：周一 10 分钟 + 周三 10 分钟
    expect(workSeconds(rc, kl("2026-10-12T17:50:00"), kl("2026-10-14T09:10:00"))).toBe(1200);
    // 工作时间外开始：周一 20:00 → 周三 09:05，从周三上班起算
    expect(workSeconds(rc, kl("2026-10-12T20:00:00"), kl("2026-10-14T09:05:00"))).toBe(300);
    // 周六开始、周六回复：整段不在工作时段
    expect(workSeconds(rc, kl("2026-10-17T10:00:00"), kl("2026-10-17T11:00:00"))).toBe(0);
    expect(workSeconds(rc, kl("2026-10-12T10:00:00"), kl("2026-10-12T10:00:00"))).toBe(0);
  });
  it("工作时段秒数：跨午夜时段按当天排班的两截累计", () => {
    const night = { ...rc, holidays: [], schedule: { ...schedule, mon: day(true, "22:00", "02:00"), tue: day(false) } };
    // 周一 01:30 → 周一 23:00：周一 [00:00, 02:00) 里的 30 分钟 + [22:00, 24:00) 里的 60 分钟
    expect(workSeconds(night, kl("2026-10-12T01:30:00"), kl("2026-10-12T23:00:00"))).toBe(5400);
  });
  it("下次上班时刻跳过节假日", () => {
    expect(nextShiftStart(rc, kl("2026-10-12T19:00:00")).toISOString()).toBe(kl("2026-10-14T09:00:00").toISOString());
    expect(nextShiftStart(rc, kl("2026-10-12T07:00:00")).toISOString()).toBe(kl("2026-10-12T09:00:00").toISOString());
  });
  it("工作日加 2 天：跳过节假日，落在下班时刻", () => {
    expect(addBusinessDays(rc, kl("2026-10-12T10:00:00"), 2).toISOString()).toBe(kl("2026-10-15T18:00:00").toISOString());
  });
  it("转人工关键词不区分大小写", () => {
    expect(hitKeyword("I want a REFUND please", ["refund"])).toBe("refund");
    expect(hitKeyword("我要投诉", ["投诉"])).toBe("投诉");
    expect(hitKeyword("hello", ["refund", " "])).toBeNull();
  });
});
