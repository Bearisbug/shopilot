"use client";

import { ArrowDownIcon, ExternalLinkIcon, ImageIcon, PackageIcon, ShoppingBagIcon, TicketPercentIcon, TriangleAlertIcon, TruckIcon, Undo2Icon } from "lucide-react";
import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BuyerOrder, DraftItem, MessageItem, ProductCardInfo } from "@/contracts/conversations";
import { STATUS_GROUP_LABEL, type StatusGroup } from "@/contracts/orders";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { inTz, money, PLATFORM_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AiTag, latestEvent } from "./wb-shared";

const STATUS_TEXT = { sending: "发送中", sent: "已发送", failed: "发送失败" } as const;
/** 卡片类消息不套聊天气泡：卡片自身就是带边框的块，按发送方左右对齐 */
const CARD_TYPES = new Set<MessageItem["type"]>(["order_card", "product_card", "return_card", "logistics_card", "coupon_card"]);

type Ctx = { ordersById: Map<string, BuyerOrder>; products: Record<string, ProductCardInfo>; platform: "shopee" | "tiktok"; tz: string };
const NEAR_BOTTOM = 80;

/**
 * 会话时间线：首屏与本人发送后贴底；用户往上翻时新消息只出「有新消息」按钮，不抢滚动位置（INT-008）。
 * 贴底时内容变高（图片加载、输入框变高）仍保持贴底；加载更早的消息后保持原来的阅读位置。
 */
