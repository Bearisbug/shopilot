// 商户设置 → 通知 → 飞书（权限 settings.manage）：选接法、填凭证、设默认群与店铺群、两个开关、发测试卡片、断开。
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { PNG } from "pngjs";
import type { FeishuChatList, FeishuConnectBody, FeishuTargetBody, FeishuTargetView, FeishuTestResult, FeishuToggleBody, FeishuView } from "@/contracts/feishu";
import type { MemberContext } from "@/server/auth/context";
import { audit } from "@/server/core/audit";
import { decrypt, encrypt } from "@/server/core/crypto";
import { db, schema } from "@/server/db/client";
import { env } from "@/server/env";
import { Problem, validation } from "@/server/http/problem";
import { testCard } from "./card";
import { feishuApi, feishuIsStub, FeishuError, parseWebhookUrl, webhookHint } from "./client";
import { appOf, sendCard, type IntegrationRow, type TargetRow } from "./deliver";

const fi = schema.feishuIntegration;
const t = schema.feishuTarget;
const d = schema.feishuDelivery;
const UUID = /^[0-9a-f-]{36}$/i;

function targetView(r: TargetRow | undefined): FeishuTargetView | null {
  if (!r) return null;
  return { id: r.id, kind: r.kind, name: r.name, chatId: r.chatId, webhookHint: r.webhookHint };
}

async function integrationOf(merchantId: string): Promise<IntegrationRow | undefined> {
  const [row] = await db().select().from(fi).where(eq(fi.merchantId, merchantId)).limit(1);
  return row;
}

/** 飞书出错转成接口错误：凭证类 422，其余 502 / 504，原因原样给管理员看 */
function feishuProblem(e: unknown, prefix: string): Problem {
  if (e instanceof FeishuError) {
    if (e.kind === "credentials") return new Problem("platform-credentials", { title: "飞书没有通过这组凭证", detail: `${prefix}：${e.message}`, extra: { feishuCode: e.code } });
    return new Problem(e.kind === "timeout" ? "platform-timeout" : "platform", { title: "飞书返回错误", detail: `${prefix}：${e.message}`, extra: { feishuCode: e.code, feishuKind: e.kind } });
  }
  throw e;
}

export async function feishuView(ctx: MemberContext): Promise<FeishuView> {
  const merchantId = ctx.merchant.id;
  const integration = await integrationOf(merchantId);
  const shops = await db()
    .select({ id: schema.shop.id, name: schema.shop.name, platform: schema.shop.platform, market: schema.shop.market })
    .from(schema.shop)
    .where(and(eq(schema.shop.merchantId, merchantId), ne(schema.shop.status, "disconnected")))
    .orderBy(schema.shop.name);
  const kind = integration?.method === "webhook" ? "webhook" : "app_chat";
  const targets = integration ? await db().select().from(t).where(and(eq(t.merchantId, merchantId), eq(t.kind, kind))) : [];
  const [failure] = await db()
    .select()
    .from(d)
    .where(and(eq(d.merchantId, merchantId), eq(d.status, "failed"), gt(d.createdAt, new Date(Math.max(Date.now() - 7 * 86400_000, integration?.createdAt.getTime() ?? 0)))))
    .orderBy(desc(d.createdAt))
    .limit(1);
  return {
    mode: feishuIsStub() ? "stub" : "live",
    connection: integration ? { method: integration.method, appId: integration.appId, status: integration.status, verifiedAt: integration.verifiedAt?.toISOString() ?? null } : null,
    notifyUnclaimed: integration?.notifyUnclaimed ?? true,
    notifyOverdue: integration?.notifyOverdue ?? true,
    defaultTarget: targetView(targets.find((x) => x.shopId === null)),
    shops: shops.map((s) => ({ ...s, target: targetView(targets.find((x) => x.shopId === s.id)) })),
    lastFailure: failure ? { at: failure.createdAt.toISOString(), targetName: failure.targetName, kind: failure.kind, error: failure.error ?? "" } : null,
  };
}

