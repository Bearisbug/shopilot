// 逐店能力检查（REQ-SHOP-005、DESIGN §9.2 能力表）：能否收发聊天、查订单、收件人是否打码。
// 结果写回 shop.capabilities；同一家店 60 秒内重复检查读缓存（API-SHOP-006）。
import { eq } from "drizzle-orm";
import { db, schema, type Executor } from "@/server/db/client";
import { capabilitiesFor } from "@/server/platforms/capabilities";
import { withShop, type ShopClient } from "@/server/platforms/clients";
import { shopeeConversations, shopeeOrderDetails, shopeeOrderSns } from "@/server/platforms/shopee";
import { tiktokConversations, tiktokSearchOrders } from "@/server/platforms/tiktok";
import { PlatformError, platformErrorText } from "@/server/platforms/types";
import type { ShopCapabilities } from "@/server/db/schema";

export type ProbeOutcome = {
  chat: { ok: boolean; reason?: string };
  orders: { ok: boolean; reason?: string };
  /** null = 近期没有订单，判断不了 */
  piiMasked: boolean | null;
  at: number;
};

const CACHE_MS = 60_000;
const g = globalThis as unknown as { __shopilotProbe?: Map<string, ProbeOutcome> };
const cache = () => (g.__shopilotProbe ??= new Map());

/** 授权时的初始能力表：TikTok 商品权限看 token 授予的 scope；聊天、订单、打码由 probeShop 实测后覆盖 */
export function initialCapabilities(platform: "shopee" | "tiktok", grantedScopes?: string[]): ShopCapabilities {
  const productScope = platform === "shopee" || (grantedScopes ?? []).some((s) => s.startsWith("seller.product"));
  return capabilitiesFor(platform, { chat: true, orders: true, piiMasked: true, productScope });
}

function chatReason(c: ShopClient, e: unknown): string {
  if (e instanceof PlatformError && e.kind === "forbidden") {
    return c.platform === "shopee"
      ? "Shopee 返回这家店没有聊天接口权限：先确认应用类型是 Seller In-house System，再按 Shopee 聊天白名单说明申请（准备清单第 4 项）。"
      : "店铺没有授予客服权限：在 Partner Center 申请客服接口，批下来后续期授权（准备清单第 4 项）。";
  }
  return e instanceof PlatformError ? platformErrorText(e) : "检查时出错，请稍后重试。";
}

function ordersReason(e: unknown): string {
  if (e instanceof PlatformError && e.kind === "forbidden") return "应用没有订单读取权限：在平台控制台给应用勾选订单权限后续期授权。";
  return e instanceof PlatformError ? platformErrorText(e) : "检查时出错，请稍后重试。";
}

async function run(c: ShopClient): Promise<ProbeOutcome> {
  const out: ProbeOutcome = { chat: { ok: false }, orders: { ok: false }, piiMasked: null, at: Date.now() };
  try {
    if (c.platform === "shopee") await shopeeConversations(c.app, c.auth, null, 1);
    else await tiktokConversations(c.app, c.auth, null, 1);
    out.chat = { ok: true };
  } catch (e) {
    out.chat = { ok: false, reason: chatReason(c, e) };
  }
  try {
    const since = new Date(Date.now() - 15 * 86400_000);
    if (c.platform === "shopee") {
      const sns = await shopeeOrderSns(c.app, c.auth, since, new Date(), "create_time");
      if (sns.length) {
        const [o] = await shopeeOrderDetails(c.app, c.auth, sns.slice(0, 1));
        out.piiMasked = o?.recipient ? o.recipient.masked : null;
      }
    } else {
      const page = await tiktokSearchOrders(c.app, c.auth, { createTimeGe: since }, null);
      const o = page.items[0];
      out.piiMasked = o?.recipient ? o.recipient.masked : null;
    }
    out.orders = { ok: true };
  } catch (e) {
    out.orders = { ok: false, reason: ordersReason(e) };
  }
  return out;
}

/** 实测一家店并写回能力表；fresh = true 时忽略缓存 */
export async function probeShop(shopId: string, opts: { fresh?: boolean } = {}): Promise<ProbeOutcome> {
  const hit = cache().get(shopId);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_MS) return hit;
  let out: ProbeOutcome;
  try {
    out = await withShop(shopId, run);
  } catch (e) {
    const reason = e instanceof PlatformError ? platformErrorText(e) : "店铺授权已失效，续期授权后再检查。";
    out = { chat: { ok: false, reason }, orders: { ok: false, reason }, piiMasked: null, at: Date.now() };
  }
  cache().set(shopId, out);
  await saveCapabilities(shopId, out);
  return out;
}

async function saveCapabilities(shopId: string, out: ProbeOutcome, ex: Executor = db()) {
  const [row] = await ex.select({ platform: schema.shop.platform, capabilities: schema.shop.capabilities }).from(schema.shop).where(eq(schema.shop.id, shopId)).limit(1);
  if (!row) return;
  const next = capabilitiesFor(row.platform, {
    chat: out.chat.ok,
    chatReason: out.chat.reason,
    orders: out.orders.ok,
    ordersReason: out.orders.reason,
    piiMasked: out.piiMasked ?? row.capabilities.piiMasked,
    productScope: row.capabilities.productScope,
  });
  await ex.update(schema.shop).set({ capabilities: next, updatedAt: new Date() }).where(eq(schema.shop.id, shopId));
}

export function forgetProbe(shopId: string) {
  cache().delete(shopId);
}
