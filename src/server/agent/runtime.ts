// Agent 服务（ADR-019，§6、§15、§17）：多轮、要调工具的 AI 任务统一经 runAgent 运行。Claude Agent SDK 起一个 CLI 子进程，
// 后端是 DeepSeek 的 Anthropic 兼容接口（AI_MODE=stub 时是进程内替身），模型固定 deepseek-flash。
// - 隔离：内置工具、配置文件、技能、会话持久化都不加载，只放行这次登记的平台工具；子进程环境只给下面列出的变量，看不到应用的其他密钥。
// - 一次一目录：临时目录当 cwd、HOME 与配置目录，结束即删；Worker 启动时清理异常退出留下的（cleanAgentDirs）。
// - 封顶在代码里：墙钟、工具调用次数、单个工具次数、token；SDK 的 maxTurns 计数不准、超限时抛错，只当兜底。
// - 每次运行记一行 agent_run 与一行日志（§21）；只认第一次通过校验的提交，没交回结论即失败。
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSdkMcpServer, query, tool, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { and, eq, lt } from "drizzle-orm";
import type { AgentPurpose, AgentRunStep } from "@/contracts/agent";
import { audit, systemActor } from "@/server/core/audit";
import { db, schema } from "@/server/db/client";
import { env } from "@/server/env";
import { startStubServer } from "./stub-server";
import type { AgentSubmit, AgentTool } from "./tools/registry";

const R = schema.agentRun;
export const AGENT_MODEL = "deepseek-flash";
const DEEPSEEK_ANTHROPIC_URL = "https://api.deepseek.com/anthropic";
/** 每个进程同时最多几个 Agent（每个 CLI 子进程约 250 MB） */
export const AGENT_CONCURRENCY = 3;
export const AGENT_LIMITS = {
  timeoutMs: 180_000,
  /** 工具调用次数（提交不受限） */
  toolCalls: 20,
  /** Agent 自己的输入（含缓存命中）加输出 */
  tokens: 80_000,
  maxTurns: 30,
};
const STEPS_MAX = 30;
const SERVER = "shopilot";
const DIR_PREFIX = "shopilot-agent-";

export type AgentErrorKind = "timeout" | "budget" | "no_submit" | "model_error";
const ERROR_TEXT: Record<AgentErrorKind, string> = { timeout: "超时", budget: "超出用量", no_submit: "没有提交结论", model_error: "模型出错" };

export class AgentError extends Error {
  constructor(
    public kind: AgentErrorKind,
    message: string,
  ) {
    super(message);
  }
}

let slots = AGENT_CONCURRENCY;
const waiting: Array<() => void> = [];
async function acquire(): Promise<() => void> {
  if (slots > 0) slots -= 1;
  else await new Promise<void>((r) => waiting.push(r));
  return () => {
    const next = waiting.shift();
    if (next) next();
    else slots += 1;
  };
}

export type RunAgentInput<Out> = {
  purpose: AgentPurpose;
  merchantId: string;
  learningTaskId: string | null;
  system: string;
  prompt: string;
  tools: AgentTool[];
  submit: AgentSubmit<Out>;
  /** 测试用：收紧封顶 */
  limits?: Partial<typeof AGENT_LIMITS>;
};

/** 跑一次 Agent：交回通过校验的结论；超时、超出用量、没提交、模型出错时抛 AgentError（这次运行已记失败） */
export async function runAgent<Out>(input: RunAgentInput<Out>): Promise<{ output: Out; runId: string }> {
  const release = await acquire();
  try {
    return await runOnce(input);
  } finally {
    release();
  }
}

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v) }] });
const clip = (s: string, n: number) => {
  const chars = [...s];
  return chars.length > n ? `${chars.slice(0, n).join("")}…` : s;
};
type Tokens = { input: number; cacheRead: number; output: number };

