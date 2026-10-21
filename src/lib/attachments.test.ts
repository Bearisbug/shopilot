import { describe, expect, it } from "vitest";
import { acceptFiles, ATTACH_MAX, checkMedia, runPlan, sendPlan, type SendStep } from "./attachments";

const MB = 1024 * 1024;
const img = (name: string, size = MB) => ({ name, type: "image/png", size });

describe("输入框附件：能不能加", () => {
  it("图片、视频与其他文件的判定", () => {
    expect(checkMedia({ type: "image/webp", size: MB }, "tiktok")).toEqual({ kind: "image" });
    expect(checkMedia({ type: "image/png", size: 11 * MB }, "shopee")).toEqual({ error: "图片 11.0 MB，超过 10 MB 上限。" });
    expect(checkMedia({ type: "image/gif", size: MB }, "shopee")).toEqual({ error: "只支持 JPG、PNG、WebP，不超过 10 MB。" });
    expect(checkMedia({ type: "video/mp4", size: MB }, "shopee")).toEqual({ kind: "video" });
    expect(checkMedia({ type: "video/quicktime", size: MB }, "shopee")).toEqual({ error: "只支持 MP4 视频，MOV 等格式请先导出为 MP4。" });
    expect(checkMedia({ type: "video/mp4", size: 31 * MB }, "shopee")).toEqual({ error: "视频 31.0 MB，超过 30 MB 上限。" });
    expect(checkMedia({ type: "application/pdf", size: MB }, "shopee")).toEqual({ error: "平台聊天只能发图片和 MP4 视频，PDF 等文件发不出去。" });
  });

  it("TikTok 视频：MP4、MOV、WebM 不超过 100 MB", () => {
    expect(checkMedia({ type: "video/mp4", size: 31 * MB }, "tiktok")).toEqual({ kind: "video" });
    expect(checkMedia({ type: "video/quicktime", size: MB }, "tiktok")).toEqual({ kind: "video" });
    expect(checkMedia({ type: "video/webm", size: 100 * MB }, "tiktok")).toEqual({ kind: "video" });
    expect(checkMedia({ type: "video/mp4", size: 101 * MB }, "tiktok")).toEqual({ error: "视频 101.0 MB，超过 100 MB 上限。" });
    expect(checkMedia({ type: "video/x-matroska", size: MB }, "tiktok")).toEqual({ error: "只支持 MP4、MOV、WebM 视频，其他格式请先导出为 MP4。" });
    expect(checkMedia({ type: "application/pdf", size: MB }, "tiktok")).toEqual({ error: "平台聊天只能发图片和 MP4、MOV、WebM 视频，PDF 等文件发不出去。" });
  });

  it("按给出的顺序加入，总数不超过上限；不能加的给原因（去重）", () => {
    const files = [img("a"), { name: "b.pdf", type: "application/pdf", size: MB }, img("c"), img("d")];
    const r = acceptFiles(files, ATTACH_MAX - 2, "shopee");
    expect(r.accepted.map((x) => x.file.name)).toEqual(["a", "c"]);
    expect(r.errors).toEqual(["平台聊天只能发图片和 MP4 视频，PDF 等文件发不出去。", `一次最多放 ${ATTACH_MAX} 个，后面的没有加入。`]);
    expect(acceptFiles([img("x"), img("y")], ATTACH_MAX, "tiktok").accepted).toEqual([]);
    expect(acceptFiles([{ name: "v", type: "video/mp4", size: MB }, { name: "w", type: "video/quicktime", size: MB }], 0, "tiktok").accepted.map((x) => x.kind)).toEqual(["video", "video"]);
  });
});

describe("输入框附件：发送顺序", () => {
  it("有文字先发文字，再按加入顺序发附件", () => {
    expect(sendPlan(true, ["1", "3"])).toEqual([{ kind: "text" }, { kind: "media", key: "1" }, { kind: "media", key: "3" }]);
    expect(sendPlan(false, ["2"])).toEqual([{ kind: "media", key: "2" }]);
  });

  it("逐条执行，上一条完成才开始下一条；失败就停下", async () => {
    const log: string[] = [];
    const exec = async (s: SendStep) => {
      const name = s.kind === "text" ? "text" : s.key;
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, 5));
      if (name === "2") throw new Error("平台拒绝");
      log.push(`end ${name}`);
    };
    const r = await runPlan(sendPlan(true, ["1", "2", "3"]), exec);
    expect(log).toEqual(["start text", "end text", "start 1", "end 1", "start 2"]);
    expect(r).toMatchObject({ done: 2, failed: { kind: "media", key: "2" } });
    expect((r.error as Error).message).toBe("平台拒绝");
    expect(await runPlan(sendPlan(false, ["1"]), async () => {})).toEqual({ done: 1, failed: null });
  });
});
