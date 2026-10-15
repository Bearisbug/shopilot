// 只读接入导入：把借用自其他系统（现网 Obsbot v2）的平台凭证与店铺 token 写进 Shopilot，供 inbound.poll 拉取真实消息。
// 标准输入是 JSON（与 obsbot-platform-tokens 导出文件同结构）；只打印计数，绝不打印凭证。
//   --setup --admin <邮箱>  没有则建商户「OBSBOT 影子」（该账号为所有者），建两个只读平台应用与全部店铺，排历史回补
//   --tokens                只更新已有只读店的 access token 与过期时间（Shopee token 4 小时有效，过期后重新同步用这个）；
//                           TikTok 凭证带 granted_scopes 时同步商品权限，新拿到权限就把商品卡缓存作废并重新预取
// 服务器上：docker compose exec -T web sh -c "cd /app && node --import tsx scripts/import-readonly.ts --setup --admin <邮箱>" < 导出文件
import { and, eq } from "drizzle-orm";
import { encrypt } from "@/server/core/crypto";
import { db, schema } from "@/server/db/client";
import { enqueue } from "@/server/jobs/boss";
import { provisionMerchant } from "@/server/merchants/provision";
import { initialCapabilities } from "@/server/shops/capabilities";

const MERCHANT_NAME = "OBSBOT 影子";

type Export = {
  shopee: { host: string; partner_id: string; partner_key: string; push_partner_key?: string; shops: Array<{ shop_id: string; name: string; region: string; access_token: string; expires_at: string }> };
  tiktok: {
    app_key: string;
    app_secret: string;
    credentials: Array<{ access_token: string; expires_at: string; granted_scopes?: string[] }>;
    shops: Array<{ shop_id: string; name: string; region: string; cipher: string }>;
  };
};

const args = process.argv.slice(2);
const mode = args.includes("--setup") ? "setup" : args.includes("--tokens") ? "tokens" : null;
if (!mode) fail("用法：--setup --admin <邮箱> 或 --tokens，标准输入为导出的 JSON");

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function readStdin(): Promise<Export> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Export;
  } catch {
    fail("标准输入不是合法的 JSON");
  }
}

const date = (s: string) => {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) fail("expires_at 不是合法时间");
  return d;
};

/** Shopee 主机 → 区域：与 SHOPEE_HOSTS 的区域名一致 */
function shopeeRegion(host: string): string {
  if (host.includes("shopee.cn")) return "cn";
  if (host.includes("shopee.com.br")) return "br";
  return "sg";
}

async function setup(data: Export) {
  const i = args.indexOf("--admin");
  const email = i >= 0 ? args[i + 1] : "";
  if (!email) fail("--setup 需要 --admin <邮箱>");
  const [user] = await db().select().from(schema.user).where(eq(schema.user.email, email.toLowerCase()));
  if (!user) fail("账号不存在，先注册或建好这个账号");

  const now = new Date();
  const shopIds: string[] = [];
  const counts = await db().transaction(async (tx) => {
    let [merchant] = await tx
      .select({ id: schema.merchant.id })
      .from(schema.merchant)
      .where(and(eq(schema.merchant.name, MERCHANT_NAME), eq(schema.merchant.ownerUserId, user.id)));
    if (!merchant) merchant = (await provisionMerchant(tx, { name: MERCHANT_NAME, timezone: "Asia/Kuala_Lumpur", ownerUserId: user.id, billingEmail: user.email, planCode: "growth" })).merchant;

    const appValues = (platform: "shopee" | "tiktok") =>
      platform === "shopee"
        ? {
            appKey: data.shopee.partner_id,
            secretEnc: encrypt(data.shopee.partner_key),
            pushKeyEnc: data.shopee.push_partner_key ? encrypt(data.shopee.push_partner_key) : null,
            apiHost: data.shopee.host,
            region: shopeeRegion(data.shopee.host),
          }
        : { appKey: data.tiktok.app_key, secretEnc: encrypt(data.tiktok.app_secret), pushKeyEnc: null, apiHost: null, region: null };
    const apps: Record<"shopee" | "tiktok", string> = { shopee: "", tiktok: "" };
    for (const platform of ["shopee", "tiktok"] as const) {
      const v = { ...appValues(platform), readOnly: true, status: "verified" as const, verifiedAt: now, updatedAt: now };
      const [row] = await tx
        .insert(schema.platformApp)
        .values({ merchantId: merchant.id, platform, ...v })
        .onConflictDoUpdate({ target: [schema.platformApp.merchantId, schema.platformApp.platform], set: v })
        .returning({ id: schema.platformApp.id });
      apps[platform] = row.id;
    }

    // 只读接入不发送、不改平台设置：卡片、优惠券、结束会话一律关掉
    const caps = (platform: "shopee" | "tiktok") => ({ ...initialCapabilities(platform, []), cards: [], coupons: false, endSession: false });
    const tiktokToken = data.tiktok.credentials[0];
    if (!tiktokToken) fail("导出文件里没有 TikTok 的 access token");
    const rows = [
      ...data.shopee.shops.map((s) => ({ platform: "shopee" as const, externalShopId: s.shop_id, shopCipher: null, name: s.name, market: s.region, token: s.access_token, expiresAt: date(s.expires_at) })),
      ...data.tiktok.shops.map((s) => ({ platform: "tiktok" as const, externalShopId: s.shop_id, shopCipher: s.cipher, name: s.name, market: s.region, token: tiktokToken.access_token, expiresAt: date(tiktokToken.expires_at) })),
    ];
    for (const r of rows) {
      const tokenSet = { accessTokenEnc: encrypt(r.token), accessExpiresAt: r.expiresAt, refreshTokenEnc: null, updatedAt: now };
      const [shop] = await tx
        .insert(schema.shop)
        .values({
          merchantId: merchant.id,
          platformAppId: apps[r.platform],
          platform: r.platform,
          externalShopId: r.externalShopId,
          shopCipher: r.shopCipher,
          name: r.name,
          market: r.market,
          status: "connected",
          capabilities: caps(r.platform),
          connectedAt: now,
          pullCursorAt: now,
          ...tokenSet,
        })
        .onConflictDoUpdate({ target: [schema.shop.platformAppId, schema.shop.externalShopId], set: { name: r.name, market: r.market, shopCipher: r.shopCipher, status: "connected", ...tokenSet } })
        .returning({ id: schema.shop.id });
      await tx
        .insert(schema.shopReception)
        .values({ shopId: shop.id, merchantId: merchant.id, modeInHours: "shadow", modeOffHours: "shadow" })
        .onConflictDoUpdate({ target: schema.shopReception.shopId, set: { modeInHours: "shadow", modeOffHours: "shadow", updatedAt: now } });
      shopIds.push(shop.id);
    }
    return { shopee: data.shopee.shops.length, tiktok: data.tiktok.shops.length };
  });

  for (const id of shopIds) await enqueue("shop.backfill", { shopId: id }, { singletonKey: id });
  console.log(JSON.stringify({ merchant: MERCHANT_NAME, admin: email, readOnlyApps: 2, shops: counts, backfillQueued: shopIds.length }));
}

