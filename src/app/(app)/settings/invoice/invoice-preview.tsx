"use client";

import { format } from "date-fns";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { computeTotals, invoiceLayout, type ProfileFields } from "@/lib/invoice";

/** 示例订单按站点换币种；数值只为让预览像真的，不参与任何计算 */
const SAMPLE_CURRENCY: Record<string, { code: string; rate: number }> = {
  MY: { code: "MYR", rate: 1 },
  SG: { code: "SGD", rate: 0.3 },
  TH: { code: "THB", rate: 8 },
  PH: { code: "PHP", rate: 13 },
  VN: { code: "VND", rate: 5500 },
};

function sampleOrder(market: string) {
  const c = SAMPLE_CURRENCY[market] ?? SAMPLE_CURRENCY.MY;
  const price = (myr: number) => (c.code === "VND" ? Math.round((myr * c.rate) / 1000) * 1000 : Math.round(myr * c.rate * 100) / 100);
  const items = [
    { name: "Wireless Earbuds Pro", sku: "Black", qty: 1, unitPrice: price(129).toFixed(2) },
    { name: "Silicone Case", sku: "Mint", qty: 2, unitPrice: price(19.9).toFixed(2) },
  ];
  const shipping = price(8);
  const total = items.reduce((s, i) => s + Number(i.unitPrice) * i.qty, 0) + shipping - price(10);
  return { currency: c.code, items, shipping: shipping.toFixed(2), orderTotal: total.toFixed(2) };
}

/** 跟踪元素宽高（预览按容器宽度缩放 A4 版面） */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.offsetWidth, height: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

/**
 * 发票版面的 HTML 复刻（1px = 1pt），与 render.tsx 用同一份 invoiceLayout；示例订单带运费与折扣。
 * 没填的法定主体名称、地址与 Logo 以灰色占位显示。
 */
