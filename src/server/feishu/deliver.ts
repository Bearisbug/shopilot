// 飞书卡片投递（发件箱）：会话进入待认领、待认领超时时先写一行投递记录（同一会话段同一卡种只一行，处理人取消认领另起一行），再入队 feishu.send；
// 任务里按当时的状态构卡并发出。会话已被认领、已结束、换了新段，或商户断开飞书、店铺没有群时记为跳过。
// 工单转发卡（kind = ticket）在请求里就构好卡片存进记录，任务只按记下的群发出与重试。
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { receptionContext } from "@/server/conversations/hours";
import { decrypt } from "@/server/core/crypto";
import { db, schema } from "@/server/db/client";
import { env } from "@/server/env";
import { enqueue } from "@/server/jobs/boss";
import { conversationCard, type CardKind } from "./card";
import { feishuApi, feishuIsStub, FeishuError, type FeishuApp, type FeishuCard } from "./client";
import { cardContent } from "./content";

export type IntegrationRow = typeof schema.feishuIntegration.$inferSelect;
export type TargetRow = typeof schema.feishuTarget.$inferSelect;
type ConversationRow = typeof schema.conversation.$inferSelect;

/** feishu.send 共尝试 6 次（首发 + 重试 5 次，见 QUEUES） */
export const MAX_ATTEMPTS = 6;

const t = schema.feishuTarget;
const d = schema.feishuDelivery;

export function appOf(integration: IntegrationRow): FeishuApp | null {
  if (integration.method !== "app" || !integration.appId || !integration.appSecretEnc) return null;
  return { appId: integration.appId, appSecret: decrypt(integration.appSecretEnc) };
}

/** 店铺另指定的群优先，否则默认群；接法不符的目标不算 */
export async function resolveTarget(merchantId: string, shopId: string | null, method: IntegrationRow["method"]): Promise<TargetRow | null> {
  const rows = await db()
    .select()
    .from(t)
    .where(and(eq(t.merchantId, merchantId), eq(t.kind, method === "app" ? "app_chat" : "webhook"), shopId ? or(isNull(t.shopId), eq(t.shopId, shopId)) : isNull(t.shopId)));
  return rows.find((r) => r.shopId !== null && r.shopId === shopId) ?? rows.find((r) => r.shopId === null) ?? null;
}

/** 发到目标群；应用接法返回 message_id，自定义机器人不返回 */
export async function sendCard(integration: IntegrationRow, target: TargetRow, card: FeishuCard): Promise<string | null> {
  const api = feishuApi();
  if (target.kind === "app_chat") {
    const app = appOf(integration);
    if (!app || !target.chatId) throw new FeishuError("credentials", null, "飞书应用凭证不完整，请在通知设置里重新连接");
    return api.sendToChat(app, target.chatId, card);
  }
  if (!target.webhookEnc || !target.secretEnc) throw new FeishuError("bad_request", null, "这个群的机器人地址或签名密钥缺失，请重新设置");
  await api.sendWebhook(decrypt(target.webhookEnc), decrypt(target.secretEnc), card);
  return null;
}

/**
 * 会话进入待认领 / 待认领超时：没接飞书、开关关着、店铺没有群、本段已推过同种卡时什么都不做。
 * again = 处理人取消认领：序号取本段同种卡最大值 + 1，本段推过也再推（INV-FEISHU-003）。
 * 飞书是旁路通知，这里出错只记日志，不影响调用方的主流程。
 */
