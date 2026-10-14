// 出稿计量（REQ-AI-005、DESIGN §16「额度临界时并发出稿」）：当期周期原子 +1，跨过提醒阈值按接收人与渠道提醒一次。
import { and, eq, inArray, sql } from "drizzle-orm";
import { audit, systemActor } from "../core/audit";
import { notify } from "../core/notify";
import { sendEmail } from "../core/outbox";
import { db, schema, type Executor } from "../db/client";
import { env } from "../env";
import { ensureCurrentPeriod } from "./periods";
import { plan } from "./plans";
import type { DraftReservation } from "./usage";

type Sub = typeof schema.subscription.$inferSelect;
type Reserved = { used: number; quota: number; topup: number; alerts_sent: number[] };

export async function reserveDraftImpl(merchantId: string, tx?: Executor): Promise<DraftReservation> {
  const ex = tx ?? db();
  const [sub] = await ex.select().from(schema.subscription).where(eq(schema.subscription.merchantId, merchantId));
  if (!sub) throw new Error(`商户 ${merchantId} 没有订阅记录`);
  const period = await ensureCurrentPeriod(merchantId, ex);
  const price = plan(sub.planCode).overagePrice;
  // 额度内直接 +1；超出时只有策略为 continue 且超量费不超过预算才 +1。0 行即额度用尽。
  const res = await ex.execute<Reserved>(sql`
    UPDATE usage_period up SET drafts_used = up.drafts_used + 1
    FROM subscription s
    WHERE up.id = ${period.id} AND s.merchant_id = up.merchant_id
      AND (up.drafts_used < up.quota + up.topup_quota
        OR (s.overage_policy = 'continue'
          AND (s.overage_budget IS NULL OR (up.drafts_used + 1 - up.quota - up.topup_quota) * ${price}::numeric <= s.overage_budget)))
    RETURNING up.drafts_used AS used, up.quota, up.topup_quota AS topup, up.alerts_sent`);
  const row = res.rows[0];
  if (!row) return { allowed: false, used: period.draftsUsed, quota: period.quota + period.topupQuota, reason: "quota" };
  await alertCrossed(ex, sub, period.id, row);
  return { allowed: true, used: row.used, quota: row.quota + row.topup };
}

async function alertCrossed(ex: Executor, sub: Sub, periodId: string, row: Reserved) {
  const total = row.quota + row.topup;
  if (total <= 0) return;
  const crossed = sub.alertConfig.thresholds.filter((t) => row.used * 100 >= t * total && !row.alerts_sent.includes(t)).sort((a, b) => a - b);
  for (const t of crossed) {
    // 并发出稿时只有一个请求能把阈值写进 alerts_sent，它负责发提醒
    const claimed = await ex.execute(sql`
      UPDATE usage_period SET alerts_sent = alerts_sent || ${JSON.stringify([t])}::jsonb
      WHERE id = ${periodId} AND NOT (alerts_sent @> ${JSON.stringify([t])}::jsonb)
      RETURNING id`);
    if (claimed.rows.length === 0) continue;
    await sendUsageAlert(ex, sub, periodId, t, row.used, total, row.topup);
    await audit(
      systemActor(sub.merchantId),
      { module: "billing", action: "usage_threshold_crossed", summary: `出稿用量跨过 ${t}%（${row.used.toLocaleString("en-US")} / ${total.toLocaleString("en-US")} 次）`, targetType: "usage_period", targetId: periodId, data: { threshold: t, used: row.used, quota: total } },
      ex,
    );
  }
}

async function sendUsageAlert(ex: Executor, sub: Sub, periodId: string, threshold: number, used: number, total: number, topup: number) {
  const cfg = sub.alertConfig;
  if (cfg.recipients.length === 0 || (!cfg.inApp && !cfg.email)) return;
  const active = await ex
    .select({ id: schema.membership.id, email: schema.user.email, name: schema.user.name })
    .from(schema.membership)
    .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .where(and(eq(schema.membership.merchantId, sub.merchantId), eq(schema.membership.status, "active"), inArray(schema.membership.id, cfg.recipients)));
  if (active.length === 0) return;
  const title = `出稿用量已到 ${threshold}%`;
  const body =
    `本期已用 ${used.toLocaleString("en-US")} / ${total.toLocaleString("en-US")} 次${topup ? `（含加购 ${topup.toLocaleString("en-US")} 次）` : ""}。` +
    (sub.overagePolicy === "stop" ? "额度用尽后停止 AI 出稿，新会话直接进入待认领；需要时加购出稿包。" : "额度用尽后继续出稿，超出部分按次计费，直到用完超量预算。");
  const link = "/billing";
  if (cfg.inApp) {
    await notify(
      { merchantId: sub.merchantId, membershipIds: active.map((a) => a.id), event: "usage_threshold", title, body, link, dedupeKey: `usage_threshold:${periodId}:${threshold}`, forceEmail: cfg.email },
      ex,
    );
    return;
  }
  for (const a of active) {
    await sendEmail(
      { to: a.email, merchantId: sub.merchantId, template: "usage_alert", subject: title, body: `${a.name}，你好：\n\n${title}\n${body}`, links: [{ label: "在 Shopilot 中查看", url: `${env().APP_BASE_URL}${link}` }], refType: "usage_period", refId: periodId },
      ex,
    );
  }
}
