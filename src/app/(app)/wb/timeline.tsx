"use client";

import { ArrowDownIcon, BotMessageSquareIcon, CopyIcon, ExternalLinkIcon, GraduationCapIcon, ImageIcon, PackageIcon, PlayIcon, ShoppingBagIcon, SmileIcon, TicketPercentIcon, TriangleAlertIcon, TruckIcon, Undo2Icon, VideoIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { BuyerOrder, DraftItem, FaqRecord, FaqRecordItem, MessageItem, ProductCardInfo } from "@/contracts/conversations";
import { STATUS_GROUP_LABEL, type StatusGroup } from "@/contracts/orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderItems, Thumb, useClamped } from "@/components/orders/order-items";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { inTz, money, PLATFORM_LABEL } from "@/lib/format";
import { platformNoticeText } from "@/lib/platform-notice";
import { cn } from "@/lib/utils";
import { MediaViewer, type ViewerItem } from "./media-viewer";
import { AiTag, Citations, DraftCardLine, latestEvent } from "./wb-shared";

const STATUS_TEXT = { sending: "发送中", sent: "已发送", failed: "发送失败" } as const;
/** 卡片类消息不套聊天气泡：卡片自身就是带边框的块，按发送方左右对齐 */
const CARD_TYPES = new Set<MessageItem["type"]>(["order_card", "product_card", "return_card", "logistics_card", "coupon_card"]);

type Ctx = {
  ordersById: Map<string, BuyerOrder>;
  products: Record<string, ProductCardInfo>;
  platform: "shopee" | "tiktok";
  tz: string;
  /** 点开某条图片或视频消息：在灯箱里从这一项开始看本会话已加载的全部图片与视频 */
  openMedia: (messageId: string, trigger: HTMLElement) => void;
  /** 加载失败（链接过期）的图片、视频、贴纸消息：显示过期提示，不进灯箱 */
  failed: ReadonlySet<string>;
  markFailed: (messageId: string) => void;
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
  conversationId,
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
  select,
  submitted,
}: {
  /** 媒体下载接口按会话与消息取文件 */
  conversationId: string;
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
  /** 提交学习的选择模式：每条消息左侧出复选框；选满后没选的不能再选 */
  select?: { picked: ReadonlySet<string>; toggle: (messageId: string) => void; full: boolean };
  /** 已提交过学习的消息：消息下方标「已提交学习」 */
  submitted?: ReadonlySet<string>;
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
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const markFailed = (messageId: string) => setFailed((s) => (s.has(messageId) ? s : new Set(s).add(messageId)));
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number; trigger: HTMLElement; open: boolean } | null>(null);
  // 点开时按时间顺序取本会话已加载、没有加载失败的图片与视频
  const openMedia = (messageId: string, trigger: HTMLElement) => {
    const items = messages.flatMap((m): ViewerItem[] => {
      const p = m.payload;
      const url = typeof p.url === "string" ? p.url : null;
      if (!url || failed.has(m.id) || (m.type !== "image" && m.type !== "video")) return [];
      const who = m.direction === "in" ? "买家" : m.senderRole === "ai" ? "AI" : (m.senderName ?? "我方");
      const base = { id: m.id, src: url, caption: `${who} · ${inTz(m.sentAt, tz, "MM-dd HH:mm")}`, downloadUrl: `/api/v1/conversations/${conversationId}/messages/${m.id}/media` };
      if (m.type === "image") return [{ ...base, kind: "image" }];
      return [{ ...base, kind: "video", poster: typeof p.cover === "string" ? p.cover : undefined, width: Number(p.width) || undefined, height: Number(p.height) || undefined }];
    });
    const index = items.findIndex((i) => i.id === messageId);
    if (index >= 0) setViewer({ items, index, trigger, open: true });
  };
  const orderLink = (orderNo: string) => {
    const href = orderUrl(orderNo);
    return href ? { href, label: `在 ${PLATFORM_LABEL[platform]} 卖家中心打开订单 ${orderNo}` } : null;
  };
  const ctx: Ctx = { ordersById, products, platform, tz, openMedia, failed, markFailed, orderLink };
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
                {select ? (
                  <div className="flex items-start gap-2">
                    <Checkbox
                      className="mt-2"
                      checked={select.picked.has(m.id)}
                      disabled={!select.picked.has(m.id) && select.full}
                      onCheckedChange={() => select.toggle(m.id)}
                      aria-label={`选择消息：${m.direction === "in" ? "买家" : m.senderRole === "ai" ? "AI" : m.senderRole === "system" ? "系统" : (m.senderName ?? "我方")} ${inTz(m.sentAt, tz, "HH:mm")}${m.text ? `「${[...m.text].slice(0, 20).join("")}」` : ""}`}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <MessageRow m={m} ctx={ctx} onRetry={onRetry} retrying={retryingId === m.id} />
                      {submitted?.has(m.id) && <LearnedMark m={m} />}
                    </div>
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-col">
                    <MessageRow m={m} ctx={ctx} onRetry={onRetry} retrying={retryingId === m.id} />
                    {submitted?.has(m.id) && <LearnedMark m={m} />}
                  </div>
                )}
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
        <MediaViewer
          open={viewer.open}
          items={viewer.items}
          index={viewer.index}
          trigger={viewer.trigger}
          onClose={() => setViewer((v) => v && { ...v, open: false })}
          onExited={() => setViewer(null)}
          onVideoError={markFailed}
        />
      )}
    </div>
  );
}

