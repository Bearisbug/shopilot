import { describe, expect, it } from "vitest";
import { computeTotals, EMPTY_PROFILE, invoiceLayout, mergeProfile, missingProfile, type InvoiceLayoutInput, type TotalsInput } from "./invoice";

const profile = (over: Partial<typeof EMPTY_PROFILE> = {}, logo: string | null = null) => ({ ...EMPTY_PROFILE, ...over, logo });

describe("mergeProfile", () => {
  it("按店覆盖填了的字段生效，空串与空白沿用商户默认", () => {
    const base = profile({ legalName: "Acme Sdn. Bhd.", address: "1 Jalan Ampang", taxRate: "8", pricesIncludeTax: true }, "logo-default");
    const over = profile({ legalName: "Acme Thailand Co., Ltd.", address: "   ", taxRate: "7" });
    const m = mergeProfile(base, over);
    expect(m.legalName).toBe("Acme Thailand Co., Ltd.");
    expect(m.address).toBe("1 Jalan Ampang");
    expect(m.taxRate).toBe("7");
    expect(m.pricesIncludeTax).toBe(true);
    expect(m.logo).toBe("logo-default");
  });

  it("覆盖可以把含税改成不含税、换 Logo；没有任何资料时全空", () => {
    const m = mergeProfile(profile({ pricesIncludeTax: true }, "a"), profile({ pricesIncludeTax: false }, "b"));
    expect(m.pricesIncludeTax).toBe(false);
    expect(m.logo).toBe("b");
    expect(mergeProfile(null, null)).toEqual({ ...EMPTY_PROFILE, logo: null });
  });

  it("缺法定主体名称或地址时列出来", () => {
    expect(missingProfile(EMPTY_PROFILE)).toEqual(["法定主体名称", "地址"]);
    expect(missingProfile({ ...EMPTY_PROFILE, legalName: "Acme", address: "KL" })).toEqual([]);
  });
});

const base: TotalsInput = {
  items: [
    { unitPrice: "129.00", qty: 1 },
    { unitPrice: "19.90", qty: 2 },
  ],
  orderTotal: "166.80",
  shipping: "8.00",
  paid: true,
  taxRate: "",
  taxInclusive: true,
  currency: "MYR",
};

describe("computeTotals", () => {
  it("订单金额低于商品加运费时差额记为折扣；不设税不加税", () => {
    const t = computeTotals(base);
    expect(t).toMatchObject({ subtotal: 16880, shipping: 800, discount: 1000, fees: 0, tax: 0, totalExclTax: null, total: 16680, amountPaid: 16680, due: 0 });
  });

  it("不知道运费时（Shopee）高出商品的部分记为运费及其他费用", () => {
    const t = computeTotals({ ...base, shipping: null, orderTotal: "173.80" });
    expect(t).toMatchObject({ shipping: null, discount: 0, fees: 500, total: 17380 });
  });

  it("含税：从合计倒算税额，合计与已付不变", () => {
    const t = computeTotals({ ...base, items: [{ unitPrice: "200.00", qty: 1 }], shipping: "16.00", orderTotal: "216.00", taxRate: "8" });
    expect(t).toMatchObject({ taxRate: 8, tax: 1600, totalExclTax: 20000, taxBase: 20000, total: 21600, amountPaid: 21600, due: 0 });
  });

  it("不含税：在折后金额上加税，超出已付的部分为待付", () => {
    const t = computeTotals({ ...base, items: [{ unitPrice: "200.00", qty: 1 }], shipping: "0", orderTotal: "200.00", taxRate: "8", taxInclusive: false });
    expect(t).toMatchObject({ tax: 1600, totalExclTax: 20000, total: 21600, amountPaid: 20000, due: 1600 });
  });

  it("越南盾税额取整到 1 盾", () => {
    const t = computeTotals({ ...base, items: [{ unitPrice: "250000", qty: 1 }], shipping: "0", orderTotal: "250000", taxRate: "10", currency: "VND" });
    expect(t.tax).toBe(2272700);
  });

  it("未付款：已付 0，合计全部待付", () => {
    const t = computeTotals({ ...base, paid: false });
    expect(t).toMatchObject({ amountPaid: 0, due: 16680 });
  });
});

