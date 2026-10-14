import { acceptWebhook } from "@/server/inbound/accept";

export const dynamic = "force-dynamic";

// key：商户专属码（merchant.webhook_key），或旧推送地址里的应用 ID
export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  return acceptWebhook("tiktok", (await ctx.params).key, req);
}
