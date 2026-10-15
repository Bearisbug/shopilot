// 发票渲染（ADR-009）：@react-pdf/renderer 按版面出 PDF；PDFium（WASM）把同一份 PDF 的第 1 页栅格化，pngjs 编码成 PNG。
// 版面内容由 @/lib/invoice 的 invoiceLayout 算好（设置页预览用同一份），这里只管排版。
// 发票是商户对外的单据：白底黑字、细分隔线，不用 Shopilot 品牌色。
// 字体：Noto Sans SC 2.004 与 Noto Sans Thai 2.002（SIL OFL 1.1，许可证在 fonts/ 下），由官方可变字体实例化为静态字重；
// SemiBold 只保留拉丁与越南文，粗体里的中文落到 Regular。
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFiumLibrary } from "@hyzyla/pdfium";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { PNG } from "pngjs";
import type { InvoiceLayout } from "@/lib/invoice";

const FONT_DIR = path.join(process.cwd(), "src/server/invoices/fonts");
const g = globalThis as unknown as { __invoiceFonts?: boolean; __pdfium?: Promise<PDFiumLibrary> };

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

function pdfium(): Promise<PDFiumLibrary> {
  g.__pdfium ??= readFile(path.join(process.cwd(), "node_modules/@hyzyla/pdfium/dist/pdfium.wasm")).then((wasm) =>
    PDFiumLibrary.init({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer }),
  );
  return g.__pdfium;
}

export type InvoiceLogoImage = { data: Buffer; format: "png" | "jpg"; width: number | null; height: number | null };
export type InvoiceRenderInput = { layout: InvoiceLayout; author: string; logo: InvoiceLogoImage | null };

const REGULAR = ["SC", "TH"];
const BOLD = ["SCB", "SC", "TH"];
const INK = "#1a1a1a";
const MUTED = "#6b6b6b";
const RULE = "#d9d9d9";
const LOGO_MAX = { width: 160, height: 48 };

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 72, paddingHorizontal: 48, fontFamily: REGULAR, fontSize: 9.5, lineHeight: 1.35, color: INK },
  bold: { fontFamily: BOLD, fontWeight: 600 },
  muted: { color: MUTED },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  title: { fontFamily: BOLD, fontWeight: 600, fontSize: 24, lineHeight: 1.2 },
  metaRow: { flexDirection: "row" },
  metaLabel: { fontFamily: BOLD, fontWeight: 600, width: 120, paddingRight: 8 },
  parties: { flexDirection: "row", marginTop: 20 },
  party: { width: "50%", paddingRight: 16 },
  headline: { fontFamily: BOLD, fontWeight: 600, fontSize: 15, lineHeight: 1.3, marginTop: 24 },
  note: { marginTop: 8 },
  table: { marginTop: 20 },
  thead: { flexDirection: "row", paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: INK, fontSize: 8.5, color: MUTED },
  row: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: RULE },
  cDesc: { flex: 1, paddingRight: 8 },
  cQty: { width: 40, textAlign: "right" },
  cPrice: { width: 88, textAlign: "right" },
  cTax: { width: 44, textAlign: "right" },
  cAmt: { width: 96, textAlign: "right" },
  detail: { fontSize: 8.5, color: MUTED },
  totals: { marginLeft: "auto", width: "55%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderTopWidth: 0.5, borderTopColor: RULE },
  firstTotal: { borderTopWidth: 0, paddingTop: 8 },
  totalLabel: { flex: 1, paddingRight: 12 },
  section: { marginTop: 24 },
  h2: { fontFamily: BOLD, fontWeight: 600, fontSize: 12, marginBottom: 8 },
  pMethod: { flex: 1, paddingRight: 8 },
  pDate: { width: 120, paddingRight: 8 },
  pAmt: { width: 96, textAlign: "right", paddingRight: 16 },
  pRef: { width: 130 },
  // 页脚用 top 定位：Page 带行高时用 bottom 定位的固定元素不出图（@react-pdf/renderer 实测）
  footer: { position: "absolute", top: 784, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 0.5, borderTopColor: RULE, fontSize: 8, color: MUTED },
});

/** Logo 缩放进 160 × 48 的框；尺寸不明（个别 JPG）时按框等比放入 */
function logoBox(l: InvoiceLogoImage) {
  if (!l.width || !l.height) return { ...LOGO_MAX, objectFit: "contain" as const, objectPosition: "right" };
  const k = Math.min(LOGO_MAX.width / l.width, LOGO_MAX.height / l.height, 1);
  return { width: l.width * k, height: l.height * k };
}

