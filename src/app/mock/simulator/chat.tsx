"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, MessageSquareIcon, PackageIcon, ReceiptTextIcon, SendIcon, ShoppingBagIcon, TicketIcon, TruckIcon, UploadIcon } from "lucide-react";
import { PlatformBadge } from "@/components/common/platform-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SimMessage, SimShop, SimState, SimThread } from "@/mock/sim/types";
import { LANGUAGES, shortTime } from "./client";
import { ActButton, Code, Hint, useAct } from "./ui";

export function ChatColumn({ shop, thread, data, hasShopSelection }: { shop: SimShop | null; thread: SimThread | null; data: SimState | undefined; hasShopSelection: boolean }) {
  if (!data) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-4" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="ml-auto h-10 w-2/3" />
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="ml-auto h-16 w-3/5" />
      </div>
    );
  }
  if (!shop || !thread) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <MessageSquareIcon className="size-8 text-muted-foreground" />
        <p className="font-medium">{!hasShopSelection || !shop ? "先在左栏选一家店" : "选一个买家，或新建买家"}</p>
        <Hint className="max-w-sm">这里以买家视角显示整段聊天：买家发的消息在右侧，卖家（Shopilot 经平台接口发出）的消息与卡片在左侧。</Hint>
      </div>
    );
  }
  return <Conversation key={thread.conversationId} shop={shop} thread={thread} data={data} />;
}

function Conversation({ shop, thread, data }: { shop: SimShop; thread: SimThread; data: SimState }) {
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = data.messages[data.messages.length - 1]?.id;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const lang = LANGUAGES.find((l) => l.value === thread.language)?.label ?? thread.language;
  const hooked = !!shop.callbackUrl && shop.subscribed.length > 0;
  const pushOff = shop.authStatus !== "authorized" || !hooked;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
        <h2 className="text-base font-semibold">{thread.buyerName}</h2>
        <PlatformBadge platform={shop.platform} market={shop.region} />
        <span className="text-xs text-muted-foreground">{lang}</span>
        <span className="text-xs text-muted-foreground tabular-nums">会话 {thread.conversationId}</span>
        {shop.platform === "tiktok" && (
          <span className="text-xs text-muted-foreground">
            {!thread.started ? "会话段未开始" : thread.sessionOpen ? `会话段进行中 ${thread.sessionId ?? ""}` : "会话段已被 End Session 结束，买家再开口会开新段"}
          </span>
        )}
      </div>
      {pushOff && (
        <p role="status" className="border-b border-border bg-(--semantic-color-surface-warm) px-4 py-2 text-xs">
          {shop.authStatus !== "authorized"
            ? "这家店没有授权给应用：动作只改模拟数据，不会推送。在 Shopilot 接入向导完成授权后才有推送。"
            : `这家店没有配置${shop.platform === "shopee" ? "推送回调" : " webhook"}：动作只改模拟数据，不会推送。`}
        </p>
      )}
      <div ref={listRef} className="scroll-y flex min-h-0 flex-1 flex-col gap-2 px-4 py-4" aria-live="polite">
        {data.messages.length === 0 ? (
          <div className="m-auto max-w-xs text-center">
            <p className="font-medium">这个买家还没开口</p>
            <Hint className="mt-1">在下面输入第一条消息，会话从这条消息开始{shop.platform === "tiktok" ? "（同时推送 type 13 新会话段）" : ""}。</Hint>
          </div>
        ) : (
          data.messages.map((m) => <Bubble key={m.id} m={m} />)
        )}
      </div>
      <Composer shop={shop} thread={thread} data={data} />
    </>
  );
}

function Bubble({ m }: { m: SimMessage }) {
  if (m.sender === "system" || m.sender === "robot") {
    return (
      <p className="mx-auto max-w-[80%] text-center text-xs text-muted-foreground">
        {m.sender === "robot" ? "平台机器人" : "系统"}：{m.text ?? `[${m.rawType}]`}
      </p>
    );
  }
  const mine = m.sender === "buyer";
  return (
    <div className={cn("flex max-w-[80%] flex-col gap-0.5", mine ? "items-end self-end" : "items-start self-start")}>
      <div className={cn("rounded-(--semantic-radius-md) px-3 py-2 text-sm", mine ? "bg-accent" : "bg-muted")}>
        <BubbleBody m={m} />
      </div>
      <span className="px-1 text-xs text-muted-foreground tabular-nums">
        {mine ? "买家" : "卖家"} · {shortTime(m.createdAt)}
      </span>
    </div>
  );
}

