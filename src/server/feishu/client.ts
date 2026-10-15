// 飞书开放接口（只发卡片，不接回调）：应用接法换 tenant_access_token、列机器人所在的群、上传图片、往群里发卡片；
// 群自定义机器人按签名规则发卡片。FEISHU_MODE=stub 时用替身：不出网，按约定的输入返回成功或失败（见 stubFeishu）。
import { createHmac } from "node:crypto";
import { env } from "@/server/env";
import { sha256 } from "@/server/core/crypto";

export const FEISHU_BASE = "https://open.feishu.cn/open-apis";

export type FeishuApp = { appId: string; appSecret: string };
export type FeishuChat = { chatId: string; name: string };
export type FeishuCard = Record<string, unknown>;
/** 要传到飞书的图片：平台图片地址，或本机生成的字节 */
export type ImageSource = { url: string } | { bytes: Buffer; mime: string; name: string };

/**
 * credentials：App ID / Secret 不对；permission：应用缺权限；not_in_chat：机器人不在群里；signature：自定义机器人签名不对；
 * bad_request：飞书拒收请求体；rate_limited / timeout / network / other：可重试
 */
export type FeishuErrorKind = "credentials" | "permission" | "not_in_chat" | "signature" | "bad_request" | "rate_limited" | "timeout" | "network" | "other";

export class FeishuError extends Error {
  constructor(
    public kind: FeishuErrorKind,
    public code: number | null,
    message: string,
  ) {
    super(message);
  }
  get retryable(): boolean {
    return this.kind === "rate_limited" || this.kind === "timeout" || this.kind === "network" || this.kind === "other";
  }
}

export interface FeishuApi {
  /** 换一次 tenant_access_token，凭证不对抛 credentials */
  verifyApp(app: FeishuApp): Promise<void>;
  /** 机器人所在的群（GET /im/v1/chats，翻页取全） */
  listChats(app: FeishuApp): Promise<FeishuChat[]>;
  /** 往群里发一张卡片，返回 message_id */
  sendToChat(app: FeishuApp, chatId: string, card: FeishuCard): Promise<string>;
  /** 上传一张消息图片，返回 image_key */
  uploadImage(app: FeishuApp, image: ImageSource): Promise<string>;
  /** 群自定义机器人发卡片 */
  sendWebhook(url: string, secret: string, card: FeishuCard): Promise<void>;
}

export function feishuApi(): FeishuApi {
  return env().FEISHU_MODE === "live" ? liveFeishu : stubFeishu;
}

export const feishuIsStub = () => env().FEISHU_MODE !== "live";

// ---------- 自定义机器人：签名与地址校验 ----------

/** 飞书自定义机器人签名：以「timestamp + 换行 + 密钥」为 HMAC-SHA256 的 key，对空串签名，再 base64 */
export function webhookSign(timestamp: number, secret: string): string {
  return createHmac("sha256", `${timestamp}\n${secret}`).update("").digest("base64");
}

const WEBHOOK_HOSTS = new Set(["open.feishu.cn", "open.larksuite.com"]);

/** 只认飞书 / Lark 的自定义机器人地址（服务端会请求这个地址，其他主机一律拒绝）；返回规范化后的地址，不合格返回 null */
export function parseWebhookUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !WEBHOOK_HOSTS.has(u.hostname) || u.port || u.username || u.password) return null;
  if (!/^\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9-]{8,128}$/.test(u.pathname)) return null;
  return `https://${u.hostname}${u.pathname}`;
}

/** 地址末 4 位，界面上区分机器人 */
export const webhookHint = (url: string) => url.slice(-4);

// ---------- 错误码 ----------

const AUTH_CODES = new Set([99991661, 99991663, 99991664, 99991665, 99991668, 99991677]);
const PERMISSION_CODES = new Set([99991672, 99991679, 99991401]);