/** 选接法并保存：应用接法先换一次 tenant_access_token 校验；换接法或换应用时清掉原来的群设置（群 ID 只对原应用有效） */
export async function connectFeishu(ctx: MemberContext, body: FeishuConnectBody): Promise<FeishuView> {
  const merchantId = ctx.merchant.id;
  const existing = await integrationOf(merchantId);
  const now = new Date();
  if (body.method === "app") {
    const sameApp = existing?.method === "app" && existing.appId === body.appId && !!existing.appSecretEnc;
    const appSecret = body.appSecret || (sameApp && existing?.appSecretEnc ? decrypt(existing.appSecretEnc) : "");
    if (!appSecret) throw validation("请填 App Secret。", { appSecret: "请填 App Secret" });
    try {
      await feishuApi().verifyApp({ appId: body.appId, appSecret });
    } catch (e) {
      throw feishuProblem(e, "校验没有通过");
    }
    // 换了应用即视为重新接入（群设置已清空）：接入时间重记，「最近一次推送失败」只看重新接入以后的
    const values = { method: "app" as const, appId: body.appId, appSecretEnc: encrypt(appSecret), status: "verified" as const, verifiedAt: now, updatedAt: now, ...(sameApp ? {} : { createdAt: now }) };
    await db().transaction(async (tx) => {
      if (!sameApp) await tx.delete(t).where(eq(t.merchantId, merchantId));
      await tx.insert(fi).values({ merchantId, ...values }).onConflictDoUpdate({ target: fi.merchantId, set: values });
      await audit(ctx.actor, { module: "settings", action: "feishu_connected", summary: `飞书推送：连接飞书应用 ${body.appId}${existing && !sameApp ? "（原有群设置已清除）" : ""}`, data: { method: "app", appId: body.appId } }, tx);
    });
  } else {
    if (existing?.method !== "webhook") {
      const values = { method: "webhook" as const, appId: null, appSecretEnc: null, status: "verified" as const, verifiedAt: null, createdAt: now, updatedAt: now };
      await db().transaction(async (tx) => {
        await tx.delete(t).where(eq(t.merchantId, merchantId));
        await tx.insert(fi).values({ merchantId, ...values }).onConflictDoUpdate({ target: fi.merchantId, set: values });
        await audit(ctx.actor, { module: "settings", action: "feishu_connected", summary: `飞书推送：改用群自定义机器人${existing ? "（原有群设置已清除）" : ""}`, data: { method: "webhook" } }, tx);
      });
    }
  }
  return feishuView(ctx);
}

async function requireIntegration(merchantId: string): Promise<IntegrationRow> {
  const row = await integrationOf(merchantId);
  if (!row) throw new Problem("not-allowed", { detail: "还没有连接飞书，先选择接法并保存。", code: "feishu_not_connected" });
  return row;
}

export async function updateFeishuToggles(ctx: MemberContext, body: FeishuToggleBody): Promise<FeishuView> {
  const row = await requireIntegration(ctx.merchant.id);
  const patch: Partial<typeof fi.$inferInsert> = {};
  const changes: string[] = [];
  if (body.notifyUnclaimed !== undefined && body.notifyUnclaimed !== row.notifyUnclaimed) {
    patch.notifyUnclaimed = body.notifyUnclaimed;
    changes.push(`待认领时推送${body.notifyUnclaimed ? "开" : "关"}`);
  }
  if (body.notifyOverdue !== undefined && body.notifyOverdue !== row.notifyOverdue) {
    patch.notifyOverdue = body.notifyOverdue;
    changes.push(`待认领超时推送${body.notifyOverdue ? "开" : "关"}`);
  }
  if (changes.length) {
    await db().update(fi).set({ ...patch, updatedAt: new Date() }).where(eq(fi.merchantId, ctx.merchant.id));
    await audit(ctx.actor, { module: "settings", action: "feishu_toggles_updated", summary: `飞书推送：${changes.join("、")}`, data: patch });
  }
  return feishuView(ctx);
}

export async function listFeishuChats(ctx: MemberContext): Promise<FeishuChatList> {
  const row = await requireIntegration(ctx.merchant.id);
  const app = appOf(row);
  if (!app) throw new Problem("not-allowed", { detail: "群自定义机器人接法不需要选群列表。", code: "feishu_not_app" });
  try {
    return { chats: await feishuApi().listChats(app) };
  } catch (e) {
    if (e instanceof FeishuError && e.kind === "credentials") await db().update(fi).set({ status: "invalid", updatedAt: new Date() }).where(eq(fi.merchantId, ctx.merchant.id));
    throw feishuProblem(e, "取不到机器人所在的群");
  }
}

