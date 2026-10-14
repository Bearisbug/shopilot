// 用量周期：当期周期查找；找不到时按订阅新建（订阅已到期而 usage.rollover 还没跑时，按下一周期与待生效改动推算）。
import { addMonths, addYears } from "date-fns";
import { and, desc, eq, gt, lte } from "drizzle-orm";
import { db, schema, type Executor } from "../db/client";
import { periodQuota } from "./plans";

const up = schema.usagePeriod;

export const addCycle = (d: Date, cycle: "monthly" | "yearly") => (cycle === "yearly" ? addYears(d, 1) : addMonths(d, 1));

export async function currentPeriod(merchantId: string, ex: Executor = db(), now = new Date()) {
  const [row] = await ex
    .select()
    .from(up)
    .where(and(eq(up.merchantId, merchantId), lte(up.periodStart, now), gt(up.periodEnd, now)))
    .orderBy(desc(up.periodStart))
    .limit(1);
  return row ?? null;
}

export async function ensureCurrentPeriod(merchantId: string, ex: Executor = db(), now = new Date()) {
  const found = await currentPeriod(merchantId, ex, now);
  if (found) return found;
  const [sub] = await ex.select().from(schema.subscription).where(eq(schema.subscription.merchantId, merchantId));
  if (!sub) throw new Error(`商户 ${merchantId} 没有订阅记录`);
  let start = sub.periodStart;
  let end = sub.periodEnd;
  let planCode = sub.planCode;
  let cycle = sub.cycle;
  if (end <= now) {
    cycle = sub.pendingCycle ?? sub.cycle;
    planCode = sub.pendingPlanCode ?? sub.planCode;
    start = end;
    end = addCycle(start, cycle);
    while (end <= now) {
      start = end;
      end = addCycle(start, cycle);
    }
  }
  await ex.insert(up).values({ merchantId, periodStart: start, periodEnd: end, quota: periodQuota(planCode, cycle) }).onConflictDoNothing();
  const [row] = await ex.select().from(up).where(and(eq(up.merchantId, merchantId), eq(up.periodStart, start)));
  return row;
}
