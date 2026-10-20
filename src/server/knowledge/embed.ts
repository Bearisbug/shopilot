// 问答向量（§12.8「问答检索」）：Cloudflare Workers AI @cf/baai/bge-m3，多语言、1024 维，生产实测单次约 90 ms。
// KNOWLEDGE_MODE=stub 时用替身向量：按字与字的二元组哈希到 1024 维再归一化，相同文本向量相同、字面相近的文本余弦距离也近，不出网。
import { createHash } from "node:crypto";
import { QA_EMBED_DIMS } from "@/server/db/schema";
import { env } from "@/server/env";

export const EMBED_MODEL = "@cf/baai/bge-m3";
export const EMBED_TIMEOUT_MS = 2_000;
/** 一次请求最多送多少段文本 */
const BATCH = 50;

export class EmbedError extends Error {
  constructor(
    public kind: "timeout" | "error",
    message: string,
  ) {
    super(message);
  }
}

/** 每段文本一个向量，顺序与输入一致；任何一批失败整体抛 EmbedError */
export async function embedTexts(texts: string[], timeoutMs = EMBED_TIMEOUT_MS): Promise<number[][]> {
  if (texts.length === 0) return [];
  const e = env();
  if (e.KNOWLEDGE_MODE !== "cloudflare") return texts.map(stubVector);
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) out.push(...(await embedBatch(texts.slice(i, i + BATCH), timeoutMs)));
  return out;
}

async function embedBatch(texts: string[], timeoutMs: number): Promise<number[][]> {
  const e = env();
  const t0 = Date.now();
  let error: string | null = null;
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${e.CLOUDFLARE_ACCOUNT_ID}/ai/run/${EMBED_MODEL}`, {
      method: "POST",
      headers: { authorization: `Bearer ${e.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ text: texts }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; result?: { data?: number[][] } };
    const data = json.result?.data;
    if (!res.ok || !json.success || !Array.isArray(data) || data.length !== texts.length || data.some((v) => !Array.isArray(v) || v.length !== QA_EMBED_DIMS)) {
      error = `http_${res.status}`;
      throw new EmbedError("error", `向量化失败（HTTP ${res.status}）`);
    }
    return data;
  } catch (err) {
    if (err instanceof EmbedError) throw err;
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    error = timeout ? "timeout" : "network";
    throw new EmbedError(timeout ? "timeout" : "error", timeout ? "向量化超时" : `向量化失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    console.log(JSON.stringify({ t: new Date().toISOString(), level: error ? "warn" : "info", msg: "embed call", model: EMBED_MODEL, n: texts.length, ms: Date.now() - t0, ok: !error, error }));
  }
}

/** 替身向量：小写后的单字（含汉字）与相邻二元组各计一次，按哈希落到 1024 维，带正负号，最后 L2 归一化 */
export function stubVector(text: string): number[] {
  const v = new Array<number>(QA_EMBED_DIMS).fill(0);
  const chars = [...text.toLowerCase().replace(/\s+/g, " ").trim()].filter((c) => !/[\s\p{P}]/u.test(c));
  const grams = [...chars, ...chars.slice(1).map((c, i) => chars[i] + c)];
  for (const g of grams) {
    const h = createHash("md5").update(g).digest();
    v[h.readUInt16BE(0) % QA_EMBED_DIMS] += h[2] & 1 ? 1 : -1;
  }
  const norm = Math.hypot(...v);
  if (norm === 0) {
    v[0] = 1;
    return v;
  }
  return v.map((x) => x / norm);
}

/** 问答参与检索的文本：全部问法用「；」连起来（回复不参与，避免长回复冲淡问法） */
export const qaEmbedText = (questions: string[]) => questions.join("；");
