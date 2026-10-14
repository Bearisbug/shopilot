// DeepSeek chat/completions（ADR-011，§17）：JSON 输出、关闭思考、按用途给超时。AI_MODE=stub 时由 dev_ai_stub 决定替身回复，并记录最近一次请求。
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { env } from "@/server/env";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type AiKind = "draft" | "translate" | "extract";

export class AiError extends Error {
  constructor(public kind: "timeout" | "model_error" | "invalid_json", message: string) {
    super(message);
  }
}

export type AiResult = { content: string; model: string; latencyMs: number };

const TIMEOUT_MS: Record<AiKind, number> = { draft: 25_000, translate: 10_000, extract: 15_000 };

export async function chat(kind: AiKind, messages: ChatMessage[], opts: { json?: boolean; maxTokens?: number; stubHint?: string } = {}): Promise<AiResult> {
  const e = env();
  const started = Date.now();
  if (e.AI_MODE === "stub") return stubChat(kind, messages, opts.stubHint, started);
  if (!e.DEEPSEEK_API_KEY) throw new AiError("model_error", "DEEPSEEK_API_KEY 未配置");
  const body = {
    model: e.DEEPSEEK_MODEL,
    messages,
    stream: false,
    max_tokens: opts.maxTokens ?? 1200,
    thinking: { type: "disabled" },
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  };
  const attempt = async () => {
    let res: Response;
    try {
      res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${e.DEEPSEEK_API_KEY}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS[kind]),
      });
    } catch (err) {
      const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new AiError(timeout ? "timeout" : "model_error", timeout ? "DeepSeek 超时" : String(err));
    }
    if (!res.ok) throw new AiError("model_error", `DeepSeek HTTP ${res.status}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; model?: string };
    const content = json.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new AiError("model_error", "DeepSeek 返回空内容");
    return { content, model: json.model ?? e.DEEPSEEK_MODEL, latencyMs: Date.now() - started };
  };
  try {
    return await attempt();
  } catch (err) {
    // 只有翻译在 5xx 时重试一次（§17）
    if (kind === "translate" && err instanceof AiError && err.kind === "model_error" && /HTTP 5\d\d/.test(err.message)) {
      await new Promise((r) => setTimeout(r, 1000));
      return attempt();
    }
    throw err;
  }
}

/** 解析模型的 JSON 输出；不是对象时抛 invalid_json */
export function parseJson(content: string): Record<string, unknown> {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    const v = JSON.parse(trimmed) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // 落到下面
  }
  throw new AiError("invalid_json", "模型输出不是合法 JSON");
}

// ── 替身 ──

/** 替身出稿回复（TEST.md §3「AI 替身」）；timeout 不返回内容，invalid_json 返回非 JSON 文本 */
export const STUB_REPLIES: Record<string, { reply: string; confidence: number; handoff: boolean; reason: string } | string | null> = {
  normal: { reply: "您好！关于「{ask}」，我们已经收到，会尽快为您处理。", confidence: 0.85, handoff: false, reason: "none" },
  low_confidence: { reply: "关于「{ask}」，我需要再确认一下。", confidence: 0.4, handoff: false, reason: "low_confidence" },
  handoff: { reply: "好的，我请同事马上为您处理，请稍等。", confidence: 0.9, handoff: true, reason: "human_request" },
  invalid_json: "好的，这是一段不是 JSON 的文本。",
  timeout: null,
};

async function stubChat(kind: AiKind, messages: ChatMessage[], hint: string | undefined, started: number): Promise<AiResult> {
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const rest = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
  const [row] = await db().select().from(schema.devAiStub).where(eq(schema.devAiStub.id, 1)).limit(1);
  const next = kind === "draft" ? (row?.next ?? "normal") : "normal";
  // 只记出稿请求（模拟器「最近一次请求」看的是出稿）；单次设定用过即回到 normal
  if (kind === "draft") {
    const lastRequest = { kind, at: new Date().toISOString(), model: "stub", system, messages: rest };
    const consume = !!row && !row.sticky && row.next !== "normal";
    await db()
      .insert(schema.devAiStub)
      .values({ id: 1, lastRequest, next: "normal" })
      .onConflictDoUpdate({ target: schema.devAiStub.id, set: { lastRequest, ...(consume ? { next: "normal" } : {}), updatedAt: new Date() } });
  }
  const done = (content: string) => ({ content, model: "stub", latencyMs: Date.now() - started });
  if (kind === "translate") return done(`[译文] ${hint ?? ""}`.trim());
  if (kind === "extract") return done(JSON.stringify({ buyerName: "PT Contoh Sdn Bhd", address: "12 Jalan Contoh, 50000 Kuala Lumpur", email: "finance@contoh.example", taxId: "C1234567890" }));
  const reply = STUB_REPLIES[next];
  if (!reply) throw new AiError("timeout", "替身：超时");
  if (typeof reply === "string") return done(reply);
  const ask = (hint ?? "").slice(0, 40);
  return done(JSON.stringify({ ...reply, reply: reply.reply.replace("{ask}", ask) }));
}
