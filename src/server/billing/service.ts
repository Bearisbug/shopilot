// 用量与套餐（REQ-BILL-001 至 REQ-BILL-005，API-BILL-001 至 API-BILL-009）。
import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, format, startOfDay, subMonths } from "date-fns";
import { and, count, desc, eq, gte, inArray, isNotNull, lt, lte, ne, sql } from "drizzle-orm";
import type {
  BillingResponse,
  Cycle,
  DailyRow,
  InvoiceInfo,
  PaymentMethod,
  PlanItem,
  PlansResponse,
  StatementRow,
  SubscriptionView,
  TopupResult,
} from "@/contracts/billing";
import type { MemberContext } from "../auth/context";
import { audit } from "../core/audit";
import { db, schema, type Executor } from "../db/client";
import { notAllowed, Problem } from "../http/problem";
import { charge, paymentFailed, parseCard } from "./payment";
import { ensureCurrentPeriod } from "./periods";
import { cyclePrice, periodQuota, plan, planRank, PLANS, TOPUP_PACKS, type PlanCode } from "./plans";

const S = schema.subscription;
const UP = schema.usagePeriod;
const BS = schema.billingStatement;
type Sub = typeof S.$inferSelect;

const CYCLE_LABEL: Record<Cycle, string> = { monthly: "月付", yearly: "年付" };
const n = (v: number) => v.toLocaleString("en-US");

function planItem(code: PlanCode): PlanItem {
  const p = plan(code);
  return { code: p.code, name: p.name, monthlyPrice: p.monthlyPrice, yearlyPrice: p.yearlyPrice, draftQuota: p.draftQuota, shopLimit: p.shopLimit, seatLimit: p.seatLimit, overagePrice: p.overagePrice };
}

function subView(sub: Sub): SubscriptionView {
  return {
    planCode: sub.planCode,
    planName: plan(sub.planCode).name,
    cycle: sub.cycle,
    price: cyclePrice(sub.planCode, sub.cycle),
    pendingPlanCode: sub.pendingPlanCode,
    pendingPlanName: sub.pendingPlanCode ? plan(sub.pendingPlanCode).name : null,
    pendingCycle: sub.pendingCycle,
    periodStart: sub.periodStart.toISOString(),
    periodEnd: sub.periodEnd.toISOString(),
    autoRenew: sub.autoRenew,
    status: sub.status,
  };
}

function statementRow(r: typeof BS.$inferSelect): StatementRow {
  return { id: r.id, kind: r.kind, description: r.description, amount: r.amount, currency: r.currency, status: r.status, invoiceCompany: r.invoiceInfo?.companyName ?? null, createdAt: r.createdAt.toISOString() };
}

async function loadSub(merchantId: string, ex: Executor = db(), lock = false) {
  const q = ex.select().from(S).where(eq(S.merchantId, merchantId));
  const [sub] = lock ? await q.for("update") : await q;
  if (!sub) throw new Problem("not-found", { detail: "这个商户还没有订阅记录，请联系 Shopilot 支持。" });
  return sub;
}

/** 已接入店铺数（断开的不算） */
export async function shopsUsed(merchantId: string, ex: Executor = db()) {
  const [r] = await ex.select({ n: count() }).from(schema.shop).where(and(eq(schema.shop.merchantId, merchantId), ne(schema.shop.status, "disconnected")));
  return r.n;
}

async function ownerName(ctx: MemberContext) {
  const [u] = await db().select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, ctx.merchant.ownerUserId));
  return u?.name ?? "所有者";
}

function downgradeReason(used: number, code: PlanCode): string | undefined {
  const p = plan(code);
  if (used <= p.shopLimit) return undefined;
  return `当前接入 ${used} 家店，超过${p.name}上限 ${p.shopLimit} 家，需先断开 ${used - p.shopLimit} 家店才能降级。`;
}

function money2(v: number) {
  return (Math.round(v * 100) / 100).toFixed(2);
}

// ---------- API-BILL-001 ----------

