// 从库里取平台应用与店铺凭证，交给适配器；access token 快到期先刷新，鉴权失败时店铺转「授权失效」（DESIGN §11.6）。
import { and, eq } from "drizzle-orm";
import { audit, systemActor } from "@/server/core/audit";
import { decrypt, encrypt } from "@/server/core/crypto";
import { admins, notify } from "@/server/core/notify";
import { db, schema, type Executor } from "@/server/db/client";
import { env } from "@/server/env";
import { shopeeRefresh, type ShopeeApp, type ShopeeShopAuth } from "./shopee";
import { tiktokRefresh, type TiktokApp, type TiktokShopAuth } from "./tiktok";
import { PlatformError } from "./types";

export type AppRow = typeof schema.platformApp.$inferSelect;
export type ShopRow = typeof schema.shop.$inferSelect;

export const webhookUrl = (platform: "shopee" | "tiktok", appId: string) => `${env().APP_BASE_URL}/api/webhooks/${platform}/${appId}`;
export const oauthRedirectUrl = (platform: "shopee" | "tiktok") => `${env().APP_BASE_URL}/api/v1/oauth/${platform}/callback`;

export function shopeeApp(app: AppRow): ShopeeApp {
  if (!app.apiHost) throw new Error("Shopee 应用还没识别出区域主机");
  return { partnerId: app.appKey, partnerKey: decrypt(app.secretEnc), host: app.apiHost };
}

export function tiktokApp(app: AppRow): TiktokApp {
  return { appKey: app.appKey, appSecret: decrypt(app.secretEnc), serviceId: app.serviceId };
}

export type ShopClient =
  | { platform: "shopee"; shop: ShopRow; appRow: AppRow; app: ShopeeApp; auth: ShopeeShopAuth }
  | { platform: "tiktok"; shop: ShopRow; appRow: AppRow; app: TiktokApp; auth: TiktokShopAuth };

/** 店铺不可调平台（已断开、授权失效、没有 token）时抛出，调用方转成 409 shop_auth_expired */
export class ShopUnavailableError extends Error {
  constructor(public shopId: string, public status: string) {
    super(status === "auth_expired" ? "店铺授权已失效，请到「店铺与连接」续期授权。" : status === "disconnected" ? "店铺已断开连接。" : "店铺还没有可用的授权，请到「店铺与连接」完成授权。");
  }
}

const REFRESH_AHEAD_MS = 5 * 60_000;

/** 取店铺客户端；access token 5 分钟内到期就先刷新 */
export async function shopClient(shopId: string): Promise<ShopClient> {
  let [row] = await db().select().from(schema.shop).where(eq(schema.shop.id, shopId)).limit(1);
  if (!row) throw new ShopUnavailableError(shopId, "missing");
  if (row.status !== "connected" || !row.accessTokenEnc) throw new ShopUnavailableError(shopId, row.status);
  if (!row.accessExpiresAt || row.accessExpiresAt.getTime() - Date.now() < REFRESH_AHEAD_MS) {
    row = await refreshShopToken(shopId);
    if (row.status !== "connected") throw new ShopUnavailableError(shopId, row.status);
  }
  const [appRow] = await db().select().from(schema.platformApp).where(eq(schema.platformApp.id, row.platformAppId)).limit(1);
  const accessToken = decrypt(row.accessTokenEnc!);
  if (row.platform === "shopee") return { platform: "shopee", shop: row, appRow, app: shopeeApp(appRow), auth: { shopId: row.externalShopId, accessToken } };
  return { platform: "tiktok", shop: row, appRow, app: tiktokApp(appRow), auth: { accessToken, cipher: row.shopCipher ?? "" } };
}

/**
 * 调平台；返回鉴权错误时刷新一次 token 再试（鉴权错误说明平台没有执行，重试不会重复副作用）。
 * 刷新仍失败时店铺已转 auth_expired，抛 ShopUnavailableError。
 */
export async function withShop<T>(shopId: string, fn: (c: ShopClient) => Promise<T>): Promise<T> {
  const c = await shopClient(shopId);
  try {
    return await fn(c);
  } catch (e) {
    if (!(e instanceof PlatformError) || e.kind !== "auth") throw e;
    const row = await refreshShopToken(shopId, { force: true });
    if (row.status !== "connected") throw new ShopUnavailableError(shopId, row.status);
    return fn(await shopClient(shopId));
  }
}

