// 套餐参数：沿用原型演示值，不是业务规则（DESIGN §28 假设）。价格单位美元；overagePrice 为超量单价（每次出稿）。
export const PLANS = [
  { code: "basic", name: "基础版", monthlyPrice: "49.00", yearlyPrice: "490.00", draftQuota: 2000, shopLimit: 5, seatLimit: 10, overagePrice: "0.04" },
  { code: "growth", name: "成长版", monthlyPrice: "149.00", yearlyPrice: "1490.00", draftQuota: 8000, shopLimit: 15, seatLimit: 30, overagePrice: "0.03" },
  { code: "pro", name: "专业版", monthlyPrice: "399.00", yearlyPrice: "3990.00", draftQuota: 30000, shopLimit: 40, seatLimit: 80, overagePrice: "0.02" },
  { code: "enterprise", name: "企业版", monthlyPrice: "0.00", yearlyPrice: "0.00", draftQuota: 100000, shopLimit: 200, seatLimit: 500, overagePrice: "0.00" },
] as const;

export type PlanCode = (typeof PLANS)[number]["code"];
export const plan = (code: PlanCode) => PLANS.find((p) => p.code === code)!;
/** 套餐档位：数字越大越高，用于判断升级还是降级 */
export const planRank = (code: PlanCode) => PLANS.findIndex((p) => p.code === code);
export const cyclePrice = (code: PlanCode, cycle: "monthly" | "yearly") => (cycle === "yearly" ? plan(code).yearlyPrice : plan(code).monthlyPrice);
/** 一个计费周期的出稿额度：draftQuota 是每月额度，年付周期按 12 个月计 */
export const periodQuota = (code: PlanCode, cycle: "monthly" | "yearly") => plan(code).draftQuota * (cycle === "yearly" ? 12 : 1);

export const TOPUP_PACKS = [
  { code: "p1000", drafts: 1000, price: "20.00" },
  { code: "p5000", drafts: 5000, price: "90.00" },
  { code: "p20000", drafts: 20000, price: "320.00" },
] as const;
export type TopupCode = (typeof TOPUP_PACKS)[number]["code"];
