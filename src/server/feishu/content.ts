// 待认领卡的内容：本段最近几条有意义的消息（带中文译文与媒体占位）、买家已等时长、AI 一句话总结。
// 译文与总结都限时，失败只少一块内容，不挡发卡；总结不计出稿用量。
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { STATUS_GROUP_LABEL, type StatusGroup } from "@/contracts/orders";
import { chat } from "@/server/ai/client";
import { isChinese, translateText } from "@/server/ai/translate";
import { db, schema } from "@/server/db/client";
import type { CardLine } from "./card";
import type { ImageSource } from "./client";

type MessageRow = typeof schema.message.$inferSelect;
type ConversationRow = typeof schema.conversation.$inferSelect;

/** 卡片上最多显示的消息条数、缩略图张数；总结看的消息条数 */
export const CARD_LINES = 5;
export const CARD_IMAGES = 3;
const SUMMARY_MESSAGES = 20;
/** 构卡时补译文的时限（与 AI 总结同为 6 秒，二者并行） */
const TRANSLATE_BUDGET_MS = 6_000;

const ROLE: Record<string, CardLine["role"] | undefined> = { buyer: "买家", agent: "客服", platform_human: "客服", ai: "AI" };

/** 有意义的消息：买家、客服、AI 发的；跳过系统事件、平台自动消息、发送失败的与空消息 */
export function meaningful(m: Pick<MessageRow, "senderRole" | "type" | "text" | "sendStatus">): boolean {
  if (!ROLE[m.senderRole]) return false;
  if (m.sendStatus === "failed") return false;
  if (m.type === "text" || m.type === "other") return Boolean(m.text?.trim());
  return true;
}

/** 到时或出错都得 null */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((r) => (timer = setTimeout(() => r(null), ms)));
  return Promise.race([p.catch(() => null), late]).finally(() => clearTimeout(timer));
}

function videoLabel(payload: Record<string, unknown>): string {
  const sec = Math.round(Number(payload.duration));
  return Number.isFinite(sec) && sec > 0 ? `[视频 ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}]` : "[视频]";
}

/** 订单类卡片的单号与中文状态；商品卡的商品名（本店商品缓存，退到消息里带的名称） */
async function cardFacts(shopId: string, rows: MessageRow[]) {
  const orderIds = [...new Set(rows.map((m) => m.payload?.orderId).filter((x): x is string => typeof x === "string" && x.length > 0))];
  const productIds = [...new Set(rows.map((m) => m.payload?.productId).filter((x): x is string => typeof x === "string" && x.length > 0))];
  const orders = orderIds.length
    ? await db()
        .select({ id: schema.order.externalOrderId, group: schema.order.statusGroup })
        .from(schema.order)
        .where(and(eq(schema.order.shopId, shopId), inArray(schema.order.externalOrderId, orderIds)))
    : [];
  const products = productIds.length
    ? await db()
        .select({ id: schema.productInfo.externalProductId, name: schema.productInfo.name })
        .from(schema.productInfo)
        .where(and(eq(schema.productInfo.shopId, shopId), inArray(schema.productInfo.externalProductId, productIds)))
    : [];
  return { orderStatus: new Map(orders.map((o) => [o.id, STATUS_GROUP_LABEL[o.group as StatusGroup] ?? ""])), productName: new Map(products.map((p) => [p.id, p.name ?? ""])) };
}

/** 一条消息在卡片 / 总结里的占位文字（文字消息返回 null） */
function placeholder(m: MessageRow, facts: Awaited<ReturnType<typeof cardFacts>>): { text: string; link: boolean } | null {
  const p = (m.payload ?? {}) as Record<string, unknown>;
  switch (m.type) {
    case "video":
      return { text: videoLabel(p), link: true };
    case "sticker":
      return { text: "[表情]", link: false };
    case "product_card": {
      const id = typeof p.productId === "string" ? p.productId : "";
      const name = facts.productName.get(id) || (typeof p.productName === "string" ? p.productName : "");
      return { text: name ? `[商品] ${name}` : "[商品]", link: false };
    }
    case "order_card":
    case "logistics_card":
    case "return_card": {
      const id = typeof p.orderId === "string" ? p.orderId : "";
      const status = id ? facts.orderStatus.get(id) : "";
      return { text: id ? `[订单] ${id}${status ? ` · ${status}` : ""}` : "[订单]", link: false };
    }
    case "coupon_card":
      return { text: typeof p.couponTitle === "string" && p.couponTitle ? `[优惠券] ${p.couponTitle}` : "[优惠券]", link: false };
    case "image":
      return { text: "[图片]", link: true };
    default:
      return null;
  }
}

