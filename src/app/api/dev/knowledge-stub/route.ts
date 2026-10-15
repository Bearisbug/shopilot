import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/server/db/client";
import { mockPlatformEnabled } from "@/server/env";

// 开发接口 API-MOCK-010：检索替身（KNOWLEDGE_MODE=stub）的下一次表现与最近几次检索请求；只在 MOCK_PLATFORM=1 时可用
const body = z.object({ next: z.enum(["normal", "no_vector", "timeout", "error", "ingest_error"]), sticky: z.boolean().default(false) });

const notFound = () => new Response("Not Found", { status: 404 });
const out = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function state() {
  const [row] = await db().select().from(schema.devKnowledgeStub).where(eq(schema.devKnowledgeStub.id, 1)).limit(1);
  return { next: row?.next ?? "normal", sticky: row?.sticky ?? false, lastQuery: row?.lastQuery ?? [] };
}

export async function GET() {
  if (!mockPlatformEnabled()) return notFound();
  return out(await state());
}

export async function PUT(req: Request) {
  if (!mockPlatformEnabled()) return notFound();
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message }), { status: 422, headers: { "content-type": "application/json" } });
  await db()
    .insert(schema.devKnowledgeStub)
    .values({ id: 1, next: parsed.data.next, sticky: parsed.data.sticky })
    .onConflictDoUpdate({ target: schema.devKnowledgeStub.id, set: { next: parsed.data.next, sticky: parsed.data.sticky, updatedAt: new Date() } });
  return out(await state());
}
