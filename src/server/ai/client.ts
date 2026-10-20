// DeepSeek chat/completions（ADR-011、ADR-014，§17）：JSON 输出、关闭思考、按用途给超时，每次调用记一行日志（§21）。AI_MODE=stub 时由 dev_ai_stub 决定替身回复，并记录最近一次出稿请求。
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { env } from "@/server/env";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type AiKind = "draft" | "translate" | "extract" | "rewrite" | "summary" | "issue" | "compare" | "qa_extract";

export class AiError extends Error {
  constructor(public kind: "timeout" | "model_error" | "invalid_json", message: string) {
    super(message);
  }
}

export type AiResult = { content: string; model: string; latencyMs: number };

const TIMEOUT_MS: Record<AiKind, number> = { draft: 25_000, translate: 10_000, extract: 15_000, rewrite: 6_000, summary: 6_000, issue: 15_000, compare: 15_000, qa_extract: 90_000 };

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
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${e.DEEPSEEK_API_KEY}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS[kind]),
      });
    } catch (err) {
      const timeout = isTimeout(err);
      logCall(kind, body.model, t0, undefined, timeout ? "timeout" : "network");
      throw new AiError(timeout ? "timeout" : "model_error", timeout ? "DeepSeek 超时" : String(err));
    }
    if (!res.ok) {
      logCall(kind, body.model, t0, undefined, `http_${res.status}`);
      throw new AiError("model_error", `DeepSeek HTTP ${res.status}`);
    }
    let json: { choices?: Array<{ message?: { content?: string } }>; model?: string; usage?: Usage };
    try {
      json = (await res.json()) as typeof json;
    } catch (err) {
      const timeout = isTimeout(err);
      logCall(kind, body.model, t0, undefined, timeout ? "timeout" : "bad_body");
      throw new AiError(timeout ? "timeout" : "model_error", timeout ? "DeepSeek 超时" : "DeepSeek 返回的不是 JSON");
    }
    const model = json.model ?? e.DEEPSEEK_MODEL;
    const content = json.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      logCall(kind, model, t0, json.usage, "empty");
      throw new AiError("model_error", "DeepSeek 返回空内容");
    }
    logCall(kind, model, t0, json.usage, null);
    return { content, model, latencyMs: Date.now() - started };
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

type Usage = { prompt_tokens?: number; completion_tokens?: number };

const isTimeout = (err: unknown) => err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");

