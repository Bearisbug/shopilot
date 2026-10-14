// 店铺定时任务（DESIGN §17）：token.refresh（每 10 分钟）与 shop.metrics（每小时）。
import { TZDate } from "@date-fns/tz";
import { addDays, format, startOfMonth, subMonths } from "date-fns";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import type { ShopMetric, ShopPeriod } from "@/contracts/shops";
import { decrypt } from "@/server/core/crypto";
import { admins, notify } from "@/server/core/notify";
import { db, schema } from "@/server/db/client";
import { refreshShopToken, shopeeApp, tiktokApp, withShop, type ShopRow } from "@/server/platforms/clients";
import { shopeeAuthedShops, shopeePerformance } from "@/server/platforms/shopee";
import { tiktokAuthorizedShops, tiktokPerformance } from "@/server/platforms/tiktok";
import { PlatformError } from "@/server/platforms/types";

const REFRESH_WINDOW_MS = 30 * 60_000;
const DAY = 86400_000;

function log(line: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...line }));
}

// ---------- token.refresh ----------

/**
 * 1. 每个 Shopee 应用调一次 get_shops_by_partner，同步各店授权到期；已不在授权列表或已过期的店强制刷新一次
 * 2. 每个 TikTok 卖家授权用一家店的 access token 调一次 Get Authorized Shops，鉴权失败的强制刷新
 * 3. access token 30 分钟内到期的店刷新；刷新鉴权失败由 refreshShopToken 转 auth_expired 并通知管理员（11.6 refresh_failed）
 * 4. 授权 30 天内、7 天内到期各提醒一次（规则 auth_expiring），记在 shop.auth_reminded_at
 */
export async function tokenRefreshJob(): Promise<void> {
  const shops = await db()
    .select()
    .from(schema.shop)
    .where(and(eq(schema.shop.status, "connected"), isNotNull(schema.shop.refreshTokenEnc)))
    .limit(5000);
  const force = new Set<string>();

  const byApp = new Map<string, ShopRow[]>();
  for (const s of shops) byApp.set(s.platformAppId, [...(byApp.get(s.platformAppId) ?? []), s]);
  const apps = byApp.size ? await db().select().from(schema.platformApp).where(inArray(schema.platformApp.id, [...byApp.keys()])) : [];

  for (const app of apps) {
    const list = byApp.get(app.id) ?? [];
    try {
      if (app.platform === "shopee") {
        const authed = new Map((await shopeeAuthedShops(shopeeApp(app))).map((a) => [a.shopId, a]));
        for (const s of list) {
          const a = authed.get(s.externalShopId);
          if (!a || (a.expireTime && a.expireTime.getTime() < Date.now())) {
            force.add(s.id);
            continue;
          }
          if (a.expireTime && a.expireTime.getTime() !== s.authExpiresAt?.getTime()) {
            await db().update(schema.shop).set({ authExpiresAt: a.expireTime, authRemindedAt: [], updatedAt: new Date() }).where(eq(schema.shop.id, s.id));
            s.authExpiresAt = a.expireTime;
            s.authRemindedAt = [];
          }
        }
      } else {
        const groups = new Map<string, ShopRow[]>();
        for (const s of list) {
          const key = s.refreshTokenEnc ? decrypt(s.refreshTokenEnc) : s.id;
          groups.set(key, [...(groups.get(key) ?? []), s]);
        }
        for (const g of groups.values()) {
          const one = g[0];
          try {
            await tiktokAuthorizedShops(tiktokApp(app), decrypt(one.accessTokenEnc!));
          } catch (e) {
            if (e instanceof PlatformError && e.kind === "auth") g.forEach((s) => force.add(s.id));
            else throw e;
          }
        }
      }
    } catch (e) {
      // 应用级调用的网络或平台错误：本轮只按到期时间刷新，下轮再查
      log({ level: "warn", job: "token.refresh", msg: "app check failed", appId: app.id, err: e instanceof Error ? e.message : String(e) });
    }
  }

  for (const s of shops) {
    const [cur] = await db().select().from(schema.shop).where(eq(schema.shop.id, s.id)).limit(1);
    if (!cur || cur.status !== "connected") continue;
    const due = !cur.accessExpiresAt || cur.accessExpiresAt.getTime() - Date.now() < REFRESH_WINDOW_MS;
    if (!due && !force.has(cur.id)) continue;
    try {
      await refreshShopToken(cur.id, { force: true });
    } catch (e) {
      log({ level: "warn", job: "token.refresh", msg: "refresh failed, retry next run", shopId: cur.id, err: e instanceof Error ? e.message : String(e) });
    }
  }

  await remindExpiring();
}

