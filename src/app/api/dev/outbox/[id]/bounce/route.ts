import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db/client";
import { mockPlatformEnabled } from "@/server/env";
import { markInvoiceEmailBounced } from "@/server/invoices/service";

// 发件箱「标记退信」（§11.9 bounce）：邮件状态改为 bounced；发票邮件另由发票模块建「开票」工单
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!mockPlatformEnabled()) return new Response("Not Found", { status: 404 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not Found", { status: 404 });
  const invoice = await markInvoiceEmailBounced(id);
  const [row] = invoice
    ? await db().select().from(schema.emailOutbox).where(eq(schema.emailOutbox.id, id)).limit(1)
    : await db().update(schema.emailOutbox).set({ status: "bounced" }).where(eq(schema.emailOutbox.id, id)).returning();
  if (!row) return new Response("Not Found", { status: 404 });
  return new Response(JSON.stringify({ id: row.id, status: row.status, invoice }), { headers: { "content-type": "application/json; charset=utf-8" } });
}
