// API-MOCK-009：模拟商户自有系统（ERP）的推送接收端，什么都收、一律 200。
// 用来把模拟应用的回调改到「别处」时让平台的测试推送能通过（真实外部地址在本机连不上）。
import { mockGate } from "@/mock/gate";

export async function POST(): Promise<Response> {
  const blocked = await mockGate();
  if (blocked) return blocked;
  return Response.json({ ok: true });
}
