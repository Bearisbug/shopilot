import { acceptWebhook } from "@/server/inbound/accept";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ appId: string }> }) {
  return acceptWebhook("tiktok", (await ctx.params).appId, req);
}
