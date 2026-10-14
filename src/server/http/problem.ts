// RFC 9457 problem+json（DESIGN §14）。title、detail 是给用户看的中文。
export type ProblemType =
  | "validation" | "unauthenticated" | "invalid-login" | "forbidden" | "owner-only" | "two-factor-required" | "ip-blocked"
  | "not-found" | "conflict" | "duplicate" | "not-allowed" | "callback-occupied" | "expired" | "locked"
  | "payment-failed" | "too-large" | "unsupported-type" | "platform-credentials" | "rate-limited" | "internal"
  | "platform" | "ai-unavailable" | "platform-timeout" | "signature";

const STATUS: Record<ProblemType, number> = {
  validation: 422, unauthenticated: 401, "invalid-login": 401, forbidden: 403, "owner-only": 403, "two-factor-required": 403,
  "ip-blocked": 403, "not-found": 404, conflict: 409, duplicate: 409, "not-allowed": 409, "callback-occupied": 409, expired: 410,
  locked: 423, "payment-failed": 402, "too-large": 413, "unsupported-type": 415, "platform-credentials": 422, "rate-limited": 429,
  internal: 500, platform: 502, "ai-unavailable": 502, "platform-timeout": 504, signature: 401,
};

const DEFAULT_TITLE: Record<ProblemType, string> = {
  validation: "提交的内容有误", unauthenticated: "请先登录", "invalid-login": "邮箱或密码不正确", forbidden: "没有权限",
  "owner-only": "只有账号所有者能操作", "two-factor-required": "需要先开启两步验证", "ip-blocked": "当前网络不在商户允许的 IP 范围内",
  "not-found": "找不到或已删除", conflict: "状态已被他人改变", duplicate: "已经存在", "not-allowed": "当前不能这样操作",
  "callback-occupied": "应用的推送回调已指向其他系统", expired: "链接已失效", locked: "登录已暂时锁定", "payment-failed": "支付失败",
  "too-large": "文件太大", "unsupported-type": "文件类型不支持", "platform-credentials": "平台凭证校验没有通过", "rate-limited": "操作太频繁",
  internal: "服务器出错了", platform: "平台返回错误", "ai-unavailable": "AI 暂时不可用", "platform-timeout": "平台没有及时响应", signature: "签名不正确",
};

export class Problem extends Error {
  readonly type: ProblemType;
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  readonly code?: string;
  readonly extra?: Record<string, unknown>;
  readonly headers?: Record<string, string>;

  constructor(type: ProblemType, opts: { title?: string; detail?: string; code?: string; extra?: Record<string, unknown>; headers?: Record<string, string> } = {}) {
    super(opts.detail ?? opts.title ?? DEFAULT_TITLE[type]);
    this.type = type;
    this.status = STATUS[type];
    this.title = opts.title ?? DEFAULT_TITLE[type];
    this.detail = opts.detail;
    this.code = opts.code;
    this.extra = opts.extra;
    this.headers = opts.headers;
  }

  toResponse(instance: string, requestId: string): Response {
    const body = { type: `/errors/${this.type}`, title: this.title, status: this.status, detail: this.detail, instance, requestId, code: this.code, extra: this.extra };
    return new Response(JSON.stringify(body), {
      status: this.status,
      headers: { "content-type": "application/problem+json; charset=utf-8", "cache-control": "no-store", "x-request-id": requestId, ...this.headers },
    });
  }
}

export const notFound = (detail?: string) => new Problem("not-found", { detail });
export const forbidden = (detail?: string, code?: string) => new Problem("forbidden", { detail, code });
export const conflict = (detail: string, extra?: Record<string, unknown>, code?: string) => new Problem("conflict", { detail, extra, code });
export const notAllowed = (detail: string, code?: string) => new Problem("not-allowed", { detail, code });
export const validation = (detail: string, fields?: Record<string, string>) => new Problem("validation", { detail, extra: fields ? { fields } : undefined });
