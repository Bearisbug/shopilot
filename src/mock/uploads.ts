// 图片上传存储（${DATA_DIR}/mock-uploads/）、尺寸解析、示例图生成。
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { eq } from "drizzle-orm";
import { mockDb } from "./db/client";
import { mockUpload, type MockPlatform } from "./db/schema";
import { uploadDir } from "./env";
import { uploadId } from "./ids";

export type ImageInfo = { mime: string; width: number; height: number };

/** 识别 PNG / JPEG / GIF / WebP 并读出宽高；不认识返回 null。 */
export function imageInfo(buf: Buffer): ImageInfo | null {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { mime: "image/png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "GIF") {
    return { mime: "image/gif", width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { mime: "image/webp", width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === "VP8 ") return { mime: "image/webp", width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { mime: "image/webp", width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mime: "image/jpeg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type StoredUpload = { id: string; width: number; height: number; mime: string; size: number };

export async function saveUpload(platform: MockPlatform, shopId: string | null, filename: string, data: Buffer): Promise<StoredUpload | null> {
  const info = imageInfo(data);
  if (!info) return null;
  const id = uploadId();
  await mkdir(uploadDir(), { recursive: true });
  await writeFile(path.join(uploadDir(), id), data);
  await mockDb().insert(mockUpload).values({ id, platform, shopId, filename: filename.slice(0, 200), mime: info.mime, size: data.length, width: info.width, height: info.height });
  return { id, ...info, size: data.length };
}

export async function readUpload(id: string): Promise<{ data: Buffer; mime: string } | null> {
  if (!/^[0-9a-f]{24}$/.test(id)) return null;
  const [row] = await mockDb().select().from(mockUpload).where(eq(mockUpload.id, id)).limit(1);
  if (!row) return null;
  try {
    return { data: await readFile(path.join(uploadDir(), id)), mime: row.mime };
  } catch {
    return null;
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 由种子字符串派生柔和底色 + 斜向条纹的 PNG，作商品图与模拟器「示例图片」。 */
export function samplePng(seed: string, width = 480, height = 360): Buffer {
  const h = createHash("sha256").update(seed).digest();
  const base = [150 + (h[0] % 90), 150 + (h[1] % 90), 150 + (h[2] % 90)];
  const stripe = base.map((v) => Math.max(0, v - 40));
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const c = Math.floor((x + y) / 24) % 2 === 0 ? base : stripe;
      raw[row + 1 + x * 3] = c[0];
      raw[row + 2 + x * 3] = c[1];
      raw[row + 3 + x * 3] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 示例图 URL：/mock/files/sample-<seed>（seed 只含字母数字与连字符） */
export function sampleImageUrl(base: string, seed: string): string {
  return `${base}/mock/files/sample-${seed.replace(/[^A-Za-z0-9-]/g, "")}`;
}

export function fileUrl(base: string, id: string): string {
  return `${base}/mock/files/${id}`;
}