/** 被提交过学习的消息：跟在消息下方、与消息同侧 */
function LearnedMark({ m }: { m: MessageItem }) {
  return (
    <span className={cn("mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground", m.senderRole === "system" ? "self-center" : m.direction === "out" ? "self-end" : "self-start")}>
      <GraduationCapIcon className="size-3.5" aria-hidden />
      已提交学习
    </span>
  );
}

function MessageRow({ m, ctx, onRetry, retrying }: { m: MessageItem; ctx: Ctx; onRetry: (id: string) => void; retrying: boolean }) {
  const time = inTz(m.sentAt, ctx.tz, "HH:mm");
  const faq = faqRecord(m);
  if (faq) {
    return (
      <div className="flex max-w-full min-w-0 flex-col items-start @md/tl:max-w-[85%]">
        <FaqRecordCard record={faq} tz={ctx.tz} />
        <span className="mt-1 text-xs text-muted-foreground tabular-nums">{time}</span>
      </div>
    );
  }
  if (m.senderRole === "system") {
    // 平台英文系统提示按对照表显示中文，点开看平台原文；表外的照原文显示
    const zh = platformNoticeText(m.text);
    if (zh) {
      return (
        <details className="self-center px-6 text-center text-xs text-muted-foreground [overflow-wrap:anywhere]">
          <summary className="focus-ring cursor-pointer rounded-sm">
            {zh} · <span className="tabular-nums">{time}</span>
          </summary>
          <p lang="en" className="mt-1">
            <Badge variant="outline" className="mr-1.5 font-normal text-muted-foreground">
              原文
            </Badge>
            {m.text}
          </p>
        </details>
      );
    }
    return (
      <p className="self-center px-6 text-center text-xs text-muted-foreground [overflow-wrap:anywhere]">
        {m.text || "平台通知"} · <span className="tabular-nums">{time}</span>
      </p>
    );
  }
  const ours = m.direction === "out";
  // 卡片与图片、视频、贴纸不套聊天气泡；带文字的图片（Shopee image_with_text）把文字作为普通文字消息放在图片下方
  const bare = CARD_TYPES.has(m.type) || m.type === "image" || m.type === "video" || (m.type === "sticker" && typeof m.payload.url === "string");
  const caption = m.type === "image" && m.text ? m.text : null;
  return (
    // 卡片消息在窄对话栏里占满宽度，栏宽超过 28rem 再和普通消息一样留出 15%
    <div className={cn("flex min-w-0 flex-col", CARD_TYPES.has(m.type) ? "max-w-full @md/tl:max-w-[85%]" : "max-w-[85%]", ours ? "items-end self-end" : "items-start")}>
      {bare ? (
        <Content m={m} ctx={ctx} />
      ) : (
        <Bubble m={m}>
          <Content m={m} ctx={ctx} />
        </Bubble>
      )}
      {caption && (
        <Bubble m={m} className="mt-1">
          <span className="whitespace-pre-wrap">{caption}</span>
        </Bubble>
      )}
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

/** 聊天气泡：我方在右、用 accent 底，对方在左、用 muted 底；平台译文与发送前的原文跟在正文下面 */
function Bubble({ m, className, children }: { m: MessageItem; className?: string; children: React.ReactNode }) {
  const ours = m.direction === "out";
  return (
    <div className={cn("max-w-full min-w-0 rounded-lg px-3 py-2 text-sm leading-relaxed [overflow-wrap:anywhere]", ours ? "rounded-tr-sm bg-accent" : "rounded-tl-sm bg-muted", className)}>
      {children}
      {m.translation && (
        <p className="mt-1.5 border-t border-border pt-1.5 text-xs leading-relaxed text-muted-foreground">
          <Badge variant="outline" className="mr-1.5 font-normal text-muted-foreground">
            译 · {m.translationSource === "platform" ? "Shopee" : "Shopilot"}
          </Badge>
          {m.translation}
        </p>
      )}
      {m.originalText && (
        <p className="mt-1.5 border-t border-border pt-1.5 text-xs leading-relaxed text-muted-foreground">
          <Badge variant="outline" className="mr-1.5 font-normal text-muted-foreground">
            原文
          </Badge>
          {m.originalText}
        </p>
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

/** 常见问题记录（Shopee bundle_message）；不是这类消息返回 null。本功能上线前入库的没有 bundle 字段，按拉取中处理 */
function faqRecord(m: MessageItem): FaqRecord | null {
  if (m.senderRole !== "system" || m.payload.platformType !== "bundle_message") return null;
  const b = m.payload.bundle as FaqRecord | undefined;
  return b && Array.isArray(b.ids) ? b : { ids: [], status: "pending" };
}

/** 收起时显示最后几条 */
const FAQ_PREVIEW = 2;
const FAQ_ROLE = { buyer: "买家", bot: "AI 助手" } as const;

function faqItemText(x: FaqRecordItem): string {
  if (x.kind === "product_rcmd") return `推荐了 ${x.count ?? 0} 个商品`;
  if (x.kind === "image") return "[图片]";
  return x.text ?? "[其他消息]";
}

/**
 * 常见问题记录：买家转人工前和 Shopee 商店 AI 助手的对话。收起时显示最后 2 条，展开看全部；
 * 买家原话带平台译文。拉取中显示骨架；取不到（含拉取太久，由接口按 failed 给）时提示到卖家中心查看。
 */
function FaqRecordCard({ record, tz }: { record: FaqRecord; tz: string }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const items = record.status === "ok" ? (record.items ?? []) : [];
  const count = items.length || record.ids.length;
  const shown = open ? items : items.slice(-FAQ_PREVIEW);
  return (
    <div className={STACK_CLASS}>
      <p className={STACK_HEAD}>
        <BotMessageSquareIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          常见问题记录<span className="font-normal text-muted-foreground"> · Shopee 商店 AI 助手</span>
        </span>
        {count > 0 && <span className="shrink-0 font-normal text-muted-foreground">{count} 条</span>}
      </p>
      {record.status === "pending" ? (
        <div role="status" aria-label="正在从 Shopee 拉取常见问题记录" className="flex flex-col gap-2">
          <Skeleton className="h-4 w-3/4 bg-muted motion-reduce:animate-none" />
          <Skeleton className="h-4 w-1/2 bg-muted motion-reduce:animate-none" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">没有取到记录内容，请到 Shopee 卖家中心查看</p>
      ) : (
        <>
          <ol id={listId} className="flex flex-col divide-y divide-border">
            {shown.map((x) => (
              <li key={x.id} className="flex flex-col gap-0.5 py-1.5 first:pt-0 last:pb-0">
                <span className="text-xs text-muted-foreground">
                  {FAQ_ROLE[x.role]} · <span className="tabular-nums">{inTz(x.sentAt, tz, "HH:mm")}</span>
                </span>
                <span className={cn("text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]", x.kind !== "text" && "text-muted-foreground")}>{faqItemText(x)}</span>
                {x.translation && (
                  <span className="text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                    <Badge variant="outline" className="mr-1.5 font-normal text-muted-foreground">
                      译 · Shopee
                    </Badge>
                    {x.translation}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {/* -ml-2 抵消 ghost 按钮的左内边距（px-2），按钮文字与上面消息文字左缘对齐 */}
          {items.length > FAQ_PREVIEW && (
            <Button variant="ghost" size="xs" className="-ml-2 self-start" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)}>
              {open ? "收起" : `展开全部 ${items.length} 条`}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

// 缩略图最大 240 × 256（max-w-60、max-h-64）；贴纸最大 120 × 120
const THUMB_W = 240;
const THUMB_H = 256;
const STICKER_MAX = 120;
const EXPIRED_HINT = "加载不出来，链接可能已过期，请到平台后台查看";

/** 按 payload 的宽高等比缩进上限：先占好位置，媒体加载完不再撑高时间线 */
function fitBox(width: number, height: number, maxW: number, maxH: number): React.CSSProperties {
  const scale = Math.min(1, maxW / width, maxH / height);
  return { width: Math.round(width * scale), aspectRatio: `${width} / ${height}` };
}

/** 图片缩略图：点开在灯箱里看原图；加载失败（链接过期）时换成过期提示 */
function ChatImage({ id, url, width, height, ctx }: { id: string; url: string; width: number; height: number; ctx: Ctx }) {
  if (ctx.failed.has(id)) return <CardBox icon={ImageIcon} title="图片" sub={[`图片${EXPIRED_HINT}`]} />;
  return (
    <button type="button" aria-label="查看大图" aria-haspopup="dialog" onClick={(e) => ctx.openMedia(id, e.currentTarget)} className="focus-ring block max-w-full cursor-zoom-in rounded-lg">
      <Image
        src={url}
        alt="聊天图片"
        width={width}
        height={height}
        unoptimized
        onError={() => ctx.markFailed(id)}
        className="h-auto max-w-full rounded-lg border border-border object-cover"
        style={fitBox(width, height, THUMB_W, THUMB_H)}
      />
    </button>
  );
}

function durationText(sec: number): string {
  const t = Math.round(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * 视频缩略图：封面 + 播放键 + 时长，点开在灯箱里播放（窄栏里就地播放的播放器太小）。
 * 没有封面或封面加载失败时取第 0.1 秒那一帧当封面；视频本身加载失败（链接过期，TikTok 带签名）时换成过期提示。
 * payload 带宽高就按它等比占位；早先入库的视频没有尺寸，先按手机竖屏 9:16 摆，封面或视频读出尺寸后按真实比例调整一次
 */
function ChatVideo({ id, url, cover, width, height, duration, ctx }: { id: string; url: string; cover: string | null; width: number | null; height: number | null; duration: number | null; ctx: Ctx }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const box = width && height ? { w: width, h: height } : (natural ?? { w: 270, h: 480 });
  const measured = (w: number, h: number) => {
    if (!(width && height) && w && h) setNatural((n) => n ?? { w, h });
  };
  if (ctx.failed.has(id)) return <CardBox icon={VideoIcon} title="视频" sub={[`视频${EXPIRED_HINT}`]} />;
  return (
    <button
      type="button"
      aria-label={duration ? `播放视频，时长 ${Math.round(duration)} 秒` : "播放视频"}
      aria-haspopup="dialog"
      onClick={(e) => ctx.openMedia(id, e.currentTarget)}
      className="focus-ring relative block max-w-full overflow-hidden rounded-lg border border-border bg-(--semantic-color-surface-inverse)"
      style={fitBox(box.w, box.h, THUMB_W, THUMB_H)}
    >
      {cover && !coverFailed ? (
        <Image src={cover} alt="" fill unoptimized sizes={`${THUMB_W}px`} onLoad={(e) => measured(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} onError={() => setCoverFailed(true)} className="object-contain" />
      ) : (
        <video
          src={`${url}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          aria-hidden="true"
          onLoadedMetadata={(e) => measured(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
          onError={() => ctx.markFailed(id)}
          className="size-full object-contain"
        />
      )}
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-10 place-items-center rounded-full bg-(--semantic-color-surface-inverse)/70 text-(--semantic-color-text-on-inverse)">
          {/* 光学修正：三角形重心偏左，右移 1px 才显得居中 */}
          <PlayIcon className="size-5 translate-x-px fill-current" aria-hidden="true" />
        </span>
      </span>
      {duration ? (
        <span className="absolute right-1.5 bottom-1.5 rounded-sm bg-(--semantic-color-surface-inverse)/70 px-1.5 text-xs leading-5 text-(--semantic-color-text-on-inverse) tabular-nums">
          {durationText(duration)}
        </span>
      ) : null}
    </button>
  );
}

/** 贴纸：按原图小尺寸显示，不进灯箱、点击无动作；加载失败时换成过期提示 */
function ChatSticker({ id, url, width, height, ctx }: { id: string; url: string; width: number; height: number; ctx: Ctx }) {
  if (ctx.failed.has(id)) return <CardBox icon={SmileIcon} title="表情" sub={[`表情${EXPIRED_HINT}`]} />;
  return <Image src={url} alt="表情" width={width} height={height} unoptimized onError={() => ctx.markFailed(id)} className="block h-auto max-w-full" style={fitBox(width, height, STICKER_MAX, STICKER_MAX)} />;
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
        <ChatImage id={m.id} url={url} width={w} height={h} ctx={ctx} />
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
    case "sticker": {
      // 早先入库的贴纸没有地址，只能显示文字
      const url = typeof p.url === "string" ? p.url : null;
      return url ? <ChatSticker id={m.id} url={url} width={Number(p.width) || STICKER_MAX} height={Number(p.height) || STICKER_MAX} ctx={ctx} /> : <span className="text-muted-foreground">[表情]</span>;
    }
    case "video": {
      const url = typeof p.url === "string" ? p.url : null;
      return url ? (
        <ChatVideo id={m.id} url={url} ctx={ctx} cover={typeof p.cover === "string" ? p.cover : null} width={Number(p.width) || null} height={Number(p.height) || null} duration={Number(p.duration) || null} />
      ) : (
        <CardBox icon={VideoIcon} title="视频" sub={["请到平台后台查看"]} />
      );
    }
    default:
      return <span className="text-muted-foreground">{m.text ?? "[这类消息请到平台后台查看]"}</span>;
  }
}

/** 影子回复：只给管理员、组长，折叠只读（REQ-AI-001）；不是商户语言时原文下方带译文，「复制」复制原文（REQ-AI-007） */
function ShadowDraft({ d, tz }: { d: DraftItem; tz: string }) {
  return (
    <details className="max-w-[85%] self-end rounded-lg border border-dashed border-border bg-(--semantic-color-surface-warm) px-3 py-2 text-sm [overflow-wrap:anywhere]">
      <summary className="focus-ring cursor-pointer text-xs text-muted-foreground">
        <AiTag className="mr-1.5" />
        AI 影子回复（未发送）· 置信度 <span className="tabular-nums">{d.confidence.toFixed(2)}</span> · <span className="tabular-nums">{inTz(d.createdAt, tz, "HH:mm")}</span>
      </summary>
      <p className="mt-2 leading-relaxed whitespace-pre-wrap">{d.text}</p>
      {d.translation && (
        <p className="mt-1.5 border-t border-border pt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          <Badge variant="outline" className="mr-1.5 font-normal text-muted-foreground">
            译 · Shopilot
          </Badge>
          {d.translation}
        </p>
      )}
      <Citations items={d.citations} className="mt-2" />
      <DraftCardLine card={d.card} className="mt-1" />
      <Button
        size="xs"
        variant="outline"
        className="mt-2"
        onClick={() =>
          navigator.clipboard
            .writeText(d.text)
            .then(() => toast.success("已复制"))
            .catch(() => toast.error("复制没有成功，请手动选中文字复制"))
        }
      >
        <CopyIcon />
        {d.translation ? "复制原文" : "复制"}
      </Button>
    </details>
  );
}
