import { z } from "zod";
import { zEmail } from "./common";

// 用量与套餐（DESIGN §8.9 API-BILL-001 至 API-BILL-009）
export const PLAN_CODES = ["basic", "growth", "pro", "enterprise"] as const;
export const zPlanCode = z.enum(PLAN_CODES);
export const zCycle = z.enum(["monthly", "yearly"]);
export type PlanCode = z.infer<typeof zPlanCode>;
export type Cycle = z.infer<typeof zCycle>;

export const billingQuery = z.object({
  daily: z.enum(["7d", "period"]).default("7d"),
  shopsMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "月份格式为 YYYY-MM")
    .optional(),
  statements: z.enum(["3m", "12m"]).default("3m"),
});

export const changePlanBody = z.object({ planCode: zPlanCode, cycle: zCycle });
export const topupBody = z.object({ pack: z.enum(["p1000", "p5000", "p20000"]) });

const zBudget = z.coerce.number().positive("预算要大于 0").max(1_000_000, "预算最多 1,000,000 美元").multipleOf(0.01, "预算最多两位小数");
export const overageBody = z
  .object({ policy: z.enum(["stop", "continue"]), budget: zBudget.nullish() })
  .refine((b) => b.policy === "stop" || (b.budget !== null && b.budget !== undefined), { message: "选择继续出稿时要填超量预算", path: ["budget"] });

export const ALERT_THRESHOLD_OPTIONS = [50, 80, 95, 100] as const;
export const alertsBody = z.object({
  thresholds: z
    .array(z.number().int("阈值是整数百分比").min(50, "阈值最低 50%").max(100, "阈值最高 100%"))
    .min(1, "至少选一个提醒时机")
    .max(5, "最多 5 个提醒时机")
    .refine((a) => new Set(a).size === a.length, "提醒时机不能重复"),
  recipients: z.array(z.string().uuid()).min(1, "至少选一位接收人").max(20, "最多 20 位接收人"),
  email: z.boolean(),
  inApp: z.boolean(),
});

export const cardBody = z.object({
  number: z.string().trim().min(1, "请填写卡号"),
  expiry: z.string().trim().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "有效期格式为 MM/YY，例如 08/28"),
});
export const paymentBody = z
  .object({ autoRenew: z.boolean().optional(), card: cardBody.optional() })
  .refine((b) => b.autoRenew !== undefined || b.card !== undefined, "没有要修改的内容");

export const invoiceInfoBody = z.object({
  companyName: z.string().trim().min(1, "请填写发票抬头").max(120, "抬头最多 120 字"),
  taxId: z.string().trim().max(40, "税号最多 40 字").optional().transform((v) => v || undefined),
  address: z.string().trim().min(1, "请填写地址").max(300, "地址最多 300 字"),
  email: zEmail,
});
export type InvoiceInfo = { companyName: string; taxId?: string; address: string; email: string };

export const salesLeadBody = z.object({
  contactName: z.string().trim().min(1, "请填写联系人").max(60, "联系人最多 60 字"),
  contact: z.string().trim().min(1, "请填写联系方式").max(120, "联系方式最多 120 字"),
  note: z.string().trim().max(1000, "备注最多 1,000 字").optional(),
});

export type PlanItem = {
  code: PlanCode;
  name: string;
  monthlyPrice: string;
  yearlyPrice: string;
  draftQuota: number;
  shopLimit: number;
  seatLimit: number;
  overagePrice: string;
  /** 降级受店铺数限制时的原因 */
  blockedReason?: string;
};

export type PaymentMethod = { brand: string; last4: string; expiry: string; mockFail: boolean };

export type SubscriptionView = {
  planCode: PlanCode;
  planName: string;
  cycle: Cycle;
  price: string;
  pendingPlanCode: PlanCode | null;
  pendingPlanName: string | null;
  pendingCycle: Cycle | null;
  periodStart: string;
  periodEnd: string;
  autoRenew: boolean;
  status: "active" | "readonly";
};

export type StatementRow = {
  id: string;
  kind: "subscription" | "topup" | "overage";
  description: string;
  amount: string;
  currency: string;
  status: "paid" | "failed";
  invoiceCompany: string | null;
  createdAt: string;
};

export type DailyRow = { date: string; auto: number; assist: number; shadow: number };

export type TopupPack = { code: z.infer<typeof topupBody>["pack"]; drafts: number; price: string };

export type BillingResponse = {
  plan: PlanItem & { cycle: Cycle; price: string };
  topupPacks: TopupPack[];
  subscription: SubscriptionView;
  period: { id: string; start: string; end: string };
  usage: { used: number; quota: number; topup: number; remaining: number; byMode: { auto: number; assist: number; shadow: number } };
  daily: DailyRow[];
  byShop: Array<{ shopId: string; name: string; platform: "shopee" | "tiktok"; market: string; drafts: number }>;
  byShopRange: { month: string; start: string; end: string };
  shopsMonths: Array<{ month: string; start: string; end: string }>;
  /** 本期结束的 AI 接待段（开段时为辅助或自动模式）里 AI 独立解决的段数 */
  aiResolvedSegments: { resolved: number; total: number };
  overage: { policy: "stop" | "continue"; budget: string | null; price: string; drafts: number; amount: string };
  alerts: { thresholds: number[]; recipients: Array<{ membershipId: string; name: string }>; email: boolean; inApp: boolean };
  statements: StatementRow[];
  paymentMethod: PaymentMethod | null;
  autoRenew: boolean;
  invoiceInfo: InvoiceInfo | null;
  shops: { used: number; limit: number };
  owner: { name: string };
};

export type PlansResponse = {
  items: PlanItem[];
  current: SubscriptionView;
  shopsUsed: number;
  downgradeBlockedReason?: string;
  owner: { name: string };
};

export type TopupResult = { statement: StatementRow; usage: { used: number; quota: number; topup: number; remaining: number } };