async function remindExpiring() {
  const soon = new Date(Date.now() + 30 * DAY);
  const rows = await db()
    .select()
    .from(schema.shop)
    .where(and(eq(schema.shop.status, "connected"), isNotNull(schema.shop.authExpiresAt), lte(schema.shop.authExpiresAt, soon)));
  for (const s of rows) {
    const left = s.authExpiresAt!.getTime() - Date.now();
    if (left <= 0) continue;
    const stamp = s.authExpiresAt!.toISOString();
    const sent = new Set(s.authRemindedAt);
    const tier = left <= 7 * DAY ? "7d" : "30d";
    if (sent.has(`${tier}:${stamp}`)) continue;
    const days = Math.max(1, Math.ceil(left / DAY));
    const next = [...sent, `${tier}:${stamp}`, ...(tier === "7d" ? [`30d:${stamp}`] : [])];
    await db().transaction(async (tx) => {
      await tx.update(schema.shop).set({ authRemindedAt: [...new Set(next)], updatedAt: new Date() }).where(eq(schema.shop.id, s.id));
      await notify(
        {
          merchantId: s.merchantId,
          membershipIds: await admins(s.merchantId, tx),
          event: "auth_expiring",
          title: `${s.name} 授权将在 ${days} 天后到期`,
          body: `到期后这家店停止收发消息。请到「店铺与连接」用店主账号续期授权。`,
          link: `/shops?shop=${s.id}&dialog=reauth`,
          dedupeKey: `auth_expiring:${s.id}:${tier}:${stamp}`,
        },
        tx,
      );
      await tx.insert(schema.shopEvent).values({ merchantId: s.merchantId, shopId: s.id, kind: "auth_expiring", text: `授权将在 ${days} 天后到期，已提醒管理员` });
    });
  }
}

// ---------- shop.metrics ----------

/** 周期的起止日期（商户时区，[ge, lt)） */
export function periodRange(period: ShopPeriod, timezone: string, now = new Date()): { ge: string; lt: string } {
  const today = new TZDate(now, timezone);
  const d = (x: Date) => format(x, "yyyy-MM-dd");
  if (period === "7d") return { ge: d(addDays(today, -7)), lt: d(today) };
  if (period === "30d") return { ge: d(addDays(today, -30)), lt: d(today) };
  const monthStart = startOfMonth(today);
  if (period === "this_month") return { ge: d(monthStart), lt: d(addDays(today, 1)) };
  return { ge: d(startOfMonth(subMonths(today, 1))), lt: d(monthStart) };
}

const PERIODS: ShopPeriod[] = ["7d", "30d", "this_month", "last_month"];

export type StoredMetrics = Partial<Record<ShopPeriod, ShopMetric>>;

async function collect(shop: ShopRow, timezone: string): Promise<StoredMetrics> {
  return withShop(shop.id, async (c) => {
    if (c.platform === "shopee") {
      const m = await shopeePerformance(c.app, c.auth);
      const metric: ShopMetric = {
        platformLabel: "Shopee 聊天回复率",
        basis: "账户健康当期值，不随周期变化",
        responseRate: typeof m.responseRate === "number" ? m.responseRate : null,
        target: typeof m.target === "number" ? m.target : null,
        responseTimeDays: typeof m.responseTimeDays === "number" ? m.responseTimeDays : null,
        nonResponded: typeof m.nonResponded === "number" ? m.nonResponded : null,
        rating: typeof m.rating === "number" ? m.rating : null,
        currentOnly: true,
      };
      return Object.fromEntries(PERIODS.map((p) => [p, metric])) as StoredMetrics;
    }
    const out: StoredMetrics = {};
    for (const p of PERIODS) {
      const r = periodRange(p, timezone);
      const m = await tiktokPerformance(c.app, c.auth, r.ge, r.lt);
      out[p] = {
        platformLabel: "TikTok 客服回复率",
        basis: `${r.ge.slice(5)} 至 ${format(addDays(new Date(`${r.lt}T00:00:00Z`), -1), "MM-dd")} 内 24 小时首次响应的会话占比`,
        responseRate: typeof m.responseRate === "number" ? m.responseRate : null,
        responseTimeMins: typeof m.responseTimeMins === "number" ? m.responseTimeMins : null,
        satisfaction: typeof m.satisfaction === "number" ? m.satisfaction : null,
        sessions: m.sessions === null || m.sessions === undefined ? null : Number(m.sessions),
      };
    }
    return out;
  });
}

/** 刷新指定店铺（或全部已连接店铺）的平台口径指标；单店失败保留上次结果 */
export async function refreshShopMetrics(shopIds?: string[]): Promise<void> {
  const where = shopIds ? and(eq(schema.shop.status, "connected"), inArray(schema.shop.id, shopIds.length ? shopIds : ["00000000-0000-0000-0000-000000000000"])) : eq(schema.shop.status, "connected");
  const rows = await db()
    .select({ shop: schema.shop, timezone: schema.merchant.timezone })
    .from(schema.shop)
    .innerJoin(schema.merchant, eq(schema.merchant.id, schema.shop.merchantId))
    .where(where);
  for (const { shop, timezone } of rows) {
    try {
      const metrics = await collect(shop, timezone);
      await db().update(schema.shop).set({ metrics, metricsAt: new Date() }).where(eq(schema.shop.id, shop.id));
    } catch (e) {
      log({ level: "warn", job: "shop.metrics", msg: "metrics failed, keep last", shopId: shop.id, err: e instanceof Error ? e.message : String(e) });
    }
  }
}

export async function shopMetricsJob(): Promise<void> {
  await refreshShopMetrics();
}
