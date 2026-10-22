// Agent 服务的替身（AI_MODE=stub，§17「Agent 服务的运行约束」）：进程内的 Anthropic Messages 兼容服务，CLI 子进程照常起、照常调工具，不出网。
// 每轮按对话里已有的工具结果决定下一步，一轮只调一个工具：
// - 会话学习（有 get_conversation）：读会话 → 查知识 → 有拟发布的卡时自测一次 → 提交。判断沿用原来的替身规则：
//   备注或消息含「无需」→ 已有内容覆盖；含「新卡」→ 新建卡；相似卡里有一张的标题与买家消息有共同的 2 个字 → 改这张卡（加一步「替身补充的一步」）；否则按流程需要新建卡。
// - 按卡体检（有 list_cases）：读卡 → 列用例 → 有改后发送或对比不一致的用例时改卡（加一步「替身补充的一步」）并在那个用例上自测一次 → 提交；否则不改。
// - 其他（运行层测试用）：第一条用户消息里「替身脚本：」后面是工具调用的 JSON 数组，逐个调；调完以文字结束。
// - 上一次提交被退回时原样再交一次；提交被收下后以文字结束。用量固定：每轮输入 1,000、输出 50 token。
import http from "node:http";
import type { AddressInfo } from "node:net";

let started: Promise<string> | null = null;

/** 启动（只启动一次）并返回地址，给 ANTHROPIC_BASE_URL 用 */
export function startStubServer(): Promise<string> {
  started ??= new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      void handle(req, res).catch((err) => {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: String(err) } }));
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.unref();
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
  return started;
}

type Block = { type: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown; text?: string };
type Msg = { role: string; content: string | Block[] };
type Body = { model?: string; stream?: boolean; tools?: Array<{ name: string }>; messages?: Msg[] };
type Call = { name: string; input: Record<string, unknown> };

const USAGE_IN = 1000;
const USAGE_OUT = 50;
const P = "mcp__shopilot__";
let seq = 0;

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const url = req.url ?? "";
  if (req.method !== "POST" || !url.startsWith("/v1/messages")) {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "替身只实现 /v1/messages" } }));
  }
  if (url.startsWith("/v1/messages/count_tokens")) {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ input_tokens: USAGE_IN }));
  }
  const body = JSON.parse(raw || "{}") as Body;
  const next = decide(body);
  const id = `msg_stub_${++seq}`;
  const toolUseId = `toolu_stub_${seq}`;
  const content = next ? [{ type: "tool_use", id: toolUseId, name: next.name, input: next.input }] : [{ type: "text", text: "已完成。" }];
  const stopReason = next ? "tool_use" : "end_turn";
  const model = body.model ?? "stub";
  if (!body.stream) {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ id, type: "message", role: "assistant", model, content, stop_reason: stopReason, stop_sequence: null, usage: { input_tokens: USAGE_IN, output_tokens: USAGE_OUT } }));
  }
  const events: Array<[string, unknown]> = [
    ["message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: USAGE_IN, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: next ? { type: "tool_use", id: toolUseId, name: next.name, input: {} } : { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: next ? { type: "input_json_delta", partial_json: JSON.stringify(next.input) } : { type: "text_delta", text: "已完成。" } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: USAGE_OUT } }],
    ["message_stop", { type: "message_stop" }],
  ];
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const [event, data] of events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.end();
}

/** 对话里已有的工具调用与结果，按顺序 */
function history(messages: Msg[]): Array<Call & { result: string }> {
  const calls = new Map<string, Call>();
  const out: Array<Call & { result: string }> = [];
  for (const m of messages) {
    if (typeof m.content === "string") continue;
    for (const b of m.content) {
      if (b.type === "tool_use" && b.id && b.name) calls.set(b.id, { name: b.name.replace(P, ""), input: (b.input ?? {}) as Record<string, unknown> });
      if (b.type === "tool_result" && b.tool_use_id) {
        const call = calls.get(b.tool_use_id);
        const result = typeof b.content === "string" ? b.content : Array.isArray(b.content) ? (b.content as Block[]).map((c) => c.text ?? "").join("") : "";
        if (call) out.push({ ...call, result });
      }
    }
  }
  return out;
}

const parse = <T>(s: string | undefined): T | null => {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};