async function tokens(data: Export) {
  const now = new Date();
  const tiktokToken = data.tiktok.credentials[0];
  const want = [
    ...data.shopee.shops.map((s) => ({ platform: "shopee" as const, id: s.shop_id, token: s.access_token, expiresAt: date(s.expires_at) })),
    ...(tiktokToken ? data.tiktok.shops.map((s) => ({ platform: "tiktok" as const, id: s.shop_id, token: tiktokToken.access_token, expiresAt: date(tiktokToken.expires_at) })) : []),
  ];
  const shops = await db()
    .select({ id: schema.shop.id, platform: schema.shop.platform, externalShopId: schema.shop.externalShopId })
    .from(schema.shop)
    .innerJoin(schema.platformApp, eq(schema.platformApp.id, schema.shop.platformAppId))
    .where(eq(schema.platformApp.readOnly, true));
  let updated = 0;
  for (const w of want) {
    for (const s of shops.filter((x) => x.platform === w.platform && x.externalShopId === w.id)) {
      await db().update(schema.shop).set({ accessTokenEnc: encrypt(w.token), accessExpiresAt: w.expiresAt, updatedAt: now }).where(eq(schema.shop.id, s.id));
      updated++;
    }
  }
  const scopes = tiktokToken?.granted_scopes;
  let productScopeGranted = 0;
  if (scopes) {
    const productScope = scopes.some((s) => s.startsWith("seller.product"));
    const tiktokShops = await db()
      .select({ id: schema.shop.id, capabilities: schema.shop.capabilities })
      .from(schema.shop)
      .innerJoin(schema.platformApp, eq(schema.platformApp.id, schema.shop.platformAppId))
      .where(and(eq(schema.platformApp.readOnly, true), eq(schema.shop.platform, "tiktok")));
    for (const s of tiktokShops.filter((x) => x.capabilities.productScope !== productScope)) {
      await db().update(schema.shop).set({ capabilities: { ...s.capabilities, productScope }, updatedAt: now }).where(eq(schema.shop.id, s.id));
      if (!productScope) continue;
      // 之前从订单借来的商品卡：作废缓存，重新预取时改从平台商品接口取
      await db().update(schema.productInfo).set({ fetchedAt: new Date(0) }).where(eq(schema.productInfo.shopId, s.id));
      productScopeGranted++;
    }
    if (productScopeGranted) await enqueue("product.prefetch", {});
  }
  console.log(JSON.stringify({ tokensUpdated: updated, inFile: want.length, productScopeGranted }));
}

const data = await readStdin();
if (mode === "setup") await setup(data);
else await tokens(data);
process.exit(0);
