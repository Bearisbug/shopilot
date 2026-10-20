import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { imageInfo, isMp4 } from "./image";

function png(w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const chunk = (t: string, d: Buffer) => Buffer.concat([Buffer.alloc(4), Buffer.from(t), d, Buffer.alloc(4)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.alloc(1)))]);
}

describe("聊天图片格式识别", () => {
  it("PNG 宽高", () => expect(imageInfo(png(320, 200))).toMatchObject({ mime: "image/png", width: 320, height: 200 }));
  it("JPEG SOF0 宽高", () => {
    const sof = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0xc8, 0x03]);
    expect(imageInfo(Buffer.concat([sof, Buffer.alloc(20)]))).toMatchObject({ mime: "image/jpeg", width: 200, height: 100 });
  });
  it("GIF 与随机字节不认", () => {
    expect(imageInfo(Buffer.from("GIF89a" + "\0".repeat(20)))).toBeNull();
    expect(imageInfo(Buffer.from("hello world, not an image"))).toBeNull();
  });
});

describe("聊天视频格式识别", () => {
  const box = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftyp"), Buffer.from(brand), Buffer.alloc(12)]);
  it("MP4（isom、mp42）认", () => {
    expect(isMp4(box("isom"))).toBe(true);
    expect(isMp4(box("mp42"))).toBe(true);
  });
  it("MOV（qt）与非视频不认", () => {
    expect(isMp4(box("qt  "))).toBe(false);
    expect(isMp4(Buffer.from("not a video at all"))).toBe(false);
  });
});
