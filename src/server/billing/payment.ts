// 模拟支付（DESIGN §19 外部副作用）：4242 4242 4242 4242 成功，4000 0000 0000 0002 失败；其余通过校验的卡号按成功处理。
// 只保存品牌、后 4 位、有效期与 mockFail，不保存完整卡号。
import type { PaymentMethod } from "@/contracts/billing";
import { Problem } from "../http/problem";

const FAIL_CARD = "4000000000000002";

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function brandOf(digits: string): string {
  if (digits.startsWith("4")) return "Visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "Amex";
  return "Card";
}

/** 校验模拟卡；不通过时抛 422（逐字段原因） */
export function parseCard(card: { number: string; expiry: string }, now = new Date()): PaymentMethod {
  const digits = card.number.replace(/[\s-]/g, "");
  if (!/^\d{13,19}$/.test(digits) || !luhn(digits)) {
    throw new Problem("validation", { detail: "卡号不正确，请检查后重新填写。", extra: { fields: { "card.number": "卡号不正确：应为 13 至 19 位数字，例如 4242 4242 4242 4242" } } });
  }
  const [mm, yy] = card.expiry.split("/").map(Number);
  const expiresAt = new Date(Date.UTC(2000 + yy, mm, 1));
  if (expiresAt <= now) {
    throw new Problem("validation", { detail: "这张卡已过期，请换一张卡。", extra: { fields: { "card.expiry": "这张卡已过期" } } });
  }
  return { brand: brandOf(digits), last4: digits.slice(-4), expiry: card.expiry, mockFail: digits === FAIL_CARD };
}

export type ChargeResult = { ok: true } | { ok: false; reason: "no_payment_method" | "card_declined" };

export function charge(pm: PaymentMethod | null): ChargeResult {
  if (!pm) return { ok: false, reason: "no_payment_method" };
  if (pm.mockFail) return { ok: false, reason: "card_declined" };
  return { ok: true };
}

export function paymentFailed(pm: PaymentMethod | null, reason: "no_payment_method" | "card_declined", ownerName: string, unchanged: "额度" | "套餐"): Problem {
  if (reason === "no_payment_method") {
    return new Problem("payment-failed", { detail: `还没有付款方式。请账号所有者 ${ownerName} 在「付款」里添加一张卡后再支付。`, code: reason });
  }
  return new Problem("payment-failed", { detail: `${pm?.brand ?? "卡"} 尾号 ${pm?.last4 ?? "—"} 扣款没有成功，${unchanged}没有变化。请换一张卡后重试。`, code: reason });
}
