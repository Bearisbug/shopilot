// 联网搜索（ADR-021）：替身不出网；真实模式按 DeepSeek Search 的请求与返回结构走，失败抛错；日志与步骤摘要不带检索词与密钥。
import { afterEach, describe, expect, it, vi } from "vitest";
import { webSearch, webSearchTool } from "./web";

// env() 读一次就缓存，这里每次按当前的环境变量现读，同一文件里才能先测替身再测真实模式
vi.mock("@/server/env", () => ({ env: () => ({ AI_MODE: process.env.AI_MODE, DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY }) }));

const QUERY = "Tiny 2 云台转动角度 site:obsbot.com";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** 真实模式下搜一次，fetch 由 respond 决定；返回结果或错误、fetch 的调用与日志行 */
async function searchWith(respond: () => Promise<Response>) {
  vi.stubEnv("AI_MODE", "deepseek");
  vi.stubEnv("DEEPSEEK_API_KEY", "sk-test");
  const fetchMock = vi.fn(respond);
  vi.stubGlobal("fetch", fetchMock);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  log.mockClear();
  const result = await webSearch(QUERY).catch((e: unknown) => e);
  const lines = log.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('"web search call"'));
  return { result, fetchMock, lines: lines.map((l) => JSON.parse(l) as Record<string, unknown>), raw: lines.join("\n") };
}

describe("联网搜索", () => {
  it("替身模式返回固定结果，不出网", async () => {
    vi.stubEnv("AI_MODE", "stub");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await webSearch(QUERY)).toEqual([{ title: "替身网页：产品参数", url: "https://example.com/specs", site: "example.com", date: null, summary: "替身摘要：产品参数与功能说明。" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("成功：要 5 条，只留标题、链接、站点、日期与摘要；没有链接的丢掉，摘要缺时用短摘要，超长截到 800 字", async () => {
    const results = [
      { title: "OBSBOT Tiny 2", url: "https://www.obsbot.com/tiny-2", site_name: "OBSBOT", date: "2026-03-01T00:00:00Z", summary: "云".repeat(900), content: "正文", rerank_score: 2.1 },
      { title: "没有链接", url: null, summary: "丢掉" },
      { title: "规格", url: "https://www.obsbot.com/tiny-2/specs", site_name: null, date: null, summary: "", snippet: "水平 ±150°" },
    ];
    const { result, fetchMock, lines, raw } = await searchWith(async () => new Response(JSON.stringify({ results }), { status: 200 }));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/v1/tools/search");
    expect(JSON.parse(String(init.body))).toEqual({ query: QUERY, count: 5 });
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    expect(result).toEqual([
      { title: "OBSBOT Tiny 2", url: "https://www.obsbot.com/tiny-2", site: "OBSBOT", date: "2026-03-01T00:00:00Z", summary: `${"云".repeat(800)}…` },
      { title: "规格", url: "https://www.obsbot.com/tiny-2/specs", site: null, date: null, summary: "水平 ±150°" },
    ]);
    expect(lines).toEqual([{ t: expect.any(String), level: "info", msg: "web search call", status: 200, ms: expect.any(Number), results: 2, error: null }]);
    expect(raw).not.toContain("Tiny 2");
    expect(raw).not.toContain("sk-test");
  });

  it("失败：HTTP 错误、超时各抛错并记一行 warn", async () => {
    const http = await searchWith(async () => new Response(JSON.stringify({ error: { message: "Insufficient Balance" } }), { status: 402 }));
    expect((http.result as Error).message).toBe("联网搜索失败（HTTP 402）");
    expect(http.lines).toMatchObject([{ level: "warn", status: 402, results: 0, error: "http_402" }]);

    const timeout = await searchWith(async () => Promise.reject(Object.assign(new Error("timed out"), { name: "TimeoutError" })));
    expect((timeout.result as Error).message).toBe("联网搜索超时");
    expect(timeout.lines).toMatchObject([{ level: "warn", status: null, error: "timeout" }]);
  });

  it("工具：每次运行最多 3 次，步骤摘要只记条数与站点，不记检索词", async () => {
    vi.stubEnv("AI_MODE", "deepseek");
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const results = ["https://www.obsbot.com/a", "https://obsbot.com/b", "https://shopee.com.my/c", "https://a.example/d", "https://b.example/e"].map((url) => ({ title: "t", url, summary: "s" }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results }), { status: 200 })));
    const tool = webSearchTool();
    expect(tool).toMatchObject({ name: "web_search", tier: "read", max: 3 });
    const out = await tool.run({ query: QUERY });
    expect(out.note).toBe("联网搜到 5 条（obsbot.com、shopee.com.my、a.example 等）");
    expect(out.note).not.toContain("Tiny");

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })));
    expect((await tool.run({ query: QUERY })).note).toBe("联网没搜到结果");
  });
});
