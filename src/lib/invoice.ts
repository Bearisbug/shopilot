// 开票资料合并、税号叫法提示、金额拆分与发票版面。开具时服务端渲染 PDF 与「开票资料」设置页的实时预览共用这一份，两边版面一致。
import { format, parseISO } from "date-fns";
import { money } from "./format";

/** 开票资料字段：空串表示没填，按店覆盖里表示沿用商户默认 */
export type ProfileFields = {
  legalName: string;
  registrationNo: string;
  taxIdLabel: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  notes: string;
  taxName: string;
  /** 百分比，如 "8"；空串或 0 表示不加税 */
  taxRate: string;
  /** 价格是否已含税；null 在商户默认里按含税处理，在按店覆盖里表示沿用商户默认 */
  pricesIncludeTax: boolean | null;
};

export const PROFILE_TEXT_KEYS = ["legalName", "registrationNo", "taxIdLabel", "taxId", "address", "phone", "email", "website", "notes", "taxName", "taxRate"] as const satisfies ReadonlyArray<keyof ProfileFields>;

export const EMPTY_PROFILE: ProfileFields = {
  legalName: "",
  registrationNo: "",
  taxIdLabel: "",
  taxId: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  notes: "",
  taxName: "",
  taxRate: "",
  pricesIncludeTax: null,
};

type WithLogo<L> = ProfileFields & { logo: L | null };

/** 按店覆盖里填了的字段生效，没填的沿用商户默认；Logo 同理 */
export function mergeProfile<L>(base: WithLogo<L> | null, over: WithLogo<L> | null): WithLogo<L> {
  const out: WithLogo<L> = { ...EMPTY_PROFILE, logo: over?.logo ?? base?.logo ?? null };
  for (const k of PROFILE_TEXT_KEYS) out[k] = over?.[k].trim() || base?.[k].trim() || "";
  out.pricesIncludeTax = over?.pricesIncludeTax ?? base?.pricesIncludeTax ?? null;
  return out;
}

/** 开票要用到、还没填的项：法定主体名称与地址 */
export function missingProfile(p: ProfileFields): string[] {
  return [p.legalName ? null : "法定主体名称", p.address ? null : "地址"].filter((x): x is string => x !== null);
}

/** 按店铺站点给的常见叫法，只作提示与留空时的默认标签 */
export const MARKET_TAX: Record<string, { country: string; taxIdLabel: string; hint: string; taxName: string }> = {
  MY: { country: "Malaysia", taxIdLabel: "SST Reg. No", hint: "SST Reg. No 或 TIN", taxName: "SST" },
  TH: { country: "Thailand", taxIdLabel: "Tax ID", hint: "Tax ID（13 位）", taxName: "VAT" },
  VN: { country: "Vietnam", taxIdLabel: "MST", hint: "MST（Mã số thuế）", taxName: "VAT" },
  SG: { country: "Singapore", taxIdLabel: "GST Reg. No", hint: "GST Reg. No 或 UEN", taxName: "GST" },
  PH: { country: "Philippines", taxIdLabel: "TIN", hint: "TIN", taxName: "VAT" },
};

export const taxIdLabelFor = (p: Pick<ProfileFields, "taxIdLabel">, market: string | null) => p.taxIdLabel || (market && MARKET_TAX[market]?.taxIdLabel) || "Tax ID";

// ── 金额 ──

const ZERO_DECIMAL = new Set(["VND", "IDR"]);
const cents = (v: string) => Math.round(Number(v) * 100);

export type TotalsInput = {
  items: Array<{ unitPrice: string; qty: number }>;
  /** 买家为这张订单付的总额（平台订单金额） */
  orderTotal: string;
  /** 买家付的运费；平台不给时为 null */
  shipping: string | null;
  paid: boolean;
  taxRate: string;
  taxInclusive: boolean;
  currency: string;
};

/** 金额以分计；shipping 为 null 表示不知道运费 */
export type Totals = {
  subtotal: number;
  shipping: number | null;
  discount: number;
  /** 订单金额高出商品与运费的部分（不知道运费时含运费） */
  fees: number;
  taxRate: number;
  tax: number;
  /** 计税基数：含税时是不含税合计，不含税时是折后金额 */
  taxBase: number;
  /** 不加税时为 null */
  totalExclTax: number | null;
  total: number;
  amountPaid: number;
  due: number;
};

/**
 * 小计 = 商品单价 × 数量之和；订单金额与小计、运费的差额为负记折扣，为正记其他费用。
 * 含税：税额从折后金额倒算，合计不变；不含税：在折后金额上加税。已付 = 已付款时的订单金额。
 */
export function computeTotals(i: TotalsInput): Totals {
  const subtotal = i.items.reduce((s, it) => s + cents(it.unitPrice) * it.qty, 0);
  const shipping = i.shipping === null ? null : cents(i.shipping);
  const paidTotal = cents(i.orderTotal);
  const rest = paidTotal - subtotal - (shipping ?? 0);
  const discount = rest < 0 ? -rest : 0;
  const fees = rest > 0 ? rest : 0;
  const net = paidTotal;
  const rate = Number(i.taxRate) > 0 ? Number(i.taxRate) : 0;
  const unit = ZERO_DECIMAL.has(i.currency) ? 100 : 1;
  const round = (x: number) => Math.round(x / unit) * unit;
  let tax = 0;
  let total = net;
  let totalExclTax: number | null = null;
  if (rate > 0 && i.taxInclusive) {
    tax = round((net * rate) / (100 + rate));
    totalExclTax = net - tax;
  } else if (rate > 0) {
    tax = round((net * rate) / 100);
    totalExclTax = net;
    total = net + tax;
  }
  const amountPaid = i.paid ? paidTotal : 0;
  return { subtotal, shipping, discount, fees, taxRate: rate, tax, taxBase: totalExclTax ?? net, totalExclTax, total, amountPaid, due: Math.max(0, total - amountPaid) };
}

