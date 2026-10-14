// /api/v1 Route Handler 包装：请求关联 ID、鉴权与权限、zod 校验、幂等键、problem+json、日志（DESIGN §8 通用约定、§14）。
import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { ZodError, type ZodType } from "zod";
import { db, schema } from "../db/client";
import { env } from "../env";
import { loadMemberContext, loadSession, type MemberContext, type SessionContext } from "../auth/context";
import type { Permission } from "@/lib/permissions";
import { audit } from "../core/audit";
import { sha256 } from "../core/crypto";
import { Problem } from "./problem";

type Params = Record<string, string | string[]>;
type NextCtx = { params: Promise<Params> };

type Base<B, Q> = {
  body?: ZodType<B>;
  query?: ZodType<Q>;
  /** optional：带 Idempotency-Key 时生效；required：必须带 */
  idempotency?: "optional" | "required";
};

type MemberRoute<B, Q> = Base<B, Q> & {
  auth: "member";
  perm?: Permission | Permission[];
  allowTwoFactorPending?: boolean;
  handler: (a: { ctx: MemberContext; body: B; query: Q; params: Params; req: Request }) => Promise<unknown>;
};
type SessionRoute<B, Q> = Base<B, Q> & {
  auth: "session";
  handler: (a: { ctx: SessionContext; body: B; query: Q; params: Params; req: Request }) => Promise<unknown>;
};
type PublicRoute<B, Q> = Base<B, Q> & {
  auth: "public";
  handler: (a: { requestId: string; body: B; query: Q; params: Params; req: Request }) => Promise<unknown>;
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}

