// 从文件头识别 JPG / PNG / WebP 与宽高、MP4 视频（API-CONV-010 只收这几种）；不认识返回 null。
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

/** MP4：第 4–8 字节是 ftyp。主品牌是 qt（苹果 MOV）的不算：Shopee 聊天视频只实测过 MP4 */
export function isMp4(b: Buffer): boolean {
  return b.length >= 12 && b.toString("ascii", 4, 8) === "ftyp" && b.toString("ascii", 8, 12) !== "qt  ";
}
