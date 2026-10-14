// 需要数据库：DATABASE_URL 未设置时跳过（set -a && . ./.env && set +a && pnpm exec vitest run src/server/inbound）。
// 推送入口按商户专属码收推送、用该商户应用的密钥验签；旧的应用 ID 地址仍可用。
import { createHmac, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/server/jobs/boss", () => ({ enqueue: vi.fn(async () => null) }));

const hmac = (key: string, msg: string) => createHmac("sha256", key).update(msg, "utf8").digest("hex");

describe.skipIf(!process.env.DATABASE_URL)("推送入口（API-HOOK-001、API-HOOK-002）", async () => {
  const { db, pool, schema } = await import("@/server/db/client");
  const { encrypt } = await import("@/server/core/crypto");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { acceptWebhook } = await import("./accept");
  const { env } = await import("@/server/env");

  const userIds: string[] = [];
  const merchantIds: string[] = [];
  const m = { a: { key: "", shopee: "", tiktok: "" }, b: { key: "", shopee: "" } };

  async function newMerchant(name: string) {
    const userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name, email: `${userId}@test.invalid` });
    userIds.push(userId);
    const { merchant } = await db().transaction((tx) => provisionMerchant(tx, { name, timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantIds.push(merchant.id);
    return merchant;
  }

  beforeAll(async () => {
    const a = await newMerchant("Hook A");
    const b = await newMerchant("Hook B");
    const [sa] = await db()
      .insert(schema.platformApp)
      .values({ merchantId: a.id, platform: "shopee", appKey: "9990001", secretEnc: encrypt("partner-key-a"), pushKeyEnc: encrypt("push-key-a"), region: "sg", status: "verified" })
      .returning();
    const [ta] = await db()
      .insert(schema.platformApp)
      .values({ merchantId: a.id, platform: "tiktok", appKey: "tthooka", secretEnc: encrypt("tt-secret-a"), region: "global", status: "verified" })
      .returning();
    const [sb] = await db()
      .insert(schema.platformApp)
      .values({ merchantId: b.id, platform: "shopee", appKey: "9990002", secretEnc: encrypt("partner-key-b"), region: "sg", status: "verified" })
      .returning();
    m.a = { key: a.webhookKey, shopee: sa.id, tiktok: ta.id };
    m.b = { key: b.webhookKey, shopee: sb.id };
  });

  afterAll(async () => {
    if (merchantIds.length) await db().delete(schema.merchant).where(inArray(schema.merchant.id, merchantIds));
    if (userIds.length) await db().delete(schema.user).where(inArray(schema.user.id, userIds));
    await pool().end();
  });

  const url = (platform: string, key: string) => `${env().APP_BASE_URL}/api/webhooks/${platform}/${key}`;
  const shopeeBody = () => JSON.stringify({ code: 10, shop_id: 1, timestamp: Date.now(), data: { content: { message_id: randomUUID() } } });
  const post = (platform: "shopee" | "tiktok", key: string, body: string, auth: string) =>
    acceptWebhook(platform, key, new Request(`http://127.0.0.1:3000/api/webhooks/${platform}/${key}`, { method: "POST", body, headers: { authorization: auth } }));
  async function appOfEvent(body: string): Promise<string | undefined> {
    const id = `10:${(JSON.parse(body) as { data: { content: { message_id: string } } }).data.content.message_id}`;
    const [row] = await db().select({ appId: schema.inboundEvent.platformAppId }).from(schema.inboundEvent).where(eq(schema.inboundEvent.externalEventId, id));
    return row?.appId;
  }

  it("商户专属码地址：用该商户应用的 push key 或 partner key 签名都收下，事件归到这个应用", async () => {
    for (const key of ["push-key-a", "partner-key-a"]) {
      const body = shopeeBody();
      const res = await post("shopee", m.a.key, body, hmac(key, `${url("shopee", m.a.key)}|${body}`));
      expect(res.status).toBe(200);
      expect(await appOfEvent(body)).toBe(m.a.shopee);
    }
  });

  it("TikTok 商户专属码地址：用该商户 TikTok 应用的 secret 签名收下", async () => {
    const body = JSON.stringify({ type: 14, shop_id: "1", tts_notification_id: randomUUID(), data: {} });
    const res = await post("tiktok", m.a.key, body, hmac("tt-secret-a", `tthooka${body}`));
    expect(res.status).toBe(200);
  });

  it("旧的应用 ID 地址仍可用：签名基串里的地址是应用 ID 地址", async () => {
    const body = shopeeBody();
    const res = await post("shopee", m.a.shopee, body, hmac("push-key-a", `${url("shopee", m.a.shopee)}|${body}`));
    expect(res.status).toBe(200);
    expect(await appOfEvent(body)).toBe(m.a.shopee);
  });

  it("密钥都不对返回 401：别的商户的密钥、签错地址、未知的码", async () => {
    const body = shopeeBody();
    expect((await post("shopee", m.a.key, body, hmac("partner-key-b", `${url("shopee", m.a.key)}|${body}`))).status).toBe(401);
    expect((await post("shopee", m.b.key, body, hmac("push-key-a", `${url("shopee", m.b.key)}|${body}`))).status).toBe(401);
    expect((await post("shopee", m.a.key, body, hmac("push-key-a", `${url("shopee", m.a.shopee)}|${body}`))).status).toBe(401);
    expect((await post("shopee", "0".repeat(32), body, hmac("push-key-a", `${url("shopee", "0".repeat(32))}|${body}`))).status).toBe(401);
    expect(await appOfEvent(body)).toBeUndefined();
  });
});
