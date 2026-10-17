import { describe, expect, it } from "vitest";
import { detectLanguage, replyLanguage } from "./language";

describe("回复语言判定（§12.8）", () => {
  it("按书写判泰语、中文、越南语", () => {
    expect(detectLanguage("สรุปทำไม่ได้ใช่ไหม", "TH")).toBe("th");
    expect(detectLanguage("พอจะจ่ายตังมันไม่มีให้เลือก paylater เลยค่ะ", "TH")).toBe("th");
    expect(detectLanguage("Tiny 3 能连 iPad 吗", "MY")).toBe("zh");
    expect(detectLanguage("Nếu ko có máy tính có sd được ko ạ", "VN")).toBe("vi");
  });

  it("拉丁字母按常用词在英语与站点本地语言之间判", () => {
    expect(detectLanguage("Got sell the remote for tail2? And how much", "MY")).toBe("en");
    expect(detectLanguage("tiada gambar bungkus sebab pihak tuan tidak info awal", "MY")).toBe("ms");
    expect(detectLanguage("Bakit po hindi successful pick up", "PH")).toBe("tl");
    expect(detectLanguage("Chat with Seller", "PH")).toBe("en");
    expect(detectLanguage("shop oi cho minh hoi", "VN")).toBe("vi");
    expect(detectLanguage("cái nào", "VN")).toBe("vi");
    expect(detectLanguage("Kak, barang sudah dikirim belum?", "ID")).toBe("id");
    expect(detectLanguage("Camera usb-c connect to TV usb-a", "TH")).toBe("en");
  });

  it("只有数字、表情或寒暄词判不出", () => {
    for (const t of ["0123438960", "👍", "???", "ok", "Hi", "yes"]) expect(detectLanguage(t, "MY")).toBeNull();
  });

  it("从新到旧找第一条判得出的，都判不出用站点默认，表外站点用英语", () => {
    expect(replyLanguage(["👍", "Nếu ko có máy tính có sd được ko ạ"], "VN")).toBe("Vietnamese");
    expect(replyLanguage(["ok", "สวัสดีครับ"], "TH")).toBe("Thai");
    expect(replyLanguage(["0123438960"], "MY")).toBe("Malay");
    expect(replyLanguage([], "TH")).toBe("Thai");
    expect(replyLanguage(["12345"], "PH")).toBe("English");
    expect(replyLanguage(["12345"], "BR")).toBe("English");
    expect(replyLanguage(["保修多久"], null)).toBe("Simplified Chinese");
  });
});
