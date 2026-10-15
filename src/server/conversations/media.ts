// 会话媒体下载（API-CONV-017）：取这条图片、视频或贴纸消息 payload 里的媒体地址，服务端拉取后以附件流式返回。
// 平台 CDN 跨域，浏览器的 <a download> 不生效，所以经这里转一道。不接收任何 URL 参数（防 SSRF），只认库里这条消息自己的地址；
// 能看这个会话才能下载（loadVisible，与会话详情同一套可见范围）。
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { and, eq } from "drizzle-orm";
import type { MemberContext } from "@/server/auth/context";
import { db, schema } from "@/server/db/client";
import { dataPath } from "@/server/files/storage";
import { Problem } from "@/server/http/problem";
import { inTzText } from "@/server/settings/data";
import { loadVisible } from "./queries";

const MEDIA_TYPES = new Set(["image", "video", "sticker"]);
/** 单个文件上限 200 MB（TikTok 聊天视频上限 100 MB） */
const MEDIA_MAX_BYTES = 200 * 1024 * 1024;
/** 平台 15 秒内没给响应头就放弃；传输中 30 秒没有新数据就断开 */
const HEAD_TIMEOUT_MS = 15_000;
const IDLE_TIMEOUT_MS = 30_000;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** 扩展名按响应头的 content-type 定；平台没给认得的类型时取地址里的扩展名，都没有用 bin */
export function mediaExtension(contentType: string | null, url: string): string {
  const mime = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (EXT[mime]) return EXT[mime];
  const fromPath = /\.([a-z0-9]{2,4})$/i.exec(new URL(url, "http://x").pathname)?.[1];
  return fromPath ? fromPath.toLowerCase() : "bin";
}

/** 文件名：店名-发送时间-消息短 ID.扩展名；店名里文件系统不认的字符换成下划线 */
export function mediaFilename(shopName: string, sentAt: Date, tz: string, messageId: string, ext: string): string {
  const shop = shopName.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim() || "shop";
  return `${shop}-${inTzText(sentAt, tz, "yyyyMMdd-HHmmss")}-${messageId.replace(/-/g, "").slice(-8)}.${ext}`;
}

function attachment(body: ReadableStream<Uint8Array>, contentType: string, filename: string, size: number | null): Response {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      ...(size !== null ? { "content-length": String(size) } : {}),
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function messageMedia(ctx: MemberContext, conversationId: string, messageId: string): Promise<Response> {
  const conv = await loadVisible(ctx, conversationId);
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) throw new Problem("not-found");
  const [m] = await db()
    .select()
    .from(schema.message)
    .where(and(eq(schema.message.id, messageId), eq(schema.message.conversationId, conv.id)))
    .limit(1);
  if (!m || !MEDIA_TYPES.has(m.type)) throw new Problem("not-found", { detail: "这条消息没有可下载的图片或视频。" });
  const [shop] = await db().select({ name: schema.shop.name }).from(schema.shop).where(eq(schema.shop.id, conv.shopId)).limit(1);
  const name = (ext: string) => mediaFilename(shop?.name ?? "", m.sentAt, ctx.merchant.timezone, m.id, ext);
  const p = (m.payload ?? {}) as Record<string, unknown>;
  const url = typeof p.url === "string" ? p.url : "";

  // 本方发出的图片在平台回传地址之前，地址是自家文件接口：直接读本商户的文件
  if (!/^https?:\/\//i.test(url)) {
    if (typeof p.fileId !== "string") throw new Problem("not-found", { detail: "这条消息没有可下载的图片或视频。" });
    const [file] = await db().select().from(schema.file).where(and(eq(schema.file.id, p.fileId), eq(schema.file.merchantId, ctx.merchant.id))).limit(1);
    const info = file ? await stat(dataPath(file.path)).catch(() => null) : null;
    if (!file || !info) throw new Problem("not-found", { detail: "文件已不存在。" });
    return attachment(Readable.toWeb(createReadStream(dataPath(file.path))) as ReadableStream<Uint8Array>, file.mime, name(mediaExtension(file.mime, file.path)), info.size);
  }

  const up = await fetchMedia(url);
  return attachment(up.body, up.type, name(mediaExtension(up.type, url)), up.size);
}

/**
 * 拉取平台媒体：响应头超时、4xx 当作链接过期（TikTok 签名过期 403、Shopee 已删 404）、超过上限拒绝；
 * 没声明长度时边传边数，超过上限就断开；传输中空闲超时同样断开上游
 */
export async function fetchMedia(url: string, limits = { maxBytes: MEDIA_MAX_BYTES, headTimeoutMs: HEAD_TIMEOUT_MS, idleTimeoutMs: IDLE_TIMEOUT_MS }) {
  const ctrl = new AbortController();
  let timer = setTimeout(() => ctrl.abort(), limits.headTimeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal, cache: "no-store", redirect: "follow" });
  } catch {
    clearTimeout(timer);
    throw ctrl.signal.aborted
      ? new Problem("platform-timeout", { detail: "平台的媒体服务器没有及时响应，请稍后重试。" })
      : new Problem("platform", { detail: "连不上平台的媒体服务器，请稍后重试。" });
  }
  clearTimeout(timer);
  const fail = (problem: Problem) => {
    void res.body?.cancel().catch(() => {});
    return problem;
  };
  if (res.status >= 400 && res.status < 500) throw fail(new Problem("expired", { title: "链接已过期", detail: "平台的媒体链接已过期，请到平台卖家后台查看这条消息。", code: "media_expired" }));
  if (!res.ok || !res.body) throw fail(new Problem("platform", { detail: "平台的媒体服务器出错，请稍后重试。" }));
  const declared = Number(res.headers.get("content-length"));
  const size = Number.isFinite(declared) && declared > 0 ? declared : null;
  const tooLarge = () => new Problem("too-large", { detail: `文件超过 ${Math.round(limits.maxBytes / 1024 / 1024)} MB，请到平台卖家后台查看。` });
  if (size !== null && size > limits.maxBytes) throw fail(tooLarge());

  let total = 0;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => ctrl.abort(), limits.idleTimeoutMs);
  };
  const body = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      start: arm,
      transform(chunk, out) {
        total += chunk.byteLength;
        if (total > limits.maxBytes) {
          clearTimeout(timer);
          ctrl.abort();
          out.error(tooLarge());
          return;
        }
        arm();
        out.enqueue(chunk);
      },
      flush: () => clearTimeout(timer),
    }),
  );
  return { body, type: res.headers.get("content-type") ?? "application/octet-stream", size };
}
