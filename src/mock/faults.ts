// 故障注入：按店按接口类别让调用失败或延迟 12 秒，供测试文档覆盖失败与超时路径。
import { and, asc, eq, sql } from "drizzle-orm";
import { mockDb } from "./db/client";
import { mockFault, type FaultCategory, type MockPlatform } from "./db/schema";

export const FAULT_CATEGORIES: FaultCategory[] = ["send_message", "order_read", "after_sale_write"];
export const FAULT_TIMEOUT_MS = 12_000;

/** 命中则返回故障类型；once 模式命中后即删除。 */
export async function takeFault(platform: MockPlatform, shopId: string, category: FaultCategory): Promise<"error" | "timeout" | null> {
  const where = and(eq(mockFault.platform, platform), eq(mockFault.shopId, shopId), eq(mockFault.category, category));
  const [f] = await mockDb().select().from(mockFault).where(where).limit(1);
  if (!f) return null;
  if (f.mode === "once") await mockDb().delete(mockFault).where(where);
  else await mockDb().update(mockFault).set({ hits: sql`${mockFault.hits} + 1` }).where(where);
  return f.kind;
}

export async function listFaults() {
  return mockDb().select().from(mockFault).orderBy(asc(mockFault.platform), asc(mockFault.shopId), asc(mockFault.category));
}

/** mode = off 时清除该店该类别的故障。 */
export async function setFault(input: { platform: MockPlatform; shopId: string; category: FaultCategory; mode: "once" | "sticky" | "off"; kind?: "error" | "timeout" }): Promise<void> {
  const where = and(eq(mockFault.platform, input.platform), eq(mockFault.shopId, input.shopId), eq(mockFault.category, input.category));
  await mockDb().delete(mockFault).where(where);
  if (input.mode === "off") return;
  await mockDb().insert(mockFault).values({ platform: input.platform, shopId: input.shopId, category: input.category, mode: input.mode, kind: input.kind ?? "error" });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
