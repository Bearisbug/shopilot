"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, LinkIcon, LoaderCircleIcon, RefreshCwIcon, SearchIcon, SendIcon, ShoppingBagIcon } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import type { ConversationDetail, ShopProduct, ShopProducts } from "@/contracts/conversations";
import { Thumb, useClamped } from "@/components/orders/order-items";
import { EmptyState, ErrorState } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMe } from "@/hooks/use-me";
import { api, errorText } from "@/lib/api";
import { inTz, money } from "@/lib/format";
import { searchProducts } from "@/lib/product-search";
import { cn } from "@/lib/utils";
import { useSend } from "./wb-shared";

const productsKey = (shopId: string) => ["shop-products", shopId];

/**
 * 右栏「商品」页签：列出本店在售商品，按名称、商品 ID、卖家 SKU 搜索；给买家发商品卡，Shopee 店另可发商品链接（TikTok 客服接口不支持超链接）。
 * 目录整店取一次（服务端缓存 10 分钟），搜索在本地过滤；「重新获取」跳过缓存。
 */
export function ProductsTab({ d }: { d: ConversationDetail }) {
  const c = d.conversation;
  const shopId = c.shop.id;
  const qc = useQueryClient();
  const me = useMe();
  const tz = me.data?.active.timezone ?? "Asia/Kuala_Lumpur";
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query);
  const enabled = d.capabilities.productCard.enabled;
  const list = useQuery({
    queryKey: productsKey(shopId),
    queryFn: () => api.get<ShopProducts>(`/api/v1/shops/${shopId}/products`),
    enabled,
    staleTime: 5 * 60_000,
  });
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (refreshing || list.isPending) return;
    setRefreshing(true);
    try {
      qc.setQueryData(productsKey(shopId), await api.get<ShopProducts>(`/api/v1/shops/${shopId}/products?refresh=1`));
    } catch (e) {
      toast.error("没有重新获取到商品", { description: errorText(e) });
    } finally {
      setRefreshing(false);
    }
  };

  if (!enabled) return <EmptyState icon={ShoppingBagIcon} title="不能列出这家店的商品" description={d.capabilities.productCard.reason} />;

  // 不能发送时仍可搜索、查看；发送按钮置灰并在上方说明原因
  const blocked = !c.canReply ? (c.replyBlockedReason ?? "这个会话现在不能发送。") : !d.permissions.canSend ? "只有这个会话的处理人能发送商品。" : null;
  const items = list.data ? searchProducts(list.data.items, q) : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <InputGroup className="h-8 min-w-0 flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="商品名称、ID 或 SKU" aria-label="搜索本店商品" />
        </InputGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="重新获取商品" aria-disabled={refreshing || list.isPending || undefined} onClick={refresh}>
              <RefreshCwIcon className={cn(refreshing && "motion-safe:animate-spin")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>重新获取价格和库存</TooltipContent>
        </Tooltip>
      </div>
      {list.data && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {q.trim() ? `匹配 ${items.length} 件 · ` : ""}在售 {list.data.items.length} 件{list.data.truncated ? "（只列出前面这些，其余请搜索）" : ""} · {inTz(list.data.fetchedAt, tz, "HH:mm")} 获取
        </p>
      )}
      {blocked && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{blocked}</p>}
      {list.isPending ? (
        <ProductSkeleton />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={ShoppingBagIcon} title="店里没有在售商品" description="平台上状态为在售的商品会列在这里。" />
      ) : items.length === 0 ? (
        <EmptyState icon={SearchIcon} title={`没有匹配「${q.trim()}」的商品`} description="可以按商品名称、商品 ID 或卖家 SKU 搜索，多个词用空格分开。" />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((p) => (
            <li key={p.productId} className="py-3 first:pt-0">
              <ProductRow p={p} d={d} canSend={!blocked} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function priceText(p: ShopProduct): string | null {
  if (!p.priceMin) return null;
  const fmt = (v: string) => (p.currency ? money(v, p.currency) : v);
  return p.priceMax && p.priceMax !== p.priceMin ? `${fmt(p.priceMin)} – ${fmt(p.priceMax)}` : fmt(p.priceMin);
}

function ProductRow({ p, d, canSend }: { p: ShopProduct; d: ConversationDetail; canSend: boolean }) {
  const send = useSend(d);
  const shopee = d.conversation.shop.platform === "shopee";
  const price = priceText(p);
  const { ref, clamped } = useClamped<HTMLSpanElement>(p.name);
  const [tipOpen, setTipOpen] = useState(false);
  const sending = send.isPending ? (send.variables?.type === "product_card" ? "card" : "link") : null;
  // 用 aria-disabled 而不是 disabled：点下后按钮仍保留焦点（A11Y-013），不能发送时也能被键盘与读屏发现
  const off = !canSend || send.isPending;
  const sendCard = () => !off && send.mutate({ type: "product_card", productId: p.productId }, { onSuccess: () => toast.success("已发商品卡", { description: p.name }) });
  const sendLink = () => !off && p.url && send.mutate({ type: "text", text: p.url }, { onSuccess: () => toast.success("已发商品链接", { description: p.name }) });
  return (
    <div className="flex gap-3 text-sm">
      <Thumb key={p.imageUrl ?? ""} src={p.imageUrl} icon={ShoppingBagIcon} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          <Tooltip open={clamped && tipOpen} onOpenChange={setTipOpen}>
            <TooltipTrigger asChild>
              <span ref={ref} tabIndex={clamped ? 0 : undefined} className={cn("line-clamp-2 min-w-0 flex-1 leading-snug font-medium [overflow-wrap:anywhere]", clamped && "focus-ring rounded-sm")}>
                {p.name}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-80 [overflow-wrap:anywhere]">{p.name}</TooltipContent>
          </Tooltip>
          {p.url && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-xs" variant="ghost" className="-mt-1 -mr-1" asChild>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`在平台查看商品详情：${p.name}`}>
                    <ExternalLinkIcon />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>在平台查看详情</TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {price ?? "价格未知"}
          {p.stock !== null && <> · 库存 {p.stock.toLocaleString("en-US")}</>}
        </p>
        {p.skus.length > 0 && (
          <p className="text-xs text-muted-foreground tabular-nums [overflow-wrap:anywhere]">
            SKU {p.skus[0]}
            {p.skus.length > 1 ? ` 等 ${p.skus.length} 个` : ""}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="xs" variant="outline" aria-disabled={off || undefined} aria-label={`发送商品卡：${p.name}`} onClick={sendCard}>
            {sending === "card" ? <LoaderCircleIcon className="motion-safe:animate-spin" /> : <SendIcon />}
            发商品卡
          </Button>
          {shopee && p.url && (
            <Button size="xs" variant="outline" aria-disabled={off || undefined} aria-label={`发送商品链接：${p.name}`} onClick={sendLink}>
              {sending === "link" ? <LoaderCircleIcon className="motion-safe:animate-spin" /> : <LinkIcon />}
              发链接
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 加载态：与商品行同结构（方图 + 两行文字 + 按钮行） */
function ProductSkeleton() {
  const block = "bg-muted motion-safe:animate-pulse";
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="商品加载中">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className={cn("size-14 shrink-0 rounded-md", block)} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className={cn("h-4 w-4/5", block)} />
            <Skeleton className={cn("h-3 w-1/2", block)} />
            <Skeleton className={cn("h-7 w-24 rounded-md", block)} />
          </div>
        </div>
      ))}
    </div>
  );
}
