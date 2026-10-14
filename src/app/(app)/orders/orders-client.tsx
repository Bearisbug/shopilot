"use client";

import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { AlertTriangleIcon, DownloadIcon, FilePlusIcon, PackageXIcon, RefreshCwIcon, SearchIcon, Undo2Icon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import type { AfterSalePending, OrdersResponse, StatusGroup, SyncResult } from "@/contracts/orders";
import { STATUS_GROUP_LABEL, STATUS_GROUPS } from "@/contracts/orders";
import { PlatformBadge } from "@/components/common/platform-badge";
import { ShopFilter } from "@/components/common/shop-filter";
import { DueText, itemsText, progressText, StatusGroupText, TICKET_TYPE_LABEL } from "@/components/orders/order-ui";
import { PageActions } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows, PageHeader, PageScroll, Panel, PanelHeader, Stat } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, ApiError, errorText } from "@/lib/api";
import { inTz, money, relative } from "@/lib/format";
import { OrderDrawer } from "./order-drawer";
import { OrdersDialogs } from "./orders-dialogs";
import { OrdersTabs, useUrlParams } from "./orders-frame";

const PLATFORMS = ["shopee", "tiktok"] as const;
const SYNC_COOLDOWN_SEC = 60;
const SYNC_WATCH_MS = 120_000;

/** 手动同步：哪些店在同步、开始前的同步时间（变化即完成）、最多等到何时 */
type SyncWatch = { baseline: Record<string, string | null>; until: number };

/** 还在同步中的店：同步时间没变且没过等待上限 */
function syncingShops(data: OrdersResponse | undefined, watch: SyncWatch | null, now: number): Set<string> {
  if (!data || !watch || now > watch.until) return new Set();
  return new Set(data.syncState.filter((s) => s.shopId in watch.baseline && s.lastSyncAt === watch.baseline[s.shopId]).map((s) => s.shopId));
}

