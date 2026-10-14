// 模拟平台路由共用：开关、请求 ID、JSON 响应、对外地址。
import { randomBytes } from "node:crypto";
import { mockBaseUrl } from "./env";

export function newRequestId(): string {
  return randomBytes(16).toString("hex");
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function notFoundResponse(): Response {
  return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}

/** 请求的对外 origin（用于拼文件 URL），取不到时回退 APP_BASE_URL。 */
export function originOf(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return mockBaseUrl();
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function toSec(d: Date | null | undefined): number {
  return d ? Math.floor(d.getTime() / 1000) : 0;
}
