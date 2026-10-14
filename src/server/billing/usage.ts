// 出稿计量（REQ-AI-005）：由「用量与套餐」实现；AI 出稿前调用 reserveDraft，跨过提醒阈值时由这里发提醒。
import type { Executor } from "../db/client";

export type DraftReservation = { allowed: boolean; used: number; quota: number; reason?: "quota" };

/** 在当期用量周期上原子 +1；策略为 stop 且已用尽时不加并返回 allowed=false。实现见用量与套餐模块。 */
export async function reserveDraft(merchantId: string, tx?: Executor): Promise<DraftReservation> {
  const impl = await import("./usage-impl");
  return impl.reserveDraftImpl(merchantId, tx);
}