async function shopOf(ctx: MemberContext, shopId: string | null) {
  if (!shopId) return null;
  const [shop] = await db().select({ id: schema.shop.id, name: schema.shop.name }).from(schema.shop).where(and(eq(schema.shop.id, shopId), eq(schema.shop.merchantId, ctx.merchant.id))).limit(1);
  if (!shop) throw new Problem("not-found", { detail: "找不到这家店铺。" });
  return shop;
}

/** 设默认群或某店的群（同一范围已有则替换） */
export async function saveFeishuTarget(ctx: MemberContext, body: FeishuTargetBody): Promise<FeishuView> {
  const merchantId = ctx.merchant.id;
  const row = await requireIntegration(merchantId);
  const shop = await shopOf(ctx, body.shopId);
  const [current] = await db()
    .select()
    .from(t)
    .where(and(eq(t.merchantId, merchantId), body.shopId ? eq(t.shopId, body.shopId) : isNull(t.shopId)))
    .limit(1);
  let values: Omit<typeof t.$inferInsert, "merchantId" | "shopId">;
  if (row.method === "app") {
    if (!body.chatId) throw validation("请选择群。", { chatId: "请选择群" });
    const app = appOf(row)!;
    let chats;
    try {
      chats = await feishuApi().listChats(app);
    } catch (e) {
      throw feishuProblem(e, "取不到机器人所在的群");
    }
    const chat = chats.find((c) => c.chatId === body.chatId);
    if (!chat) throw validation("机器人不在这个群里，刷新群列表后重选。", { chatId: "机器人不在这个群里" });
    values = { kind: "app_chat", name: chat.name, chatId: chat.chatId, webhookEnc: null, secretEnc: null, webhookHint: null };
  } else {
    const keep = current?.kind === "webhook" ? current : undefined;
    const name = body.name ?? keep?.name;
    if (!name) throw validation("请填群名。", { name: "请填群名" });
    let webhookEnc = keep?.webhookEnc ?? null;
    let hint = keep?.webhookHint ?? null;
    if (body.webhookUrl) {
      const url = parseWebhookUrl(body.webhookUrl);
      if (!url) throw validation("不是飞书自定义机器人的地址。", { webhookUrl: "应为 https://open.feishu.cn/open-apis/bot/v2/hook/… 开头的地址" });
      webhookEnc = encrypt(url);
      hint = webhookHint(url);
    }
    const secretEnc = body.secret ? encrypt(body.secret) : (keep?.secretEnc ?? null);
    if (!webhookEnc) throw validation("请填 Webhook 地址。", { webhookUrl: "请填 Webhook 地址" });
    if (!secretEnc) throw validation("请填签名密钥。", { secret: "请填签名密钥（机器人安全设置里开启「签名校验」后显示）" });
    values = { kind: "webhook", name, chatId: null, webhookEnc, secretEnc, webhookHint: hint };
  }
  const scope = shop ? `「${shop.name}」` : "默认群";
  await db().transaction(async (tx) => {
    if (current) await tx.update(t).set({ ...values, updatedAt: new Date() }).where(eq(t.id, current.id));
    else await tx.insert(t).values({ merchantId, shopId: body.shopId, ...values });
    await audit(ctx.actor, { module: "settings", action: "feishu_target_saved", summary: `飞书推送：${scope}设为「${values.name}」`, data: { shopId: body.shopId, kind: values.kind, name: values.name } }, tx);
  });
  return feishuView(ctx);
}

