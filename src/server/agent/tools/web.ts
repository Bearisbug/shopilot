// 联网搜索（ADR-021，§17）：会话学习与按卡体检的 Agent 用它查证产品参数、功能、兼容这类事实，出稿不调用。
// 调 DeepSeek Search，每次 5 条结果，只给标题、链接、站点、日期与摘要；检索词不进日志与运行步骤。AI_MODE=stub 时返回固定的替身结果，不出网。
import { z } from "zod";
import { env } from "@/server/env";
import { defineTool, type AgentTool } from "./registry";

const SEARCH_URL = "https://api.deepseek.com/v1/tools/search";
/** 每次运行最多搜几次 */
export const WEB_SEARCH_MAX = 3;
const RESULTS = 5;
const TIMEOUT_MS = 10_000;
const SUMMARY_MAX = 800;

export type WebHit = { title: string; url: string; site: string | null; date: string | null; summary: string };
type RawHit = { title?: string | null; url?: string | null; site_name?: string | null; date?: string | null; summary?: string | null; snippet?: string | null };

const clip = (s: string, n: number) => {
  const chars = [...s];
  return chars.length > n ? `${chars.slice(0, n).join("")}…` : s;
};

/** 搜一次；HTTP 错误、超时、网络错误抛错（工具里会作为出错交给模型） */
export async function webSearch(query: string): Promise<WebHit[]> {
  const e = env();
  if (e.AI_MODE === "stub") return [{ title: "替身网页：产品参数", url: "https://example.com/specs", site: "example.com", date: null, summary: "替身摘要：产品参数与功能说明。" }];
  if (!e.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY 未配置");
  const t0 = Date.now();
  let status: number | null = null;
  let error: string | null = null;
  let results = 0;
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${e.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ query, count: RESULTS }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = res.status;
    const json = (await res.json().catch(() => ({}))) as { results?: RawHit[] };
    if (!res.ok) {
      error = `http_${res.status}`;
      throw new Error(`联网搜索失败（HTTP ${res.status}）`);
    }
    const hits = (json.results ?? [])
      .filter((r) => r.url)
      .slice(0, RESULTS)
      .map((r) => ({ title: r.title ?? "", url: r.url!, site: r.site_name ?? null, date: r.date ?? null, summary: clip(r.summary || r.snippet || "", SUMMARY_MAX) }));
    results = hits.length;
    return hits;
  } catch (err) {
    if (error) throw err;
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    error = timeout ? "timeout" : "network";
    throw new Error(timeout ? "联网搜索超时" : `联网搜索失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    console.log(JSON.stringify({ t: new Date().toISOString(), level: error ? "warn" : "info", msg: "web search call", status, ms: Date.now() - t0, results, error }));
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** Agent 的联网搜索工具：结果摘要只记条数与站点，不记检索词 */
export function webSearchTool(): AgentTool {
  return defineTool({
    name: "web_search",
    description:
      "联网搜索公开网页，查证产品参数、功能、兼容这类事实（每次 5 条：标题、链接、站点、日期、摘要）。查品牌官网时在 query 里加 site:官网域名。退换、保修、物流、价格以本商户的问答和卡为准，网页说法不算依据。query 里不要写买家姓名、电话、地址、订单号。",
    tier: "read",
    max: WEB_SEARCH_MAX,
    input: { query: z.string().min(1).max(128) },
    run: async ({ query }) => {
      const hits = await webSearch(query);
      const sites = [...new Set(hits.map((h) => hostOf(h.url)).filter((h): h is string => !!h))];
      return { result: hits, note: hits.length ? `联网搜到 ${hits.length} 条（${sites.slice(0, 3).join("、")}${sites.length > 3 ? " 等" : ""}）` : "联网没搜到结果" };
    },
  });
}
