import { desc } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { mockPlatformEnabled } from "@/server/env";
import { stubImageSource } from "@/server/feishu/client";

// API-MOCK-011：飞书卡片投递记录（开发者用，不参与商户权限）；只在 MOCK_PLATFORM=1 时可用。替身图片 key 解出原图地址供预览
export async function GET(req: Request) {
  if (!mockPlatformEnabled()) return new Response("Not Found", { status: 404 });
  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 100) || 100, 500);
  const rows = await db().select().from(schema.feishuDelivery).orderBy(desc(schema.feishuDelivery.createdAt)).limit(limit);
  const images: Record<string, string> = {};
  for (const r of rows) {
    for (const m of JSON.stringify(r.card ?? {}).matchAll(/"img_key":"([^"]+)"/g)) {
      const src = stubImageSource(m[1]);
      if (src) images[m[1]] = src;
    }
  }
  const items = rows.map((r) => ({
    id: r.id,
    merchantId: r.merchantId,
    conversationId: r.conversationId,
    ticketId: r.ticketId,
    kind: r.kind,
    status: r.status,
    targetName: r.targetName,
    attempts: r.attempts,
    messageId: r.messageId,
    stub: r.stub,
    error: r.error,
    card: r.card,
    createdAt: r.createdAt.toISOString(),
    sentAt: r.sentAt?.toISOString() ?? null,
  }));
  return new Response(JSON.stringify({ items, images }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
