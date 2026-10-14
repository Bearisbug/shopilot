// 模拟器动作：POST /api/mock/sim/{action}（API-MOCK-004）。buyer_image 用 multipart（conversationId、file 可选）。
import { mockGate } from "@/mock/gate";
import { jsonResponse, originOf } from "@/mock/http";
import { runBuyerImage, runSimAction, SIM_ACTIONS, type SimAction } from "@/mock/sim/actions";

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }): Promise<Response> {
  const blocked = await mockGate();
  if (blocked) return blocked;
  const { action } = await ctx.params;
  if (!(SIM_ACTIONS as readonly string[]).includes(action)) return jsonResponse({ ok: false, error: `未知动作 ${action}` }, 404);
  if (action === "buyer_image") {
    const form = await req.formData().catch(() => null);
    const conversationId = String(form?.get("conversationId") ?? "");
    if (!conversationId) return jsonResponse({ ok: false, error: "conversationId 必填" }, 400);
    const file = form?.get("file");
    const upload = file && typeof file !== "string" && file.size > 0 ? { name: file.name, data: Buffer.from(await file.arrayBuffer()) } : null;
    const result = await runBuyerImage({ conversationId, file: upload, origin: originOf(req) });
    return jsonResponse(result, result.ok ? 200 : 400);
  }
  const input = await req.json().catch(() => ({}));
  const result = await runSimAction(action as SimAction, input);
  return jsonResponse(result, result.ok ? 200 : 400);
}