export function csv(filename: string, rows: Array<Array<string | number | null | undefined>>): Response {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  if (rows.length > 10_001) throw new Problem("validation", { detail: "导出超过 10,000 行，请缩小筛选范围后再导出。" });
  const body = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n");
  return new Response(body, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`, "cache-control": "no-store" },
  });
}

const PENDING_DELETION_ALLOWED = [
  "/api/v1/me",
  "/api/v1/nav-summary",
  "/api/v1/notifications",
  "/api/v1/merchant",
  "/api/v1/notification-rules",
  "/api/v1/security-policy",
  "/api/v1/data-policy",
  "/api/v1/data/",
  "/api/v1/audit-logs",
  "/api/v1/ownership-transfers",
  "/api/v1/files/",
];

const rate = new Map<string, { start: number; count: number }>();
function rateLimit(key: string, max = 600) {
  const now = Date.now();
  const cur = rate.get(key);
  if (!cur || now - cur.start > 60_000) {
    rate.set(key, { start: now, count: 1 });
    return;
  }
  cur.count += 1;
  if (cur.count > max) throw new Problem("rate-limited", { detail: "操作太频繁，请稍后再试。", headers: { "retry-after": "30" } });
}

function newRequestId(req: Request): string {
  const incoming = req.headers.get("x-request-id");
  if (incoming && /^[A-Za-z0-9_-]{8,64}$/.test(incoming)) return incoming;
  return `req_${uuidv7().replace(/-/g, "")}`;
}

function checkOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return; // curl 等非浏览器客户端没有 Origin；浏览器跨站请求一定带
  if (new URL(origin).host !== new URL(env().APP_BASE_URL).host) throw new Problem("forbidden", { detail: "请求来源不被允许。", code: "bad_origin" });
}

async function parseBody<B>(req: Request, schemaB?: ZodType<B>): Promise<B> {
  if (!schemaB) return undefined as B;
  let raw: unknown = {};
  const text = await req.text();
  if (text) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Problem("validation", { detail: "请求体不是合法的 JSON。" });
    }
  }
  return schemaB.parse(raw);
}

function parseQuery<Q>(req: Request, schemaQ?: ZodType<Q>): Q {
  if (!schemaQ) return undefined as Q;
  const obj: Record<string, string> = {};
  new URL(req.url).searchParams.forEach((v, k) => (obj[k] = v));
  return schemaQ.parse(obj);
}

function zodFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) fields[issue.path.join(".") || "_"] = issue.message;
  return fields;
}

function log(line: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...line }));
}

async function withIdempotency(
  mode: "optional" | "required" | undefined,
  req: Request,
  merchantId: string,
  routeKey: string,
  bodyForHash: unknown,
  run: () => Promise<Response>,
): Promise<Response> {
  const key = req.headers.get("idempotency-key");
  if (!mode || (!key && mode === "optional")) return run();
  if (!key) throw new Problem("validation", { detail: "这个操作需要 Idempotency-Key 请求头。", code: "idempotency_key_required" });
  const hash = sha256(JSON.stringify(bodyForHash ?? null));
  const inserted = await db()
    .insert(schema.idempotencyKey)
    .values({ merchantId, key, route: routeKey, requestHash: hash })
    .onConflictDoNothing()
    .returning({ id: schema.idempotencyKey.id });
  if (inserted.length === 0) {
    const [existing] = await db()
      .select()
      .from(schema.idempotencyKey)
      .where(and(eq(schema.idempotencyKey.merchantId, merchantId), eq(schema.idempotencyKey.route, routeKey), eq(schema.idempotencyKey.key, key)));
    if (existing.requestHash !== hash) throw new Problem("validation", { detail: "同一个 Idempotency-Key 不能用于不同的请求内容。", code: "idempotency_key_reused" });
    if (existing.status === null) throw new Problem("conflict", { detail: "同一个请求正在处理，请稍候刷新。", code: "idempotency_in_flight" });
    return json(existing.response, existing.status);
  }
  const id = inserted[0].id;
  try {
    const res = await run();
    const ok = res.status < 500;
    const contentType = res.headers.get("content-type") ?? "";
    if (ok && contentType.includes("json")) {
      const body = await res.clone().json();
      await db().update(schema.idempotencyKey).set({ status: res.status, response: body }).where(eq(schema.idempotencyKey.id, id));
    } else {
      await db().delete(schema.idempotencyKey).where(eq(schema.idempotencyKey.id, id));
    }
    return res;
  } catch (e) {
    await db().delete(schema.idempotencyKey).where(eq(schema.idempotencyKey.id, id));
    throw e;
  }
}

function toResponse(result: unknown): Response {
  if (result instanceof Response) return result;
  return json(result ?? { ok: true });
}

export function route<B = undefined, Q = undefined>(opts: MemberRoute<B, Q> | SessionRoute<B, Q> | PublicRoute<B, Q>) {
  return async (req: Request, nctx: NextCtx): Promise<Response> => {
    const requestId = newRequestId(req);
    const started = Date.now();
    const url = new URL(req.url);
    const instance = url.pathname;
    let status = 500;
    let merchantId: string | null = null;
    try {
      checkOrigin(req);
      const params = (await nctx.params) ?? {};
      let res: Response;
      if (opts.auth === "public") {
        rateLimit(`ip:${req.headers.get("x-forwarded-for") ?? "local"}`, 300);
        const body = await parseBody(req, opts.body);
        const query = parseQuery(req, opts.query);
        res = toResponse(await opts.handler({ requestId, body, query, params, req }));
      } else if (opts.auth === "session") {
        const ctx = await loadSession(req, requestId);
        rateLimit(`s:${ctx.session.id}`);
        const body = await parseBody(req, opts.body);
        const query = parseQuery(req, opts.query);
        res = toResponse(await opts.handler({ ctx, body, query, params, req }));
      } else {
        const ctx = await loadMemberContext(req, requestId);
        merchantId = ctx.merchant.id;
        rateLimit(`s:${ctx.session.id}`);
        if (ctx.twoFactorRequired && !opts.allowTwoFactorPending) {
          throw new Problem("two-factor-required", { detail: "商户要求开启两步验证，开启后才能继续使用。" });
        }
        // 11.10：待删除期间所有者只能用商户设置（及账号、通知、文件下载）
        if (ctx.merchant.status === "pending_deletion" && !PENDING_DELETION_ALLOWED.some((p) => instance.startsWith(p))) {
          throw new Problem("forbidden", { detail: "商户正在等待删除，只能使用商户设置；撤销删除后恢复。", code: "merchant_pending_deletion" });
        }
        const perms = opts.perm === undefined ? [] : Array.isArray(opts.perm) ? opts.perm : [opts.perm];
        const denied = perms.find((p) => !ctx.can(p));
        if (denied) {
          await audit(ctx.actor, { module: "auth", action: "permission_denied", summary: `被拒绝：${req.method} ${instance}`, data: { perm: denied, role: ctx.membership.role } });
          throw new Problem(denied.endsWith(".owner") ? "owner-only" : "forbidden", { detail: "当前角色没有这个操作的权限。", code: denied });
        }
        const body = await parseBody(req, opts.body);
        const query = parseQuery(req, opts.query);
        res = await withIdempotency(opts.idempotency, req, ctx.merchant.id, `${req.method} ${instance}`, body, async () =>
          toResponse(await opts.handler({ ctx, body, query, params, req })),
        );
      }
      res.headers.set("x-request-id", requestId);
      status = res.status;
      return res;
    } catch (e) {
      let problem: Problem;
      if (e instanceof Problem) problem = e;
      else if (e instanceof ZodError) problem = new Problem("validation", { detail: "提交的内容有误，请检查标红的字段。", extra: { fields: zodFields(e) } });
      else {
        console.error(JSON.stringify({ t: new Date().toISOString(), level: "error", requestId, route: instance, err: e instanceof Error ? e.stack : String(e) }));
        problem = new Problem("internal", { detail: "请稍后重试；问题持续时把请求编号发给管理员。" });
      }
      status = problem.status;
      return problem.toResponse(instance, requestId);
    } finally {
      log({ level: status >= 500 ? "error" : "info", requestId, merchantId, method: req.method, route: instance, status, durationMs: Date.now() - started });
    }
  };
}
