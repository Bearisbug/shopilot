// 平台 HTTP 调用：10 秒超时（§17），网络错与超时转成 PlatformError；不重试（写操作结果未知时由调用方决定）。
import { PlatformError, type PlatformName } from "./types";

export const PLATFORM_TIMEOUT_MS = 10_000;

export type RawResult = { status: number; json: Record<string, unknown> };

export async function platformFetch(platform: PlatformName, url: string, init: RequestInit, timeoutMs = PLATFORM_TIMEOUT_MS): Promise<RawResult> {
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    log(platform, init.method ?? "GET", url, null, Date.now() - started, timeout ? "timeout" : "network");
    throw new PlatformError(platform, timeout ? "timeout" : "network", timeout ? "request timed out" : String(e), timeout ? "timeout" : "network", 0);
  }
  const text = await res.text();
  log(platform, init.method ?? "GET", url, res.status, Date.now() - started);
  let json: Record<string, unknown> = {};
  if (text.trim()) {
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new PlatformError(platform, `http_${res.status}`, "response is not json", res.status >= 500 ? "server" : "param", res.status);
    }
  }
  return { status: res.status, json };
}

function log(platform: PlatformName, method: string, url: string, status: number | null, ms: number, error?: string) {
  // 只记路径，不记查询串（含 access_token、sign）
  const path = url.split("?")[0];
  console.log(JSON.stringify({ t: new Date().toISOString(), level: error || (status ?? 0) >= 400 ? "warn" : "info", msg: "platform call", platform, method, path, status, ms, error }));
}
