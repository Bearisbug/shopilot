import { afterEach, describe, expect, it, vi } from "vitest";
import { AiError, chat, parseJson } from "./client";

describe("模型 JSON 输出解析", () => {
  it("接受对象与 ```json 包裹", () => {
    expect(parseJson('{"reply":"hi","confidence":0.8}')).toEqual({ reply: "hi", confidence: 0.8 });
    expect(parseJson('```json\n{"reply":"hi"}\n```')).toEqual({ reply: "hi" });
  });
  it("非 JSON、数组、空串抛 invalid_json", () => {
    for (const bad of ["好的，这是文本", "[1,2]", ""]) {
      expect(() => parseJson(bad)).toThrow(AiError);
    }
  });
});

describe("DeepSeek 调用日志（§21）", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** 真实模式（不走替身）下调 chat，fetch 由 respond 决定；返回打出的 deepseek 日志行 */
  async function callWith(kind: Parameters<typeof chat>[0], respond: () => Promise<Response>) {
    vi.stubEnv("AI_MODE", "deepseek");
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test");
    vi.stubGlobal("fetch", vi.fn(respond));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    log.mockClear();
    const result = await chat(kind, [{ role: "user", content: "买家原话：保修多久" }], { json: true }).catch((e: unknown) => e);
    const lines = log.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('"deepseek call"'));
    return { result, lines: lines.map((l) => JSON.parse(l) as Record<string, unknown>), raw: lines.join("\n") };
  }

  it("成功：一行 info，带用途、模型、耗时、token 数，不带提示词与买家内容", async () => {
    const body = { model: "deepseek-flash", choices: [{ message: { content: '{"reply":"12 个月"}' } }], usage: { prompt_tokens: 812, completion_tokens: 37 } };
    const { result, lines, raw } = await callWith("draft", async () => new Response(JSON.stringify(body), { status: 200 }));
    expect(result).toMatchObject({ model: "deepseek-flash" });
    expect(lines).toEqual([{ t: expect.any(String), level: "info", msg: "deepseek call", kind: "draft", model: "deepseek-flash", ms: expect.any(Number), promptTokens: 812, completionTokens: 37, ok: true, error: null }]);
    expect(raw).not.toContain("保修");
    expect(raw).not.toContain("12 个月");
    expect(raw).not.toContain("sk-test");
  });

  it("失败：HTTP 错误、超时、空内容各记一行 warn 与错误类别", async () => {
    const http = await callWith("rewrite", async () => new Response("busy", { status: 503 }));
    expect(http.result).toBeInstanceOf(AiError);
    expect(http.lines).toMatchObject([{ level: "warn", kind: "rewrite", ok: false, error: "http_503", promptTokens: null }]);

    const timeout = await callWith("summary", async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    expect(timeout.result).toMatchObject({ kind: "timeout" });
    expect(timeout.lines).toMatchObject([{ level: "warn", kind: "summary", ok: false, error: "timeout" }]);

    const empty = await callWith("extract", async () => new Response(JSON.stringify({ choices: [{ message: { content: " " } }], usage: { prompt_tokens: 5, completion_tokens: 0 } }), { status: 200 }));
    expect(empty.lines).toMatchObject([{ level: "warn", kind: "extract", ok: false, error: "empty", promptTokens: 5, completionTokens: 0 }]);
  });

  it("翻译遇 5xx 重试一次：两次调用各一行", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    let n = 0;
    const pending = callWith("translate", async () => (n++ === 0 ? new Response("err", { status: 500 }) : new Response(JSON.stringify({ choices: [{ message: { content: "Hello" } }] }), { status: 200 })));
    await vi.advanceTimersByTimeAsync(1000);
    const { lines } = await pending;
    vi.useRealTimers();
    expect(lines.map((l) => [l.kind, l.ok, l.error])).toEqual([
      ["translate", false, "http_500"],
      ["translate", true, null],
    ]);
  });
});
