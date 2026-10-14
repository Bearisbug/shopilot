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

async function once<T>(method: string, url: string, body: unknown, opts: { idempotencyKey?: string; timeoutMs: number; raw?: boolean }): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
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
        window.location.assign("/account/security");
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
  post<T>(url: string, body?: unknown, idempotencyKey?: string) {
    return once<T>("POST", url, body ?? {}, { timeoutMs: 30_000, idempotencyKey });
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
