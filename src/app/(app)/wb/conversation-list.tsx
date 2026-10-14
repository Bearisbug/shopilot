"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { ClipboardListIcon, CornerDownLeftIcon, FilterXIcon, InboxIcon, PinIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ConversationList, ConversationListItem, ConvView } from "@/contracts/conversations";
import { ShopFilter } from "@/components/common/shop-filter";
import { EmptyState, ErrorState, LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api";
import { inTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AiTag, Avatar, listPoll, PlatformTag, PollErrorBar, remainText, STAGE_LABEL, useWbParams, VIEW_LABEL, waitedText } from "./wb-shared";

const VIEWS: ConvView[] = ["queue", "ai", "mine", "team", "done"];

const EMPTY: Record<ConvView, string> = {
  queue: "没有待认领的会话。买家新消息在店铺为 off 或影子模式时进这里，转人工的会话也在这里。",
  ai: "AI 正在接待的会话会出现在这里，草稿待审的排在前面。",
  mine: "你认领的会话会出现在这里。",
  team: "同事处理中的会话会出现在这里。",
  done: "结束的会话会出现在这里。",
};

export function ConversationListPanel({ selectedId, className }: { selectedId: string | null; className?: string }) {
  const me = useMe();
  const { params, set, hrefFor } = useWbParams();
  const canTeam = Boolean(me.data?.active.permissions.includes("wb.team"));
  const allShops = [...(me.data?.active.shops ?? []), ...(me.data?.active.disconnectedShops ?? [])];
  // URL 里的筛选只认合法值：分组与平台按枚举，店铺须在本人可见或已断开的店铺里且与平台一致；其余回落到默认
  const rawView = params.get("view");
  const rawPlatform = params.get("platform");
  const rawShop = params.get("shop");
  const view: ConvView = VIEWS.includes(rawView as ConvView) && (rawView !== "team" || canTeam) ? (rawView as ConvView) : "queue";
  const platform = rawPlatform === "shopee" || rawPlatform === "tiktok" ? rawPlatform : "all";
  const shopId = rawShop && allShops.some((x) => x.id === rawShop && (platform === "all" || x.platform === platform)) ? rawShop : "all";
  const tz = me.data?.active.timezone ?? "Asia/Kuala_Lumpur";
  const byPlatform = <T extends { platform: string }>(list: T[]) => list.filter((x) => platform === "all" || x.platform === platform);
  const shops = byPlatform(me.data?.active.shops ?? []);
  const disconnectedShops = byPlatform(me.data?.active.disconnectedShops ?? []);

  // 无效参数从地址栏去掉（replace），筛选框与列表按同一组值
  const router = useRouter();
  const pathname = usePathname();
  const stale = me.isSuccess ? (["view", "platform", "shop"] as const).filter((k) => params.get(k) !== null && params.get(k) !== { view, platform, shop: shopId }[k]) : [];
  let cleanUrl: string | null = null;
  if (stale.length > 0) {
    const next = new URLSearchParams(params.toString());
    for (const k of stale) next.delete(k);
    cleanUrl = next.toString() ? `${pathname}?${next.toString()}` : pathname;
  }
  useEffect(() => {
    if (cleanUrl) router.replace(cleanUrl, { scroll: false });
  }, [cleanUrl, router]);

  const qs = new URLSearchParams({ view });
  if (platform !== "all") qs.set("platform", platform);
  if (shopId !== "all") qs.set("shopId", shopId);
  const list = useInfiniteQuery({
    queryKey: ["conversations", view, platform, shopId],
    queryFn: ({ pageParam }) => api.get<ConversationList>(`/api/v1/conversations?${qs.toString()}${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: listPoll,
    // 先知道本人的可见店铺与权限，再按校验过的筛选取数
    enabled: !me.isPending,
  });
  const counts = list.data?.pages[0]?.counts;
  // 翻页期间有会话插到顶部时，下一页会带回已显示的会话：按 id 去重，保留第一次出现的那行
  const byId = new Map<string, ConversationListItem>();
  for (const page of list.data?.pages ?? []) for (const x of page.items) if (!byId.has(x.id)) byId.set(x.id, x);
  const items = [...byId.values()];
  const views = VIEWS.filter((v) => v !== "team" || canTeam);
  const filtered = platform !== "all" || shopId !== "all";

  return (
    <section aria-label="会话列表" className={cn("flex min-h-0 flex-col rounded-xl bg-card", className)}>
      <div className="shrink-0 border-b border-border px-4 pt-4 pb-3">
        <h1 className="text-lg font-semibold">聚合客服</h1>
        <p className="text-xs text-muted-foreground tabular-nums">
          {me.data ? `${me.data.active.shops.length} 家店` : " "}
          {counts ? ` · 待认领 ${counts.queue} · AI ${counts.ai}` : ""}
        </p>
        <div className="mt-3 flex gap-2">
          <Select
            value={platform}
            onValueChange={(v) => {
              const keepShop = shopId === "all" || v === "all" || allShops.find((x) => x.id === shopId)?.platform === v;
              set({ platform: v === "all" ? null : v, ...(keepShop ? {} : { shop: null }) });
            }}
          >
            <SelectTrigger size="sm" aria-label="按平台筛选" className="min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部平台</SelectItem>
              {/* 只列本人可见店铺里有的平台 */}
              {allShops.some((x) => x.platform === "shopee") && <SelectItem value="shopee">Shopee</SelectItem>}
              {allShops.some((x) => x.platform === "tiktok") && <SelectItem value="tiktok">TikTok</SelectItem>}
            </SelectContent>
          </Select>
          <ShopFilter shops={shops} disconnected={disconnectedShops} value={shopId} onChange={(v) => set({ shop: v === "all" ? null : v })} className="flex-1" />
        </div>
        {/* 列宽只有 16–20rem：分组换行显示，五个分组都可见；切换分组是筛选，不是页签，当前项用 aria-current 标出 */}
        <div role="group" aria-label="会话分组" className="mt-3 flex flex-wrap gap-1.5">
          {views.map((v) => {
            const active = v === view;
            const n = counts?.[v];
            return (
              <button
                key={v}
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => set({ view: v === "queue" ? null : v }, "push")}
                className={cn(
                  "state-layer focus-ring inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs whitespace-nowrap",
                  active ? "border-transparent bg-accent font-semibold text-(--semantic-color-text-link)" : "border-border text-muted-foreground",
                )}
              >
                {VIEW_LABEL[v]}
                {n ? <span className="tabular-nums">{n}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="scroll-y min-h-0 flex-1">
        {list.isError && list.data && <PollErrorBar className="mx-3 mt-3" onRetry={() => list.refetch()} />}
        {list.isPending ? (
          <div className="p-4">
            <LoadingRows rows={5} />
          </div>
        ) : list.isError && !list.data ? (
          <div className="p-4">
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          </div>
        ) : items.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={FilterXIcon}
              title="当前筛选下没有会话"
              description={`${VIEW_LABEL[view]}里没有符合平台或店铺筛选的会话。`}
              action={
                <Button variant="outline" size="sm" onClick={() => set({ platform: null, shop: null })}>
                  清除筛选
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <InboxIcon className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium">{VIEW_LABEL[view]}是空的</p>
              <p className="mt-1 text-xs text-muted-foreground">{EMPTY[view]}</p>
            </div>
          )
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <Row item={item} href={hrefFor(item.id)} selected={item.id === selectedId} tz={tz} view={view} now={list.dataUpdatedAt} />
              </li>
            ))}
          </ul>
        )}
        {list.hasNextPage && !list.isError && (
          <div className="p-3">
            <Button variant="outline" size="sm" className="w-full" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
              {list.isFetchingNextPage ? "加载中…" : "加载更多"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

/** now 取列表这次取数的时刻，渲染保持纯函数 */
function Row({ item, href, selected, tz, view, now }: { item: ConversationListItem; href: string; selected: boolean; tz: string; view: ConvView; now: number }) {
  const time = item.lastMessageAt ? (now - new Date(item.lastMessageAt).getTime() < 20 * 3600_000 ? inTz(item.lastMessageAt, tz, "HH:mm") : inTz(item.lastMessageAt, tz, "MM-dd")) : "";
  const ticket = item.openTickets[0];
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(
        // 焦点环画在行内侧，滚动容器不会裁掉它的边
        "state-layer focus-ring relative block border-b border-border px-3 py-3 [--focus-ring-offset:calc(var(--focus-ring-width)*-1)]",
        selected && "bg-accent before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-(--semantic-color-text-link)",
      )}
    >
      <span className="flex gap-3">
        <Avatar name={item.buyerName} src={item.buyerAvatarUrl} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.buyerName}</span>
            {item.pinned && <PinIcon className="size-3.5 text-muted-foreground" aria-label="置顶" />}
            <span className="text-xs text-muted-foreground tabular-nums">{time}</span>
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <PlatformTag platform={item.shop.platform} market={item.shop.market} />
            <span className="truncate text-xs text-muted-foreground">{item.shop.name}</span>
          </span>
          <span className="mt-1 block truncate text-xs leading-relaxed">{item.preview || " "}</span>
          <StatusLine item={item} view={view} />
          {ticket && (
            <span className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
              {ticket.overdue ? <TriangleAlertIcon className="size-3.5 text-(--semantic-color-feedback-warning)" aria-hidden="true" /> : <ClipboardListIcon className="size-3.5" aria-hidden="true" />}
              <span className="truncate">
                工单 {ticket.number}
                {ticket.dueAt ? ` · ${remainText(ticket.dueAt, now)}` : ""}
                {item.openTickets.length > 1 ? ` 等 ${item.openTickets.length} 张` : ""}
              </span>
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

function StatusLine({ item, view }: { item: ConversationListItem; view: ConvView }) {
  // 同事处理中：等待提示前也要标出处理人
  const who = view === "team" && item.claimedBy ? `${item.claimedBy.name} · ` : "";
  if (item.overdue && item.waitingSinceSec !== null) {
    return (
      <span className="mt-1 flex items-center gap-1 text-xs text-(--semantic-color-feedback-warning)">
        <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {who}
          {waitedText(item.waitingSinceSec)} · 超过接待时限
        </span>
      </span>
    );
  }
  if (item.handlingState === "bot") {
    return (
      <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <AiTag />
        {item.draftPending ? "草稿待审" : "AI 接待中"} · {STAGE_LABEL[item.stage]}
      </span>
    );
  }
  if (item.pinned && item.waitingSinceSec !== null) {
    return (
      <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <CornerDownLeftIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {who}
          {item.handlingState === "awaiting_human" ? "待认领" : "买家再回复"} · {waitedText(item.waitingSinceSec)}
        </span>
      </span>
    );
  }
  if (view === "team" || (item.handlingState === "human" && item.claimedBy)) {
    return <span className="mt-1 block text-xs text-muted-foreground">{item.claimedBy?.name ?? "平台后台"} 处理中</span>;
  }
  return <span className="mt-1 block text-xs text-muted-foreground">{STAGE_LABEL[item.stage]}</span>;
}