export async function getBilling(ctx: MemberContext, query: { daily: "7d" | "period"; shopsMonth?: string; statements: "3m" | "12m" }): Promise<BillingResponse> {
  const merchantId = ctx.merchant.id;
  const tz = ctx.merchant.timezone;
  const now = new Date();
  const sub = await loadSub(merchantId);
  const period = await ensureCurrentPeriod(merchantId);
  const p = plan(sub.planCode);

  const D = schema.draft;
  const modeRows = await db()
    .select({ mode: D.mode, n: count() })
    .from(D)
    .where(and(eq(D.merchantId, merchantId), gte(D.createdAt, period.periodStart), lt(D.createdAt, period.periodEnd)))
    .groupBy(D.mode);
  const byMode = { auto: 0, assist: 0, shadow: 0 };
  for (const r of modeRows) byMode[r.mode] = r.n;

  // 每日按模式：近 7 天（商户时区，含今天）或本计费周期至今
  const today = startOfDay(new TZDate(now, tz));
  const dailyFrom = query.daily === "7d" ? addDays(today, -6) : startOfDay(new TZDate(period.periodStart, tz));
  const dayExpr = sql<string>`to_char(${D.createdAt} at time zone ${tz}, 'YYYY-MM-DD')`;
  const dailyRows = await db()
    .select({ day: dayExpr, mode: D.mode, n: count() })
    .from(D)
    .where(and(eq(D.merchantId, merchantId), gte(D.createdAt, query.daily === "7d" ? new Date(dailyFrom.getTime()) : period.periodStart), lt(D.createdAt, now)))
    .groupBy(sql`1`, D.mode); // 按位置分组：时区参数在 select 与 group by 里编号不同，PG 不认为是同一表达式
  const daily: DailyRow[] = [];
  for (let d = dailyFrom; d <= today; d = addDays(d, 1)) {
    const key = format(d, "yyyy-MM-dd");
    const row: DailyRow = { date: key, auto: 0, assist: 0, shadow: 0 };
    for (const r of dailyRows) if (r.day === key) row[r.mode] = r.n;
    daily.push(row);
  }

  // 按店：shopsMonth 指开始于该月（商户时区）的计费周期；没有这样的周期时按自然月
  const recent = await db().select().from(UP).where(and(eq(UP.merchantId, merchantId), lte(UP.periodStart, now))).orderBy(desc(UP.periodStart)).limit(3);
  const shopsMonths = recent.map((r) => ({ month: format(new TZDate(r.periodStart, tz), "yyyy-MM"), start: r.periodStart.toISOString(), end: r.periodEnd.toISOString() }));
  let range = shopsMonths.find((m) => m.month === (query.shopsMonth ?? format(new TZDate(period.periodStart, tz), "yyyy-MM")));
  if (!range && query.shopsMonth) {
    const [y, m] = query.shopsMonth.split("-").map(Number);
    const start = new TZDate(y, m - 1, 1, tz);
    range = { month: query.shopsMonth, start: new Date(start.getTime()).toISOString(), end: new Date(addMonths(start, 1).getTime()).toISOString() };
  }
  range ??= { month: format(new TZDate(period.periodStart, tz), "yyyy-MM"), start: period.periodStart.toISOString(), end: period.periodEnd.toISOString() };
  const C = schema.conversation;
  const byShopRows = await db()
    .select({ shopId: schema.shop.id, name: schema.shop.name, platform: schema.shop.platform, market: schema.shop.market, drafts: count() })
    .from(D)
    .innerJoin(C, eq(C.id, D.conversationId))
    .innerJoin(schema.shop, eq(schema.shop.id, C.shopId))
    .where(and(eq(D.merchantId, merchantId), gte(D.createdAt, new Date(range.start)), lt(D.createdAt, new Date(range.end))))
    .groupBy(schema.shop.id)
    .orderBy(desc(count()));

  const G = schema.segment;
  const [seg] = await db()
    .select({ total: count(), resolved: sql<number>`count(*) filter (where ${G.aiResolved})`.mapWith(Number) })
    .from(G)
    // 与看板同口径（DESIGN §3）：只算 AI 接待段，即开段时为辅助或自动模式的段
    .where(and(eq(G.merchantId, merchantId), eq(G.backfilled, false), isNotNull(G.endedAt), inArray(G.openMode, ["assist", "auto"]), gte(G.startedAt, period.periodStart), lt(G.startedAt, period.periodEnd)));

  const recipientRows = sub.alertConfig.recipients.length
    ? await db()
        .select({ membershipId: schema.membership.id, name: schema.user.name })
        .from(schema.membership)
        .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
        .where(and(eq(schema.membership.merchantId, merchantId), inArray(schema.membership.id, sub.alertConfig.recipients)))
    : [];
  const recipients = sub.alertConfig.recipients.flatMap((id) => recipientRows.filter((r) => r.membershipId === id));

  const since = subMonths(now, query.statements === "12m" ? 12 : 3);
  const statements = await db().select().from(BS).where(and(eq(BS.merchantId, merchantId), gte(BS.createdAt, since))).orderBy(desc(BS.createdAt)).limit(200);

  const used = period.draftsUsed;
  const overDrafts = Math.max(0, used - period.quota - period.topupQuota);
  return {
    plan: { ...planItem(sub.planCode), cycle: sub.cycle, price: cyclePrice(sub.planCode, sub.cycle) },
    topupPacks: TOPUP_PACKS.map((p) => ({ code: p.code, drafts: p.drafts, price: p.price })),
    subscription: subView(sub),
    period: { id: period.id, start: period.periodStart.toISOString(), end: period.periodEnd.toISOString() },
    usage: { used, quota: period.quota, topup: period.topupQuota, remaining: Math.max(0, period.quota + period.topupQuota - used), byMode },
    daily,
    byShop: byShopRows,
    byShopRange: range,
    shopsMonths,
    aiResolvedSegments: { resolved: seg.resolved, total: seg.total },
    overage: { policy: sub.overagePolicy, budget: sub.overageBudget, price: p.overagePrice, drafts: overDrafts, amount: money2(overDrafts * Number(p.overagePrice)) },
    alerts: { thresholds: sub.alertConfig.thresholds, recipients, email: sub.alertConfig.email, inApp: sub.alertConfig.inApp },
    statements: statements.map(statementRow),
    paymentMethod: sub.paymentMethod,
    autoRenew: sub.autoRenew,
    invoiceInfo: ctx.merchant.invoiceInfo ?? null,
    shops: { used: await shopsUsed(merchantId), limit: p.shopLimit },
    owner: { name: await ownerName(ctx) },
  };
}

