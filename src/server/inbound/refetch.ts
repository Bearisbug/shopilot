// inbound.refetch（DESIGN §11.1 platform_human、§17）：Shopee 不推送卖家侧消息，卖家在卖家中心的回复只以 code 10 的
// mark_as_replied 通知到达。收到通知后按会话补拉最新一页消息，把本段开始之后、库里还没有的卖家侧消息按推送同一条路径入库
// （ingestMessage：本方出站回声认出后不入库；店铺自动回复记平台自动回复；其余记平台后台回复并走 platform_human 转移）。
// 买家消息以推送为准，补拉不入库，所以补拉不开段、不出稿。
import { and, eq } from "drizzle-orm";
import { ingestMessage, runFollowUp } from "@/server/conversations/ingest";
import { db, schema } from "@/server/db/client";
import { enqueue } from "@/server/jobs/boss";
import { ShopUnavailableError, withShop, type ShopRow } from "@/server/platforms/clients";
import { shopeeMessages } from "@/server/platforms/shopee";
import { PlatformError, type NormalizedMessage } from "@/server/platforms/types";

/** 通知到达后等 10 秒再拉：卖家连发的几条一次拉到，同一会话这期间的其他通知并进同一个任务 */
const REFETCH_DELAY_S = 10;
const PAGE_SIZE = 20;
/** 店铺自动回复与触发它的买家消息同一秒发出（线上 152 条自动回复全部在 2 秒内），人工回复做不到这么快 */
const AUTO_REPLY_WINDOW_MS = 2_000;
/** 常见问题记录与开段的买家消息几乎同时发出（线上实测晚 1 秒）；放宽到本段开始前 2 分钟，免得时钟差把它漏掉 */
const BUNDLE_SLACK_MS = 120_000;

export function enqueueRefetch(shopId: string, externalConversationId: string) {
  return enqueue("inbound.refetch", { shopId, conversationId: externalConversationId }, { singletonKey: `${shopId}:${externalConversationId}`, startAfter: REFETCH_DELAY_S });
}

export async function refetchConversation(data: Record<string, unknown>): Promise<void> {
  const shopId = String(data.shopId ?? "");
  const externalConversationId = String(data.conversationId ?? "");
  const [conv] = await db()
    .select()
    .from(schema.conversation)
    .where(and(eq(schema.conversation.shopId, shopId), eq(schema.conversation.externalConversationId, externalConversationId)))
    .limit(1);
  // 会话还没建（买家首条消息未到）、达人会话（平台不给读历史）都不补
  if (!conv?.currentSegmentId || conv.buyerKind === "affiliate") return;
  const [seg] = await db().select({ startedAt: schema.segment.startedAt }).from(schema.segment).where(eq(schema.segment.id, conv.currentSegmentId)).limit(1);
  if (!seg) return;

  let fetched: { shop: ShopRow; items: NormalizedMessage[] } | null;
  try {
    fetched = await withShop(shopId, async (c) =>
      c.platform === "shopee" && c.shop.capabilities.chat ? { shop: c.shop, items: (await shopeeMessages(c.app, c.auth, externalConversationId, null, PAGE_SIZE)).items } : null,
    );
  } catch (e) {
    // 授权失效、无权限、会话不存在：重试也不会好，只记日志；超时、5xx、网络错误抛出，由队列重试
    const permanent = e instanceof ShopUnavailableError || (e instanceof PlatformError && (e.kind === "auth" || e.kind === "forbidden" || e.kind === "not_found" || e.kind === "param"));
    if (!permanent) throw e;
    console.warn(JSON.stringify({ t: new Date().toISOString(), level: "warn", job: "inbound.refetch", shopId, conversationId: externalConversationId, err: e instanceof Error ? e.message : String(e) }));
    return;
  }
  if (!fetched) return;
  const { shop, items } = fetched;
  for (const m of sellerSideSince(items, seg.startedAt)) {
    const res = await db().transaction((tx) => ingestMessage(tx, shop, m, null));
    await runFollowUp(res.followUp);
  }
}

/**
 * 补拉页（新 → 旧）里本段开始之后的卖家侧与平台消息，按时间旧 → 新排；买家消息不返回。
 * 店铺发出、且距前一条买家消息不超过 2 秒的是店铺自动回复，记平台自动回复（platform_bot），不算有人在后台处理。
 */
export function sellerSideSince(page: NormalizedMessage[], since: Date): NormalizedMessage[] {
  // 先反转成旧 → 新再按时间稳定排序：同一秒的消息保持平台给的先后（自动回复排在触发它的买家消息之后）
  const sorted = [...page].reverse().sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  const out: NormalizedMessage[] = [];
  let lastBuyerAt: number | null = null;
  for (const m of sorted) {
    if (m.fromBuyer) {
      lastBuyerAt = m.sentAt.getTime();
      continue;
    }
    if (m.sentAt < since && !(m.payload.platformType === "bundle_message" && m.sentAt.getTime() >= since.getTime() - BUNDLE_SLACK_MS)) continue;
    const autoReply = m.senderRole === "agent" && lastBuyerAt !== null && m.sentAt.getTime() - lastBuyerAt <= AUTO_REPLY_WINDOW_MS;
    out.push(autoReply ? { ...m, senderRole: "platform_bot" } : m);
  }
  return out;
}