function InvoicePdf({ d }: { d: InvoiceRenderInput }) {
  const L = d.layout;
  return (
    <Document title={L.meta[0].value} author={d.author} creator="Shopilot" producer="Shopilot">
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          <Text style={s.title}>{L.title}</Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer 的 Image 不接受 alt */}
          {d.logo && <Image src={{ data: d.logo.data, format: d.logo.format }} style={logoBox(d.logo)} />}
        </View>

        <View>
          {L.meta.map((r) => (
            <View key={r.label} style={s.metaRow}>
              <Text style={s.metaLabel}>{r.label}</Text>
              <Text style={{ flex: 1 }}>{r.value}</Text>
            </View>
          ))}
        </View>

        <View style={s.parties}>
          <View style={s.party}>
            {L.seller.name ? <Text style={s.bold}>{L.seller.name}</Text> : null}
            {L.seller.lines.map((l, i) => (
              <Text key={i}>{l}</Text>
            ))}
          </View>
          <View style={s.party}>
            <Text style={s.bold}>Bill to</Text>
            <Text>{L.billTo.name}</Text>
            {L.billTo.lines.map((l, i) => (
              <Text key={i}>{l}</Text>
            ))}
          </View>
        </View>

        <Text style={s.headline}>{L.headline}</Text>
        {L.notes.map((n, i) => (
          <Text key={i} style={s.note}>
            {n}
          </Text>
        ))}

        <View style={s.table}>
          <View style={s.thead}>
            <Text style={s.cDesc}>Description</Text>
            <Text style={s.cQty}>Qty</Text>
            <Text style={s.cPrice}>Unit price</Text>
            {L.taxColumn && <Text style={s.cTax}>Tax</Text>}
            <Text style={s.cAmt}>Amount</Text>
          </View>
          {L.rows.map((r, i) => (
            <View key={i} style={s.row} wrap={false}>
              <View style={s.cDesc}>
                <Text>{r.description}</Text>
                {r.detail ? <Text style={s.detail}>{r.detail}</Text> : null}
              </View>
              <Text style={s.cQty}>{r.qty}</Text>
              <Text style={s.cPrice}>{r.unitPrice}</Text>
              {L.taxColumn && <Text style={s.cTax}>{L.taxColumn}</Text>}
              <Text style={s.cAmt}>{r.amount}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals} wrap={false}>
          {L.totals.map((t, i) => (
            <View key={t.label} style={[s.totalRow, i === 0 ? s.firstTotal : {}]}>
              <Text style={[s.totalLabel, t.strong ? s.bold : {}]}>{t.label}</Text>
              <Text style={t.strong ? s.bold : {}}>{t.value}</Text>
            </View>
          ))}
        </View>

        {L.payments && (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Payment history</Text>
            <View style={s.thead}>
              <Text style={s.pMethod}>Payment method</Text>
              <Text style={s.pDate}>Date</Text>
              <Text style={s.pAmt}>Amount paid</Text>
              <Text style={s.pRef}>{L.payments.refLabel}</Text>
            </View>
            {L.payments.rows.map((p, i) => (
              <View key={i} style={s.row}>
                <Text style={s.pMethod}>{p.method}</Text>
                <Text style={s.pDate}>{p.date}</Text>
                <Text style={s.pAmt}>{p.amount}</Text>
                <Text style={s.pRef}>{p.ref}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.footer} fixed>
          <Text style={{ flex: 1, paddingRight: 16 }}>{L.footer}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** 上传 Logo 时试嵌一次：个别 PNG（如 16 位、隔行扫描）PDF 引擎解不开，在上传时就拒掉，不留到开票时失败 */
export async function checkLogo(logo: Pick<InvoiceLogoImage, "data" | "format">): Promise<boolean> {
  registerFonts();
  try {
    await renderToBuffer(
      <Document>
        <Page size="A6">
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer 的 Image 不接受 alt */}
          <Image src={{ data: logo.data, format: logo.format }} style={{ width: 80, height: 24, objectFit: "contain" }} />
        </Page>
      </Document>,
    );
    return true;
  } catch {
    return false;
  }
}

/** 渲染 PDF 与第 1 页 PNG（2 倍，A4 约 1190 × 1684） */
export async function renderInvoice(d: InvoiceRenderInput): Promise<{ pdf: Buffer; png: Buffer; width: number; height: number }> {
  registerFonts();
  const pdf = await renderToBuffer(<InvoicePdf d={d} />);
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
