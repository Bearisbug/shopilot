// 模拟器读数：GET /api/mock/sim/state?shop=<platform:shopId>&conversation=<id>（API-MOCK-005）
import { mockGate } from "@/mock/gate";
import { jsonResponse } from "@/mock/http";
import { getSimState } from "@/mock/sim/state";

export async function GET(req: Request): Promise<Response> {
  const blocked = await mockGate();
  if (blocked) return blocked;
  const q = new URL(req.url).searchParams;
  return jsonResponse(await getSimState({ shopKey: q.get("shop"), conversationId: q.get("conversation") }));
}