export const fromCents = (c: number) => (c / 100).toFixed(2);

// ── 版面 ──

export type InvoiceLayoutInput = {
  kind: "invoice" | "receipt";
  number: string;
  /** 开具日（商户时区）yyyy-MM-dd */
  issuedOn: string;
  /** 付款日（商户时区）yyyy-MM-dd；没付款或平台没给时为 null */
  paidOn: string | null;
  externalOrderId: string | null;
  platform: "shopee" | "tiktok";
  market: string | null;
  seller: ProfileFields;
  /** 没填法定主体名称时卖方栏显示的名称；预览传 null，由预览显示占位 */
  sellerFallback: string | null;
  buyer: { name: string; address: string; email?: string; taxId?: string };
  items: Array<{ name: string; sku?: string; qty: number; unitPrice: string }>;
  currency: string;
  totals: Totals;
  paymentMethod: string | null;
  /** 这张发票自己的备注，印在开票资料备注之前 */
  notes?: string;
};

export type InvoiceLayout = {
  title: "Invoice" | "Receipt";
  meta: Array<{ label: string; value: string }>;
  seller: { name: string | null; lines: string[] };
  billTo: { name: string; lines: string[] };
  headline: string;
  notes: string[];
  /** 有税时每行显示的税率，如 "8%"；不加税为 null，不显示 Tax 列 */
  taxColumn: string | null;
  rows: Array<{ description: string; detail: string | null; qty: string; unitPrice: string; amount: string }>;
  totals: Array<{ label: string; value: string; strong?: boolean }>;
  payments: { refLabel: string; rows: Array<{ method: string; date: string; amount: string; ref: string }> } | null;
  footer: string;
};

const PLATFORM_NAME = { shopee: "Shopee", tiktok: "TikTok Shop" } as const;
const day = (d: string) => format(parseISO(d), "MMMM d, yyyy");
const lines = (text: string | undefined) => (text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

export function invoiceLayout(d: InvoiceLayoutInput): InvoiceLayout {
  const t = d.totals;
  const m = (c: number) => money(fromCents(c), d.currency);
  const s = d.seller;
  const title = d.kind === "receipt" ? "Receipt" : "Invoice";
  const rate = t.taxRate > 0 ? `${t.taxRate}%` : null;
  const country = d.market ? MARKET_TAX[d.market]?.country : undefined;

  const meta = [{ label: `${title} number`, value: d.number }];
  if (d.externalOrderId) meta.push({ label: "Order number", value: d.externalOrderId });
  meta.push(d.kind === "receipt" ? { label: "Date paid", value: day(d.paidOn ?? d.issuedOn) } : { label: "Date", value: day(d.issuedOn) });
  if (s.taxId) meta.push({ label: taxIdLabelFor(s, d.market), value: s.taxId });

  const headline =
    d.kind === "receipt" && t.amountPaid > 0
      ? `${m(t.amountPaid)} paid on ${day(d.paidOn ?? d.issuedOn)}`
      : t.due > 0
        ? `${m(t.due)} due`
        : `Total ${m(t.total)}`;

  const totals: InvoiceLayout["totals"] = [{ label: "Subtotal", value: m(t.subtotal) }];
  if (t.shipping) totals.push({ label: "Shipping", value: m(t.shipping) });
  if (t.discount) totals.push({ label: "Discount", value: `-${m(t.discount)}` });
  if (t.fees) totals.push({ label: t.shipping === null ? "Shipping & fees" : "Other fees", value: m(t.fees) });
  if (rate && t.totalExclTax !== null) {
    totals.push({ label: "Total excluding tax", value: m(t.totalExclTax) });
    totals.push({ label: `${s.taxName || "Tax"}${country ? ` - ${country}` : ""} (${rate} on ${m(t.taxBase)})`, value: m(t.tax) });
  }
  totals.push({ label: "Total", value: m(t.total) });
  totals.push({ label: "Amount paid", value: m(t.amountPaid), strong: true });
  if (t.due > 0) totals.push({ label: "Amount due", value: m(t.due), strong: true });

  return {
    title,
    meta,
    seller: {
      name: s.legalName || d.sellerFallback,
      lines: [...(s.registrationNo ? [`Reg. No. ${s.registrationNo}`] : []), ...lines(s.address), ...[s.phone, s.email, s.website].filter(Boolean)],
    },
    billTo: { name: d.buyer.name, lines: [...lines(d.buyer.address), ...(d.buyer.email ? [d.buyer.email] : []), ...(d.buyer.taxId ? [`Tax ID ${d.buyer.taxId}`] : [])] },
    headline,
    notes: [d.notes?.trim(), s.notes.trim()].filter((x): x is string => Boolean(x)),
    taxColumn: rate,
    rows: d.items.map((it) => ({
      description: it.name,
      detail: it.sku || null,
      qty: String(it.qty),
      unitPrice: m(cents(it.unitPrice)),
      amount: m(cents(it.unitPrice) * it.qty),
    })),
    totals,
    payments:
      t.amountPaid > 0
        ? {
            refLabel: d.kind === "receipt" ? "Receipt number" : "Order number",
            rows: [{ method: d.paymentMethod || PLATFORM_NAME[d.platform], date: d.paidOn ? day(d.paidOn) : "—", amount: m(t.amountPaid), ref: d.kind === "receipt" ? d.number : (d.externalOrderId ?? d.number) }],
          }
        : null,
    footer: `${d.number} · ${headline}`,
  };
}
