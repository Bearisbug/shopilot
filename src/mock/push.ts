// 推送发送：同步 fetch POST 到回调地址，按平台签名，结果写 mock_push_log；支持重发。
import { and, desc, eq } from "drizzle-orm";
import { mockDb } from "./db/client";
import { mockApp, mockPushLog, type MockPlatform } from "./db/schema";
import { shopeePushSign, tiktokWebhookSign } from "./signing";

export const PUSH_TIMEOUT_MS = 5000;

type AppKeys = { platform: MockPlatform; appKey: string; secret: string; pushKey: string | null };

export function pushSignature(app: AppKeys, url: string, rawBody: string): string {
  return app.platform === "shopee" ? shopeePushSign(app.pushKey || app.secret, url, rawBody) : tiktokWebhookSign(app.secret, app.appKey, rawBody);
}

export type PushResult = { id: string; httpStatus: number | null; error: string | null };

async function post(app: AppKeys, url: string, rawBody: string): Promise<{ httpStatus: number | null; error: string | null; durationMs: number }> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: pushSignature(app, url, rawBody) },
      body: rawBody,
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });
    await res.arrayBuffer().catch(() => undefined);
    return { httpStatus: res.status, error: null, durationMs: Date.now() - started };
  } catch (e) {
    const err = e as Error;
    const msg = err.name === "TimeoutError" ? `超时（${PUSH_TIMEOUT_MS / 1000} 秒无响应）` : `连接失败：${err.message}`;
    return { httpStatus: null, error: msg, durationMs: Date.now() - started };
  }
}

async function loadApp(platform: MockPlatform, appKey: string): Promise<AppKeys | null> {
  const [app] = await mockDb().select().from(mockApp).where(and(eq(mockApp.platform, platform), eq(mockApp.appKey, appKey))).limit(1);
  return app ? { platform, appKey, secret: app.secret, pushKey: app.pushKey } : null;
}

export async function deliverPush(input: {
  platform: MockPlatform;
  appKey: string;
  shopId: string | null;
  event: number;
  url: string;
  body: Record<string, unknown>;
  summary: string;
}): Promise<PushResult | null> {
  const app = await loadApp(input.platform, input.appKey);
  if (!app) return null;
  const rawBody = JSON.stringify(input.body);
  const r = await post(app, input.url, rawBody);
  const [row] = await mockDb()
    .insert(mockPushLog)
    .values({
      platform: input.platform,
      appKey: input.appKey,
      shopId: input.shopId,
      event: input.event,
      targetUrl: input.url,
      rawBody,
      body: input.body,
      summary: input.summary.slice(0, 300),
      httpStatus: r.httpStatus,
      error: r.error,
      durationMs: r.durationMs,
    })
    .returning({ id: mockPushLog.id });
  return { id: row.id, httpStatus: r.httpStatus, error: r.error };
}

/** 按日志原样重发（同一 body、按当前密钥重新签名），新增一行日志。 */
export async function resendPush(logId: string): Promise<PushResult | null> {
  const [log] = await mockDb().select().from(mockPushLog).where(eq(mockPushLog.id, logId)).limit(1);
  if (!log) return null;
  const app = await loadApp(log.platform, log.appKey);
  if (!app) return null;
  const r = await post(app, log.targetUrl, log.rawBody);
  const [row] = await mockDb()
    .insert(mockPushLog)
    .values({
      platform: log.platform,
      appKey: log.appKey,
      shopId: log.shopId,
      event: log.event,
      targetUrl: log.targetUrl,
      rawBody: log.rawBody,
      body: log.body,
      summary: log.summary,
      httpStatus: r.httpStatus,
      error: r.error,
      durationMs: r.durationMs,
      resendOf: log.id,
    })
    .returning({ id: mockPushLog.id });
  return { id: row.id, httpStatus: r.httpStatus, error: r.error };
}

export async function recentPushLogs(limit = 50) {
  return mockDb().select().from(mockPushLog).orderBy(desc(mockPushLog.createdAt)).limit(limit);
}

/** 待发推送：业务写操作先落库，再由调用方决定同步等待（模拟器）或在响应后发出（平台接口）。 */
export type PendingPush = () => Promise<PushResult | null>;

export async function runPushes(list: Array<PendingPush | null | undefined>): Promise<Array<PushResult | null>> {
  const out: Array<PushResult | null> = [];
  for (const p of list) if (p) out.push(await p());
  return out;
}

/** 平台接口触发的推送在响应返回后发出，避免回调方处理推送时等待本次接口响应。 */
export function runPushesLater(list: Array<PendingPush | null | undefined>): void {
  const pending = list.filter(Boolean);
  if (pending.length === 0) return;
  setTimeout(() => {
    runPushes(pending).catch((e) => console.error("[mock] 推送失败", e));
  }, 50);
}
