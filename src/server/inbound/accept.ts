// 平台回调入站（API-HOOK-001、API-HOOK-002）：验签 → 按事件 ID 幂等落 inbound_event → 排 inbound.process → 立即 200（DESIGN §11.3 accept）。
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { decrypt, sha256 } from "@/server/core/crypto";
import { db, schema } from "@/server/db/client";
import { Problem } from "@/server/http/problem";
import { enqueue } from "@/server/jobs/boss";
import { webhookUrl } from "@/server/platforms/clients";
import { verifyShopeePush, verifyTiktokWebhook } from "@/server/platforms/signing";

/** 处理清单（DESIGN §8.4）；其余事件落库为 ignored */
const HANDLED: Record<"shopee" | "tiktok", Set<number>> = {
  shopee: new Set([10, 3, 4, 29, 30, 1, 2, 12, 28]),
  tiktok: new Set([1, 6, 7, 11, 12, 13, 14]),
};

/** 按键排序后序列化，用于给没有事件 ID 的 Shopee 推送算稳定摘要 */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

export async function acceptWebhook(platform: "shopee" | "tiktok", appId: string, req: Request): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  const instance = new URL(req.url).pathname;
  const fail = (p: Problem) => p.toResponse(instance, requestId);
  const raw = await req.text();
  if (!/^[0-9a-f-]{36}$/i.test(appId)) return fail(new Problem("signature"));
  const [app] = await db().select().from(schema.platformApp).where(and(eq(schema.platformApp.id, appId), eq(schema.platformApp.platform, platform))).limit(1);
  if (!app) return fail(new Problem("signature"));

  const auth = req.headers.get("authorization");
  const secret = decrypt(app.secretEnc);
  const ok =
    platform === "shopee"
      ? [app.pushKeyEnc ? decrypt(app.pushKeyEnc) : null, secret].some((k) => k && verifyShopeePush(k, webhookUrl("shopee", appId), raw, auth))
      : verifyTiktokWebhook(secret, app.appKey, raw, auth);
  if (!ok) {
    console.warn(JSON.stringify({ t: new Date().toISOString(), level: "warn", msg: "webhook signature rejected", platform, appId, requestId }));
    return fail(new Problem("signature"));
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return fail(new Problem("validation", { detail: "body is not json" }));
  }

  const code = Number(platform === "shopee" ? body.code : body.type);
  const externalShopId = body.shop_id !== undefined && body.shop_id !== null ? String(body.shop_id) : null;
  let eventId: string;
  if (platform === "tiktok") eventId = String(body.tts_notification_id ?? sha256(raw));
  else if (code === 10) eventId = `10:${String(((body.data as Record<string, unknown> | undefined)?.content as Record<string, unknown> | undefined)?.message_id ?? sha256(raw))}`;
  else if (code === 0) eventId = `0:${body.timestamp ?? ""}`;
  else eventId = `${code}:${externalShopId ?? ""}:${sha256(stable(body.data ?? {}))}`;

  const [shop] = externalShopId
    ? await db()
        .select({ id: schema.shop.id })
        .from(schema.shop)
        .where(and(eq(schema.shop.platformAppId, app.id), eq(schema.shop.externalShopId, externalShopId)))
        .limit(1)
    : [];
  const handled = HANDLED[platform].has(code);
  const [row] = await db()
    .insert(schema.inboundEvent)
    .values({
      merchantId: app.merchantId,
      platformAppId: app.id,
      platform,
      shopId: shop?.id ?? null,
      externalEventId: eventId,
      eventType: `${platform}:${code}`,
      payload: body,
      status: handled ? "queued" : "ignored",
      error: handled ? null : "事件类型不在处理清单",
      processedAt: handled ? null : new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: schema.inboundEvent.id });
  if (row && handled) await enqueueInbound(row.id, app.id, externalShopId);
  return new Response(null, { status: 200, headers: { "x-request-id": requestId, "cache-control": "no-store" } });
}

/** 同一店铺的事件按到达顺序处理（key_strict_fifo 的 singletonKey） */
export function enqueueInbound(eventId: string, appId: string, externalShopId: string | null, startAfter?: number) {
  return enqueue("inbound.process", { eventId }, { singletonKey: `${appId}:${externalShopId ?? "app"}`, startAfter });
}
