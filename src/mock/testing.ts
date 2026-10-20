// 测试辅助：按平台规则构造已签名的请求（只给 src/mock/**/*.test.ts 用）。
import { shopeeApiSign, tiktokApiSign } from "./signing";

const HOST = "http://127.0.0.1:3360";

export function testDatabaseUrl(): string {
  const raw = process.env.MOCK_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) throw new Error("需要 DATABASE_URL（测试会换成 shopilot_mock_test 库）");
  const u = new URL(raw);
  u.pathname = "/shopilot_mock_test";
  return u.toString();
}

export function shopeeRequest(o: {
  region: string;
  path: string;
  partnerId: string;
  key: string;
  method?: "GET" | "POST";
  accessToken?: string;
  shopId?: string;
  query?: Record<string, string>;
  body?: unknown;
  /** multipart 上传（upload_image、upload_video） */
  form?: FormData;
  ts?: number;
}): Request {
  const apiPath = `/api/v2/${o.path}`;
  const ts = o.ts ?? Math.floor(Date.now() / 1000);
  const q = new URLSearchParams({ partner_id: o.partnerId, timestamp: String(ts), sign: shopeeApiSign(o.key, o.partnerId, apiPath, ts, o.accessToken, o.shopId) });
  if (o.accessToken) q.set("access_token", o.accessToken);
  if (o.shopId) q.set("shop_id", o.shopId);
  for (const [k, v] of Object.entries(o.query ?? {})) q.set(k, v);
  const method = o.method ?? "GET";
  if (o.form) return new Request(`${HOST}/mock/shopee/${o.region}${apiPath}?${q}`, { method: "POST", body: o.form });
  return new Request(`${HOST}/mock/shopee/${o.region}${apiPath}?${q}`, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(o.body ?? {}) : undefined,
  });
}

export function tiktokRequest(o: {
  path: string;
  appKey: string;
  secret: string;
  method?: string;
  token?: string;
  cipher?: string;
  query?: Record<string, string>;
  body?: unknown;
  ts?: number;
}): { req: Request; apiPath: string } {
  const ts = o.ts ?? Math.floor(Date.now() / 1000);
  const params: Record<string, string> = { app_key: o.appKey, timestamp: String(ts), ...(o.cipher ? { shop_cipher: o.cipher } : {}), ...(o.query ?? {}) };
  const method = o.method ?? "GET";
  const body = method === "GET" ? "" : JSON.stringify(o.body ?? {});
  params.sign = tiktokApiSign(o.secret, o.path, params, body);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.token) headers["x-tts-access-token"] = o.token;
  return {
    req: new Request(`${HOST}/mock/tiktok/open-api${o.path}?${new URLSearchParams(params)}`, { method, headers, body: method === "GET" ? undefined : body }),
    apiPath: o.path,
  };
}
