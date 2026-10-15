import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { documentPatch, uploadFields } from "@/contracts/knowledge";
import { Problem } from "@/server/http/problem";
import { checkKnowledgeFile } from "./format";

const MB = 1024 * 1024;
const pdfHead = strToU8("%PDF-1.7\n%âãÏÓ\n");
const zipHead = zipSync({ "word/document.xml": strToU8("<w:document/>") });

function problem(fn: () => unknown): Problem {
  try {
    fn();
  } catch (e) {
    if (e instanceof Problem) return e;
    throw e;
  }
  throw new Error("没有抛出 Problem");
}

describe("资料格式与大小判断（API-KB-002）", () => {
  it("PDF、docx、图片、文本按扩展名与文件头放行", () => {
    expect(checkKnowledgeFile("保修政策.pdf", 3 * MB, pdfHead)).toMatchObject({ ext: "pdf", mime: "application/pdf", pdf: true });
    expect(checkKnowledgeFile("型号对照.DOCX", 1 * MB, zipHead)).toMatchObject({ ext: "docx", pdf: false });
    expect(checkKnowledgeFile("a.jpeg", 1000, new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toMatchObject({ ext: "jpg", mime: "image/jpeg" });
    expect(checkKnowledgeFile("说明.md", 100, strToU8("# 保修\n12 个月"))).toMatchObject({ ext: "md", mime: "text/markdown" });
    expect(checkKnowledgeFile("old.xls", 100, new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toMatchObject({ ext: "xls" });
  });

  it("PPT 拒收并提示先导出为 PDF", () => {
    const p = problem(() => checkKnowledgeFile("产品介绍.pptx", 1 * MB, zipHead));
    expect(p).toMatchObject({ status: 415, type: "unsupported-type", code: "ppt_export_pdf" });
    expect(problem(() => checkKnowledgeFile("旧版.ppt", 1000, pdfHead)).code).toBe("ppt_export_pdf");
  });

  it("其他格式与内容不符的文件 415", () => {
    expect(problem(() => checkKnowledgeFile("a.exe", 1000, zipHead))).toMatchObject({ status: 415, code: "unsupported" });
    expect(problem(() => checkKnowledgeFile("假的.pdf", 1000, zipHead))).toMatchObject({ status: 415, code: "content_mismatch" });
    expect(problem(() => checkKnowledgeFile("二进制.txt", 1000, new Uint8Array([0x41, 0x00, 0x42])))).toMatchObject({ status: 415, code: "content_mismatch" });
    expect(problem(() => checkKnowledgeFile("空.pdf", 0, new Uint8Array()))).toMatchObject({ status: 415 });
  });

  it("超过 20 MB 413 file_limit；PDF 以外超过 4 MB 413 retrieval_limit；PDF 20 MB 以内放行", () => {
    expect(problem(() => checkKnowledgeFile("大.pdf", 25 * MB, pdfHead))).toMatchObject({ status: 413, code: "file_limit", detail: "单个文件不能超过 20 MB。" });
    expect(problem(() => checkKnowledgeFile("大.docx", 5 * MB, zipHead))).toMatchObject({ status: 413, code: "retrieval_limit", detail: "PDF 以外的文件不能超过 4 MB。" });
    expect(checkKnowledgeFile("扫描件.pdf", 19 * MB, pdfHead).pdf).toBe(true);
  });

  it("文本截断处切开多字节字符时仍算合法 UTF-8", () => {
    const text = strToU8("保".repeat(5000));
    expect(checkKnowledgeFile("长.txt", text.length, text.subarray(0, 8192)).ext).toBe("txt");
  });
});

describe("适用站点与修改请求的校验", () => {
  it("站点缺省 ALL；ALL 不与具体站点同选；不能为空", () => {
    expect(uploadFields.parse({}).markets).toEqual(["ALL"]);
    expect(uploadFields.parse({ markets: ["MY", "TH"] }).markets).toEqual(["MY", "TH"]);
    expect(uploadFields.safeParse({ markets: ["ALL", "MY"] }).success).toBe(false);
    expect(uploadFields.safeParse({ markets: [] }).success).toBe(false);
    expect(uploadFields.safeParse({ markets: ["TW"] }).success).toBe(false);
    expect(documentPatch.safeParse({ markets: [] }).success).toBe(false);
    expect(documentPatch.safeParse({}).success).toBe(false);
    expect(documentPatch.parse({ aiEnabled: false })).toEqual({ aiEnabled: false });
  });
});
