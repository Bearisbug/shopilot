import { randomBytes } from "node:crypto";
import { PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { splitPdf } from "./split";

const KB = 1024;

/** 每页挂一段随机字节（不可压缩），页大小按字节可控 */
async function pdfWithPages(sizes: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const size of sizes) {
    const page = doc.addPage([200, 200]);
    page.node.set(PDFName.of("Junk"), doc.context.register(doc.context.stream(randomBytes(size))));
  }
  return doc.save({ useObjectStreams: true });
}

describe("大 PDF 按页拆分（§17）", () => {
  it("不超限的 PDF 不拆，整份一个条目、不带页码", async () => {
    const data = await pdfWithPages([10 * KB, 10 * KB]);
    const r = await splitPdf(data, 100 * KB);
    expect(r.ok && r.parts.length).toBe(1);
    expect(r.ok && r.parts[0]).toMatchObject({ pageFrom: null, pageTo: null });
  });

  it("超限时按连续页拆，每个条目不超限、页码首尾相接、每个条目尽量装满", async () => {
    const data = await pdfWithPages(Array.from({ length: 12 }, () => 30 * KB));
    const limit = 100 * KB;
    const r = await splitPdf(data, limit);
    if (!r.ok) throw new Error("拆分失败");
    expect(r.parts.length).toBe(4);
    let next = 1;
    for (const part of r.parts) {
      expect(part.data.length).toBeLessThanOrEqual(limit);
      expect(part.pageFrom).toBe(next);
      next = (part.pageTo ?? 0) + 1;
      const doc = await PDFDocument.load(part.data);
      expect(doc.getPageCount()).toBe((part.pageTo ?? 0) - (part.pageFrom ?? 0) + 1);
    }
    expect(next).toBe(13);
  });

  it("单页仍超限时报出页码，不出条目", async () => {
    const data = await pdfWithPages([20 * KB, 20 * KB, 150 * KB, 20 * KB]);
    expect(await splitPdf(data, 100 * KB)).toEqual({ ok: false, page: 3 });
  });

  it("读不出来的 PDF 返回错误说明", async () => {
    const r = await splitPdf(new Uint8Array(200 * KB).fill(0x20), 100 * KB);
    expect(r.ok).toBe(false);
    expect("error" in r).toBe(true);
  });
});
