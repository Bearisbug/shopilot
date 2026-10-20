// 前端请求客户端（DESIGN §8 通用约定）：请求关联 ID、problem+json 解析、超时；只有读请求自动重试 1 次。
import type { Problem } from "@/contracts/common";

export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem;
  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.status = problem.status;
    this.problem = problem;
  }
  get type() {
    return this.problem.type.replace("/errors/", "");
  }
}

function requestId() {
  return `req_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function once<T>(method: string, url: string, body: unknown, opts: { idempotencyKey?: string; timeoutMs: number; raw?: boolean; signal?: AbortSignal }): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  opts.signal?.addEventListener("abort", () => ctrl.abort(), { once: true });
  const rid = requestId();
  try {
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: {
        "x-request-id": rid,
        ...(body !== undefined && !isForm ? { "content-type": "application/json" } : {}),
        ...(opts.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const ct = res.headers.get("content-type") ?? "";
      const problem: Problem = ct.includes("json")
        ? await res.json()
        : { type: "/errors/internal", title: "请求失败", status: res.status, instance: url, requestId: res.headers.get("x-request-id") ?? rid };
      // 限频等响应带 Retry-After：放进 extra.retryAfter（秒），页面据此倒计时
      const retryAfter = Number(res.headers.get("retry-after"));
      if (retryAfter > 0 && problem.extra?.retryAfter === undefined) problem.extra = { ...problem.extra, retryAfter };
      if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth") && !window.location.pathname.startsWith("/login")) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.assign(`/login?next=${next}&reason=expired`);
      }
      if (problem.type === "/errors/two-factor-required" && typeof window !== "undefined" && window.location.pathname !== "/account/security") {
        window.location.assign(`/account/security?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      }
      throw new ApiError(problem);
    }
    if (opts.raw) return res as T;
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError({ type: "/errors/platform-timeout", title: "请求超时", detail: "服务器没有及时响应，结果未知，请先刷新确认。", status: 504, instance: url, requestId: rid });
    }
    throw new ApiError({ type: "/errors/internal", title: "网络连接失败", detail: "请检查网络后重试。", status: 0, instance: url, requestId: rid });
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  async get<T>(url: string): Promise<T> {
    try {
      return await once<T>("GET", url, undefined, { timeoutMs: 15_000 });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) return once<T>("GET", url, undefined, { timeoutMs: 15_000 });
      throw e;
    }
  },
  /** signal 由调用方取消（如防抖请求被新输入取代）；取消后同样抛超时类 ApiError，调用方据 signal.aborted 忽略 */
  post<T>(url: string, body?: unknown, idempotencyKey?: string, timeoutMs = 30_000, signal?: AbortSignal) {
    return once<T>("POST", url, body ?? {}, { timeoutMs, idempotencyKey, signal });
  },
  put<T>(url: string, body: unknown, idempotencyKey?: string) {
    return once<T>("PUT", url, body, { timeoutMs: 30_000, idempotencyKey });
  },
  patch<T>(url: string, body: unknown) {
    return once<T>("PATCH", url, body, { timeoutMs: 30_000 });
  },
  delete<T>(url: string) {
    return once<T>("DELETE", url, undefined, { timeoutMs: 30_000 });
  },
  upload<T>(url: string, form: FormData) {
    return once<T>("POST", url, form, { timeoutMs: 60_000 });
  },
  /** 带上传进度的上传：fetch 拿不到上传进度，改用 XMLHttpRequest；错误同样按 problem 抛 ApiError（登录过期由页面上的下一次读请求带去登录页） */
  uploadWithProgress<T>(url: string, form: FormData, onProgress: (ratio: number) => void, idempotencyKey?: string): Promise<T> {
    const rid = requestId();
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.timeout = 120_000;
      xhr.setRequestHeader("x-request-id", rid);
      if (idempotencyKey) xhr.setRequestHeader("idempotency-key", idempotencyKey);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        const ct = xhr.getResponseHeader("content-type") ?? "";
        const body = ct.includes("json") && xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
        if (xhr.status >= 200 && xhr.status < 300) return resolve(body as T);
        const problem: Problem = body ?? { type: "/errors/internal", title: "请求失败", status: xhr.status, instance: url, requestId: xhr.getResponseHeader("x-request-id") ?? rid };
        reject(new ApiError(problem));
      };
      xhr.onerror = () => reject(new ApiError({ type: "/errors/internal", title: "网络连接失败", detail: "请检查网络后重试。", status: 0, instance: url, requestId: rid }));
      xhr.ontimeout = () =>
        reject(new ApiError({ type: "/errors/platform-timeout", title: "请求超时", detail: "服务器没有及时响应，结果未知，请先刷新确认。", status: 504, instance: url, requestId: rid }));
      xhr.send(form);
    });
  },
  /** 下载文件：出错时同样按 problem 抛 ApiError；成功返回原始响应，由调用方读 blob（超时只管到响应头） */
  download(url: string) {
    return once<Response>("GET", url, undefined, { timeoutMs: 30_000, raw: true });
  },
};

export const newKey = () => crypto.randomUUID();

/** 错误提示文案：标题 + 原因 + 请求编号（IA-009）；响应里没有请求编号时不拼 */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const text = e.problem.detail ?? e.problem.title;
    return e.problem.requestId ? `${text}（请求编号 ${e.problem.requestId}）` : text;
  }
  return "操作没有成功，请重试。";
}
