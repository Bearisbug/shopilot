// 会话媒体下载（API-CONV-017）：文件名与扩展名、拉取平台媒体时的过期、上限与超时。平台用本机临时 HTTP 服务模拟
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Problem } from "@/server/http/problem";
import { fetchMedia, mediaExtension, mediaFilename } from "./media";

describe("媒体下载文件名", () => {
  it("扩展名按 content-type 定，认不得时取地址里的扩展名，都没有用 bin", () => {
    expect(mediaExtension("image/jpeg", "https://down-my.img.susercontent.com/file/vn-11134231-abc")).toBe("jpg");
    expect(mediaExtension("video/mp4; charset=binary", "https://v/x")).toBe("mp4");
    expect(mediaExtension("image/webp", "https://p16/x.jpeg")).toBe("webp");
    expect(mediaExtension("application/octet-stream", "https://v16/obj/v.MP4?x-expires=1&sig=a.b")).toBe("mp4");
    expect(mediaExtension(null, "https://down-my.img.susercontent.com/file/vn-11134231-abc")).toBe("bin");
  });
  it("店名-商户时区的发送时间-消息短 ID；店名里的路径字符换成下划线", () => {
    const at = new Date(Date.UTC(2026, 9, 14, 16, 5, 9));
    expect(mediaFilename("Obsbot Official MY", at, "Asia/Kuala_Lumpur", "01a13b10-f4e3-74bf-8fc9-14cc816075d0", "mp4")).toBe("Obsbot Official MY-20261015-000509-816075d0.mp4");
    expect(mediaFilename('a/b:c*"d"', at, "UTC", "01a13b10-f4e3-74bf-8fc9-14cc816075d0", "jpg")).toBe("a_b_c_d_-20261014-160509-816075d0.jpg");
  });
});

describe("拉取平台媒体", () => {
  let server: Server;
  let base = "";
  const limits = { maxBytes: 1000, headTimeoutMs: 300, idleTimeoutMs: 300 };
  beforeAll(async () => {
    server = createServer((req, res) => {
      const path = req.url ?? "";
      if (path === "/ok") {
        res.writeHead(200, { "content-type": "video/mp4", "content-length": "600" });
        res.end(Buffer.alloc(600, 1));
      } else if (path === "/expired") {
        res.writeHead(403, { "content-type": "application/json" });
        res.end("{}");
      } else if (path === "/broken") {
        res.writeHead(502);
        res.end();
      } else if (path === "/declared-big") {
        res.writeHead(200, { "content-type": "video/mp4", "content-length": "5000" });
        res.end(Buffer.alloc(5000));
      } else if (path === "/chunked-big") {
        // 不声明长度，边传边超过上限
        res.writeHead(200, { "content-type": "video/mp4" });
        for (let i = 0; i < 5; i++) res.write(Buffer.alloc(400));
        res.end();
      } else if (path === "/slow-head") {
        setTimeout(() => res.end("late"), 1000);
      } else if (path === "/stall") {
        res.writeHead(200, { "content-type": "video/mp4" });
        res.write(Buffer.alloc(10));
        // 之后不再发数据，也不结束
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  const problemOf = async (p: Promise<unknown>) => {
    const e = await p.catch((err: unknown) => err);
    expect(e).toBeInstanceOf(Problem);
    return e as Problem;
  };

  it("正常文件：原样流过，带类型与长度", async () => {
    const up = await fetchMedia(`${base}/ok`, limits);
    expect(up).toMatchObject({ type: "video/mp4", size: 600 });
    expect((await new Response(up.body).arrayBuffer()).byteLength).toBe(600);
  });
  it("平台 4xx 当作链接过期（410），5xx 是平台出错（502）", async () => {
    expect(await problemOf(fetchMedia(`${base}/expired`, limits))).toMatchObject({ type: "expired", status: 410, code: "media_expired" });
    expect(await problemOf(fetchMedia(`${base}/broken`, limits))).toMatchObject({ type: "platform", status: 502 });
  });
  it("声明长度超过上限直接拒绝（413）；没声明长度的边传边数，超过就断开", async () => {
    expect(await problemOf(fetchMedia(`${base}/declared-big`, limits))).toMatchObject({ type: "too-large", status: 413 });
    const up = await fetchMedia(`${base}/chunked-big`, limits);
    expect(up.size).toBeNull();
    expect(await problemOf(new Response(up.body).arrayBuffer())).toMatchObject({ type: "too-large" });
  });
  it("响应头超时（504）；传输中空闲超时断开", async () => {
    expect(await problemOf(fetchMedia(`${base}/slow-head`, limits))).toMatchObject({ type: "platform-timeout", status: 504 });
    const up = await fetchMedia(`${base}/stall`, limits);
    await expect(new Response(up.body).arrayBuffer()).rejects.toThrow();
  });
  it("连不上时是平台出错（502）", async () => {
    expect(await problemOf(fetchMedia("http://127.0.0.1:1/x", limits))).toMatchObject({ type: "platform", status: 502 });
  });
});