function classify(code: number, msg: string, context: "token" | "api" | "webhook"): FeishuError {
  const text = `飞书返回 ${code}：${msg}`;
  if (context === "token") return new FeishuError("credentials", code, `App ID 或 App Secret 不对（${text}）`);
  if (context === "webhook") {
    if (code === 19021) return new FeishuError("signature", code, `签名校验没有通过，请核对签名密钥（${text}）`);
    if (code === 19024) return new FeishuError("bad_request", code, `机器人开启了自定义关键词，卡片里没有命中关键词；请在机器人安全设置里改用签名校验（${text}）`);
    if (code === 19022) return new FeishuError("bad_request", code, `机器人开启了 IP 白名单，Shopilot 服务器不在白名单里（${text}）`);
    if (code === 11232) return new FeishuError("rate_limited", code, `发送太频繁，被飞书限流（${text}）`);
    if (code === 9499 || code === 19001 || code === 19002) return new FeishuError("bad_request", code, `飞书拒收了这张卡片（${text}）`);
    return new FeishuError("other", code, text);
  }
  if (AUTH_CODES.has(code)) return new FeishuError("credentials", code, `应用凭证已失效（${text}）`);
  if (PERMISSION_CODES.has(code)) return new FeishuError("permission", code, `应用缺少接口权限，请在飞书开放平台为应用开通后重新发布版本（${text}）`);
  if (code === 230002) return new FeishuError("not_in_chat", code, `机器人不在这个群里，请先把应用机器人拉进群（${text}）`);
  if (code === 230020 || code === 99991400) return new FeishuError("rate_limited", code, `发送太频繁，被飞书限流（${text}）`);
  if (code === 230001 || code === 230099 || code === 234001 || code === 234006) return new FeishuError("bad_request", code, `飞书拒收了这次请求（${text}）`);
  return new FeishuError("other", code, text);
}

// ---------- 真实实现 ----------

type FeishuJson = { code?: number; msg?: string; StatusCode?: number; StatusMessage?: string; data?: Record<string, unknown>; tenant_access_token?: string; expire?: number };

async function request(url: string, init: RequestInit, timeoutMs = 10_000): Promise<FeishuJson> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new FeishuError(timeout ? "timeout" : "network", null, timeout ? "飞书没有及时响应" : `连不上飞书：${e instanceof Error ? e.message : String(e)}`);
  }
  let body: FeishuJson;
  try {
    body = (await res.json()) as FeishuJson;
  } catch {
    throw new FeishuError(res.status >= 500 ? "other" : "bad_request", null, `飞书返回的不是 JSON（HTTP ${res.status}）`);
  }
  if (res.status === 429) throw new FeishuError("rate_limited", body.code ?? null, `发送太频繁，被飞书限流（HTTP 429）`);
  return body;
}

const tokens = new Map<string, { token: string; expiresAt: number; secretHash: string }>();

/** tenant_access_token 按 App ID 缓存（有效期约 2 小时，剩 5 分钟内换新）；force 时直接换新 */
async function tenantToken(app: FeishuApp, force = false): Promise<string> {
  const secretHash = sha256(app.appSecret);
  const hit = tokens.get(app.appId);
  if (!force && hit && hit.secretHash === secretHash && hit.expiresAt - Date.now() > 5 * 60_000) return hit.token;
  const body = await request(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: app.appId, app_secret: app.appSecret }),
  });
  if (body.code !== 0 || !body.tenant_access_token) {
    tokens.delete(app.appId);
    throw classify(body.code ?? -1, body.msg ?? "换取 tenant_access_token 失败", "token");
  }
  tokens.set(app.appId, { token: body.tenant_access_token, expiresAt: Date.now() + (body.expire ?? 7200) * 1000, secretHash });
  return body.tenant_access_token;
}

/** 带 token 调接口；鉴权失败时换一次 token 再试 */
async function authed(app: FeishuApp, path: string, init: RequestInit, timeoutMs?: number): Promise<Record<string, unknown>> {
  const call = async (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return request(`${FEISHU_BASE}${path}`, { ...init, headers }, timeoutMs);
  };
  let body = await call(await tenantToken(app));
  if (body.code !== 0 && AUTH_CODES.has(body.code ?? -1)) body = await call(await tenantToken(app, true));
  if (body.code !== 0) throw classify(body.code ?? -1, body.msg ?? "未知错误", "api");
  return body.data ?? {};
}

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

async function imageBytes(image: ImageSource): Promise<{ bytes: Buffer; mime: string; name: string }> {
  if ("bytes" in image) return image;
  let res: Response;
  try {
    res = await fetch(image.url, { signal: AbortSignal.timeout(8_000) });
  } catch {
    throw new FeishuError("network", null, "取不到买家图片");
  }
  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!res.ok || !mime.startsWith("image/")) throw new FeishuError("bad_request", null, `取不到买家图片（HTTP ${res.status}）`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > IMAGE_MAX_BYTES) throw new FeishuError("bad_request", null, "买家图片超过 10 MB，飞书不收");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > IMAGE_MAX_BYTES) throw new FeishuError("bad_request", null, "买家图片超过 10 MB，飞书不收");
  return { bytes, mime, name: `image.${mime.split("/")[1] || "jpg"}` };
}

