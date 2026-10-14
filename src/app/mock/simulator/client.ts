// 模拟器前端：调用 /api/mock/sim/* 与 Shopilot 开发接口，及界面用的标签。
import { format } from "date-fns";
import type { SimActionResult, SimPlatform, SimState } from "@/mock/sim/types";

export async function fetchState(shopKey: string | null, conversationId: string | null, signal?: AbortSignal): Promise<SimState> {
  const q = new URLSearchParams();
  if (shopKey) q.set("shop", shopKey);
  if (conversationId) q.set("conversation", conversationId);
  const res = await fetch(`/api/mock/sim/state?${q}`, { cache: "no-store", signal });
  if (!res.ok) throw new Error(res.status === 404 ? "模拟平台没有开启（MOCK_PLATFORM 不是 1）" : `模拟器读数失败（HTTP ${res.status}）`);
  return (await res.json()) as SimState;
}

async function readResult(res: Response): Promise<SimActionResult> {
  try {
    return (await res.json()) as SimActionResult;
  } catch {
    return { ok: false, error: `请求失败（HTTP ${res.status}）` };
  }
}

export async function simAction(action: string, body: unknown): Promise<SimActionResult> {
  const res = await fetch(`/api/mock/sim/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return readResult(res);
}

export async function simImage(conversationId: string, file: File | null): Promise<SimActionResult> {
  const form = new FormData();
  form.set("conversationId", conversationId);
  if (file) form.set("file", file);
  return readResult(await fetch("/api/mock/sim/buyer_image", { method: "POST", body: form }));
}

export async function putFault(body: { platform: SimPlatform; shopId: string; category: string; mode: string; kind: string }): Promise<void> {
  const res = await fetch("/api/mock/sim/faults", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
}

/** 动作结果的推送摘要：「推送 2 条：HTTP 200、HTTP 200」 */
export function pushSummary(r: Extract<SimActionResult, { ok: true }>): string {
  if (r.pushes.length === 0) return "没有推送（回调未配置或未订阅该事件）";
  return `推送 ${r.pushes.length} 条：${r.pushes.map((p) => (p.httpStatus ? `HTTP ${p.httpStatus}` : p.error ?? "失败")).join("、")}`;
}

export const shortTime = (iso: string | null) => (iso ? format(new Date(iso), "MM-dd HH:mm") : "—");
export const clockTime = (iso: string) => format(new Date(iso), "HH:mm:ss");

const SHOPEE_EVENTS: Record<number, string> = { 0: "测试推送", 1: "授权", 2: "取消授权", 3: "订单状态", 4: "运单号", 10: "聊天", 12: "授权将到期", 28: "店铺处罚", 29: "退货", 30: "包裹履约" };
const TIKTOK_EVENTS: Record<number, string> = { 1: "订单状态", 6: "取消授权", 7: "授权将到期", 11: "取消申请", 12: "退货", 13: "新会话段", 14: "新消息" };

export function eventLabel(platform: SimPlatform, event: number): string {
  return platform === "shopee" ? `code ${event} ${SHOPEE_EVENTS[event] ?? ""}`.trim() : `type ${event} ${TIKTOK_EVENTS[event] ?? ""}`.trim();
}

export const AUTH_LABEL: Record<string, string> = { authorized: "已授权", unauthorized: "未授权", deauthorized: "已取消授权" };

export const LANGUAGES: Array<{ value: string; label: string }> = [
  { value: "ms", label: "马来语" },
  { value: "en", label: "英语" },
  { value: "th", label: "泰语" },
  { value: "vi", label: "越南语" },
  { value: "zh", label: "中文" },
  { value: "id", label: "印尼语" },
  { value: "tl", label: "菲律宾语" },
];

export const FAULT_LABEL: Record<string, string> = { send_message: "发送消息", order_read: "订单读取", after_sale_write: "售后写操作" };

export const AI_STUB_OPTIONS: Array<{ value: string; label: string; hint: string }> = [
  { value: "normal", label: "正常出稿", hint: "置信度高的正常回复" },
  { value: "low_confidence", label: "低置信度", hint: "低于阈值，应转人工" },
  { value: "handoff", label: "要求转人工", hint: "handoff = true" },
  { value: "invalid_json", label: "返回非法 JSON", hint: "解析失败，按模型出错处理" },
  { value: "timeout", label: "超时", hint: "按模型超时处理" },
];