// ---------- API-BILL-002 ----------

export async function getPlans(ctx: MemberContext): Promise<PlansResponse> {
  const sub = await loadSub(ctx.merchant.id);
  const used = await shopsUsed(ctx.merchant.id);
  const cur = planRank(sub.planCode);
  const items = PLANS.map((p) => {
    const item = planItem(p.code);
    const reason = planRank(p.code) < cur ? downgradeReason(used, p.code) : undefined;
    return reason ? { ...item, blockedReason: reason } : item;
  });
  const nearestBlocked = [...items].reverse().find((i) => planRank(i.code) < cur && i.blockedReason);
  return { items, current: subView(sub), shopsUsed: used, downgradeBlockedReason: nearestBlocked?.blockedReason, owner: { name: await ownerName(ctx) } };
}

// ---------- API-BILL-003 ----------

export async function changePlan(ctx: MemberContext, body: { planCode: PlanCode; cycle: Cycle }): Promise<SubscriptionView> {
  const owner = await ownerName(ctx);
  return db().transaction(async (tx) => {
    const sub = await loadSub(ctx.merchant.id, tx, true);
    const target = plan(body.planCode);
    if (body.planCode === "enterprise" && sub.planCode !== "enterprise") throw notAllowed("企业版按合同签约，请在套餐页点「联系销售」留下联系方式。", "contact_sales");
    const cur = planRank(sub.planCode);
    const next = planRank(body.planCode);
    const patch: Partial<typeof S.$inferInsert> = { updatedAt: new Date() };
    const notes: string[] = [];
    if (next < cur) {
      const reason = downgradeReason(await shopsUsed(ctx.merchant.id, tx), body.planCode);
      if (reason) throw notAllowed(reason, "shop_limit");
      patch.pendingPlanCode = body.planCode;
      notes.push(`下周期改为${target.name}`);
    } else if (next > cur) {
      // 升级立即生效：按本期剩余时间补差价，新额度写入当期周期
      const now = Date.now();
      const ratio = Math.min(1, Math.max(0, (sub.periodEnd.getTime() - now) / (sub.periodEnd.getTime() - sub.periodStart.getTime())));
      const amount = money2((Number(cyclePrice(body.planCode, sub.cycle)) - Number(cyclePrice(sub.planCode, sub.cycle))) * ratio);
      if (Number(amount) > 0) {
        const r = charge(sub.paymentMethod);
        if (!r.ok) throw paymentFailed(sub.paymentMethod, r.reason, owner, "套餐");
        await tx.insert(BS).values({
          merchantId: ctx.merchant.id,
          kind: "subscription",
          description: `升级到${target.name}（补本期剩余差价）`,
          amount,
          status: "paid",
          invoiceInfo: ctx.merchant.invoiceInfo ?? null,
        });
      }
      const period = await ensureCurrentPeriod(ctx.merchant.id, tx);
      await tx.update(UP).set({ quota: periodQuota(body.planCode, sub.cycle) }).where(eq(UP.id, period.id));
      patch.planCode = body.planCode;
      patch.pendingPlanCode = null;
      notes.push(`升级到${target.name}，立即生效${Number(amount) > 0 ? `，补差价 USD ${amount}` : ""}`);
    } else {
      patch.pendingPlanCode = null;
      if (sub.pendingPlanCode) notes.push("取消待生效的套餐变更");
    }
    patch.pendingCycle = body.cycle === sub.cycle ? null : body.cycle;
    if (patch.pendingCycle) notes.push(`下周期改为${CYCLE_LABEL[body.cycle]}`);
    else if (sub.pendingCycle) notes.push("取消待生效的付费周期变更");
    const [updated] = await tx.update(S).set(patch).where(eq(S.merchantId, ctx.merchant.id)).returning();
    await audit(
      ctx.actor,
      {
        module: "billing",
        action: "plan_changed",
        summary: `套餐：${notes.join("；") || "没有变化"}`,
        targetType: "subscription",
        targetId: ctx.merchant.id,
        data: { before: { planCode: sub.planCode, cycle: sub.cycle, pendingPlanCode: sub.pendingPlanCode, pendingCycle: sub.pendingCycle }, after: { planCode: updated.planCode, pendingPlanCode: updated.pendingPlanCode, pendingCycle: updated.pendingCycle } },
      },
      tx,
    );
    return subView(updated);
  });
}