export type CardContent = { lines: CardLine[]; summary: string | null; waitedSec: number | null };

/**
 * 本段最近的有意义消息与总结。uploadImage 只在应用接法下给：前 3 张有平台地址的图片上传到飞书拿 image_key，
 * 失败或没给时卡片显示「[图片]」与「在 Shopilot 查看」。
 */
export async function cardContent(
  conv: ConversationRow,
  opts: { timezone: string; uploadImage?: (image: ImageSource) => Promise<string> },
): Promise<CardContent> {
  const rows = conv.currentSegmentId
    ? await db()
        .select()
        .from(schema.message)
        .where(and(eq(schema.message.conversationId, conv.id), eq(schema.message.segmentId, conv.currentSegmentId), inArray(schema.message.senderRole, ["buyer", "agent", "platform_human", "ai"])))
        .orderBy(desc(schema.message.sentAt), desc(schema.message.createdAt))
        .limit(60)
    : [];
  const recent = rows.filter(meaningful).slice(0, SUMMARY_MESSAGES).reverse();
  const shown = recent.slice(-CARD_LINES);
  const facts = await cardFacts(conv.shopId, recent);

  // 买家已等：最早一条未回复的买家消息（与待认领提醒同一口径）
  const [since] = await db()
    .select({ at: sql<Date | null>`min(${schema.message.sentAt})` })
    .from(schema.message)
    .where(and(eq(schema.message.conversationId, conv.id), eq(schema.message.senderRole, "buyer"), gt(schema.message.sentAt, conv.lastAgentAt ?? new Date(0))));
  const waitedSec = since?.at ? Math.max(0, Math.floor((Date.now() - new Date(since.at).getTime()) / 1000)) : null;

  let images = 0;
  const lineJobs = shown.map(async (m): Promise<CardLine> => {
    const ph = placeholder(m, facts);
    const text = m.text?.trim() || null;
    const role = ROLE[m.senderRole]!;
    const time = format(new TZDate(m.sentAt, opts.timezone), "HH:mm");
    // 原文是中文时不放译文（平台推送带的机翻也不放）
    const chinese = !text || isChinese(text);
    let translation: string | null = chinese ? null : m.originalText?.trim() || m.translation?.trim() || null;
    const translate = !translation && text && !chinese ? withTimeout(translateText(text, "zh-CN"), TRANSLATE_BUDGET_MS) : null;
    let media: CardLine["media"] = ph ? { kind: "label", text: ph.text, link: ph.link } : null;
    if (m.type === "image") {
      const url = typeof m.payload?.url === "string" && /^https?:\/\//i.test(m.payload.url) ? m.payload.url : null;
      let imageKey: string | null = null;
      if (opts.uploadImage && url && images < CARD_IMAGES) {
        images++;
        imageKey = await withTimeout(opts.uploadImage({ url }), 12_000);
      }
      media = { kind: "image", imageKey };
    }
    if (translate) translation = (await translate)?.trim() || null;
    if (translation && text && translation === text) translation = null;
    return { role, time, text, translation, media };
  });

  const summaryJob = recent.length ? withTimeout(summarize(conv, recent, facts, waitedSec), 6_500) : Promise.resolve(null);
  const [lines, summary] = await Promise.all([Promise.all(lineJobs), summaryJob]);
  return { lines, summary, waitedSec };
}

/** AI 一句话总结（1–2 句中文）；替身模式返回固定文案 */
async function summarize(conv: ConversationRow, msgs: MessageRow[], facts: Awaited<ReturnType<typeof cardFacts>>, waitedSec: number | null): Promise<string | null> {
  const transcript = msgs
    .map((m) => {
      const ph = placeholder(m, facts);
      const body = [ph?.text, m.text?.trim(), m.translation ? `（译文：${m.translation}）` : null].filter(Boolean).join(" ");
      return `${ROLE[m.senderRole]}：${body}`;
    })
    .join("\n");
  const waited = waitedSec === null ? "" : `买家已等 ${Math.max(1, Math.round(waitedSec / 60))} 分钟。`;
  const res = await chat(
    "summary",
    [
      {
        role: "system",
        content:
          "你是电商客服组长的助手。根据下面这段买家与店铺的对话，用 1 到 2 句简体中文概括：买家要什么、发了哪些图片或订单、现在卡在哪里。只写事实，不加称呼、不给建议，不超过 80 个字。",
      },
      { role: "user", content: `买家：${conv.buyerName}。${waited}\n${transcript}` },
    ],
    { maxTokens: 200 },
  );
  const text = res.content.replace(/\s+/g, " ").trim();
  return text || null;
}