export function InvoicePreview({ seller, logoUrl, market, platform, kind }: { seller: ProfileFields; logoUrl: string | null; market: string; platform: "shopee" | "tiktok"; kind: "invoice" | "receipt" }) {
  const [box, boxSize] = useSize<HTMLDivElement>();
  const [page, pageSize] = useSize<HTMLDivElement>();
  const scale = boxSize.width / PAGE_WIDTH;
  const L = useMemo(() => {
    const o = sampleOrder(market);
    const today = format(new Date(), "yyyy-MM-dd");
    return invoiceLayout({
      kind,
      number: kind === "receipt" ? "RCT-2026-000001" : "INV-2026-000001",
      issuedOn: today,
      paidOn: today,
      externalOrderId: "2510150A7K3M9Q",
      platform,
      market,
      seller,
      sellerFallback: null,
      buyer: { name: "Tan Mei Ling", address: "12 Jalan Bukit Bintang\n55100 Kuala Lumpur", email: "meiling@example.com" },
      items: o.items,
      currency: o.currency,
      totals: computeTotals({ items: o.items, orderTotal: o.orderTotal, shipping: o.shipping, paid: true, taxRate: seller.taxRate, taxInclusive: seller.pricesIncludeTax ?? true, currency: o.currency }),
      paymentMethod: platform === "shopee" ? "ShopeePay" : "Credit/Debit Card",
    });
  }, [seller, market, platform, kind]);
  const placeholder = "text-neutral-400";

  return (
    <div ref={box} className="w-full overflow-hidden rounded-md border border-border bg-white shadow-xs" style={{ height: scale ? pageSize.height * scale : undefined }}>
      <div
        ref={page}
        className="relative origin-top-left px-[48px] pt-[40px] pb-[72px] font-sans text-[9.5px] leading-[1.35] text-neutral-900"
        style={{ width: PAGE_WIDTH, minHeight: PAGE_HEIGHT, transform: `scale(${scale || 0})` }}
      >
        <div className="mb-[16px] flex items-start justify-between gap-4">
          <p className="text-[24px] leading-[1.2] font-semibold">{L.title}</p>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- 商户上传的文件，走鉴权下载接口，不经图片优化
            <img src={logoUrl} alt="发票 Logo" className="max-h-[48px] max-w-[160px] object-contain" />
          ) : (
            <span className={`flex h-[48px] w-[160px] items-center justify-center border border-dashed border-neutral-300 ${placeholder}`}>Logo</span>
          )}
        </div>
        <dl className="grid grid-cols-[120px_1fr]">
          {L.meta.map((r) => (
            <div key={r.label} className="contents">
              <dt className="pr-[8px] font-semibold">{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-[20px] grid grid-cols-2">
          <div className="pr-[16px] [overflow-wrap:anywhere]">
            <p className={L.seller.name ? "font-semibold" : `font-semibold ${placeholder}`}>{L.seller.name ?? "法定主体名称"}</p>
            {L.seller.lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
            {!seller.address && <p className={placeholder}>地址</p>}
          </div>
          <div className="pr-[16px] [overflow-wrap:anywhere]">
            <p className="font-semibold">Bill to</p>
            <p>{L.billTo.name}</p>
            {L.billTo.lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        </div>
        <p className="mt-[24px] text-[15px] leading-[1.3] font-semibold">{L.headline}</p>
        {L.notes.map((n, i) => (
          <p key={i} className="mt-[8px] whitespace-pre-line [overflow-wrap:anywhere]">
            {n}
          </p>
        ))}
        <table className="mt-[20px] w-full border-collapse tabular-nums">
          <thead>
            <tr className="border-b border-neutral-900 text-[8.5px] text-neutral-500">
              <th className="pb-[6px] text-left font-normal">Description</th>
              <th className="w-[40px] pb-[6px] text-right font-normal">Qty</th>
              <th className="w-[88px] pb-[6px] text-right font-normal">Unit price</th>
              {L.taxColumn && <th className="w-[44px] pb-[6px] text-right font-normal">Tax</th>}
              <th className="w-[96px] pb-[6px] text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {L.rows.map((r, i) => (
              <tr key={i} className="border-b-[0.5px] border-neutral-200 align-top">
                <td className="py-[6px] pr-[8px]">
                  {r.description}
                  {r.detail && <span className="block text-[8.5px] text-neutral-500">{r.detail}</span>}
                </td>
                <td className="py-[6px] text-right">{r.qty}</td>
                <td className="py-[6px] text-right">{r.unitPrice}</td>
                {L.taxColumn && <td className="py-[6px] text-right">{L.taxColumn}</td>}
                <td className="py-[6px] text-right">{r.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto w-[55%] tabular-nums">
          {L.totals.map((t, i) => (
            <div key={t.label} className={`flex justify-between gap-[12px] py-[4px] ${i === 0 ? "pt-[8px]" : "border-t-[0.5px] border-neutral-200"} ${t.strong ? "font-semibold" : ""}`}>
              <dt>{t.label}</dt>
              <dd>{t.value}</dd>
            </div>
          ))}
        </dl>
        {L.payments && (
          <div className="mt-[24px]">
            <p className="mb-[8px] text-[12px] font-semibold">Payment history</p>
            <table className="w-full border-collapse tabular-nums">
              <thead>
                <tr className="border-b border-neutral-900 text-[8.5px] text-neutral-500">
                  <th className="pb-[6px] text-left font-normal">Payment method</th>
                  <th className="w-[120px] pb-[6px] text-left font-normal">Date</th>
                  <th className="w-[96px] pr-[16px] pb-[6px] text-right font-normal">Amount paid</th>
                  <th className="w-[130px] pb-[6px] text-left font-normal">{L.payments.refLabel}</th>
                </tr>
              </thead>
              <tbody>
                {L.payments.rows.map((p, i) => (
                  <tr key={i} className="border-b-[0.5px] border-neutral-200">
                    <td className="py-[6px]">{p.method}</td>
                    <td className="py-[6px]">{p.date}</td>
                    <td className="py-[6px] pr-[16px] text-right">{p.amount}</td>
                    <td className="py-[6px]">{p.ref}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="absolute inset-x-[48px] bottom-[32px] flex justify-between gap-[16px] border-t-[0.5px] border-neutral-200 pt-[8px] text-[8px] text-neutral-500">
          <span>{L.footer}</span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
}
