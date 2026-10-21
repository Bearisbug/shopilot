// 从文件头识别 JPG / PNG / WebP 与宽高、MP4 / MOV / WebM 视频（API-CONV-010 只收这几种）；不认识返回 null。
export type ImageInfo = { mime: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp"; width: number; height: number };

export function imageInfo(b: Buffer): ImageInfo | null {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { mime: "image/png", ext: "png", width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length >= 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { mime: "image/webp", ext: "webp", width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (chunk === "VP8L") {
      const bits = b.readUInt32LE(21);
      return { mime: "image/webp", ext: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8 ") return { mime: "image/webp", ext: "webp", width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      // SOF0..SOF15（不含 DHT C4、JPG C8、DAC CC）带尺寸
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mime: "image/jpeg", ext: "jpg", height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return { mime: "image/jpeg", ext: "jpg", width: 0, height: 0 };
  }
  return null;
}

export type VideoInfo = { mime: "video/mp4" | "video/quicktime" | "video/webm"; ext: "mp4" | "mov" | "webm" };

/** MP4 与 MOV：第 4–8 字节是 ftyp，主品牌 qt 的是 MOV；WebM：EBML 头（1A 45 DF A3）且 DocType 是 webm（MKV 的是 matroska，不认） */
export function videoInfo(b: Buffer): VideoInfo | null {
  if (b.length >= 12 && b.toString("ascii", 4, 8) === "ftyp") return b.toString("ascii", 8, 12) === "qt  " ? { mime: "video/quicktime", ext: "mov" } : { mime: "video/mp4", ext: "mp4" };
  if (b.length >= 4 && b.readUInt32BE(0) === 0x1a45dfa3 && b.subarray(0, 64).includes("webm")) return { mime: "video/webm", ext: "webm" };
  return null;
}

/** 视频宽高的上限：8K（8192 × 4320）横竖都放得下 */
export const VIDEO_SIDE_MAX = 8192;

/**
 * 上传视频时浏览器读出的宽高（API-CONV-010 的可选字段 width、height，服务端不解码视频）：
 * 两个都没给返回 null；给了就要两个都是 1–8192 的整数，否则返回 "invalid"
 */
export function videoDims(width: FormDataEntryValue | null, height: FormDataEntryValue | null): { width: number; height: number } | null | "invalid" {
  if (width === null && height === null) return null;
  const side = (v: FormDataEntryValue | null) => (typeof v === "string" && /^[1-9]\d{0,4}$/.test(v) && Number(v) <= VIDEO_SIDE_MAX ? Number(v) : null);
  const w = side(width);
  const h = side(height);
  return w && h ? { width: w, height: h } : "invalid";
}
