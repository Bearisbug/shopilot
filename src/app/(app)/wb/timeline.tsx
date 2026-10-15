"use client";

import { ArrowDownIcon, ExternalLinkIcon, ImageIcon, PackageIcon, ShoppingBagIcon, TicketPercentIcon, TriangleAlertIcon, TruckIcon, Undo2Icon } from "lucide-react";
import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BuyerOrder, DraftItem, MessageItem, ProductCardInfo } from "@/contracts/conversations";
import { STATUS_GROUP_LABEL, type StatusGroup } from "@/contracts/orders";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderItems, Thumb, useClamped } from "@/components/orders/order-items";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { inTz, money, PLATFORM_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ImageViewer, type ViewerImage } from "./image-viewer";
import { AiTag, latestEvent } from "./wb-shared";

const STATUS_TEXT = { sending: "发送中", sent: "已发送", failed: "发送失败" } as const;
/** 卡片类消息不套聊天气泡：卡片自身就是带边框的块，按发送方左右对齐 */
const CARD_TYPES = new Set<MessageItem["type"]>(["order_card", "product_card", "return_card", "logistics_card", "coupon_card"]);

type Ctx = {
  ordersById: Map<string, BuyerOrder>;
  products: Record<string, ProductCardInfo>;
  platform: "shopee" | "tiktok";
  tz: string;
  /** 点开某条图片消息：在灯箱里从这张开始看本会话已加载的全部图片 */
  openImage: (messageId: string, trigger: HTMLElement) => void;
  /** 订单、物流、退货退款卡的链接：在平台卖家后台打开这张订单；拼不出链接时为 null */
  orderLink: (orderNo: string) => CardLink | null;
};
type CardLink = { href: string; label: string };
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
  orderUrl,
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
  /** 按平台订单号生成卖家后台的订单链接 */
  orderUrl: (orderNo: string) => string | null;
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
  const images: ViewerImage[] = messages.flatMap((m) => {
    const url = m.type === "image" && typeof m.payload.url === "string" ? m.payload.url : null;
    if (!url) return [];
    const who = m.direction === "in" ? "买家" : m.senderRole === "ai" ? "AI" : (m.senderName ?? "我方");
    return [{ id: m.id, src: url, caption: `${who} · ${inTz(m.sentAt, tz, "MM-dd HH:mm")}` }];
  });
  const [viewer, setViewer] = useState<{ index: number; trigger: HTMLElement; open: boolean } | null>(null);
  const openImage = (messageId: string, trigger: HTMLElement) => {
    const index = images.findIndex((i) => i.id === messageId);
    if (index >= 0) setViewer({ index, trigger, open: true });
  };
  const orderLink = (orderNo: string) => {
    const href = orderUrl(orderNo);
    return href ? { href, label: `在 ${PLATFORM_LABEL[platform]} 卖家中心打开订单 ${orderNo}` } : null;
  };
  const ctx: Ctx = { ordersById, products, platform, tz, openImage, orderLink };
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* 滚动位置由上面的逻辑自己还原，关掉浏览器的滚动锚定免得两边一起调；长串在气泡里折行，overflow-x 只是兜底 */}
      <div ref={ref} onScroll={onScroll} className="scroll-y min-h-0 flex-1 overflow-x-hidden [overflow-anchor:none]">
        <div ref={contentRef} className="@container/tl flex flex-col gap-3 px-4 py-4" aria-live="polite" aria-relevant="additions">
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
      {viewer && (
        <ImageViewer
          open={viewer.open}
          images={images}
          index={viewer.index}
          trigger={viewer.trigger}
          onClose={() => setViewer((v) => v && { ...v, open: false })}
          onExited={() => setViewer(null)}
        />
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
  // 卡片与图片自带边框，不再套聊天气泡
  const bubble = CARD_TYPES.has(m.type) || m.type === "image" ? (
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
    // 卡片消息在窄对话栏里占满宽度，栏宽超过 28rem 再和普通消息一样留出 15%
    <div className={cn("flex min-w-0 flex-col", CARD_TYPES.has(m.type) ? "max-w-full @md/tl:max-w-[85%]" : "max-w-[85%]", ours ? "items-end self-end" : "items-start")}>
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

// 卡片宽度随对话栏自适应：首选 30rem，放不下时占满消息列（消息列宽度见 MessageRow）
const CARD_CLASS = "flex w-120 max-w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left";

/** 卡片消息：标题一行，下面每个非空的 sub 各占一行；带 link 时整张卡片在新标签页打开链接 */
function CardBox({ icon: Icon, title, sub = [], link = null }: { icon: React.ComponentType<{ className?: string }>; title: string; sub?: Array<string | null | undefined>; link?: CardLink | null }) {
  const body = (
    <>
      <Icon className="size-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-xs [overflow-wrap:anywhere]">
        <span className="block font-medium tabular-nums">{title}</span>
        {sub.filter(Boolean).map((line, i) => (
          <span key={i} className="block text-muted-foreground">
            {line}
          </span>
        ))}
      </span>
      {link && <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );
  if (!link) return <div className={CARD_CLASS}>{body}</div>;
  return (
    <a href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.label} className={cn(CARD_CLASS, "state-layer focus-ring")}>
      {body}
    </a>
  );
}

function priceText(p: ProductCardInfo | undefined): string | null {
  if (!p?.priceMin) return null;
  const fmt = (v: string) => (p.currency ? money(v, p.currency) : v);
  return p.priceMax && p.priceMax !== p.priceMin ? `${fmt(p.priceMin)} – ${fmt(p.priceMax)}` : fmt(p.priceMin);
}

/** 商品卡片：缩略图、标题（最多两行）、现价；整张卡片在新标签页打开平台商品页。获取中显示同尺寸骨架；取不到时用图标占位、标题写商品 ID */
function ProductCard({ productId, info, fallbackName, platform }: { productId: string; info: ProductCardInfo | undefined; fallbackName?: string; platform: "shopee" | "tiktok" }) {
  if (info?.state === "loading") return <ProductCardSkeleton productId={productId} />;
  return <ProductCardBody productId={productId} info={info} fallbackName={fallbackName} platform={platform} />;
}

function ProductCardSkeleton({ productId }: { productId: string }) {
  const block = "bg-muted motion-reduce:animate-none";
  return (
    <div className={CARD_CLASS} role="status" aria-label={`商品 ${productId} 信息获取中`}>
      <Skeleton className={cn("size-14 shrink-0", block)} />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className={cn("h-4 w-4/5", block)} />
        <Skeleton className={cn("h-3 w-1/3", block)} />
      </span>
    </div>
  );
}

function ProductCardBody({ productId, info, fallbackName, platform }: { productId: string; info: ProductCardInfo | undefined; fallbackName?: string; platform: "shopee" | "tiktok" }) {
  const title = info?.name || fallbackName || `商品 ${productId}`;
  const price = priceText(info);
  const { ref: titleRef, clamped } = useClamped<HTMLSpanElement>(title);
  const [tipOpen, setTipOpen] = useState(false);
  const body = (
    <>
      <Thumb key={info?.imageUrl ?? ""} src={info?.imageUrl} icon={ShoppingBagIcon} />
      <span className="min-w-0 flex-1">
        <span ref={titleRef} className="line-clamp-2 text-sm leading-snug font-medium [overflow-wrap:anywhere]">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground tabular-nums">{price ?? "商品卡片"}</span>
      </span>
      {info?.url && <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );
  if (!info?.url) return <div className={CARD_CLASS}>{body}</div>;
  // 标题被截到两行时，悬停或键盘聚焦卡片弹出全名；读屏从 aria-label 读到全名
  return (
    <Tooltip open={clamped && tipOpen} onOpenChange={setTipOpen}>
      <TooltipTrigger asChild>
        <a href={info.url} target="_blank" rel="noopener noreferrer" aria-label={`在 ${PLATFORM_LABEL[platform]} 打开商品：${title}${price ? `，${price}` : ""}`} className={cn(CARD_CLASS, "state-layer focus-ring")}>
          {body}
        </a>
      </TooltipTrigger>
      <TooltipContent className="max-w-80 [overflow-wrap:anywhere]">{title}</TooltipContent>
    </Tooltip>
  );
}

/** 订单、物流、退货退款卡：标题一行，订单商品明细，底部补充信息；整张卡片在新标签页打开卖家后台的订单页。订单镜像里没有这单时退回只有标题的卡片 */
const STACK_CLASS = "flex w-120 max-w-full flex-col gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left";
const STACK_HEAD = "flex items-center gap-1.5 text-xs font-medium tabular-nums";

/**
 * 卡片里有「还有 N 件」按钮与可聚焦的商品名，整张卡片不能套成一个链接：键盘与读屏经标题行的链接打开，
 * 卡片其余位置的点击转给这个链接；点到卡片里的按钮由按钮自己处理，拖选文字不算点击。
 */
function StackCard({ icon: Icon, title, link, children }: { icon: React.ComponentType<{ className?: string }>; title: string; link: CardLink | null; children: React.ReactNode }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const head = (
    <>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{title}</span>
      {link && <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );
  if (!link)
    return (
      <div className={STACK_CLASS}>
        <p className={STACK_HEAD}>{head}</p>
        {children}
      </div>
    );
  return (
    <div
      className={cn(STACK_CLASS, "state-layer cursor-pointer")}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button") || window.getSelection()?.toString()) return;
        linkRef.current?.click();
      }}
    >
      <a ref={linkRef} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.label} className={cn(STACK_HEAD, "focus-ring rounded-sm")}>
        {head}
      </a>
      {children}
    </div>
  );
}

/** 底部补充信息：每个非空行一行，与商品明细之间用细线隔开 */
function CardFoot({ lines }: { lines: Array<string | null | undefined> }) {
  const shown = lines.filter(Boolean);
  if (!shown.length) return null;
  return (
    <span className="border-t border-border pt-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
      {shown.map((line, i) => (
        <span key={i} className="block tabular-nums">
          {line}
        </span>
      ))}
    </span>
  );
}

/** 订单卡底部：合计金额与当前状态（中文在前、平台原值在后） */
function orderFoot(o: BuyerOrder): string[] {
  const label = STATUS_GROUP_LABEL[o.statusGroup as StatusGroup];
  return [`合计 ${money(o.total, o.currency)}`, label ? `当前：${label}（${o.status}）` : `当前：${o.status}`];
}

function OrderCard({ orderId, order, link }: { orderId: string; order: BuyerOrder | undefined; link: CardLink | null }) {
  if (!order) return <CardBox icon={PackageIcon} title={`订单 ${orderId}`} link={link} />;
  return (
    <StackCard icon={PackageIcon} title={`订单 ${orderId}`} link={link}>
      <OrderItems items={order.items} currency={order.currency} />
      <CardFoot lines={orderFoot(order)} />
    </StackCard>
  );
}

/** 物流卡底部：承运商与运单号一行，按时间取最新的一条轨迹一行 */
function trackingLines(o: BuyerOrder | undefined, tz: string): string[] {
  const t = o?.tracking;
  if (!t) return [];
  const latest = latestEvent(t.events);
  return [[t.carrier, t.trackingNo ? `运单号 ${t.trackingNo}` : null].filter(Boolean).join(" · "), latest ? `${latest.text} · ${inTz(latest.at, tz, "MM-dd HH:mm")}` : "还没有物流轨迹"];
}

function LogisticsCard({ orderId, order, tz, link }: { orderId: string; order: BuyerOrder | undefined; tz: string; link: CardLink | null }) {
  const title = `物流 · 订单 ${orderId}`;
  if (!order) return <CardBox icon={TruckIcon} title={title} link={link} />;
  return (
    <StackCard icon={TruckIcon} title={title} link={link}>
      <OrderItems items={order.items} currency={order.currency} />
      <CardFoot lines={trackingLines(order, tz)} />
    </StackCard>
  );
}

/** 退货退款卡：退货单带 sku 时把对应那件标出来 */
function ReturnCard({ orderId, order, skuId, link }: { orderId: string; order: BuyerOrder | undefined; skuId: string | null; link: CardLink | null }) {
  const title = `退货退款 · 订单 ${orderId}`;
  if (!order) return <CardBox icon={Undo2Icon} title={title} link={link} />;
  return (
    <StackCard icon={Undo2Icon} title={title} link={link}>
      <OrderItems items={order.items} currency={order.currency} highlightSkuId={skuId} />
    </StackCard>
  );
}

// 缩略图最大 240 × 256（max-w-60、max-h-64）
const THUMB_W = 240;
const THUMB_H = 256;

/** 缩略图点开在灯箱里看原图；按 payload 的宽高先占好位置，图片加载完不再撑高时间线 */
function ChatImage({ id, url, width, height, onOpen }: { id: string; url: string; width: number; height: number; onOpen: Ctx["openImage"] }) {
  const scale = Math.min(1, THUMB_W / width, THUMB_H / height);
  return (
    <button type="button" aria-label="查看大图" aria-haspopup="dialog" onClick={(e) => onOpen(id, e.currentTarget)} className="focus-ring block max-w-full cursor-zoom-in rounded-lg">
      <Image
        src={url}
        alt="聊天图片"
        width={width}
        height={height}
        unoptimized
        className="h-auto max-w-full rounded-lg border border-border object-cover"
        style={{ width: Math.round(width * scale), aspectRatio: `${width} / ${height}` }}
      />
    </button>
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
        <ChatImage id={m.id} url={url} width={w} height={h} onOpen={ctx.openImage} />
      ) : (
        <CardBox icon={ImageIcon} title="图片" />
      );
    }
    case "order_card":
      return <OrderCard orderId={orderId} order={ordersById.get(orderId)} link={ctx.orderLink(orderId)} />;
    case "logistics_card":
      return <LogisticsCard orderId={orderId} order={ordersById.get(orderId)} tz={tz} link={ctx.orderLink(orderId)} />;
    case "return_card":
      return <ReturnCard orderId={orderId} order={ordersById.get(orderId)} skuId={typeof p.skuId === "string" ? p.skuId : null} link={ctx.orderLink(orderId)} />;
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