export async function queueFeishuCard(conversationId: string, kind: CardKind, opts: { again?: boolean } = {}): Promise<string | null> {
  try {
    const [conv] = await db().select().from(schema.conversation).where(eq(schema.conversation.id, conversationId)).limit(1);
    if (!conv || !conv.currentSegmentId || conv.buyerKind !== "buyer") return null;
    const [integration] = await db().select().from(schema.feishuIntegration).where(eq(schema.feishuIntegration.merchantId, conv.merchantId)).limit(1);
    if (!integration || !(kind === "unclaimed" ? integration.notifyUnclaimed : integration.notifyOverdue)) return null;
    const target = await resolveTarget(conv.merchantId, conv.shopId, integration.method);
    if (!target) return null;
    const seq = opts.again ? sql<number>`(select coalesce(max(${d.seq}), -1) + 1 from ${d} where ${d.segmentId} = ${conv.currentSegmentId} and ${d.kind} = ${kind})` : 0;
    const [row] = await db()
      .insert(d)
      .values({ merchantId: conv.merchantId, conversationId: conv.id, segmentId: conv.currentSegmentId, kind, seq, targetId: target.id, targetName: target.name })
      .onConflictDoNothing()
      .returning({ id: d.id });
    if (!row) return null;
    await enqueue("feishu.send", { id: row.id });
    return row.id;
  } catch (e) {
    console.error(JSON.stringify({ t: new Date().toISOString(), level: "error", msg: "feishu queue failed", conversationId, kind, err: e instanceof Error ? e.stack : String(e) }));
    return null;
  }
}

async function buildCard(conv: ConversationRow, kind: CardKind, integration: IntegrationRow, target: TargetRow): Promise<FeishuCard> {
  const [shop] = await db().select().from(schema.shop).where(eq(schema.shop.id, conv.shopId)).limit(1);
  const [merchant] = await db().select({ timezone: schema.merchant.timezone }).from(schema.merchant).where(eq(schema.merchant.id, conv.merchantId)).limit(1);
  const app = target.kind === "app_chat" ? appOf(integration) : null;
  const content = await cardContent(conv, { timezone: merchant?.timezone ?? "UTC", uploadImage: app ? (image) => feishuApi().uploadImage(app, image) : undefined });
  const remindMinutes = kind === "overdue" ? (await receptionContext(conv.merchantId)).unclaimedRemindMinutes : null;
  const base = env().APP_BASE_URL;
  return conversationCard({
    kind,
    shopName: shop?.name ?? "",
    platform: shop?.platform ?? conv.platform,
    market: shop?.market ?? "",
    buyerName: conv.buyerName,
    waitedSec: content.waitedSec,
    handoffReason: conv.handoffReason,
    remindMinutes,
    summary: content.summary,
    lines: content.lines,
    claimUrl: `${base}/wb/${conv.id}?claim=1&m=${conv.merchantId}`,
    openUrl: `${base}/wb/${conv.id}?m=${conv.merchantId}`,
  });
}

function skipReason(conv: ConversationRow | undefined, segmentId: string | null): string | null {
  if (!conv) return "会话已删除";
  if (conv.currentSegmentId !== segmentId) return "会话已开始新的一段";
  if (conv.handlingState === "human") return "会话已被认领";
  if (conv.handlingState === "closed") return "会话已结束";
  if (conv.handlingState === "bot") return "会话已回到 AI 接待";
  return null;
}