const doc = (over: Partial<InvoiceLayoutInput> = {}): InvoiceLayoutInput => ({
  kind: "receipt",
  number: "RCT-2026-000012",
  issuedOn: "2026-10-15",
  paidOn: "2026-10-14",
  externalOrderId: "251014ABCD",
  platform: "shopee",
  market: "MY",
  seller: { ...EMPTY_PROFILE, legalName: "Acme Sdn. Bhd.", taxId: "W10-1808-32000123", address: "1 Jalan Ampang\n50450 Kuala Lumpur", notes: "Thank you!" },
  sellerFallback: "Demo Store",
  buyer: { name: "Tan Mei Ling", address: "12 Jalan Bukit\nPetaling Jaya", email: "mei@example.com" },
  items: [{ name: "Wireless Earbuds", sku: "Black", qty: 1, unitPrice: "129.00" }],
  currency: "MYR",
  totals: computeTotals(base),
  paymentMethod: "ShopeePay",
  ...over,
});

describe("invoiceLayout", () => {
  it("收据：付款日、税务登记按站点默认叫法、运费与折扣行、付款记录", () => {
    const L = invoiceLayout(doc());
    expect(L.title).toBe("Receipt");
    expect(L.meta).toEqual([
      { label: "Receipt number", value: "RCT-2026-000012" },
      { label: "Order number", value: "251014ABCD" },
      { label: "Date paid", value: "October 14, 2026" },
      { label: "SST Reg. No", value: "W10-1808-32000123" },
    ]);
    expect(L.headline).toBe("MYR 166.80 paid on October 14, 2026");
    expect(L.seller).toEqual({ name: "Acme Sdn. Bhd.", lines: ["1 Jalan Ampang", "50450 Kuala Lumpur"] });
    expect(L.taxColumn).toBeNull();
    expect(L.totals.map((t) => t.label)).toEqual(["Subtotal", "Shipping", "Discount", "Total", "Amount paid"]);
    expect(L.totals.find((t) => t.label === "Discount")?.value).toBe("-MYR 10.00");
    expect(L.payments?.rows).toEqual([{ method: "ShopeePay", date: "October 14, 2026", amount: "MYR 166.80", ref: "RCT-2026-000012" }]);
    expect(L.notes).toEqual(["Thank you!"]);
  });

  it("发票带税：税率列、不含税合计与税行；没填法定名称用商户名", () => {
    const totals = computeTotals({ ...base, items: [{ unitPrice: "200.00", qty: 1 }], shipping: "16.00", orderTotal: "216.00", taxRate: "8" });
    const L = invoiceLayout(doc({ kind: "invoice", totals, seller: { ...EMPTY_PROFILE, taxName: "SST", taxRate: "8", taxIdLabel: "TIN", taxId: "C123" } }));
    expect(L.meta.map((m) => m.label)).toEqual(["Invoice number", "Order number", "Date", "TIN"]);
    expect(L.seller.name).toBe("Demo Store");
    expect(L.headline).toBe("Total MYR 216.00");
    expect(L.taxColumn).toBe("8%");
    expect(L.totals.map((t) => `${t.label}|${t.value}`)).toEqual([
      "Subtotal|MYR 200.00",
      "Shipping|MYR 16.00",
      "Total excluding tax|MYR 200.00",
      "SST - Malaysia (8% on MYR 200.00)|MYR 16.00",
      "Total|MYR 216.00",
      "Amount paid|MYR 216.00",
    ]);
  });

  it("未付款：没有付款记录，标题行写待付", () => {
    const L = invoiceLayout(doc({ kind: "invoice", paidOn: null, totals: computeTotals({ ...base, paid: false }) }));
    expect(L.payments).toBeNull();
    expect(L.headline).toBe("MYR 166.80 due");
    expect(L.totals.at(-1)).toEqual({ label: "Amount due", value: "MYR 166.80", strong: true });
  });
});