export async function removeFeishuTarget(ctx: MemberContext, id: string): Promise<FeishuView> {
  if (!UUID.test(id)) throw new Problem("not-found", { detail: "这个群设置已不存在。" });
  const [row] = await db().select().from(t).where(and(eq(t.id, id), eq(t.merchantId, ctx.merchant.id))).limit(1);
  if (!row) throw new Problem("not-found", { detail: "这个群设置已不存在。" });
  const shop = await shopOf(ctx, row.shopId);
  await db().delete(t).where(eq(t.id, row.id));
  await audit(ctx.actor, { module: "settings", action: "feishu_target_removed", summary: `飞书推送：${shop ? `「${shop.name}」改为跟随默认群` : "清除默认群"}（原为「${row.name}」）`, data: { shopId: row.shopId, name: row.name } });
  return feishuView(ctx);
}

/** 测试卡片里的图片：一张 160×96 的纯色 PNG，只用来验证图片上传 */
function testImage(): Buffer {
  const png = new PNG({ width: 160, height: 96 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0xff;
    png.data[i + 1] = 0xa7;
    png.data[i + 2] = 0x48;
    png.data[i + 3] = 0xff;
  }
  return PNG.sync.write(png);
}

/** 发测试卡片：同步发出并记一行投递记录；应用接法顺带上传一张图片验证图片权限 */
export async function sendFeishuTest(ctx: MemberContext, targetId: string): Promise<FeishuTestResult> {
  if (!UUID.test(targetId)) throw new Problem("not-found", { detail: "这个群设置已不存在。" });
  const merchantId = ctx.merchant.id;
  const integration = await requireIntegration(merchantId);
  const [target] = await db().select().from(t).where(and(eq(t.id, targetId), eq(t.merchantId, merchantId))).limit(1);
  if (!target) throw new Problem("not-found", { detail: "这个群设置已不存在。" });
  const app = target.kind === "app_chat" ? appOf(integration) : null;
  let imageKey: string | null = null;
  let imageError: string | null = null;
  if (app) {
    try {
      imageKey = await feishuApi().uploadImage(app, { bytes: testImage(), mime: "image/png", name: "shopilot-test.png" });
    } catch (e) {
      if (e instanceof FeishuError && e.kind === "credentials") throw feishuProblem(e, "测试卡片没有发出");
      imageError = e instanceof Error ? e.message : String(e);
    }
  }
  const card = testCard({ merchantName: ctx.merchant.name, targetName: target.name, settingsUrl: `${env().APP_BASE_URL}/settings/notify`, imageKey, imageError });
  const [row] = await db().insert(d).values({ merchantId, kind: "test", targetId: target.id, targetName: target.name, card, attempts: 1 }).returning({ id: d.id });
  const stub = feishuIsStub();
  try {
    const messageId = await sendCard(integration, target, card);
    await db().update(d).set({ status: "sent", messageId, sentAt: new Date(), stub, updatedAt: new Date() }).where(eq(d.id, row.id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db().update(d).set({ status: "failed", error: msg.slice(0, 500), stub, updatedAt: new Date() }).where(eq(d.id, row.id));
    await audit(ctx.actor, { module: "settings", action: "feishu_test_sent", summary: `飞书推送：测试卡片发往「${target.name}」失败`, data: { targetId: target.id, ok: false, error: msg.slice(0, 200) } });
    throw feishuProblem(e, "测试卡片没有发出");
  }
  await audit(ctx.actor, { module: "settings", action: "feishu_test_sent", summary: `飞书推送：测试卡片已发往「${target.name}」`, data: { targetId: target.id, ok: true, image: app ? (imageKey ? "ok" : "failed") : "skipped" } });
  return { ok: true, stub, imageUpload: app ? (imageKey ? "ok" : "failed") : "skipped", imageError };
}

/** 断开：删除接法、凭证与全部群设置；还没发出的卡片随之跳过 */
export async function disconnectFeishu(ctx: MemberContext): Promise<FeishuView> {
  const existing = await integrationOf(ctx.merchant.id);
  if (existing) {
    await db().transaction(async (tx) => {
      await tx.delete(t).where(eq(t.merchantId, ctx.merchant.id));
      await tx.delete(fi).where(eq(fi.merchantId, ctx.merchant.id));
      await audit(ctx.actor, { module: "settings", action: "feishu_disconnected", summary: `飞书推送：断开${existing.method === "app" ? `飞书应用 ${existing.appId}` : "群自定义机器人"}`, data: { method: existing.method } }, tx);
    });
  }
  return feishuView(ctx);
}
