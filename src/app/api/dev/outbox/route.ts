import { desc, ilike } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { mockPlatformEnabled } from "@/server/env";

// API-MOCK-006：发件箱列表与正文（开发者用，不参与商户权限）；只在 MOCK_PLATFORM=1 时可用
export async function GET(req: Request) {
  if (!mockPlatformEnabled()) return new Response("Not Found", { status: 404 });
  const url = new URL(req.url);
  const to = url.searchParams.get("to")?.trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 500);
  const rows = await db()
    .select()
    .from(schema.emailOutbox)
    .where(to ? ilike(schema.emailOutbox.toEmail, `%${to}%`) : undefined)
    .orderBy(desc(schema.emailOutbox.createdAt))
    .limit(limit);
  const items = rows.map((r) => ({
    id: r.id,
    to: r.toEmail,
    template: r.template,
    subject: r.subject,
    body: r.body,
    links: r.links,
    attachments: r.attachments.map((a) => ({ ...a, url: `/api/dev/outbox/${r.id}/attachments/${a.fileId}` })),
    status: r.status,
    refType: r.refType,
    refId: r.refId,
    createdAt: r.createdAt.toISOString(),
  }));
  return new Response(JSON.stringify({ items }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
