// 工作时间与当前接待模式（DESIGN §11.1 开头：按商户时区与排班判断入站时刻在不在工作时间内，取该店 mode_in_hours 或 mode_off_hours）。
import { TZDate } from "@date-fns/tz";
import { eq } from "drizzle-orm";
import { db, schema, type Executor } from "@/server/db/client";
import type { Schedule } from "@/server/db/schema";
import { DEFAULT_HANDOFF_KEYWORDS, DEFAULT_SCHEDULE } from "@/server/merchants/defaults";

export type ReceptionMode = "off" | "shadow" | "assist" | "auto";

export type ReceptionContext = {
  timezone: string;
  schedule: Schedule;
  holidays: string[];
  keywords: string[];
  confidenceThreshold: number;
  unclaimedRemindMinutes: number | null;
  responseSlaMinutes: number;
  brandVoice: string | null;
};

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export async function receptionContext(merchantId: string, ex: Executor = db()): Promise<ReceptionContext> {
  const [m] = await ex.select({ timezone: schema.merchant.timezone }).from(schema.merchant).where(eq(schema.merchant.id, merchantId)).limit(1);
  const [r] = await ex.select().from(schema.receptionSettings).where(eq(schema.receptionSettings.merchantId, merchantId)).limit(1);
  return {
    timezone: m?.timezone ?? "Asia/Kuala_Lumpur",
    schedule: r?.schedule ?? DEFAULT_SCHEDULE,
    holidays: r?.holidays ?? [],
    keywords: r?.handoffKeywords ?? DEFAULT_HANDOFF_KEYWORDS,
    confidenceThreshold: r?.confidenceThreshold ?? 0.6,
    unclaimedRemindMinutes: r ? r.unclaimedRemindMinutes : 10,
    responseSlaMinutes: r?.responseSlaMinutes ?? 15,
    brandVoice: r?.brandVoice ?? null,
  };
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** 某时刻在不在工作时间内：节假日整天不在；当天排班关闭不在；时段 [start, end]，end ≤ start 视为跨午夜 */
export function isInHours(rc: Pick<ReceptionContext, "timezone" | "schedule" | "holidays">, at: Date): boolean {
  const local = new TZDate(at.getTime(), rc.timezone);
  const date = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
  if (rc.holidays.includes(date)) return false;
  const day = rc.schedule[DAYS[local.getDay()]];
  if (!day?.on) return false;
  const now = local.getHours() * 60 + local.getMinutes();
  const start = minutes(day.start);
  const end = minutes(day.end);
  return end > start ? now >= start && now <= end : now >= start || now <= end;
}

/** 店铺在该时刻的接待模式；Shopee 店不得为 auto（REQ-RCP-001），库里出现时按 assist 处理 */
export async function currentMode(shopId: string, platform: "shopee" | "tiktok", rc: ReceptionContext, at: Date, ex: Executor = db()): Promise<{ mode: ReceptionMode; inHours: boolean }> {
  const [r] = await ex.select().from(schema.shopReception).where(eq(schema.shopReception.shopId, shopId)).limit(1);
  const inHours = isInHours(rc, at);
  let mode = (r ? (inHours ? r.modeInHours : r.modeOffHours) : "off") as ReceptionMode;
  if (platform === "shopee" && mode === "auto") mode = "assist";
  return { mode, inHours };
}

/** 买家文字是否命中转人工关键词（不区分大小写的包含匹配） */
export function hitKeyword(text: string | null, keywords: string[]): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  return keywords.find((k) => k.trim() && lower.includes(k.trim().toLowerCase())) ?? null;
}

/** 从 from 起往后数 n 个工作日（排班开启且非节假日的日子），落在第 n 个工作日的下班时刻 */
export function addBusinessDays(rc: Pick<ReceptionContext, "timezone" | "schedule" | "holidays">, from: Date, n: number): Date {
  let local = new TZDate(from.getTime(), rc.timezone);
  let left = n;
  for (let i = 0; i < 366 && left > 0; i++) {
    local = new TZDate(local.getFullYear(), local.getMonth(), local.getDate() + 1, 0, 0, 0, rc.timezone);
    const date = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    const day = rc.schedule[DAYS[local.getDay()]];
    if (day?.on && !rc.holidays.includes(date)) {
      left -= 1;
      if (left === 0) {
        const end = minutes(day.end);
        return new Date(new TZDate(local.getFullYear(), local.getMonth(), local.getDate(), Math.floor(end / 60), end % 60, 0, rc.timezone).getTime());
      }
    }
  }
  return new Date(from.getTime() + n * 86400_000);
}

/** from 之后最近一次上班时刻（今天还没到上班时间则取今天） */
export function nextShiftStart(rc: Pick<ReceptionContext, "timezone" | "schedule" | "holidays">, from: Date): Date {
  const base = new TZDate(from.getTime(), rc.timezone);
  for (let i = 0; i < 366; i++) {
    const d = new TZDate(base.getFullYear(), base.getMonth(), base.getDate() + i, 0, 0, 0, rc.timezone);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const day = rc.schedule[DAYS[d.getDay()]];
    if (!day?.on || rc.holidays.includes(date)) continue;
    const s = minutes(day.start);
    const start = new TZDate(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(s / 60), s % 60, 0, rc.timezone);
    if (start.getTime() > from.getTime()) return new Date(start.getTime());
  }
  return new Date(from.getTime() + 86400_000);
}