function CardLine({ icon: Icon, title, detail }: { icon: React.ComponentType<{ className?: string }>; title: string; detail?: React.ReactNode }) {
  return (
    <span className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        {detail && <span className="block text-xs break-all text-muted-foreground">{detail}</span>}
      </span>
    </span>
  );
}

function BubbleBody({ m }: { m: SimMessage }) {
  switch (m.kind) {
    case "text":
      return <p className="whitespace-pre-wrap break-words">{m.text}</p>;
    case "image":
      return m.imageUrl ? (
        <a href={m.imageUrl} target="_blank" rel="noreferrer" className="focus-ring block rounded-md">
          {/* eslint-disable-next-line @next/next/no-img-element -- 模拟平台文件 URL，原样显示 */}
          <img src={m.imageUrl} alt="聊天图片" className="aspect-[4/3] w-56 max-w-full rounded-md object-cover" loading="lazy" />
        </a>
      ) : (
        <span>[图片]</span>
      );
    case "order":
      return <CardLine icon={ReceiptTextIcon} title="订单卡" detail={m.orderId} />;
    case "product":
      return <CardLine icon={ShoppingBagIcon} title="商品卡" detail={m.productName} />;
    case "coupon":
      return <CardLine icon={TicketIcon} title="优惠券卡" detail={m.couponTitle} />;
    case "return":
      return <CardLine icon={PackageIcon} title="退货退款卡" detail={m.orderId} />;
    case "logistics":
      return <CardLine icon={TruckIcon} title="物流卡" detail={m.orderId} />;
    default:
      return <Code>{m.rawType}</Code>;
  }
}

function Composer({ shop, thread, data }: { shop: SimShop; thread: SimThread; data: SimState }) {
  const { act, pendingKey } = useAct();
  const [text, setText] = useState("");
  const [orderId, setOrderId] = useState<string>("");
  const [itemId, setItemId] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = pendingKey !== null;
  const conversationId = thread.conversationId;

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    const r = await act("buyer_message", "buyer_message", { conversationId, text: t });
    if (r?.ok) setText("");
  };
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };
  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void act("buyer_image_file", "buyer_image", { conversationId }, f);
  };
  const selectedOrder = orderId || data.orders[0]?.orderId || "";
  const selectedItem = itemId || data.products[0]?.itemId || "";

  return (
    <div className="border-t border-border px-4 py-3">
      <label htmlFor="buyer-text" className="sr-only">
        以买家身份输入消息
      </label>
      <Textarea
        id="buyer-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        placeholder={`以 ${thread.buyerName} 的身份说点什么（Enter 发送，Shift+Enter 换行）`}
        maxLength={2000}
        className="max-h-40 min-h-16 bg-card"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={pickFile} />
        <Button type="button" size="xs" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          {pendingKey === "buyer_image_file" ? <Spinner className="size-3.5" /> : <UploadIcon />}
          上传图片
        </Button>
        <ActButton actKey="buyer_image_sample" action="buyer_image" body={{ conversationId }}>
          <ImageIcon />
          示例图片
        </ActButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {data.orders.length > 0 ? (
          <span className="flex items-center gap-1">
            <Select value={selectedOrder} onValueChange={setOrderId}>
              <SelectTrigger size="sm" className="h-7 max-w-40 text-xs" aria-label="要发的订单">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.orders.map((o) => (
                  <SelectItem key={o.orderId} value={o.orderId}>
                    {o.orderId} · {o.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ActButton actKey="buyer_order_card" action="buyer_order_card" body={{ conversationId, orderId: selectedOrder }}>
              <ReceiptTextIcon />
              发订单卡
            </ActButton>
          </span>
        ) : (
          <Hint>没有订单可发订单卡</Hint>
        )}
        {data.products.length > 0 && (
          <span className="flex items-center gap-1">
            <Select value={selectedItem} onValueChange={setItemId}>
              <SelectTrigger size="sm" className="h-7 max-w-40 text-xs" aria-label="要发的商品">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.products.map((p) => (
                  <SelectItem key={p.itemId} value={p.itemId}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ActButton actKey="buyer_product_card" action="buyer_product_card" body={{ conversationId, itemId: selectedItem }}>
              <ShoppingBagIcon />
              发商品卡
            </ActButton>
          </span>
        )}
        <Button type="button" size="sm" className="ml-auto" disabled={!text.trim() || busy} onClick={() => void send()}>
          {pendingKey === "buyer_message" ? <Spinner className="size-3.5" /> : <SendIcon />}
          发送
        </Button>
      </div>
      {shop.platform === "shopee" && !shop.chat && <Hint className="mt-1.5 text-destructive">这家店没有聊天权限：消息会写进模拟数据，但平台不会推送 code 10，sellerchat 接口返回 error_permission。</Hint>}
    </div>
  );
}
