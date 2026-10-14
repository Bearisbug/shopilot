// Better Auth 端点（API-AUTH-002、API-AUTH-003、API-AUTH-008）。包一层：登录锁定、登录记录、错误转成 problem+json。
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/auth";
import { requestIp } from "@/server/auth/context";
import { lockRemainingSeconds, merchantIdsOf, postLoginGate, recordLogin, userIdByEmail } from "@/server/auth/login-guard";
import { Problem, type ProblemType } from "@/server/http/problem";

const handlers = () => toNextJsHandler(auth());

function problemFrom(res: Response, body: { code?: string; message?: string } | null, instance: string): Response {
  const map: Record<number, ProblemType> = { 400: "validation", 401: "invalid-login", 403: "forbidden", 404: "not-found", 409: "conflict", 422: "validation", 423: "locked", 429: "rate-limited" };
  const type = map[res.status] ?? "internal";
  const detail =
    body?.code === "INVALID_EMAIL_OR_PASSWORD" ? "邮箱或密码不正确。"
    : body?.code === "INVALID_CODE" || body?.code === "INVALID_TWO_FACTOR_CODE" ? "验证码不正确。"
    : body?.code === "PASSWORD_TOO_SHORT" ? "密码至少 10 位。"
    : body?.code === "INVALID_PASSWORD" ? "密码不正确。"
    : body?.message;
  return new Problem(type, { detail, code: body?.code?.toLowerCase() }).toResponse(instance, `req_auth_${Date.now()}`);
}

/** 登录成功后的商户策略拦截：停用账号、IP 白名单 */
async function gate(userId: string, email: string, ip: string, ua: string | null, instance: string): Promise<Response | null> {
  const blocked = await postLoginGate(userId, ip);
  if (!blocked) return null;
  await recordLogin({ email, userId, merchantId: blocked.merchantId, result: "failure", reason: blocked.reason, ip, userAgent: ua });
  const problem =
    blocked.reason === "ip_blocked"
      ? new Problem("ip-blocked", { detail: `当前网络（${ip}）不在商户允许的 IP 范围内，请联系管理员。` })
      : new Problem("forbidden", { detail: "你的账号已被管理员停用，请联系管理员。", code: "member_disabled" });
  return problem.toResponse(instance, `req_auth_${Date.now()}`);
}

/** Better Auth 限频（429）只给英文提示和 X-Retry-After：换成中文提示，并带标准 Retry-After 与 extra.retryAfter（§14） */
function rateLimited(res: Response, instance: string): Response {
  const retryAfter = Number(res.headers.get("retry-after") ?? res.headers.get("x-retry-after")) || 60;
  return new Problem("rate-limited", {
    detail: `尝试太频繁，请 ${Math.max(1, Math.ceil(retryAfter / 60))} 分钟后再试。`,
    extra: { retryAfter },
    headers: { "retry-after": String(retryAfter) },
  }).toResponse(instance, `req_auth_${Date.now()}`);
}

async function finish(res: Response, instance: string): Promise<Response> {
  if (res.ok) return res;
  const body = await res.clone().json().catch(() => null);
  const out = res.status === 429 ? rateLimited(res, instance) : problemFrom(res, body, instance);
  for (const cookie of res.headers.getSetCookie()) out.headers.append("set-cookie", cookie);
  return out;
}

export async function GET(req: Request) {
  const res = await handlers().GET(req);
  return finish(res, new URL(req.url).pathname);
}

export async function POST(req: Request) {
  const path = new URL(req.url).pathname;
  const ip = requestIp(req);
  const ua = req.headers.get("user-agent");

  if (path.endsWith("/sign-in/email")) {
    const payload = (await req.clone().json().catch(() => ({}))) as { email?: string };
    const email = (payload.email ?? "").toLowerCase();
    const remaining = email ? await lockRemainingSeconds(email) : 0;
    if (remaining > 0) {
      await recordLogin({ email, userId: await userIdByEmail(email), result: "failure", reason: "locked", ip, userAgent: ua });
      return new Problem("locked", {
        detail: `连续输错密码次数过多，请 ${Math.ceil(remaining / 60)} 分钟后再试。`,
        extra: { retryAfter: remaining },
        headers: { "retry-after": String(remaining) },
      }).toResponse(path, `req_auth_${Date.now()}`);
    }
    const res = await handlers().POST(req);
    const userId = email ? await userIdByEmail(email) : null;
    if (res.ok) {
      const body = await res.clone().json().catch(() => ({}));
      if (!(body as { twoFactorRedirect?: boolean }).twoFactorRedirect && userId) {
        const blocked = await gate(userId, email, ip, ua, path);
        if (blocked) return blocked;
        const [merchantId] = await merchantIdsOf(userId);
        await recordLogin({ email, userId, merchantId, result: "success", ip, userAgent: ua });
      }
    } else if (email && res.status === 401) {
      // 只有凭证错误才记失败并计入锁定；被限频（429）的尝试没有校验密码
      await recordLogin({ email, userId, result: "failure", reason: userId ? "bad_password" : "unknown_email", ip, userAgent: ua });
    }
    return finish(res, path);
  }

  if (path.endsWith("/two-factor/verify-totp") || path.endsWith("/two-factor/verify-backup-code")) {
    const res = await handlers().POST(req);
    const body = await res.clone().json().catch(() => ({}));
    const user = (body as { user?: { id: string; email: string } }).user;
    if (res.ok && user) {
      const blocked = await gate(user.id, user.email, ip, ua, path);
      if (blocked) return blocked;
      const [merchantId] = await merchantIdsOf(user.id);
      await recordLogin({ email: user.email, userId: user.id, merchantId, result: "success", ip, userAgent: ua });
    }
    return finish(res, path);
  }

  if (path.endsWith("/sign-out") && !req.headers.get("content-type")?.includes("json")) {
    // 退出不需要请求体；不带 JSON 头时补一个空对象，避免框架按坏请求处理
    const headers = new Headers(req.headers);
    headers.set("content-type", "application/json");
    const res = await handlers().POST(new Request(req.url, { method: "POST", headers, body: "{}" }));
    return finish(res, path);
  }

  const res = await handlers().POST(req);
  return finish(res, path);
}