export function OrdersClient({ me }: { me: Me }) {
  const tz = me.active.timezone;
  const { params, update } = useUrlParams();
  // 地址里的筛选先校验，不认识的值丢弃（下方 effect 改写地址），不把非法值发给接口
  const rawPlatform = params.get("platform");
  const rawStatus = params.get("status");
  const rawShop = params.get("shop");
  const platform = PLATFORMS.find((p) => p === rawPlatform) ?? "all";
  const status = STATUS_GROUPS.find((g) => g === rawStatus) ?? "all";
  const shop = [...me.active.shops, ...me.active.disconnectedShops].some((x) => x.id === rawShop) ? rawShop! : "all";
  const qParam = (params.get("q") ?? "").slice(0, 100);
  const [search, setSearch] = useState(qParam);

  useEffect(() => {
    const bad: Record<string, null> = {};
    if (rawPlatform !== null && platform === "all") bad.platform = null;
    if (rawStatus !== null && status === "all") bad.status = null;
    if (rawShop !== null && shop === "all") bad.shop = null;
    if (Object.keys(bad).length) update(bad);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在地址里的筛选变化时校验
  }, [rawPlatform, rawStatus, rawShop]);

  // 搜索框输入停 400ms 后写进 URL
  useEffect(() => {
    if (search.trim() === qParam) return;
    const t = setTimeout(() => update({ q: search.trim() || null }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只跟随输入变化
  }, [search]);

  const filters = new URLSearchParams();
  if (platform !== "all") filters.set("platform", platform);
  if (status !== "all") filters.set("statusGroup", status);
  if (shop !== "all") filters.set("shopId", shop);
  if (qParam) filters.set("q", qParam);
  const qs = filters.toString();

  const [syncWatch, setSyncWatch] = useState<SyncWatch | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  const list = useInfiniteQuery({
    queryKey: ["orders", "list", qs],
    queryFn: ({ pageParam }) => api.get<OrdersResponse>(`/api/v1/orders?${qs}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // 手动同步后每 3 秒刷新，直到各店的同步时间更新
    refetchInterval: (query) => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
      return syncingShops(query.state.data?.pages[0], syncWatch, Date.now()).size ? 3_000 : 30_000;
    },
  });
  const first = list.data?.pages[0];
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  // 统计、售后、同步与筛选无关：换筛选加载中或列表出错时沿用上一次的
  const [summary, setSummary] = useState<OrdersResponse | null>(null);
  if (first && first !== summary) setSummary(first);
  const head = first ?? summary;

  const syncing = syncingShops(head ?? undefined, syncWatch, clock);
  const cooldown = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - clock) / 1000)) : 0;
  // 冷却倒计时与同步等待上限都要按秒刷新
  const ticking = cooldown > 0 || syncing.size > 0;
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);

  const startCooldown = (sec: number) => {
    const now = Date.now();
    setClock(now);
    setCooldownUntil(now + sec * 1000);
  };
  const sync = useMutation({
    mutationFn: () => api.post<SyncResult>("/api/v1/orders/sync", {}),
    onSuccess: (r) => {
      const now = Date.now();
      const baseline = Object.fromEntries(r.shopIds.map((id) => [id, head?.syncState.find((s) => s.shopId === id)?.lastSyncAt ?? null]));
      setSyncWatch({ baseline, until: now + SYNC_WATCH_MS });
      startCooldown(SYNC_COOLDOWN_SEC);
      toast.success(`已开始同步 ${r.shopIds.length} 家店的订单`, { description: r.jobIds.length < r.shopIds.length ? "部分店铺的同步已在排队，不重复排。" : "完成后同步时间自动更新。" });
      void list.refetch();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.type === "rate-limited") {
        // 接口在说明里写了还要等几秒（与 Retry-After 一致）；读不到时按 60 秒
        const wait = Number(e.problem.extra?.retryAfter) || SYNC_COOLDOWN_SEC;
        startCooldown(wait);
        toast.warning("稍后再试", { description: e.problem.detail });
      } else toast.error("没有开始同步", { description: errorText(e) });
    },
  });

  const shops = me.active.shops;
  const filtered = platform !== "all" || status !== "all" || shop !== "all" || !!qParam;
  const clearFilters = () => {
    setSearch("");
    update({ platform: null, status: null, shop: null, q: null });
  };
  const pending = head?.afterSalesPending ?? [];
  const overdue = pending.filter((p) => p.overdue).length;
  const lastSync = head?.syncState.map((s) => s.lastSyncAt).filter(Boolean).sort().at(-1) ?? null;
  const pushBad = head?.syncState.filter((s) => !s.pushOk) ?? [];

  return (
    <PageScroll>
      <PageActions>
        <Button variant="outline" onClick={() => update({ dialog: "invoice", order: null }, "push")}>
          <FilePlusIcon />
          新建发票
        </Button>
      </PageActions>
      <PageHeader title="订单与开票" facts={head ? `${head.syncState.length} 家店 · 订单镜像${lastSync ? ` ${relative(lastSync)}同步` : "尚未同步"}` : " "} />
      <OrdersTabs />

      {!head && !list.isError ? (
        <LoadingRows rows={8} />
      ) : (
        <div className="flex flex-col gap-4">
          {head && (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <Stat label="待发货" value={`${head.stats.toShip} 单`} note={head.stats.toShipDueToday ? `其中 ${head.stats.toShipDueToday} 单今天到发货时限` : "今天没有到发货时限的订单"} tone={head.stats.toShipDueToday ? "warn" : undefined} />
              <Stat label="运输中" value={`${head.stats.shipped} 单`} note="两个平台合计" />
              <Link href="/tickets" aria-label={`售后待处理 ${pending.length} 单，查看工单`} className="focus-ring block rounded-(--semantic-radius-lg)">
                <Stat label="售后待处理" value={`${pending.length} 单`} note={overdue ? `工单 ${pending.length} · 已超时 ${overdue}` : `退货退款与取消申请工单 ${pending.length} 张`} tone={overdue ? "error" : undefined} />
              </Link>
              <Stat label="今日新订单" value={`${head.stats.newToday} 单`} note={`Shopee ${head.stats.newTodayByPlatform.shopee} · TikTok ${head.stats.newTodayByPlatform.tiktok}`} />
            </div>
          )}

          {pushBad.length > 0 && (
            <div role="status" className="flex items-start gap-2 rounded-(--semantic-radius-lg) bg-(--semantic-color-surface-warm) px-5 py-3 text-sm">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-(--semantic-color-feedback-warning)" aria-hidden />
              <p>
                {pushBad.map((s) => s.name).join("、")} 的平台推送没有订阅到 Shopilot，订单状态与售后工单会延迟到每小时同步时才更新。
                {me.active.permissions.includes("shops.manage") ? (
                  <Link href="/shops" className="ml-1 font-semibold text-(--semantic-color-text-link) underline-offset-4 hover:underline">
                    去检查连接
                  </Link>
                ) : (
                  "请联系管理员在「店铺与连接」检查。"
                )}
              </p>
            </div>
          )}

          <Panel>
            <PanelHeader title="订单" description="点一行看详情；数据来自订单镜像，平台推送到达后实时更新">
              <InputGroup className="w-56">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="订单号或买家" aria-label="搜索订单号或买家" />
              </InputGroup>
              <Select value={platform} onValueChange={(v) => update({ platform: v === "all" ? null : v })}>
                <SelectTrigger size="sm" aria-label="按平台筛选">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部平台</SelectItem>
                  {/* 只列本人可见店铺里有的平台 */}
                  {[...me.active.shops, ...me.active.disconnectedShops].some((x) => x.platform === "shopee") && <SelectItem value="shopee">Shopee</SelectItem>}
                  {[...me.active.shops, ...me.active.disconnectedShops].some((x) => x.platform === "tiktok") && <SelectItem value="tiktok">TikTok Shop</SelectItem>}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(v) => update({ status: v === "all" ? null : v })}>
                <SelectTrigger size="sm" aria-label="按状态筛选">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  {STATUS_GROUPS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {STATUS_GROUP_LABEL[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {shops.length + me.active.disconnectedShops.length > 1 && (
                <ShopFilter shops={shops} disconnected={me.active.disconnectedShops} value={shop} onChange={(v) => update({ shop: v === "all" ? null : v })} className="max-w-48" />
              )}
              <Button asChild variant="outline" size="sm">
                <a href={`/api/v1/orders?${qs}${qs ? "&" : ""}format=csv`} download>
                  <DownloadIcon />
                  导出
                </a>
              </Button>
            </PanelHeader>
            {list.isError && !first ? (
              <>
                <ErrorState error={list.error} onRetry={() => list.refetch()} />
                {filtered && (
                  <p className="-mt-8 pb-8 text-center text-sm text-muted-foreground">
                    也可以
                    <Button variant="link" size="sm" className="mx-1 h-auto p-0 align-baseline font-semibold" onClick={clearFilters}>
                      清除筛选
                    </Button>
                    回到全部订单。
                  </p>
                )}
              </>
            ) : !first ? (
              <LoadingRows rows={6} />
            ) : items.length === 0 ? (
              <EmptyState
                icon={PackageXIcon}
                title={filtered ? "没有符合筛选条件的订单" : "还没有订单"}
                description={filtered ? undefined : "店铺接入后会回补近 180 天的订单，之后随平台推送更新。"}
                action={
                  filtered ? (
                    <Button variant="outline" onClick={clearFilters}>
                      清除筛选
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>订单</TableHead>
                      <TableHead>买家</TableHead>
                      <TableHead className="hidden xl:table-cell">商品</TableHead>
                      <TableHead className="text-right">金额</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="hidden xl:table-cell">更新</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((o) => (
                      <TableRow key={o.id} className="state-layer cursor-pointer" onClick={() => update({ order: o.id }, "push")}>
                        <TableCell>
                          <button
                            type="button"
                            className="focus-ring rounded-sm text-left font-medium tabular-nums"
                            onClick={(e) => {
                              e.stopPropagation();
                              update({ order: o.id }, "push");
                            }}
                          >
                            {o.externalOrderId}
                          </button>
                          <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <PlatformBadge platform={o.shop.platform} market={o.shop.market} />
                            <span className="max-w-28 truncate">{o.shop.name}</span>
                          </span>
                        </TableCell>
                        <TableCell className="max-w-36 truncate">{o.buyerName ?? "—"}</TableCell>
                        <TableCell className="hidden max-w-48 truncate text-xs xl:table-cell" title={itemsText(o.items)}>
                          {itemsText(o.items)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">{money(o.total, o.currency)}</TableCell>
                        <TableCell className="max-w-56">
                          <StatusGroupText group={o.statusGroup as StatusGroup} className="text-xs" />
                          {progressText(o, tz) && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{progressText(o, tz)}</span>}
                          <span className="mt-0.5 block text-xs whitespace-nowrap text-muted-foreground tabular-nums xl:hidden">更新 {inTz(o.updatedAt, tz)}</span>
                        </TableCell>
                        <TableCell className="hidden text-xs whitespace-nowrap text-muted-foreground tabular-nums xl:table-cell">{inTz(o.updatedAt, tz)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {list.hasNextPage && (
                  <div className="mt-3 flex justify-center">
                    <Button variant="outline" size="sm" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
                      {list.isFetchingNextPage && <Spinner />}
                      加载更多
                    </Button>
                  </div>
                )}
              </>
            )}
          </Panel>

          {head && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Panel>
                <PanelHeader title="售后待处理" description="退货退款、取消申请工单，按剩余时限排序" />
                {pending.length === 0 ? (
                  <EmptyState icon={Undo2Icon} title="没有待处理的售后" description="买家申请取消或退货后，平台推送到达即自动建工单并出现在这里。" />
                ) : (
                  <ul className="flex flex-col divide-y divide-border">
                    {pending.map((p) => (
                      <PendingRow key={p.ticketId} p={p} onOpen={() => p.afterSaleId && update({ dialog: p.afterSaleKind === "cancel" ? "cancel-request" : "return-review", afterSale: p.afterSaleId }, "push")} />
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel>
                <PanelHeader title="订单同步" description="订单靠平台推送实时更新，每小时再补拉一次兜底">
                  <Button variant="outline" size="sm" disabled={sync.isPending || cooldown > 0} onClick={() => sync.mutate()}>
                    {sync.isPending ? <Spinner /> : <RefreshCwIcon />}
                    {cooldown > 0 ? <span className="tabular-nums">{cooldown} 秒后可再同步</span> : "立即同步"}
                  </Button>
                </PanelHeader>
                {head.syncState.length === 0 ? (
                  <EmptyState icon={RefreshCwIcon} title="没有已连接的店铺" />
                ) : (
                  <ul className="flex flex-col divide-y divide-border">
                    {head.syncState.map((s) => (
                      <li key={s.shopId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{s.name}</span>
                          <PlatformBadge platform={s.platform} market={s.market} />
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
                          {!s.pushOk && (
                            <span className="inline-flex items-center gap-1 text-(--semantic-color-feedback-warning)">
                              <AlertTriangleIcon className="size-3.5" aria-hidden />
                              推送未订阅
                            </span>
                          )}
                          {syncing.has(s.shopId) ? (
                            <span className="inline-flex items-center gap-1.5 text-foreground">
                              <Spinner className="size-3.5" />
                              同步中
                            </span>
                          ) : s.lastSyncAt ? (
                            relative(s.lastSyncAt)
                          ) : (
                            "尚未同步"
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-muted-foreground">同一家店 60 秒内只能手动同步一次；订单状态与售后工单最长可能晚到 1 小时。</p>
              </Panel>
            </div>
          )}
        </div>
      )}
      <OrderDrawer tz={tz} />
      <OrdersDialogs />
    </PageScroll>
  );
}

function PendingRow({ p, onOpen }: { p: AfterSalePending; onOpen: () => void }) {
  const Icon = p.type === "cancel_request" ? XCircleIcon : Undo2Icon;
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {p.buyerName ?? "买家"} · {TICKET_TYPE_LABEL[p.type]}
          {p.phase ? ` · ${p.phase}` : ""}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[p.number, p.shop.platform === "shopee" ? "Shopee" : "TikTok", p.shop.name, p.itemsText, p.amount && p.currency ? money(p.amount, p.currency) : null].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <DueText dueAt={p.dueAt} className="text-xs" />
        {p.afterSaleId ? (
          <Button variant="link" size="sm" className="h-auto px-0 font-semibold" onClick={onOpen} aria-label={`${p.actionable ? "处理" : "查看"} ${p.number} ${TICKET_TYPE_LABEL[p.type]}`}>
            {p.actionable ? "处理" : "查看"}
          </Button>
        ) : (
          <Button asChild variant="link" size="sm" className="h-auto px-0 font-semibold">
            <Link href={`/tickets/${p.ticketId}`} aria-label={`查看 ${p.number} ${TICKET_TYPE_LABEL[p.type]}`}>
              查看
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}