// ---------- API-BILL-004 ----------

export async function buyTopup(ctx: MemberContext, body: { pack: (typeof TOPUP_PACKS)[number]["code"] }): Promise<TopupResult> {
  const pack = TOPUP_PACKS.find((p) => p.code === body.pack)!;
  const owner = await ownerName(ctx);
  const result = await db().transaction(async (tx) => {
    const sub = await loadSub(ctx.merchant.id, tx, true);
    const r = charge(sub.paymentMethod);
    if (!r.ok) return { ok: false as const, reason: r.reason, pm: sub.paymentMethod };
    const period = await ensureCurrentPeriod(ctx.merchant.id, tx);
    const [up] = await tx
      .update(UP)
      .set({ topupQuota: sql`${UP.topupQuota} + ${pack.drafts}` })
      .where(eq(UP.id, period.id))
      .returning();
    const [st] = await tx
      .insert(BS)
      .values({ merchantId: ctx.merchant.id, kind: "topup", description: `出稿加购包 ${n(pack.drafts)} 次`, amount: pack.price, status: "paid", invoiceInfo: ctx.merchant.invoiceInfo ?? null })
      .returning();
    await audit(
      ctx.actor,
      { module: "billing", action: "topup_purchased", summary: `加购出稿包 ${n(pack.drafts)} 次（USD ${pack.price}）`, targetType: "billing_statement", targetId: st.id, data: { pack: pack.code, drafts: pack.drafts, amount: pack.price } },
      tx,
    );
    return { ok: true as const, up, st };
  });
  if (!result.ok) {
    await audit(ctx.actor, { module: "billing", action: "topup_payment_failed", summary: `加购出稿包 ${n(pack.drafts)} 次支付失败`, data: { pack: pack.code, reason: result.reason, last4: result.pm?.last4 ?? null } });
    throw paymentFailed(result.pm, result.reason, owner, "额度");
  }
  const { up, st } = result;
  return { statement: statementRow(st), usage: { used: up.draftsUsed, quota: up.quota, topup: up.topupQuota, remaining: Math.max(0, up.quota + up.topupQuota - up.draftsUsed) } };
}

// ---------- API-BILL-005 ----------

export async function setOverage(ctx: MemberContext, body: { policy: "stop" | "continue"; budget?: number | null }) {
  const budget = body.policy === "continue" && body.budget != null ? body.budget.toFixed(2) : null;
  const before = await loadSub(ctx.merchant.id);
  await db().update(S).set({ overagePolicy: body.policy, overageBudget: budget, updatedAt: new Date() }).where(eq(S.merchantId, ctx.merchant.id));
  await audit(ctx.actor, {
    module: "billing",
    action: "overage_policy_changed",
    summary: body.policy === "stop" ? "超量策略：额度用尽后停止 AI 出稿" : `超量策略：额度用尽后继续出稿，超量预算 USD ${budget}`,
    targetType: "subscription",
    targetId: ctx.merchant.id,
    data: { before: { policy: before.overagePolicy, budget: before.overageBudget }, after: { policy: body.policy, budget } },
  });
  return { policy: body.policy, budget };
}

// ---------- API-BILL-006 ----------

