// 后台任务 usage.rollover（DESIGN §17，每小时）：到期的订阅滚到下一周期。
// 结算上期超量 → 应用待生效的套餐与付费周期 → 自动续费开着就模拟扣款并生成账单（扣款失败或未续费则订阅转只读）→ 新建用量周期。
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { and, eq, lte, sql } from "drizzle-orm";
import { audit, systemActor } from "../core/audit";
import { db, schema } from "../db/client";
import { charge } from "./payment";
import { addCycle } from "./periods";
import { cyclePrice, periodQuota, plan, planRank } from "./plans";
import { shopsUsed } from "./service";

const S = schema.subscription;
const UP = schema.usagePeriod;
const BS = schema.billingStatement;
const MAX_PERIODS_PER_RUN = 24;

export async function usageRollover(): Promise<void> {
  const due = await db().select({ merchantId: S.merchantId }).from(S).where(lte(S.periodEnd, new Date())).limit(500);
  for (const d of due) {
    try {
      await rolloverMerchant(d.merchantId);
    } catch (err) {
      console.error(JSON.stringify({ t: new Date().toISOString(), level: "error", job: "usage.rollover", merchantId: d.merchantId, err: err instanceof Error ? err.stack : String(err) }));
    }
  }
}

export async function rolloverMerchant(merchantId: string, now = new Date()) {
  await db().transaction(async (tx) => {
    let [sub] = await tx.select().from(S).where(eq(S.merchantId, merchantId)).for("update");
    if (!sub || sub.periodEnd > now) return;
    const [m] = await tx.select({ timezone: schema.merchant.timezone, invoiceInfo: schema.merchant.invoiceInfo }).from(schema.merchant).where(eq(schema.merchant.id, merchantId));
    const day = (d: Date) => format(new TZDate(d, m.timezone), "MM-dd");
    const actor = systemActor(merchantId);

    for (let i = 0; i < MAX_PERIODS_PER_RUN && sub.periodEnd <= now; i++) {
      const range = `${day(sub.periodStart)} 至 ${day(sub.periodEnd)}`;

      // 1. 上期超量（策略 continue 时才会出现）
      const [old] = await tx.select().from(UP).where(and(eq(UP.merchantId, merchantId), eq(UP.periodStart, sub.periodStart)));
      const overDrafts = old ? Math.max(0, old.draftsUsed - old.quota - old.topupQuota) : 0;
      const overAmount = (Math.round(overDrafts * Number(plan(sub.planCode).overagePrice) * 100) / 100).toFixed(2);
      if (overDrafts > 0 && Number(overAmount) > 0) {
        const paid = charge(sub.paymentMethod).ok;
        await tx.insert(BS).values({ merchantId, kind: "overage", description: `超量 ${overDrafts.toLocaleString("en-US")} 次（${range}）`, amount: overAmount, status: paid ? "paid" : "failed", invoiceInfo: m.invoiceInfo ?? null });
        await audit(actor, { module: "billing", action: "overage_billed", summary: `结算 ${range} 超量 ${overDrafts} 次，USD ${overAmount}${paid ? "" : "，扣款失败"}`, data: { drafts: overDrafts, amount: overAmount, paid } }, tx);
      }

      // 2. 应用待生效改动，算出下一周期；降级时店铺数已超过新套餐上限则保留原套餐
      let planCode = sub.pendingPlanCode ?? sub.planCode;
      if (sub.pendingPlanCode && planRank(sub.pendingPlanCode) < planRank(sub.planCode)) {
        const used = await shopsUsed(merchantId, tx);
        if (used > plan(sub.pendingPlanCode).shopLimit) {
          planCode = sub.planCode;
          await audit(actor, { module: "billing", action: "pending_downgrade_skipped", summary: `待生效的降级到${plan(sub.pendingPlanCode).name}未执行：当前接入 ${used} 家店，超过上限 ${plan(sub.pendingPlanCode).shopLimit} 家`, data: { pendingPlanCode: sub.pendingPlanCode, shops: used } }, tx);
        }
      }
      const cycle = sub.pendingCycle ?? sub.cycle;
      const start = sub.periodEnd;
      const end = addCycle(start, cycle);
      const p = plan(planCode);

      // 3. 续费
      let status: "active" | "readonly" = "readonly";
      const price = cyclePrice(planCode, cycle);
      if (sub.autoRenew) {
        if (Number(price) > 0) {
          const paid = charge(sub.paymentMethod).ok;
          status = paid ? "active" : "readonly";
          await tx.insert(BS).values({
            merchantId,
            kind: "subscription",
            description: `${p.name}${cycle === "yearly" ? "年费" : "月费"}（${day(start)} 至 ${day(end)}）`,
            amount: price,
            status: paid ? "paid" : "failed",
            invoiceInfo: m.invoiceInfo ?? null,
          });
        } else {
          status = "active";
        }
      }

      // 4. 新用量周期（出稿计量可能已按订阅先建了这一行，以续费结果为准覆盖额度与结束时间）
      await tx
        .insert(UP)
        .values({ merchantId, periodStart: start, periodEnd: end, quota: periodQuota(planCode, cycle) })
        .onConflictDoUpdate({ target: [UP.merchantId, UP.periodStart], set: { periodEnd: end, quota: sql`excluded.quota` } });

      [sub] = await tx
        .update(S)
        .set({ planCode, cycle, pendingPlanCode: null, pendingCycle: null, periodStart: start, periodEnd: end, status, updatedAt: new Date() })
        .where(eq(S.merchantId, merchantId))
        .returning();

      const summary = !sub.autoRenew
        ? `自动续费已关闭，${range} 周期结束后未续费，订阅转为只读`
        : status === "active"
          ? `续费成功：${p.name}${cycle === "yearly" ? "年付" : "月付"}，新周期 ${day(start)} 至 ${day(end)}`
          : `续费扣款失败（USD ${price}），订阅转为只读`;
      await audit(actor, { module: "billing", action: status === "active" ? "subscription_renewed" : sub.autoRenew ? "subscription_renewal_failed" : "subscription_not_renewed", summary, targetType: "subscription", targetId: merchantId, data: { planCode, cycle, price, status, autoRenew: sub.autoRenew } }, tx);
    }
  });
}
