// 发票渲染（ADR-009）：@react-pdf/renderer 按模板出 PDF；PDFium（WASM）把同一份 PDF 的第 1 页栅格化，pngjs 编码成 PNG。
// 字体：Noto Sans SC 2.004 与 Noto Sans Thai 2.002（SIL OFL 1.1，许可证在 fonts/ 下），由官方可变字体实例化为静态字重；
// SemiBold 只保留拉丁与越南文，粗体里的中文落到 Regular。
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFiumLibrary } from "@hyzyla/pdfium";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { PNG } from "pngjs";
import type { InvoiceFields } from "@/server/db/schema";

const FONT_DIR = path.join(process.cwd(), "src/server/invoices/fonts");
const g = globalThis as unknown as { __invoiceFonts?: boolean; __pdfium?: Promise<PDFiumLibrary>; __invoicePalette?: Promise<Palette> };

type Palette = { text: string; muted: string; link: string; border: string; sunken: string };

function registerFonts() {
  if (g.__invoiceFonts) return;
  Font.register({ family: "SC", src: path.join(FONT_DIR, "NotoSansSC-Regular.ttf"), fontWeight: 400 });
  Font.register({ family: "SCB", src: path.join(FONT_DIR, "NotoSansSC-SemiBold-Latin.ttf"), fontWeight: 600 });
  Font.register({
    family: "TH",
    fonts: [
      { src: path.join(FONT_DIR, "NotoSansThai-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "NotoSansThai-SemiBold.ttf"), fontWeight: 600 },
    ],
  });
  // 中文、泰文没有空格分词，按字断行
  Font.registerHyphenationCallback((word) => (/[฀-๿㐀-鿿]/.test(word) ? Array.from(word) : [word]));
  g.__invoiceFonts = true;
}

/** 颜色取品牌 tokens（brand/tokens.resolved.json），不在代码里另写色值 */
function palette(): Promise<Palette> {
  g.__invoicePalette ??= readFile(path.join(process.cwd(), "brand/tokens.resolved.json"), "utf8").then((raw) => {
    const c = (JSON.parse(raw) as { semantic: { color: Record<string, Record<string, { $value: string }>> } }).semantic.color;
    return { text: c.text.primary.$value, muted: c.text.secondary.$value, link: c.text.link.$value, border: c.border.subtle.$value, sunken: c.surface.sunken.$value };
  });
  return g.__invoicePalette;
}

function pdfium(): Promise<PDFiumLibrary> {
  g.__pdfium ??= readFile(path.join(process.cwd(), "node_modules/@hyzyla/pdfium/dist/pdfium.wasm")).then((wasm) =>
    PDFiumLibrary.init({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer }),
  );
  return g.__pdfium;
}

export type InvoiceDoc = {
  kind: "invoice" | "receipt";
  number: string;
  issuedOn: string;
  merchantName: string;
  shopName: string;
  shopLabel: string;
  externalOrderId: string | null;
  fields: InvoiceFields;
};

const REGULAR = ["SC", "TH"];
const BOLD = ["SCB", "SC", "TH"];

function amount(v: string, currency: string) {
  const n = Number(v);
  const digits = currency === "VND" || currency === "IDR" ? 0 : 2;
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function InvoicePdf({ d, p }: { d: InvoiceDoc; p: Palette }) {
  const s = StyleSheet.create({
    page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48, fontFamily: REGULAR, fontSize: 10, lineHeight: 1.5, color: p.text },
    head: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
    merchant: { fontSize: 16, lineHeight: 1.3, marginBottom: 4 },
    muted: { color: p.muted },
    title: { fontFamily: BOLD, fontWeight: 600, fontSize: 22, color: p.link, textAlign: "right", lineHeight: 1.2 },
    meta: { flexDirection: "row", justifyContent: "flex-end" },
    metaLabel: { color: p.muted, width: 64, textAlign: "right", marginRight: 8 },
    label: { fontFamily: BOLD, fontWeight: 600, fontSize: 9, color: p.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
    party: { marginBottom: 24 },
    thead: { flexDirection: "row", backgroundColor: p.sunken, paddingVertical: 6, paddingHorizontal: 8, fontFamily: BOLD, fontWeight: 600, fontSize: 9, color: p.muted },
    row: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: p.border },
    cName: { flex: 1, paddingRight: 8 },
    cQty: { width: 40, textAlign: "right" },
    cPrice: { width: 96, textAlign: "right" },
    cAmt: { width: 104, textAlign: "right" },
    totals: { marginTop: 12, marginLeft: "auto", width: 240 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, paddingHorizontal: 8 },
    grand: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, paddingHorizontal: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: p.text, fontFamily: BOLD, fontWeight: 600, fontSize: 12 },
    notes: { marginTop: 28 },
    footer: { position: "absolute", bottom: 28, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: p.muted },
  });
  const f = d.fields;
  const isReceipt = d.kind === "receipt";
  return (
    <Document title={`${d.number}`} author={d.merchantName} creator="Shopilot" producer="Shopilot">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View style={{ maxWidth: 280 }}>
            <Text style={s.merchant}>{d.merchantName}</Text>
            <Text style={s.muted}>{d.shopName}</Text>
            <Text style={s.muted}>{d.shopLabel}</Text>
          </View>
          <View>
            <Text style={s.title}>{isReceipt ? "RECEIPT" : "INVOICE"}</Text>
            <View style={[s.meta, { marginTop: 6 }]}>
              <Text style={s.metaLabel}>No.</Text>
              <Text>{d.number}</Text>
            </View>
            <View style={s.meta}>
              <Text style={s.metaLabel}>Date</Text>
              <Text>{d.issuedOn}</Text>
            </View>
            {d.externalOrderId && (
              <View style={s.meta}>
                <Text style={s.metaLabel}>Order</Text>
                <Text>{d.externalOrderId}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.party}>
          <Text style={s.label}>{isReceipt ? "Received from" : "Bill to"}</Text>
          <Text style={{ fontSize: 12 }}>{f.buyerName}</Text>
          <Text>{f.address}</Text>
          {f.email ? <Text style={s.muted}>{f.email}</Text> : null}
          {f.taxId ? <Text style={s.muted}>Tax ID: {f.taxId}</Text> : null}
        </View>

        <View style={s.thead}>
          <Text style={s.cName}>Item</Text>
          <Text style={s.cQty}>Qty</Text>
          <Text style={s.cPrice}>Unit price</Text>
          <Text style={s.cAmt}>Amount</Text>
        </View>
        {f.items.map((it, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={s.cName}>{it.name}</Text>
            <Text style={s.cQty}>{it.qty}</Text>
            <Text style={s.cPrice}>{amount(it.unitPrice, f.currency)}</Text>
            <Text style={s.cAmt}>{amount((Number(it.unitPrice) * it.qty).toFixed(2), f.currency)}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text style={s.muted}>Subtotal</Text>
            <Text>{amount(f.subtotal, f.currency)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.muted}>Tax</Text>
            <Text>{amount(f.tax, f.currency)}</Text>
          </View>
          <View style={s.grand}>
            <Text>{isReceipt ? "Total paid" : "Total"}</Text>
            <Text>{amount(f.total, f.currency)}</Text>
          </View>
        </View>

        {f.notes ? (
          <View style={s.notes}>
            <Text style={s.label}>Notes</Text>
            <Text>{f.notes}</Text>
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text>{d.number}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** 渲染 PDF 与第 1 页 PNG（2 倍，A4 约 1190 × 1684） */
export async function renderInvoice(d: InvoiceDoc): Promise<{ pdf: Buffer; png: Buffer; width: number; height: number }> {
  registerFonts();
  const pdf = await renderToBuffer(<InvoicePdf d={d} p={await palette()} />);
  const lib = await pdfium();
  const doc = await lib.loadDocument(new Uint8Array(pdf));
  try {
    const page = doc.getPage(0);
    const img = await page.render({
      scale: 2,
      render: async ({ data, width, height }) => {
        const png = new PNG({ width, height });
        png.data = Buffer.from(data); // 按 RGBA 排列（库里带了 REVERSE_BYTE_ORDER）
        return new Uint8Array(PNG.sync.write(png));
      },
    });
    return { pdf, png: Buffer.from(img.data), width: img.width, height: img.height };
  } finally {
    doc.destroy();
  }
}