async function runOnce<Out>(input: RunAgentInput<Out>): Promise<{ output: Out; runId: string }> {
  const e = env();
  const limits = { ...AGENT_LIMITS, ...input.limits };
  const stub = e.AI_MODE === "stub";
  const model = stub ? "stub" : AGENT_MODEL;
  const home = await mkdtemp(path.join(tmpdir(), DIR_PREFIX));
  const [run] = await db().insert(R).values({ merchantId: input.merchantId, learningTaskId: input.learningTaskId, purpose: input.purpose, model }).returning({ id: R.id });
  const started = Date.now();
  const steps: AgentRunStep[] = [];
  const record = (s: AgentRunStep) => {
    if (steps.length < STEPS_MAX) steps.push(s);
  };
  let toolCalls = 0;
  const perTool = new Map<string, number>();
  let submitted: { output: Out } | null = null;
  let failure: AgentError | null = null;
  const abort = new AbortController();
  // 中止后 SDK 先关子进程的输入、约 2 秒后才结束它，这段时间里已发出的那次模型请求不计入 token
  const stop = (err: AgentError) => {
    failure ??= err;
    abort.abort();
  };
  const timer = setTimeout(() => stop(new AgentError("timeout", `超过 ${Math.round(limits.timeoutMs / 1000)} 秒没有交回结论`)), limits.timeoutMs);

  const wrap = (t: AgentTool) =>
    tool(t.name, t.description, t.input, async (args) => {
      toolCalls += 1;
      const used = (perTool.get(t.name) ?? 0) + 1;
      perTool.set(t.name, used);
      if (toolCalls > limits.toolCalls || (t.max !== undefined && used > t.max)) {
        record({ tool: t.name, ms: 0, ok: false, note: "已到次数上限，没有执行" });
        return text(`${toolCalls > limits.toolCalls ? `工具调用已到上限（${limits.toolCalls} 次）` : `${t.name} 已到上限（${t.max} 次）`}，请直接调用 submit 提交结论。`);
      }
      const t0 = Date.now();
      try {
        const out = await t.run(args as Record<string, unknown>);
        // 写工具（以后全量托管时接入）每次调用写审计
        if (t.tier === "write") await audit(systemActor(input.merchantId), { module: "reception", action: "agent_tool_write", summary: `Agent 调用写工具 ${t.name}`, data: { runId: run.id, tool: t.name } });
        record({ tool: t.name, ms: Date.now() - t0, ok: true, note: out.note });
        return text(out.result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        record({ tool: t.name, ms: Date.now() - t0, ok: false, note: `出错：${clip(msg, 60)}` });
        return { ...text(`工具出错：${clip(msg, 200)}`), isError: true };
      }
    });
  const submitTool = tool("submit", input.submit.description, input.submit.input, async (args) => {
    toolCalls += 1;
    if (submitted) {
      record({ tool: "submit", ms: 0, ok: true, note: "重复提交，已忽略" });
      return text("已经提交过了，不用再提交，直接结束。");
    }
    const r = input.submit.accept(args as Record<string, unknown>);
    if (!r.ok) {
      record({ tool: "submit", ms: 0, ok: false, note: `退回：${clip(r.error, 60)}` });
      return text(`没有收下：${r.error}请改好后重新调用 submit。`);
    }
    submitted = { output: r.output };
    record({ tool: "submit", ms: 0, ok: true, note: r.note });
    return text("已提交，可以结束。");
  });
  const server = createSdkMcpServer({ name: SERVER, version: "1.0.0", tools: [...input.tools.map(wrap), submitTool] });
  const allowed = [...input.tools.map((t) => t.name), "submit"].map((n) => `mcp__${SERVER}__${n}`);

  // token：每个模型请求的 message_start 带输入与缓存命中，message_delta 带输出；一路累加，超出就中止
  const perMessage = new Map<string, Tokens>();
  let current: string | null = null;
  const total = () => [...perMessage.values()].reduce((a, t) => ({ input: a.input + t.input, cacheRead: a.cacheRead + t.cacheRead, output: a.output + t.output }), { input: 0, cacheRead: 0, output: 0 });
  type Usage = { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
  const track = (id: string, u: Usage | undefined) => {
    if (!u) return;
    const prev = perMessage.get(id) ?? { input: 0, cacheRead: 0, output: 0 };
    perMessage.set(id, {
      input: Math.max(prev.input, (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)),
      cacheRead: Math.max(prev.cacheRead, u.cache_read_input_tokens ?? 0),
      output: Math.max(prev.output, u.output_tokens ?? 0),
    });
    const t = total();
    if (t.input + t.cacheRead + t.output > limits.tokens) stop(new AgentError("budget", `token 超过 ${limits.tokens}`));
  };

  let result: SDKResultMessage | null = null;
  let stderr = "";
  try {
    const baseUrl = stub ? await startStubServer() : DEEPSEEK_ANTHROPIC_URL;
    if (!stub && !e.DEEPSEEK_API_KEY) throw new AgentError("model_error", "DEEPSEEK_API_KEY 未配置");
    const q = query({
      prompt: input.prompt,
      options: {
        systemPrompt: input.system,
        tools: [],
        allowedTools: allowed,
        mcpServers: { [SERVER]: server },
        strictMcpConfig: true,
        settingSources: [],
        persistSession: false,
        maxTurns: limits.maxTurns,
        model,
        cwd: home,
        abortController: abort,
        includePartialMessages: true,
        env: {
          PATH: process.env.PATH,
          HOME: home,
          CLAUDE_CONFIG_DIR: home,
          ANTHROPIC_BASE_URL: baseUrl,
          ANTHROPIC_AUTH_TOKEN: stub ? "stub" : e.DEEPSEEK_API_KEY,
          ANTHROPIC_MODEL: model,
          ANTHROPIC_SMALL_FAST_MODEL: model,
          ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
          DISABLE_TELEMETRY: "1",
          DISABLE_ERROR_REPORTING: "1",
          DISABLE_AUTOUPDATER: "1",
        },
        // CLI 不认识 DeepSeek 的模型名，每次打一行 unrecognized_model 警告，不记
        stderr: (d) => {
          if (!d.includes("unrecognized_model")) stderr = (stderr + d).slice(-500);
        },
      },
    });
    for await (const m of q) {
      if (m.type === "stream_event") {
        if (m.event.type === "message_start") {
          current = m.event.message.id;
          track(current, m.event.message.usage);
        } else if (m.event.type === "message_delta" && current) track(current, m.event.usage as Usage);
      } else if (m.type === "result") result = m;
    }
  } catch (err) {
    if (!failure) failure = err instanceof AgentError ? err : new AgentError("model_error", clip(err instanceof Error ? err.message : String(err), 200));
  } finally {
    clearTimeout(timer);
    await rm(home, { recursive: true, force: true });
  }

  const done = submitted as { output: Out } | null;
  if (!done && !failure) failure = result?.is_error ? new AgentError("model_error", clip(result.subtype === "success" ? result.result : result.errors.join("；"), 200)) : new AgentError("no_submit", "Agent 结束时没有提交结论");
  const sdk = result?.usage;
  const tokens: Tokens = sdk
    ? { input: sdk.input_tokens + (sdk.cache_creation_input_tokens ?? 0), cacheRead: sdk.cache_read_input_tokens ?? 0, output: sdk.output_tokens }
    : total();
  const err = done ? null : failure;
  await db()
    .update(R)
    .set({
      status: done ? "succeeded" : "failed",
      error: err ? `${ERROR_TEXT[err.kind]}：${err.message}` : null,
      turns: result?.num_turns ?? null,
      toolCalls,
      inputTokens: tokens.input,
      cacheReadTokens: tokens.cacheRead,
      outputTokens: tokens.output,
      steps,
      finishedAt: new Date(),
    })
    .where(eq(R.id, run.id));
  console.log(
    JSON.stringify({
      t: new Date().toISOString(),
      level: done ? "info" : "warn",
      msg: "agent run",
      purpose: input.purpose,
      model,
      runId: run.id,
      ms: Date.now() - started,
      turns: result?.num_turns ?? null,
      toolCalls,
      inputTokens: tokens.input,
      cacheReadTokens: tokens.cacheRead,
      outputTokens: tokens.output,
      ok: !!done,
      error: err?.kind ?? null,
      ...(err && stderr ? { stderr } : {}),
    }),
  );
  if (!done) throw err!;
  return { output: done.output, runId: run.id };
}

/** 运行中超过 15 分钟的标「运行中断」（进程被杀时留下的），由 knowledge.qa_embed 的补扫顺带调用 */
export async function failStaleAgentRuns(staleMs: number): Promise<number> {
  const rows = await db()
    .update(R)
    .set({ status: "failed", error: "运行中断：进程在运行中退出", finishedAt: new Date() })
    .where(and(eq(R.status, "running"), lt(R.startedAt, new Date(Date.now() - staleMs))))
    .returning({ id: R.id });
  return rows.length;
}

/** 清理异常退出留下的临时目录（正常结束的运行已在 finally 里删掉）：Worker 启动时与 knowledge.qa_embed 补扫时调用；只删 15 分钟前的，不碰同机别的进程正在用的 */
export async function cleanAgentDirs(): Promise<void> {
  const base = tmpdir();
  const before = Date.now() - 15 * 60_000;
  for (const name of await readdir(base).catch(() => [] as string[])) {
    if (!name.startsWith(DIR_PREFIX)) continue;
    const dir = path.join(base, name);
    const st = await stat(dir).catch(() => null);
    if (st && st.mtimeMs < before) await rm(dir, { recursive: true, force: true });
  }
}
