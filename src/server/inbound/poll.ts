// inbound.poll（只读接入）：凭证借用自其他系统的店收不到推送，改由本任务每 30 秒拉一次会话列表，
// 把游标之后的新消息按实时消息入库（与推送同一个 ingestMessage：归一、去重、会话状态、阶段判定、出稿）。
// 同一批里一个会话只出一次稿，且只在最新一条买家消息不早于 10 分钟时出；游标为空（刚接入）只把游标设为当前时间。
import { and, eq } from "drizzle-orm";
import { ingestMessage, runFollowUp, type FollowUp } from "@/server/conversations/ingest";
import { db, schema } from "@/server/db/client";
import { ShopUnavailableError, withShop, type ShopClient } from "@/server/platforms/clients";
import { shopeeConversations, shopeeMessages } from "@/server/platforms/shopee";
import { tiktokConversations, tiktokMessages } from "@/server/platforms/tiktok";
import { PlatformError, type NormalizedMessage } from "@/server/platforms/types";
import { collect } from "./backfill";

const ROUND_GAP_MS = 30_000;
/** 游标回退 5 秒再拉：同一秒到达、晚一步进会话列表的消息不漏，重复的由入库去重挡住 */
const OVERLAP_MS = 5_000;
const DRAFT_MAX_AGE_MS = 10 * 60_000;
/** 每轮最多翻 3 页会话列表（每页 20 个），30 秒内变动的会话不会更多 */
const MAX_CONVERSATION_PAGES = 3;
/** 平台超时、5xx、网络错误后跳过这家店的轮数（约 1 分钟） */
const BACKOFF_ROUNDS = 2;

type Buyer = { externalId: string; name: string | null; affiliate: boolean; avatarUrl: string | null };
type Batch = { buyer: Buyer; messages: NormalizedMessage[] };

const backoff = new Map<string, number>();

function log(line: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), job: "inbound.poll", ...line }));
}

export async function pollReadOnlyShops(): Promise<void> {
  // 没有只读接入的店就不等第二轮，免得每分钟白占一个 worker 槽 30 秒
  if ((await pollRound()) === 0) return;
  await new Promise((r) => setTimeout(r, ROUND_GAP_MS));
  await pollRound();
}

async function pollRound(): Promise<number> {
  const rows = await db()
    .select({ id: schema.shop.id })
    .from(schema.shop)
    .innerJoin(schema.platformApp, eq(schema.platformApp.id, schema.shop.platformAppId))
    .where(and(eq(schema.platformApp.readOnly, true), eq(schema.shop.status, "connected")));
  for (const { id } of rows) {
    const skip = backoff.get(id) ?? 0;
    if (skip > 0) {
      backoff.set(id, skip - 1);
      continue;
    }
    try {
      const n = await pollShop(id);
      if (n > 0) log({ level: "info", msg: "pulled", shopId: id, messages: n });
    } catch (e) {
      if (e instanceof ShopUnavailableError) {
        // 借用的 token 过期：店铺状态不变，店铺页显示「等待重新同步」
        log({ level: "info", msg: "shop unavailable", shopId: id, status: e.status });
      } else {
        if (e instanceof PlatformError && (e.kind === "server" || e.kind === "timeout" || e.kind === "network")) backoff.set(id, BACKOFF_ROUNDS);
        log({ level: "warn", msg: "poll failed", shopId: id, err: e instanceof PlatformError ? `${e.platform} ${e.code} ${e.message}` : e instanceof Error ? e.message : String(e) });
      }
    }
  }
  return rows.length;
}

/** 拉一家店游标之后的新消息并入库，返回新入库的消息数 */
export async function pollShop(shopId: string): Promise<number> {
  const [row] = await db().select().from(schema.shop).where(eq(schema.shop.id, shopId)).limit(1);
  if (!row) return 0;
  if (!row.pullCursorAt) {
    await db().update(schema.shop).set({ pullCursorAt: new Date() }).where(eq(schema.shop.id, shopId));
    return 0;
  }
  const since = new Date(row.pullCursorAt.getTime() - OVERLAP_MS);
  const { shop, batches } = await withShop(shopId, async (c) => ({ shop: c.shop, batches: await changedSince(c, since) }));

  let cursor = row.pullCursorAt;
  let ingested = 0;
  for (const b of batches) {
    let draft: { followUp: FollowUp; buyerAt: Date } | null = null;
    for (const m of [...b.messages].sort((x, y) => x.sentAt.getTime() - y.sentAt.getTime())) {
      if (m.sentAt > cursor) cursor = m.sentAt;
      const res = await db().transaction((tx) => ingestMessage(tx, shop, m, m.fromBuyer ? b.buyer : null));
      if (!res.messageId) continue;
      ingested++;
      const f = res.followUp;
      if (!f) continue;
      if (f.translate || f.unclaimed || f.bundle) await runFollowUp({ ...f, draftMode: null });
      if (m.fromBuyer && f.draftMode) draft = { followUp: f, buyerAt: m.sentAt };
    }
    // 出稿任务按会话取最新上下文：一批只排一次，买家消息太旧（如游标落后很久后补拉）就不出
    if (draft && Date.now() - draft.buyerAt.getTime() < DRAFT_MAX_AGE_MS) await runFollowUp({ ...draft.followUp, translate: false, unclaimed: false });
  }
  await db()
    .update(schema.shop)
    .set({ pullCursorAt: cursor, ...(ingested > 0 ? { lastInboundAt: new Date() } : {}) })
    .where(eq(schema.shop.id, shopId));
  return ingested;
}

/** 会话列表按最近消息时间从新到旧：取 since 之后有变动的会话，再取各会话 since 之后的消息 */
async function changedSince(c: ShopClient, since: Date): Promise<Batch[]> {
  const out: Batch[] = [];
  if (c.platform === "shopee") {
    let cursor: string | null = null;
    for (let page = 0; page < MAX_CONVERSATION_PAGES; page++) {
      const res = await shopeeConversations(c.app, c.auth, cursor, 20);
      for (const conv of res.items) {
        if (conv.lastMessageAt < since) return out;
        const messages = await collect(async (offset) => {
          const r = await shopeeMessages(c.app, c.auth, conv.conversationId, offset, 20);
          return { items: r.items, next: r.nextOffset };
        }, since);
        if (messages.length) out.push({ buyer: { externalId: conv.buyerId, name: conv.buyerName || null, affiliate: false, avatarUrl: conv.buyerAvatar }, messages });
      }
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
    }
    return out;
  }
  let token: string | null = null;
  for (let page = 0; page < MAX_CONVERSATION_PAGES; page++) {
    const res = await tiktokConversations(c.app, c.auth, token, 20);
    for (const conv of res.items) {
      if (!conv.lastMessageAt) continue;
      if (conv.lastMessageAt < since) return out;
      const messages = await collect(async (t) => {
        const r = await tiktokMessages(c.app, c.auth, conv.conversationId, t);
        return { items: r.items, next: r.nextPageToken };
      }, since);
      if (messages.length) out.push({ buyer: { externalId: conv.buyerUserId ?? conv.buyerImId ?? "", name: conv.buyerName || null, affiliate: conv.affiliate, avatarUrl: conv.buyerAvatar }, messages });
    }
    if (!res.nextPageToken) break;
    token = res.nextPageToken;
  }
  return out;
}
