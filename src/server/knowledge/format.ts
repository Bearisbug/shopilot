// 资料格式与大小判断（API-KB-002、§9.6 资料类型）：按扩展名与文件头一起判断；ppt、pptx 拒收并提示先导出为 PDF。
import { KNOWLEDGE_FILE_MAX, KNOWLEDGE_NON_PDF_MAX } from "@/contracts/knowledge";
import { Problem } from "@/server/http/problem";

export type KnowledgeFormat = { ext: string; mime: string; pdf: boolean };

type Sniff = "pdf" | "zip" | "ole" | "jpg" | "png" | "webp" | "gif" | "bmp" | "tiff" | "heic" | "text";

const BY_EXT: Record<string, { mime: string; sniff: Sniff }> = {
  pdf: { mime: "application/pdf", sniff: "pdf" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sniff: "zip" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sniff: "zip" },
  odt: { mime: "application/vnd.oasis.opendocument.text", sniff: "zip" },
  ods: { mime: "application/vnd.oasis.opendocument.spreadsheet", sniff: "zip" },
  xls: { mime: "application/vnd.ms-excel", sniff: "ole" },
  csv: { mime: "text/csv", sniff: "text" },
  md: { mime: "text/markdown", sniff: "text" },
  txt: { mime: "text/plain", sniff: "text" },
  html: { mime: "text/html", sniff: "text" },
  htm: { mime: "text/html", sniff: "text" },
  jpg: { mime: "image/jpeg", sniff: "jpg" },
  jpeg: { mime: "image/jpeg", sniff: "jpg" },
  png: { mime: "image/png", sniff: "png" },
  webp: { mime: "image/webp", sniff: "webp" },
  gif: { mime: "image/gif", sniff: "gif" },
  bmp: { mime: "image/bmp", sniff: "bmp" },
  tiff: { mime: "image/tiff", sniff: "tiff" },
  tif: { mime: "image/tiff", sniff: "tiff" },
  heic: { mime: "image/heic", sniff: "heic" },
};

export const SUPPORTED_TEXT = "PDF、Word（docx）、Excel（xlsx、xls）、CSV、图片（JPG、PNG、WebP、GIF、BMP、TIFF、HEIC）、Markdown、TXT、HTML、ODT、ODS";

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, Math.min(to, b.length)));

function matches(sniff: Sniff, b: Uint8Array): boolean {
  switch (sniff) {
    case "pdf":
      // %PDF- 允许出现在前 1 KB 内（部分生成器在前面带垃圾字节）
      return ascii(b, 0, 1024).includes("%PDF-");
    case "zip":
      return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
    case "ole":
      return [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((v, i) => b[i] === v);
    case "jpg":
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "png":
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v);
    case "webp":
      return ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP";
    case "gif":
      return ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a";
    case "bmp":
      return ascii(b, 0, 2) === "BM";
    case "tiff":
      return (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a);
    case "heic":
      return ascii(b, 4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii(b, 8, 12));
    case "text": {
      // 文本类：前 8 KB 没有 NUL 字节且是合法 UTF-8（传进来的往往只是文件开头，末尾可能切开一个多字节字符）
      const head = b.subarray(0, 8192);
      if (head.includes(0)) return false;
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(trimPartialUtf8(head));
        return true;
      } catch {
        return false;
      }
    }
  }
}

/** 截断处可能切开一个多字节字符，去掉末尾不完整的那几个字节再校验 */
function trimPartialUtf8(b: Uint8Array): Uint8Array {
  let end = b.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const c = b[end - i];
    if ((c & 0xc0) === 0x80) continue;
    if (c >= 0xc0) end -= i;
    break;
  }
  return b.subarray(0, end);
}

export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

/** 判断上传的资料能不能收；不能收时抛 413 / 415（§14）。size 是整个文件的字节数，head 至少含文件开头 8 KB */
export function checkKnowledgeFile(name: string, size: number, head: Uint8Array): KnowledgeFormat {
  if (size > KNOWLEDGE_FILE_MAX) throw new Problem("too-large", { detail: "单个文件不能超过 20 MB。", code: "file_limit" });
  const ext = extensionOf(name);
  if (ext === "ppt" || ext === "pptx") throw new Problem("unsupported-type", { detail: "请先把 PPT 导出为 PDF 再上传。", code: "ppt_export_pdf" });
  const rule = BY_EXT[ext];
  if (!rule) throw new Problem("unsupported-type", { detail: `这种格式暂不支持。支持 ${SUPPORTED_TEXT}。`, code: "unsupported" });
  if (size === 0 || !matches(rule.sniff, head)) throw new Problem("unsupported-type", { detail: `文件内容与扩展名 .${ext} 不符，或文件已损坏。支持 ${SUPPORTED_TEXT}。`, code: "content_mismatch" });
  const pdf = rule.sniff === "pdf";
  if (!pdf && size > KNOWLEDGE_NON_PDF_MAX) throw new Problem("too-large", { detail: "PDF 以外的文件不能超过 4 MB。", code: "retrieval_limit" });
  return { ext: ext === "jpeg" ? "jpg" : ext === "htm" ? "html" : ext === "tif" ? "tiff" : ext, mime: rule.mime, pdf };
}