/**
 * 刷新一家店的 token（行锁防并发）。TikTok 一个卖家 token 覆盖同站点多家店，刷新后同步到同 refresh token 的兄弟店。
 * 平台返回鉴权失败 → 店铺转 auth_expired 并通知管理员（refresh_failed）；网络或平台 5xx 抛出，由调用方重试。
 */
export async function refreshShopToken(shopId: string, opts: { force?: boolean } = {}): Promise<ShopRow> {
  return db().transaction(async (tx) => {
    const [row] = await tx.select().from(schema.shop).where(eq(schema.shop.id, shopId)).for("update").limit(1);
    if (!row || row.status !== "connected" || !row.refreshTokenEnc) return row;
    if (!opts.force && row.accessExpiresAt && row.accessExpiresAt.getTime() - Date.now() >= REFRESH_AHEAD_MS) return row;
    const [appRow] = await tx.select().from(schema.platformApp).where(eq(schema.platformApp.id, row.platformAppId)).limit(1);
    const oldRefresh = decrypt(row.refreshTokenEnc);
    try {
      if (row.platform === "shopee") {
        const t = await shopeeRefresh(shopeeApp(appRow), row.externalShopId, oldRefresh);
        const [updated] = await tx
          .update(schema.shop)
          .set({ accessTokenEnc: encrypt(t.accessToken), refreshTokenEnc: encrypt(t.refreshToken), accessExpiresAt: t.accessExpiresAt, updatedAt: new Date() })
          .where(eq(schema.shop.id, row.id))
          .returning();
        return updated;
      }
      const t = await tiktokRefresh(tiktokApp(appRow), oldRefresh);
      const siblings = await tx.select().from(schema.shop).where(and(eq(schema.shop.platformAppId, row.platformAppId), eq(schema.shop.status, "connected")));
      let self = row;
      for (const s of siblings) {
        if (s.id !== row.id && (!s.refreshTokenEnc || decrypt(s.refreshTokenEnc) !== oldRefresh)) continue;
        const [u] = await tx
          .update(schema.shop)
          .set({ accessTokenEnc: encrypt(t.accessToken), refreshTokenEnc: encrypt(t.refreshToken), accessExpiresAt: t.accessExpiresAt, authExpiresAt: t.authExpiresAt, updatedAt: new Date() })
          .where(eq(schema.shop.id, s.id))
          .returning();
        if (s.id === row.id) self = u;
      }
      return self;
    } catch (e) {
      if (e instanceof PlatformError && e.kind === "auth") return markAuthExpired(row, "refresh_failed", `刷新授权失败（${e.code}）`, tx);
      throw e;
    }
  });
}

/** 店铺转「授权失效」：停止拉取与发送、写连接事件、通知管理员、审计（refresh_failed / deauthorized） */
export async function markAuthExpired(row: ShopRow, event: "refresh_failed" | "deauthorized", reason: string, tx: Executor = db()): Promise<ShopRow> {
  if (row.status !== "connected") return row;
  const [updated] = await tx.update(schema.shop).set({ status: "auth_expired", updatedAt: new Date() }).where(eq(schema.shop.id, row.id)).returning();
  await tx.insert(schema.shopEvent).values({ merchantId: row.merchantId, shopId: row.id, kind: event, text: reason });
  await notify(
    {
      merchantId: row.merchantId,
      membershipIds: await admins(row.merchantId, tx),
      event: "shop_disconnected",
      title: `${row.name} 授权失效`,
      body: `${reason}。该店暂停收发消息，请到「店铺与连接」续期授权。`,
      link: `/shops?shop=${row.id}`,
      dedupeKey: `shop_auth:${row.id}`,
    },
    tx,
  );
  await audit(systemActor(row.merchantId), { module: "shops", action: event === "deauthorized" ? "shop_deauthorized" : "shop_refresh_failed", summary: `${row.name}：${reason}`, targetType: "shop", targetId: row.id }, tx);
  return updated;
}
