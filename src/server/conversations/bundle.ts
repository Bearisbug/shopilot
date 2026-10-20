// Shopee「常见问题记录」（bundle_message）：推送和拉取只带成员消息 ID，入库时 payload.bundle 记 pending，
// shopee.bundle 任务按 ID 拉回买家与 Shopee 商店 AI 助手的对话写回同一条消息。拉取失败不影响会话处理：
// 超时、5xx 由队列退避重试；授权失效、无权限、参数错这类重试也不会好的记 failed，工作台显示「到卖家中心查看」。
import { and, eq, gt, sql } from "drizzle-orm";
import type { FaqRecord, FaqRecordItem } from "@/contracts/conversations";
import { db, schema } from "@/server/db/client";
import { enqueue } from "@/server/jobs/boss";
import { ShopUnavailableError, withShop } from "@/server/platforms/clients";
import { normalizeBundleMember, shopeeMessagesByIds } from "@/server/platforms/shopee";
import { PlatformError } from "@/server/platforms/types";

type MessageRow = typeof schema.message.$inferSelect;

/** 系统消息里的常见问题记录；不是这类消息返回 null。历史消息（本功能上线前入库）没有 bundle 字段，按 ID 未知的 pending 处理 */
export function faqRecordOf(m: Pick<MessageRow, "senderRole" | "payload">): FaqRecord | null {
  const p = (m.payload ?? {}) as Record<string, unknown>;
  if (m.senderRole !== "system" || p.platformType !== "bundle_message") return null;
  const b = p.bundle as FaqRecord | undefined;
  return b && Array.isArray(b.ids) ? b : { ids: [], status: "pending" };
}

/** 拉取中超过这么久说明任务在重试或已放弃（重试 4 次退避约 4 分钟），给工作台按取不到显示 */
const BUNDLE_STALE_MS = 10 * 60_000;

/** 给工作台的 payload：拉取中太久的常见问题记录（含本功能上线前入库、没有 bundle 字段的）按 failed 给 */
export function displayPayload(m: Pick<MessageRow, "senderRole" | "payload" | "createdAt">, now = Date.now()): Record<string, unknown> {
  const p = (m.payload ?? {}) as Record<string, unknown>;
  const faq = faqRecordOf(m);
  if (!faq || faq.status !== "pending" || now - m.createdAt.getTime() <= BUNDLE_STALE_MS) return p;
  return { ...p, bundle: { ...faq, status: "failed", error: "拉取超时" } satisfies FaqRecord };
}

export function enqueueBundle(messageId: string) {
  return enqueue("shopee.bundle", { messageId }, { singletonKey: messageId });
}

/** 会话里还没拉到内容的常见问题记录全部排任务（历史回补入库后调用：回补在事务里，提交后才能排） */
export async function enqueuePendingBundles(shopId: string, externalConversationId: string): Promise<number> {
  const rows = await db()
    .select({ id: schema.message.id })
    .from(schema.message)
    .innerJoin(schema.conversation, eq(schema.conversation.id, schema.message.conversationId))
    .where(
      and(
        eq(schema.conversation.shopId, shopId),
        eq(schema.conversation.externalConversationId, externalConversationId),
        eq(schema.message.senderRole, "system"),
        sql`${schema.message.payload}->>'platformType' = 'bundle_message'`,
        sql`coalesce(${schema.message.payload}->'bundle'->>'status', 'pending') = 'pending'`,
      ),
    );
  for (const r of rows) await enqueueBundle(r.id);
  return rows.length;
}

/** 重试也不会好的错误：店铺不可调、授权失效、无权限、参数错、平台查不到 */
function permanent(e: unknown): boolean {
  return e instanceof ShopUnavailableError || (e instanceof PlatformError && (e.kind === "auth" || e.kind === "forbidden" || e.kind === "not_found" || e.kind === "param"));
}

async function save(row: MessageRow, record: FaqRecord) {
  await db()
    .update(schema.message)
    .set({ payload: { ...((row.payload ?? {}) as Record<string, unknown>), bundle: record } })
    .where(eq(schema.message.id, row.id));
}

/**
 * shopee.bundle：拉回一条常见问题记录的成员。已拉到的不重复拉。
 * 历史消息没有成员 ID 时，先按这条 bundle_message 自己的 ID 拉回它的原始行取 content.messages。
 * 返回写回后的记录（脚本用来打印结果）；消息不存在或不是这类消息返回 null。
 */
export async function fillBundle(data: Record<string, unknown>): Promise<FaqRecord | null> {
  const messageId = String(data.messageId ?? "");
  const [row] = await db().select().from(schema.message).where(eq(schema.message.id, messageId)).limit(1);
  const current = row ? faqRecordOf(row) : null;
  if (!row || !current) return null;
  if (current.status === "ok" && !data.force) return current;
  const [conv] = await db().select().from(schema.conversation).where(eq(schema.conversation.id, row.conversationId)).limit(1);
  if (!conv || conv.platform !== "shopee") return null;

  let record: FaqRecord;
  try {
    record = await withShop(conv.shopId, async (c) => {
      if (c.platform !== "shopee") throw new PlatformError("shopee", "not_shopee", "店铺不是 Shopee", "param", 400);
      let ids = current.ids;
      if (!ids.length && row.externalMessageId) {
        const [own] = await shopeeMessagesByIds(c.app, c.auth, conv.externalConversationId, [row.externalMessageId]);
        const content = (own?.content ?? {}) as Record<string, unknown>;
        ids = ((content.messages as unknown[] | undefined) ?? []).map(String).filter((id) => /^\d+$/.test(id));
      }
      if (!ids.length) return { ids, status: "failed", error: "平台没有给出记录里的消息" };
      const raw = await shopeeMessagesByIds(c.app, c.auth, conv.externalConversationId, ids);
      const items: FaqRecordItem[] = raw
        .map((m) => normalizeBundleMember(m, c.auth.shopId))
        .sort((a, b) => a.sentAt.localeCompare(b.sentAt) || ids.indexOf(a.id) - ids.indexOf(b.id));
      return items.length ? { ids, status: "ok", items, fetchedAt: new Date().toISOString() } : { ids, status: "failed", error: "平台没有返回记录里的消息" };
    });
  } catch (e) {
    if (!permanent(e)) throw e;
    record = { ids: current.ids, status: "failed", error: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }
  await save(row, record);
  return record;
}

/** 出稿与飞书构卡前最多等多久：等刚收到、还在拉取的常见问题记录，让它们看得到买家原话 */
export const BUNDLE_WAIT_MS = 4_000;
/** 多新的 pending 才值得等（更早的说明任务在重试或已放弃，不再等） */
const BUNDLE_FRESH_MS = 20_000;

/** 会话里有刚收到、还在拉取的常见问题记录时等它拉完（最多 maxMs），到时不管结果继续 */
export async function waitForBundles(conversationId: string, maxMs = BUNDLE_WAIT_MS): Promise<void> {
  const deadline = Date.now() + maxMs;
  for (;;) {
    const [pending] = await db()
      .select({ id: schema.message.id })
      .from(schema.message)
      .where(
        and(
          eq(schema.message.conversationId, conversationId),
          eq(schema.message.senderRole, "system"),
          gt(schema.message.createdAt, new Date(Date.now() - BUNDLE_FRESH_MS)),
          sql`${schema.message.payload}->>'platformType' = 'bundle_message'`,
          sql`${schema.message.payload}->'bundle'->>'status' = 'pending'`,
        ),
      )
      .limit(1);
    if (!pending || Date.now() >= deadline) return;
    await new Promise((r) => setTimeout(r, 400));
  }
}