export async function setAlerts(ctx: MemberContext, body: { thresholds: number[]; recipients: string[]; email: boolean; inApp: boolean }) {
  const ids = [...new Set(body.recipients)];
  const admins = await db()
    .select({ id: schema.membership.id, name: schema.user.name })
    .from(schema.membership)
    .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .where(and(eq(schema.membership.merchantId, ctx.merchant.id), eq(schema.membership.status, "active"), eq(schema.membership.role, "admin"), inArray(schema.membership.id, ids)));
  if (admins.length !== ids.length) {
    throw new Problem("validation", { detail: "接收人只能选启用中的管理员（用量页只对管理员开放）。", extra: { fields: { recipients: "有接收人不是启用中的管理员" } } });
  }
  const config = { thresholds: [...body.thresholds].sort((a, b) => a - b), recipients: ids, email: body.email, inApp: body.inApp };
  await db().update(S).set({ alertConfig: config, updatedAt: new Date() }).where(eq(S.merchantId, ctx.merchant.id));
  const channels = [body.inApp && "站内", body.email && "邮件"].filter(Boolean).join("、") || "不发送";
  await audit(ctx.actor, {
    module: "billing",
    action: "usage_alerts_changed",
    summary: `用量提醒：${config.thresholds.map((t) => `${t}%`).join("、")}，发给 ${admins.map((a) => a.name).join("、")}，渠道 ${channels}`,
    targetType: "subscription",
    targetId: ctx.merchant.id,
    data: config,
  });
  return { thresholds: config.thresholds, recipients: admins.map((a) => ({ membershipId: a.id, name: a.name })), email: config.email, inApp: config.inApp };
}

// ---------- API-BILL-007 ----------

export async function setPayment(ctx: MemberContext, body: { autoRenew?: boolean; card?: { number: string; expiry: string } }): Promise<{ paymentMethod: PaymentMethod | null; autoRenew: boolean }> {
  const pm = body.card ? parseCard(body.card) : undefined;
  const before = await loadSub(ctx.merchant.id);
  const patch: Partial<typeof S.$inferInsert> = { updatedAt: new Date() };
  if (pm) patch.paymentMethod = pm;
  if (body.autoRenew !== undefined) patch.autoRenew = body.autoRenew;
  const [sub] = await db().update(S).set(patch).where(eq(S.merchantId, ctx.merchant.id)).returning();
  const notes: string[] = [];
  if (pm) notes.push(`付款方式改为 ${pm.brand} 尾号 ${pm.last4}`);
  if (body.autoRenew !== undefined && body.autoRenew !== before.autoRenew) notes.push(body.autoRenew ? "打开自动续费" : "关闭自动续费，本期结束后不再扣款");
  await audit(ctx.actor, {
    module: "billing",
    action: "payment_settings_changed",
    summary: notes.join("；") || "付款设置没有变化",
    targetType: "subscription",
    targetId: ctx.merchant.id,
    data: { card: pm ? { brand: pm.brand, last4: pm.last4, expiry: pm.expiry } : undefined, autoRenew: body.autoRenew },
  });
  return { paymentMethod: sub.paymentMethod, autoRenew: sub.autoRenew };
}

// ---------- API-BILL-008 ----------

export async function setInvoiceInfo(ctx: MemberContext, body: InvoiceInfo): Promise<InvoiceInfo> {
  const info: InvoiceInfo = { companyName: body.companyName, address: body.address, email: body.email, ...(body.taxId ? { taxId: body.taxId } : {}) };
  await db().update(schema.merchant).set({ invoiceInfo: info, updatedAt: new Date() }).where(eq(schema.merchant.id, ctx.merchant.id));
  await audit(ctx.actor, { module: "billing", action: "invoice_info_changed", summary: `账单开票资料改为「${info.companyName}」`, targetType: "merchant", targetId: ctx.merchant.id, data: { companyName: info.companyName, hasTaxId: Boolean(info.taxId) } });
  return info;
}

// ---------- API-BILL-009 ----------

export async function createSalesLead(ctx: MemberContext, body: { contactName: string; contact: string; note?: string }) {
  const sub = await loadSub(ctx.merchant.id);
  const period = await ensureCurrentPeriod(ctx.merchant.id);
  const [lead] = await db()
    .insert(schema.salesLead)
    .values({
      merchantId: ctx.merchant.id,
      contactName: body.contactName,
      contact: body.contact,
      note: body.note || null,
      snapshot: { planCode: sub.planCode, cycle: sub.cycle, shops: await shopsUsed(ctx.merchant.id), draftsUsed: period.draftsUsed },
      createdBy: ctx.membership.id,
    })
    .returning({ id: schema.salesLead.id, createdAt: schema.salesLead.createdAt });
  await audit(ctx.actor, { module: "billing", action: "sales_lead_created", summary: `联系销售：${body.contactName}`, targetType: "sales_lead", targetId: lead.id });
  return { id: lead.id, createdAt: lead.createdAt.toISOString() };
}