function decide(body: Body): Call | null {
  const tools = new Set((body.tools ?? []).map((t) => t.name.replace(P, "")));
  if (!tools.has("submit")) return null;
  const done = history(body.messages ?? []);
  const call = (name: string, input: Record<string, unknown> = {}): Call => ({ name: `${P}${name}`, input });
  const last = done.at(-1);
  if (last?.name === "submit") return last.result.startsWith("没有收下") ? call("submit", last.input) : null;
  const resultOf = (name: string) => done.findLast((c) => c.name === name)?.result;
  if (tools.has("get_conversation")) {
    const conv = parse<StubLearnPayload>(resultOf("get_conversation"));
    if (!conv) return call("get_conversation");
    const verdict = stubLearn(conv);
    if (!resultOf("search_knowledge")) return call("search_knowledge", { query: verdict.test_question || "买家的问题" });
    if (verdict.card && !resultOf("simulate")) return call("simulate", { card: verdict.card, ...(verdict.target_card ? { target_card: verdict.target_card } : {}) });
    return call("submit", verdict);
  }
  if (tools.has("list_cases")) {
    const card = parse<{ card: StubCard }>(resultOf("get_card"));
    if (!card) return call("get_card");
    const cases = parse<Array<{ n: number; disposition: string; compare: { consistency: string } | null }>>(resultOf("list_cases"));
    if (!cases) return call("list_cases");
    const bad = cases.find((c) => c.disposition === "edited_sent" || c.compare?.consistency === "different");
    if (!bad) return call("submit", { verdict: "keep", reason: "替身：用例没有明显问题", suggestion: "" });
    const revised = { ...card.card, steps: [...card.card.steps, { text: "替身补充的一步", branches: [] }] };
    if (!resultOf("simulate")) return call("simulate", { case_n: bad.n, card: revised });
    return call("submit", { verdict: "revise", reason: "替身：客服改写过这张卡的草稿", suggestion: "替身：补一步", card: revised });
  }
  const script = scriptOf(body.messages ?? []);
  const step = script[done.length];
  return step ? call(step.name, step.input) : null;
}

/** 第一条用户消息里「替身脚本：」后面的 JSON 数组 */
function scriptOf(messages: Msg[]): Call[] {
  const first = messages.find((m) => m.role === "user");
  const textOf = (m: Msg | undefined) => (!m ? "" : typeof m.content === "string" ? m.content : m.content.map((b) => b.text ?? "").join("\n"));
  const m = textOf(first).match(/替身脚本：(\[[\s\S]*\])/);
  return (m && parse<Call[]>(m[1])) || [];
}

type StubCard = { title: string; conditions: string[]; condition_mode: string; steps: Array<{ text: string; branches: unknown[] }>; tips: string | null; stage?: string };
type StubLearnPayload = {
  note?: string | null;
  stage?: string;
  products?: Array<{ code: string }>;
  conversation?: Array<{ from: string; text: string; selected?: boolean }>;
  similar_cards?: Array<StubCard & { id: string }>;
};

/** 两段文字有没有共同的连续 2 个字（去掉空白与标点） */
function shareTwoChars(a: string, b: string): boolean {
  const clean = (x: string) => [...x.toLowerCase()].filter((c) => !/[\s\p{P}]/u.test(c));
  const ca = clean(a);
  const tb = clean(b).join("");
  for (let i = 0; i + 1 < ca.length; i++) if (tb.includes(ca[i] + ca[i + 1])) return true;
  return false;
}

function stubLearn(p: StubLearnPayload) {
  const buyer = (p.conversation ?? []).filter((m) => m.from === "buyer" && m.text);
  const picked = buyer.filter((m) => m.selected);
  const question = (picked.length ? picked : buyer).at(-1)?.text ?? "";
  const all = [p.note ?? "", ...(p.conversation ?? []).map((m) => m.text)].join("\n");
  const base = { reason: "替身：按关键词判断", suggestion: "替身：按建议更新", test_question: question };
  if (all.includes("无需")) return { ...base, diagnosis: "covered", action: "none", target_card: null, card: null };
  const target = all.includes("新卡") ? undefined : (p.similar_cards ?? []).find((c) => buyer.some((m) => shareTwoChars(c.title, m.text)));
  if (target)
    return {
      ...base,
      diagnosis: "process",
      action: "edit_card",
      target_card: target.id,
      card: { title: target.title, conditions: target.conditions, condition_mode: target.condition_mode, steps: [...target.steps, { text: "替身补充的一步", branches: [] }], tips: target.tips, stage: target.stage, product_codes: null },
    };
  const head = [...question].slice(0, 20).join("") || "买家的问题";
  return {
    ...base,
    diagnosis: "process",
    action: "new_card",
    target_card: null,
    card: {
      title: `替身：${head}`,
      conditions: [`买家提到「${head}」`],
      condition_mode: "all",
      steps: [{ text: "替身第一步：问清情况", branches: [] }],
      tips: null,
      stage: p.stage && p.stage !== "unknown" ? p.stage : "any",
      product_codes: (p.products ?? []).map((x) => x.code),
    },
  };
}
