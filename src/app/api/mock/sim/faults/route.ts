// 故障注入：GET 列表；PUT { platform, shopId, category, mode: once|sticky|off, kind: error|timeout }
import { z } from "zod";
import { FAULT_CATEGORIES, listFaults, setFault } from "@/mock/faults";
import { mockGate } from "@/mock/gate";
import { jsonResponse } from "@/mock/http";

const Input = z.object({
  platform: z.enum(["shopee", "tiktok"]),
  shopId: z.string().min(1),
  category: z.enum(FAULT_CATEGORIES as [string, ...string[]]),
  mode: z.enum(["once", "sticky", "off"]),
  kind: z.enum(["error", "timeout"]).default("error"),
});

export async function GET(): Promise<Response> {
  const blocked = await mockGate();
  if (blocked) return blocked;
  return jsonResponse({ items: await listFaults() });
}

export async function PUT(req: Request): Promise<Response> {
  const blocked = await mockGate();
  if (blocked) return blocked;
  const parsed = Input.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}：${i.message}`).join("；") }, 400);
  const d = parsed.data;
  await setFault({ platform: d.platform, shopId: d.shopId, category: d.category as (typeof FAULT_CATEGORIES)[number], mode: d.mode, kind: d.kind });
  return jsonResponse({ ok: true, items: await listFaults() });
}