/** 任务 feishu.send：按投递记录构卡并发出；可重试的失败抛出交给队列退避重试，最后一次或不可重试的记为失败 */
export async function deliverFeishuCard(data: Record<string, unknown>): Promise<void> {
  const id = String(data.id ?? "");
  const [row] = await db().select().from(d).where(eq(d.id, id)).limit(1);
  // 写入它的事务可能还没提交：抛错交给队列按间隔重试
  if (!row) throw new Error(`飞书投递 ${id} 尚不可见`);
  if (row.status !== "queued" || row.kind === "test") return;
  const attempt = row.attempts + 1;
  await db().update(d).set({ attempts: attempt, updatedAt: new Date() }).where(eq(d.id, id));
  const finish = (patch: Partial<typeof d.$inferInsert>) => db().update(d).set({ ...patch, updatedAt: new Date() }).where(eq(d.id, id));

  const [integration] = await db().select().from(schema.feishuIntegration).where(eq(schema.feishuIntegration.merchantId, row.merchantId)).limit(1);
  if (!integration) return void (await finish({ status: "skipped", error: "商户已断开飞书" }));
  if (row.kind === "ticket") return deliverStoredCard(row, integration, attempt, finish);
  const [conv] = row.conversationId ? await db().select().from(schema.conversation).where(eq(schema.conversation.id, row.conversationId)).limit(1) : [];
  const skip = skipReason(conv, row.segmentId);
  if (skip || !conv) return void (await finish({ status: "skipped", error: skip ?? "会话已删除" }));
  const target = await resolveTarget(row.merchantId, conv.shopId, integration.method);
  if (!target) return void (await finish({ status: "skipped", error: "店铺没有绑定飞书群" }));

  try {
    // 重试时沿用上次构好的卡片（目标没变时），不重复调 AI 总结与翻译
    let card = row.card && row.targetId === target.id ? row.card : null;
    if (!card) {
      card = await buildCard(conv, row.kind as CardKind, integration, target);
      await finish({ card, targetId: target.id, targetName: target.name });
    }
    const messageId = await sendCard(integration, target, card);
    await finish({ status: "sent", messageId, sentAt: new Date(), error: null, stub: feishuIsStub() });
    if (integration.status === "invalid" && target.kind === "app_chat") {
      await db().update(schema.feishuIntegration).set({ status: "verified", verifiedAt: new Date(), updatedAt: new Date() }).where(eq(schema.feishuIntegration.merchantId, row.merchantId));
    }
  } catch (e) {
    await failAttempt(e, row.merchantId, target.kind === "app_chat", attempt, finish);
  }
}

type DeliveryRow = typeof d.$inferSelect;
type Finish = (patch: Partial<typeof d.$inferInsert>) => Promise<unknown>;

/** 一次发送失败：应用凭证不对时把接法标为失效；可重试且没到次数上限的抛出交给队列，否则记为失败 */
async function failAttempt(e: unknown, merchantId: string, appChat: boolean, attempt: number, finish: Finish): Promise<void> {
  const err = e instanceof FeishuError ? e : new FeishuError("other", null, e instanceof Error ? e.message : String(e));
  if (err.kind === "credentials" && appChat) {
    await db().update(schema.feishuIntegration).set({ status: "invalid", updatedAt: new Date() }).where(eq(schema.feishuIntegration.merchantId, merchantId));
  }
  const final = !err.retryable || attempt >= MAX_ATTEMPTS;
  await finish({ status: final ? "failed" : "queued", error: err.message.slice(0, 500) });
  if (!final) throw err;
}

/** 工单转发卡：发到转发时选的群（应用接法按 chat_id，自定义机器人按 target_id）；接法换了或群设置删了记为跳过 */
async function deliverStoredCard(row: DeliveryRow, integration: IntegrationRow, attempt: number, finish: Finish): Promise<void> {
  if (!row.card) return void (await finish({ status: "failed", error: "投递记录里没有卡片" }));
  let send: () => Promise<string | null>;
  if (row.chatId) {
    const app = appOf(integration);
    if (!app) return void (await finish({ status: "skipped", error: "飞书接法已改为群自定义机器人" }));
    send = () => feishuApi().sendToChat(app, row.chatId!, row.card!);
  } else {
    const [target] = row.targetId ? await db().select().from(t).where(eq(t.id, row.targetId)).limit(1) : [];
    if (!target) return void (await finish({ status: "skipped", error: "这个群设置已删除" }));
    if (target.kind !== "webhook" || integration.method !== "webhook") return void (await finish({ status: "skipped", error: "飞书接法已改为飞书应用" }));
    send = () => sendCard(integration, target, row.card!);
  }
  try {
    const messageId = await send();
    await finish({ status: "sent", messageId, sentAt: new Date(), error: null, stub: feishuIsStub() });
  } catch (e) {
    await failAttempt(e, row.merchantId, !!row.chatId, attempt, finish);
  }
}