/** 每次调用 DeepSeek 一行日志（§21）：用途、模型、耗时、token 数、成败与错误类别；不记提示词与买家内容 */
function logCall(kind: AiKind, model: string, t0: number, usage: Usage | undefined, error: string | null) {
  console.log(
    JSON.stringify({
      t: new Date().toISOString(),
      level: error ? "warn" : "info",
      msg: "deepseek call",
      kind,
      model,
      ms: Date.now() - t0,
      promptTokens: usage?.prompt_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
      ok: !error,
      error,
    }),
  );
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

type StubReply = { reply: string; confidence: number; handoff: boolean; reason: string; insufficient: boolean; used_sources: number[] };

/**
 * 替身出稿回复（TEST.md §3「AI 替身」、API-MOCK-008）；timeout 不返回内容，invalid_json 返回非 JSON 文本。
 * 请求带资料片段时，normal 在 used_sources 里引用第 1 段（见 stubChat）。
 */
export const STUB_REPLIES: Record<string, StubReply | string | null> = {
  normal: { reply: "您好！关于「{ask}」，我们已经收到，会尽快为您处理。", confidence: 0.85, handoff: false, reason: "none", insufficient: false, used_sources: [] },
  low_confidence: { reply: "关于「{ask}」，我需要再确认一下。", confidence: 0.4, handoff: false, reason: "low_confidence", insufficient: false, used_sources: [] },
  handoff: { reply: "好的，我请同事马上为您处理，请稍等。", confidence: 0.9, handoff: true, reason: "human_request", insufficient: false, used_sources: [] },
  invalid_json: "好的，这是一段不是 JSON 的文本。",
  timeout: null,
  insufficient: { reply: "关于「{ask}」，我请同事核实后回复您。", confidence: 0.9, handoff: false, reason: "none", insufficient: true, used_sources: [] },
};

/** 替身模式下飞书卡片的一句话总结（固定文案） */
export const STUB_SUMMARY = "AI 替身总结：买家发来新消息，正在等待客服认领。";

/** 替身问题提取：按关键词归到默认类别（类别表里没有就归「其他」），总结取买家第一句 */
const STUB_ISSUE_RULES: Array<[RegExp, string]> = [
  [/物流|快递|发货|到货|tracking|ship|deliver/i, "物流查询"],
  [/退款|退货|换货|refund|return/i, "退换货与退款"],
  [/发票|开票|invoice/i, "开票"],
  [/取消|改地址|修改订单|cancel/i, "订单修改与取消"],
  [/优惠|券|折扣|coupon|voucher|discount/i, "优惠与活动"],
  [/坏|故障|连不上|不能用|识别不到|broken|not working/i, "产品使用与故障"],
  [/库存|现货|有货|价格|规格|stock|price/i, "商品咨询（库存、规格、价格）"],
];
function stubIssue(system: string, transcript: string): string {
  const firstBuyer = transcript.split("\n").find((l) => l.startsWith("买家："))?.slice(3).trim() ?? "";
  const listed = new Set((system.match(/类别：(.*)/)?.[1] ?? "").split("、").map((x) => x.trim()));
  const hit = STUB_ISSUE_RULES.find(([re]) => re.test(transcript))?.[1];
  return JSON.stringify({ summary: `买家咨询：${firstBuyer.slice(0, 30) || "（无文字）"}`, category: hit && listed.has(hit) ? hit : "其他" });
}

/**
 * 替身草稿对比：两段文字去空白后相同记语义一致；人工回复包含草稿记补充信息；长度相近记仅语言润色；其余记弃用重写。
 * 载荷是 draft.compare 发出的 JSON（draft、human）。
 */
function stubCompare(rest: Array<{ role: string; content: string }>): string {
  let p: { draft?: string; human?: string } = {};
  try {
    p = JSON.parse(rest.find((m) => m.role === "user")?.content ?? "{}") as typeof p;
  } catch {
    // 落到下面按空串比
  }
  const squash = (x: string | undefined) => (x ?? "").replace(/\s+/g, "");
  const [draft, human] = [squash(p.draft), squash(p.human)];
  const ratio = draft ? human.length / draft.length : 0;
  const [cls, consistency] =
    draft === human ? ["same", "same"] : human.includes(draft) ? ["supplement", "partial"] : ratio >= 0.7 && ratio <= 1.3 ? ["polish", "same"] : ["rewrite", "different"];
  return JSON.stringify({ edit_class: cls, consistency, reason: "替身：按字面比较", evidence: (p.human ?? "").slice(0, 40) });
}

/**
 * 替身整理问答：资料片段按句切开，取前 3 句（每句 ≥ 8 个字）各出一条候选；问法是「关于「句子前 30 字」？」，回复是整句；
 * 句子里出现了产品清单里的物料编码或名称就带上那个编码；阶段一律「全部阶段」。
 */
function stubQaExtract(rest: Array<{ role: string; content: string }>): string {
  let payload: { text?: string; products?: Array<{ code: string; name: string; aliases?: string[] }> } = {};
  try {
    payload = JSON.parse(rest.find((m) => m.role === "user")?.content ?? "{}");
  } catch {
    // 落到空载荷
  }
  const sentences = (payload.text ?? "")
    .split(/[。！？!?\n]+/)
    .map((x) => x.trim())
    .filter((x) => [...x].length >= 8)
    .slice(0, 3);
  const items = sentences.map((x) => ({
    questions: [`关于「${[...x].slice(0, 30).join("")}」？`],
    answer: x,
    stage: "any",
    product_codes: (payload.products ?? []).filter((pr) => [pr.code, pr.name, ...(pr.aliases ?? [])].some((w) => w && x.toLowerCase().includes(w.toLowerCase()))).map((pr) => pr.code),
    excerpt: x,
  }));
  return JSON.stringify({ items });
}

/** 出稿请求 user 载荷里有没有资料片段 */
function stubHasKnowledge(rest: Array<{ role: string; content: string }>): boolean {
  try {
    const payload = JSON.parse(rest.find((m) => m.role === "user")?.content ?? "{}") as { knowledge?: unknown[] };
    return Array.isArray(payload.knowledge) && payload.knowledge.length > 0;
  } catch {
    return false;
  }
}

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
  // 改写一律返回买家原话，不受 next 影响，也不记入 lastRequest（API-MOCK-008）
  if (kind === "rewrite") return done(JSON.stringify({ query: hint ?? "" }));
  if (kind === "translate") return done(`[译文] ${hint ?? ""}`.trim());
  if (kind === "summary") return done(STUB_SUMMARY);
  if (kind === "issue") return done(stubIssue(system, hint ?? ""));
  if (kind === "compare") return done(stubCompare(rest));
  if (kind === "qa_extract") return done(stubQaExtract(rest));
  if (kind === "extract") return done(JSON.stringify({ buyerName: "PT Contoh Sdn Bhd", address: "12 Jalan Contoh, 50000 Kuala Lumpur", email: "finance@contoh.example", taxId: "C1234567890" }));
  const reply = STUB_REPLIES[next];
  if (!reply) throw new AiError("timeout", "替身：超时");
  if (typeof reply === "string") return done(reply);
  const ask = (hint ?? "").slice(0, 40);
  const used = next === "normal" && stubHasKnowledge(rest) ? [1] : reply.used_sources;
  return done(JSON.stringify({ ...reply, reply: reply.reply.replace("{ask}", ask), used_sources: used }));
}