export function Timeline({
  messages,
  shadowDrafts,
  ordersById,
  products,
  platform,
  tz,
  hasMore,
  loadingMore,
  onLoadMore,
  onRetry,
  retryingId,
}: {
  messages: MessageItem[];
  shadowDrafts: DraftItem[] | null;
  ordersById: Map<string, BuyerOrder>;
  /** 商品卡片涉及的商品信息，键为平台商品 ID */
  products: Record<string, ProductCardInfo>;
  platform: "shopee" | "tiktok";
  tz: string;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry: (messageId: string) => void;
  retryingId: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;
  const firstId = messages[0]?.id;
  const lastOwn = messages[messages.length - 1]?.direction === "out" && messages[messages.length - 1]?.senderRole === "agent";
  const [atBottom, setAtBottom] = useState(true);
  const [seenLastId, setSeenLastId] = useState(lastId);
  // 用户没有主动往上翻（ResizeObserver 回调里读，用 ref 免得拿到旧值）
  const stick = useRef(true);
  // 点「查看更早的消息」时记下离底部的距离，更早的消息插到上面后按它还原
  const fromBottom = useRef<number | null>(null);

  // 新的最后一条：贴底时跟到底；是本人刚发的也跟到底
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (atBottom || lastOwn) el.scrollTop = el.scrollHeight;
  }, [lastId, atBottom, lastOwn]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || fromBottom.current === null) return;
    el.scrollTop = el.scrollHeight - fromBottom.current;
    fromBottom.current = null;
  }, [firstId]);

  useEffect(() => {
    const el = ref.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    stick.current = bottom;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (bottom && seenLastId !== lastId) setSeenLastId(lastId);
  };
  const hasNew = !atBottom && seenLastId !== lastId && !lastOwn;
  const loadMore = () => {
    const el = ref.current;
    if (el) fromBottom.current = el.scrollHeight - el.scrollTop;
    onLoadMore();
  };

  const shadowByTrigger = new Map<string, DraftItem[]>();
  for (const d of shadowDrafts ?? []) {
    if (!d.triggerMessageId) continue;
    shadowByTrigger.set(d.triggerMessageId, [...(shadowByTrigger.get(d.triggerMessageId) ?? []), d]);
  }

  const days = messages.map((m) => inTz(m.sentAt, tz, "M 月 d 日"));
  const ctx: Ctx = { ordersById, products, platform, tz };
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* 滚动位置由上面的逻辑自己还原，关掉浏览器的滚动锚定免得两边一起调；长串在气泡里折行，overflow-x 只是兜底 */}
      <div ref={ref} onScroll={onScroll} className="scroll-y min-h-0 flex-1 overflow-x-hidden [overflow-anchor:none]">
        <div ref={contentRef} className="flex flex-col gap-3 px-4 py-4" aria-live="polite" aria-relevant="additions">
          {hasMore && (
            <Button variant="ghost" size="xs" className="self-center" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? "加载中…" : "查看更早的消息"}
            </Button>
          )}
          {messages.map((m, i) => {
            const day = days[i];
            const sep = i === 0 || day !== days[i - 1];
            return (
              <div key={m.id} className="flex flex-col gap-3">
                {sep && <p className="self-center text-xs text-muted-foreground">{day}</p>}
                <MessageRow m={m} ctx={ctx} onRetry={onRetry} retrying={retryingId === m.id} />
                {(shadowByTrigger.get(m.id) ?? []).map((d) => (
                  <ShadowDraft key={d.id} d={d} tz={tz} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {hasNew && (
        <Button
          size="xs"
          variant="secondary"
          className="absolute bottom-3 left-1/2 -translate-x-1/2"
          onClick={() => {
            const el = ref.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
        >
          <ArrowDownIcon />
          有新消息
        </Button>
      )}
    </div>
  );
}

function MessageRow({ m, ctx, onRetry, retrying }: { m: MessageItem; ctx: Ctx; onRetry: (id: string) => void; retrying: boolean }) {
  const time = inTz(m.sentAt, ctx.tz, "HH:mm");
  if (m.senderRole === "system") {
    return (
      <p className="self-center px-6 text-center text-xs text-muted-foreground [overflow-wrap:anywhere]">
        {m.text || "平台通知"} · <span className="tabular-nums">{time}</span>
      </p>
    );
  }
  const ours = m.direction === "out";
  const bubble = CARD_TYPES.has(m.type) ? (
    <Content m={m} ctx={ctx} />
  ) : (
    <div className={cn("max-w-full min-w-0 rounded-lg px-3 py-2 text-sm leading-relaxed [overflow-wrap:anywhere]", ours ? "rounded-tr-sm bg-accent" : "rounded-tl-sm bg-muted")}>
      <Content m={m} ctx={ctx} />
      {m.translation && (
        <p className="mt-1.5 border-t border-border pt-1.5 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium">译 · {m.translationSource === "platform" ? "Shopee" : "Shopilot"}</span> {m.translation}
        </p>
      )}
      {m.originalText && (
        <p className="mt-1.5 border-t border-border pt-1.5 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium">原文</span> {m.originalText}
        </p>
      )}
    </div>
  );
  return (
    <div className={cn("flex max-w-[85%] min-w-0 flex-col", ours ? "items-end self-end" : "items-start")}>
      {bubble}
      <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {m.senderRole === "ai" && <AiTag />}
        {ours && m.senderName && m.senderRole !== "ai" && <span>{m.senderName}</span>}
        <span className="tabular-nums">{time}</span>
        {ours && m.sendStatus && (
          <span className={cn(m.sendStatus === "failed" && "text-destructive")}>
            · {STATUS_TEXT[m.sendStatus]}
          </span>
        )}
      </span>
      {m.sendStatus === "failed" && (
        <span className="mt-1 flex max-w-full items-start gap-1.5 text-xs text-destructive">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{m.sendError ?? "平台没有返回成功"}</span>
          <Button variant="outline" size="xs" disabled={retrying} onClick={() => onRetry(m.id)}>
            {retrying ? "重试中…" : "重试"}
          </Button>
        </span>
      )}
    </div>
  );
}

const CARD_CLASS = "flex w-72 max-w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left";

/** 卡片消息：标题一行，下面每个非空的 sub 各占一行 */
function CardBox({ icon: Icon, title, sub = [] }: { icon: React.ComponentType<{ className?: string }>; title: string; sub?: Array<string | null | undefined> }) {
  return (
    <div className={CARD_CLASS}>
      <Icon className="size-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 text-xs [overflow-wrap:anywhere]">
        <span className="block font-medium tabular-nums">{title}</span>
        {sub.filter(Boolean).map((line, i) => (
          <span key={i} className="block text-muted-foreground">
            {line}
          </span>
        ))}
      </span>
    </div>
  );
}

function priceText(p: ProductCardInfo | undefined): string | null {
  if (!p?.priceMin) return null;
  const fmt = (v: string) => (p.currency ? money(v, p.currency) : v);
  return p.priceMax && p.priceMax !== p.priceMin ? `${fmt(p.priceMin)} – ${fmt(p.priceMax)}` : fmt(p.priceMin);
}

/** 商品卡片：缩略图、标题（最多两行）、现价；整张卡片在新标签页打开平台商品页。商品信息还没取到或取不到时用图标占位、标题写商品 ID */
function ProductCard({ productId, info, fallbackName, platform }: { productId: string; info: ProductCardInfo | undefined; fallbackName?: string; platform: "shopee" | "tiktok" }) {
  const [broken, setBroken] = useState(false);
  const title = info?.name || fallbackName || `商品 ${productId}`;
  const price = priceText(info);
  const image = info?.imageUrl && !broken ? info.imageUrl : null;
  const body = (
    <>
      <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {image ? (
          <Image src={image} alt="" fill sizes="56px" unoptimized referrerPolicy="no-referrer" className="object-cover" onError={() => setBroken(true)} />
        ) : (
          <ShoppingBagIcon className="size-5 text-muted-foreground" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm leading-snug font-medium [overflow-wrap:anywhere]">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground tabular-nums">{price ?? "商品卡片"}</span>
      </span>
      {info?.url && <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );
  if (!info?.url) return <div className={CARD_CLASS}>{body}</div>;
  return (
    <a href={info.url} target="_blank" rel="noopener noreferrer" aria-label={`在 ${PLATFORM_LABEL[platform]} 打开商品：${title}${price ? `，${price}` : ""}`} className={cn(CARD_CLASS, "state-layer focus-ring")}>
      {body}
    </a>
  );
}

/** 订单卡：商品与金额一行；状态按订单镜像的当前值，中文在前、平台原值在后 */
function orderLines(o: BuyerOrder | undefined): string[] {
  if (!o) return [];
  const first = o.items[0];
  const goods = [first ? `${first.name} ×${first.qty}${o.items.length > 1 ? ` 等 ${o.items.length} 件` : ""}` : null, money(o.total, o.currency)].filter(Boolean).join(" · ");
  const label = STATUS_GROUP_LABEL[o.statusGroup as StatusGroup];
  return [goods, label ? `当前：${label}（${o.status}）` : `当前：${o.status}`];
}

/** 物流卡：承运商与运单号一行，按时间取最新的一条轨迹一行 */
function trackingLines(o: BuyerOrder | undefined, tz: string): string[] {
  const t = o?.tracking;
  if (!t) return [];
  const latest = latestEvent(t.events);
  return [[t.carrier, t.trackingNo ? `运单号 ${t.trackingNo}` : null].filter(Boolean).join(" · "), latest ? `${latest.text} · ${inTz(latest.at, tz, "MM-dd HH:mm")}` : "还没有物流轨迹"];
}

// 缩略图最大 240 × 256（max-w-60、max-h-64）
const THUMB_W = 240;
const THUMB_H = 256;

/** 缩略图点开看原图；按 payload 的宽高先占好位置，图片加载完不再撑高时间线 */
function ChatImage({ url, width, height }: { url: string; width: number; height: number }) {
  const scale = Math.min(1, THUMB_W / width, THUMB_H / height);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" aria-label="查看大图" className="focus-ring block max-w-full cursor-zoom-in rounded-md">
          <Image
            src={url}
            alt="聊天图片"
            width={width}
            height={height}
            unoptimized
            className="h-auto max-w-full rounded-md object-cover"
            style={{ width: Math.round(width * scale), aspectRatio: `${width} / ${height}` }}
          />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>聊天图片</DialogTitle>
          <DialogDescription>
            <a href={url} target="_blank" rel="noreferrer" className="focus-ring rounded-sm text-(--semantic-color-text-link) underline-offset-4 hover:underline">
              在新标签页打开原图
            </a>
          </DialogDescription>
        </DialogHeader>
        <Image src={url} alt="聊天图片原图" width={width} height={height} unoptimized className="mx-auto h-auto max-h-[70dvh] w-auto max-w-full rounded-md object-contain" />
      </DialogContent>
    </Dialog>
  );
}

function Content({ m, ctx }: { m: MessageItem; ctx: Ctx }) {
  const { ordersById, tz } = ctx;
  const p = m.payload;
  const orderId = typeof p.orderId === "string" ? p.orderId : "";
  switch (m.type) {
    case "text":
      return <span className="whitespace-pre-wrap">{m.text}</span>;
    case "image": {
      const url = typeof p.url === "string" ? p.url : null;
      const w = Number(p.width) || 240;
      const h = Number(p.height) || 240;
      return url ? (
        <ChatImage url={url} width={w} height={h} />
      ) : (
        <CardBox icon={ImageIcon} title="图片" />
      );
    }
    case "order_card":
      return <CardBox icon={PackageIcon} title={`订单 ${orderId}`} sub={orderLines(ordersById.get(orderId))} />;
    case "logistics_card":
      return <CardBox icon={TruckIcon} title={`物流 · 订单 ${orderId}`} sub={trackingLines(ordersById.get(orderId), tz)} />;
    case "return_card":
      return <CardBox icon={Undo2Icon} title={`退货退款 · 订单 ${orderId}`} sub={[ordersById.get(orderId)?.items.find((i) => i.skuId === p.skuId)?.name]} />;
    case "coupon_card":
      return <CardBox icon={TicketPercentIcon} title="优惠券" sub={[typeof p.couponTitle === "string" ? p.couponTitle : String(p.couponId ?? "")]} />;
    case "product_card": {
      const productId = String(p.productId ?? "");
      return <ProductCard productId={productId} info={ctx.products[productId]} fallbackName={typeof p.productName === "string" ? p.productName : undefined} platform={ctx.platform} />;
    }
    case "sticker":
      return <span className="text-muted-foreground">[表情]</span>;
    case "video":
      return <span className="text-muted-foreground">[视频] 请到平台后台查看</span>;
    default:
      return <span className="text-muted-foreground">{m.text ?? "[这类消息请到平台后台查看]"}</span>;
  }
}

/** 影子回复：只给管理员、组长，折叠只读（REQ-AI-001） */
function ShadowDraft({ d, tz }: { d: DraftItem; tz: string }) {
  return (
    <details className="max-w-[85%] self-end rounded-lg border border-dashed border-border bg-(--semantic-color-surface-warm) px-3 py-2 text-sm [overflow-wrap:anywhere]">
      <summary className="focus-ring cursor-pointer text-xs text-muted-foreground">
        <AiTag className="mr-1.5" />
        AI 影子回复（未发送）· 置信度 <span className="tabular-nums">{d.confidence.toFixed(2)}</span> · <span className="tabular-nums">{inTz(d.createdAt, tz, "HH:mm")}</span>
      </summary>
      <p className="mt-2 leading-relaxed whitespace-pre-wrap">{d.text}</p>
    </details>
  );
}
