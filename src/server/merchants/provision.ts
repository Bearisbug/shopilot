// 开通商户（11.10 signup）：商户、所有者管理员成员、默认接待与工单配置、通知规则、订阅与用量周期、知识库内置分类、看板问题类别，同一事务内完成。
import { addMonths } from "date-fns";
import { schema, type Executor } from "../db/client";
import { plan, type PlanCode } from "../billing/plans";
import { UNCATEGORIZED } from "@/contracts/knowledge";
import { seedIssueCategories } from "../issues/categories";
import { DEFAULT_HANDOFF_KEYWORDS, DEFAULT_SCHEDULE, DEFAULT_SECURITY_POLICY, DEFAULT_TICKET_TYPES, NOTIFICATION_EVENTS } from "./defaults";

export async function provisionMerchant(
  tx: Executor,
  input: { name: string; timezone: string; ownerUserId: string; billingEmail?: string; planCode?: PlanCode; now?: Date },
) {
  const now = input.now ?? new Date();
  const planCode = input.planCode ?? "basic";
  const [m] = await tx
    .insert(schema.merchant)
    .values({ name: input.name, timezone: input.timezone, ownerUserId: input.ownerUserId, billingEmail: input.billingEmail, securityPolicy: DEFAULT_SECURITY_POLICY })
    .returning();
  const [membership] = await tx.insert(schema.membership).values({ merchantId: m.id, userId: input.ownerUserId, role: "admin" }).returning();
  await tx.insert(schema.receptionSettings).values({ merchantId: m.id, schedule: DEFAULT_SCHEDULE, handoffKeywords: DEFAULT_HANDOFF_KEYWORDS });
  await tx.insert(schema.ticketTypeConfig).values(DEFAULT_TICKET_TYPES.map((t) => ({ merchantId: m.id, ...t })));
  await tx.insert(schema.knowledgeCategory).values({ merchantId: m.id, name: UNCATEGORIZED, builtin: true });
  await seedIssueCategories(tx, m.id);
  await tx.insert(schema.notificationRule).values(NOTIFICATION_EVENTS.map((e) => ({ merchantId: m.id, event: e.event, inApp: e.inApp, email: e.email })));
  const periodEnd = addMonths(now, 1);
  await tx.insert(schema.subscription).values({
    merchantId: m.id,
    planCode,
    cycle: "monthly",
    periodStart: now,
    periodEnd,
    alertConfig: { thresholds: [80, 100], recipients: [membership.id], email: false, inApp: true },
  });
  await tx.insert(schema.usagePeriod).values({ merchantId: m.id, periodStart: now, periodEnd, quota: plan(planCode).draftQuota });
  return { merchant: m, membership };
}
