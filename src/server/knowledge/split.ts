// 大 PDF 按页拆分（§17：开 OCR 的 PDF 单条目上限 10 MiB）：从第 1 页起，每个条目装下尽量多的连续页；
// 单页仍超限时报出页码。每个条目的大小用 pdf-lib 实际生成后量，不估算。
import { PDFDocument } from "pdf-lib";

export const PDF_PART_LIMIT = 10 * 1024 * 1024;

export type PdfPart = { pageFrom: number | null; pageTo: number | null; data: Uint8Array };
export type SplitResult = { ok: true; parts: PdfPart[] } | { ok: false; page: number } | { ok: false; error: string };

export async function splitPdf(data: Uint8Array, limit = PDF_PART_LIMIT): Promise<SplitResult> {
  if (data.length <= limit) return { ok: true, parts: [{ pageFrom: null, pageTo: null, data }] };
  let src: PDFDocument;
  try {
    src = await PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const total = src.getPageCount();
  const build = async (from: number, to: number) => {
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(
      src,
      Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i),
    );
    for (const p of pages) doc.addPage(p);
    return doc.save({ useObjectStreams: true });
  };
  const parts: PdfPart[] = [];
  for (let start = 1; start <= total; ) {
    const single = await build(start, start);
    if (single.length > limit) return { ok: false, page: start };
    // 已知能装下的最远页 good（含）与已知装不下的最近页 bad，先倍增探测再二分
    let good = start;
    let goodBytes = single;
    let bad = total + 1;
    for (let step = 1; good < total; step *= 2) {
      const end = Math.min(total, start + step);
      const bytes = await build(start, end);
      if (bytes.length <= limit) {
        good = end;
        goodBytes = bytes;
      } else {
        bad = end;
        break;
      }
    }
    while (bad - good > 1 && good < total) {
      const mid = Math.floor((good + bad) / 2);
      const bytes = await build(start, mid);
      if (bytes.length <= limit) {
        good = mid;
        goodBytes = bytes;
      } else bad = mid;
    }
    parts.push({ pageFrom: start, pageTo: good, data: goodBytes });
    start = good + 1;
  }
  return { ok: true, parts };
}