export const liveFeishu: FeishuApi = {
  async verifyApp(app) {
    await tenantToken(app, true);
  },
  async listChats(app) {
    const chats: FeishuChat[] = [];
    let pageToken = "";
    for (let i = 0; i < 10; i++) {
      const data = await authed(app, `/im/v1/chats?page_size=100${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`, { method: "GET" });
      for (const item of (data.items as Array<{ chat_id?: string; name?: string }> | undefined) ?? []) {
        if (item.chat_id) chats.push({ chatId: item.chat_id, name: item.name || item.chat_id });
      }
      pageToken = typeof data.page_token === "string" ? data.page_token : "";
      if (!data.has_more || !pageToken) break;
    }
    return chats;
  },
  async sendToChat(app, chatId, card) {
    const data = await authed(app, "/im/v1/messages?receive_id_type=chat_id", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ receive_id: chatId, msg_type: "interactive", content: JSON.stringify(card) }),
    });
    return typeof data.message_id === "string" ? data.message_id : "";
  },
  async uploadImage(app, image) {
    const { bytes, mime, name } = await imageBytes(image);
    const form = new FormData();
    form.append("image_type", "message");
    form.append("image", new Blob([new Uint8Array(bytes)], { type: mime }), name);
    const data = await authed(app, "/im/v1/images", { method: "POST", body: form }, 15_000);
    if (typeof data.image_key !== "string") throw new FeishuError("other", null, "飞书没有返回 image_key");
    return data.image_key;
  },
  async sendWebhook(url, secret, card) {
    const safe = parseWebhookUrl(url);
    if (!safe) throw new FeishuError("bad_request", null, "不是飞书自定义机器人的地址");
    const timestamp = Math.floor(Date.now() / 1000);
    const body = await request(safe, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ timestamp: String(timestamp), sign: webhookSign(timestamp, secret), msg_type: "interactive", card }),
    });
    const code = body.code ?? body.StatusCode ?? -1;
    if (code !== 0) throw classify(code, body.msg ?? body.StatusMessage ?? "未知错误", "webhook");
  },
};

/** 测试用：清掉 token 缓存 */
export function resetFeishuTokens() {
  tokens.clear();
}

// ---------- 替身 ----------

/** 替身里的群：与真实接口一样只列机器人所在的群 */
export const STUB_CHATS: FeishuChat[] = [
  { chatId: "oc_stub_service", name: "Shopilot 客服群（替身）" },
  { chatId: "oc_stub_aftersale", name: "售后处理群（替身）" },
  { chatId: "oc_stub_th", name: "泰国站客服（替身）" },
];

/** 替身图片 key：带上来源地址，开发发件箱据此显示原图 */
export function stubImageKey(image: ImageSource): string {
  return "url" in image ? `img_stub_${Buffer.from(image.url).toString("base64url")}` : `img_stub_bytes_${image.bytes.length}`;
}

export function stubImageSource(key: string): string | null {
  if (!key.startsWith("img_stub_") || key.startsWith("img_stub_bytes_")) return null;
  try {
    return Buffer.from(key.slice("img_stub_".length), "base64url").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * 发送替身（FEISHU_MODE=stub）：不出网。约定：
 * App Secret 含 bad → 凭证不对；webhook 地址末段含 bad → 签名不对；群 oc_stub_gone → 机器人不在群里；
 * 买家图片地址含 bad → 上传失败。其余一律成功。
 */
export const stubFeishu: FeishuApi = {
  async verifyApp(app) {
    if (/bad/i.test(app.appSecret)) throw classify(10014, "app secret invalid", "token");
  },
  async listChats(app) {
    if (/bad/i.test(app.appSecret)) throw classify(10014, "app secret invalid", "token");
    return STUB_CHATS;
  },
  async sendToChat(app, chatId) {
    if (/bad/i.test(app.appSecret)) throw classify(10014, "app secret invalid", "token");
    if (chatId === "oc_stub_gone") throw classify(230002, "Bot is not in the chat", "api");
    return `om_stub_${crypto.randomUUID().replace(/-/g, "")}`;
  },
  async uploadImage(_app, image) {
    if ("url" in image && /bad/i.test(image.url)) throw new FeishuError("bad_request", null, "取不到买家图片（替身）");
    return stubImageKey(image);
  },
  async sendWebhook(url) {
    if (!parseWebhookUrl(url)) throw new FeishuError("bad_request", null, "不是飞书自定义机器人的地址");
    if (/bad/i.test(url.split("/").pop() ?? "")) throw classify(19021, "sign match fail or timestamp is not within one hour from current time", "webhook");
  },
};
