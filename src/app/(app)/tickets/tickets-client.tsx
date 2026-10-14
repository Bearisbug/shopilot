"use client";

// PAGE-TICKETS（/tickets）：统计、筛选列表、按类型、平台事件流水（REQ-TKT-003、API-TKT-001）。
import { useInfiniteQuery } from "@tanstack/react-query";
import { ClipboardListIcon, DownloadIcon, RadioTowerIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Me } from "@/contracts/auth";
import { STATUS_LABEL, TICKET_STATUSES, TICKET_TYPES, TYPE_LABEL, statusText, type TicketItem, type TicketList, type TicketType } from "@/contracts/tickets";
import { BrandChart, stripes, useBrandColors } from "@/components/charts/chart";
import { PlatformBadge } from "@/components/common/platform-badge";
import { EmptyState, ErrorState, LoadingRows, PageScroll, Panel, PanelHeader, Stat } from "@/components/shell/page";
import { AssigneeCell, DueCell, dueDuration } from "@/components/tickets/ticket-ui";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/api";
import { duration, inTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TicketsFrame, ticketsPoll, useQueryParam } from "./tickets-shared";

export function TicketsClient({ me }: { me: Me }) {
  const isAgent = me.active.role === "agent";
  const [type, setType] = useQueryParam("type", "all");
  const [status, setStatus] = useQueryParam("status", "all");
  const [platform, setPlatform] = useQueryParam("platform", "all");
  const [scope, setScope] = useQueryParam("scope", isAgent ? "mine" : "all");
  const qs = new URLSearchParams({ type, status, platform, ...(isAgent ? {} : { scope }) }).toString();

  const list = useInfiniteQuery({
    queryKey: ["tickets", "list", qs],
    queryFn: ({ pageParam }) => api.get<TicketList>(`/api/v1/tickets?${qs}${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: ticketsPoll,
  });
  const first = list.data?.pages[0];
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const now = list.dataUpdatedAt;
  const filtered = type !== "all" || status !== "all" || platform !== "all";
  const clear = () => {
    setType("all");
    setStatus("all");
    setPlatform("all");
  };

  return (
    <PageScroll>
      <TicketsFrame stats={first?.stats}>
        {list.isError && !first ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !first ? (
          <LoadingRows />
        ) : (
          <div className="flex flex-col gap-4">
            <StatsRow list={first} />
            <Panel>
              <PanelHeader title="工单" description="按剩余时限排序；点一行看详情">
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger size="sm" aria-label="按类型筛选">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部类型</SelectItem>
                    {TICKET_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger size="sm" aria-label="按状态筛选">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    {TICKET_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger size="sm" aria-label="按平台筛选">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部平台</SelectItem>
                    <SelectItem value="shopee">Shopee</SelectItem>
                    <SelectItem value="tiktok">TikTok Shop</SelectItem>
                  </SelectContent>
                </Select>
                {!isAgent && (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    spacing={0}
                    className="overflow-hidden rounded-md"
                    value={scope}
                    onValueChange={(v) => v && setScope(v)}
                    aria-label="我的或全部工单"
                  >
                    {[
                      { v: "mine", label: "我的" },
                      { v: "all", label: "全部" },
                    ].map((o) => (
                      <ToggleGroupItem key={o.v} value={o.v} className="px-3 text-xs font-normal data-[state=on]:bg-accent data-[state=on]:font-semibold data-[state=on]:text-(--semantic-color-text-link)">
                        {o.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/v1/tickets?${qs}&format=csv`} download>
                    <DownloadIcon />
                    导出
                  </a>
                </Button>
              </PanelHeader>
              {items.length === 0 ? (
                filtered ? (
                  <EmptyState
                    icon={ClipboardListIcon}
                    title="没有符合筛选的工单"
                    action={
                      <Button variant="outline" onClick={clear}>
                        清除筛选
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={ClipboardListIcon}
                    title={first.scope === "mine" ? "没有指派给你的工单" : "还没有工单"}
                    description="退货退款、取消申请、物流异常由平台事件自动建单；其他事项点右上角「新建工单」。"
                  />
                )
              ) : (
                <>
                  <TicketTable items={items} now={now} tz={me.active.timezone} />
                  {list.hasNextPage && (
                    <div className="mt-3 flex justify-center">
                      <Button variant="outline" size="sm" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                        {list.isFetchingNextPage && <Spinner />}
                        加载更多
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Panel>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ByTypePanel list={first} />
              <FeedPanel list={first} tz={me.active.timezone} now={now} />
            </div>
          </div>
        )}
      </TicketsFrame>
    </PageScroll>
  );
}

function StatsRow({ list }: { list: TicketList }) {
  const s = list.stats;
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <Stat label="未结" value={`${s.open} 张`} note={`平台截止 ${s.openPlatformDue} · 商户时限 ${s.openMerchantDue}`} />
      <Stat
        label="6 小时内到期"
        value={`${s.due6h} 张`}
        tone={s.due6h ? "warn" : undefined}
        note={
          s.due6h ? (
            <span className="inline-flex items-center gap-1">
              <TriangleAlertIcon className="size-3.5" aria-hidden="true" />
              {s.due6hNumbers.join(" · ")}
            </span>
          ) : (
            "没有临近到期的工单"
          )
        }
      />
      <Stat
        label="已超时"
        value={`${s.overdue} 张`}
        tone={s.overdue ? "error" : undefined}
        note={
          s.overdueOldest ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              {s.overdueOldest.number} · 已超时 {dueDuration(s.overdueOldest.overdueSec)}
            </span>
          ) : (
            "没有超时工单"
          )
        }
      />
      <Stat label="本周已解决" value={`${s.resolvedThisWeek} 张`} note={s.resolveMedianSec === null ? "本周还没有解决的工单" : `解决时长中位 ${duration(s.resolveMedianSec)}`} />
    </div>
  );
}

function objectTitle(t: TicketItem): string {
  return t.buyerName ?? t.description ?? TYPE_LABEL[t.type];
}

function TicketTable({ items, now, tz }: { items: TicketItem[]; now: number; tz: string }) {
  const router = useRouter();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">工单</TableHead>
          <TableHead className="min-w-44">对象</TableHead>
          <TableHead className="min-w-32">阶段</TableHead>
          <TableHead className="w-36">时限</TableHead>
          <TableHead className="w-36">负责人</TableHead>
          <TableHead className="hidden w-28 xl:table-cell">更新</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((t) => {
          const dead = t.status === "void";
          const sub = [t.externalOrderId ? `订单 ${t.externalOrderId}` : null, t.buyerName && t.description ? t.description : null].filter(Boolean).join(" · ");
          return (
            <TableRow key={t.id} className="state-layer cursor-pointer" onClick={() => router.push(`/tickets/${t.id}`)}>
              <TableCell>
                <Link href={`/tickets/${t.id}`} onClick={(e) => e.stopPropagation()} className={cn("focus-ring rounded-sm font-medium tabular-nums", dead && "text-muted-foreground line-through")}>
                  {t.number}
                </Link>
                <p className="text-xs text-muted-foreground">{TYPE_LABEL[t.type]}</p>
              </TableCell>
              <TableCell className="max-w-80 whitespace-normal">
                <p className="line-clamp-2 break-words">{objectTitle(t)}</p>
                <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <PlatformBadge platform={t.shop.platform} market={t.shop.market} />
                  <span className="line-clamp-1 break-all">{t.shop.name}</span>
                </p>
                {sub && <p className="mt-1 line-clamp-1 text-xs break-all text-muted-foreground tabular-nums">{sub}</p>}
              </TableCell>
              <TableCell className="max-w-64 whitespace-normal">
                <p className={cn(dead && "inline-flex items-center gap-1.5 text-muted-foreground")}>
                  {dead && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
                  {statusText(t)}
                </p>
                {t.platformStatus && (
                  <p className="mt-0.5 max-w-40 truncate text-xs text-muted-foreground xl:max-w-56" title={t.platformStatus}>
                    {t.platformStatus}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <DueCell ticket={t} now={now} />
              </TableCell>
              <TableCell>
                <AssigneeCell assignee={t.assignee} />
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground tabular-nums xl:table-cell">{inTz(t.updatedAt, tz)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

const TYPE_GROUPS: Array<{ label: string; types: TicketType[] }> = [
  { label: TYPE_LABEL.return_refund, types: ["return_refund"] },
  { label: TYPE_LABEL.cancel_request, types: ["cancel_request"] },
  { label: TYPE_LABEL.logistics, types: ["logistics"] },
  { label: TYPE_LABEL.handover, types: ["handover"] },
  { label: TYPE_LABEL.invoice, types: ["invoice"] },
  { label: "缺货跟进 · 内部确认", types: ["stock", "internal"] },
];

function ByTypePanel({ list }: { list: TicketList }) {
  const colors = useBrandColors();
  const groups = TYPE_GROUPS.map((g) => ({ ...g, count: list.byType.filter((b) => g.types.includes(b.type)).reduce((a, b) => a + b.count, 0) }));
  const total = groups.reduce((a, g) => a + g.count, 0);
  return (
    <Panel className="min-w-0">
      <PanelHeader title="按类型" description={`未结 ${total} 张；退货退款、取消申请、物流异常由平台事件建单`} />
      {total === 0 ? (
        <EmptyState icon={ClipboardListIcon} title="没有未结工单" description="有未结工单时，这里按类型显示分布。" />
      ) : (
        <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[180px_minmax(0,1fr)]">
          {colors && (
            <BrandChart
              type="doughnut"
              height={180}
              label={`未结工单按类型：${groups.map((g) => `${g.label} ${g.count}`).join("，")}`}
              data={{
                labels: groups.map((g) => g.label),
                datasets: [{ data: groups.map((g) => g.count), backgroundColor: groups.map((_, i) => (i === 0 ? stripes(colors.series[0], colors.surface) : colors.series[i])), borderWidth: 2, borderColor: colors.surface }],
              }}
              options={{ cutout: "62%" }}
            />
          )}
          <ul className="flex flex-col gap-2">
            {groups.map((g, i) => (
              <li key={g.label} className="flex items-center gap-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: colors?.series[i] }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{g.label}</span>
                <span className="tabular-nums">{g.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function FeedPanel({ list, tz, now }: { list: TicketList; tz: string; now: number }) {
  return (
    <Panel className="min-w-0">
      <PanelHeader title="平台事件流水" description="推送与 webhook 到达后自动建单、推进阶段" />
      {list.platformFeed.length === 0 ? (
        <EmptyState icon={RadioTowerIcon} title="还没有平台事件" description="买家申请退货、取消或物流异常时，平台推送会在这里出现。" />
      ) : (
        <ul className="flex flex-col">
          {list.platformFeed.map((f) => {
            const recent = now - new Date(f.at).getTime() < 20 * 3600_000;
            return (
              <li key={f.id} className="border-b border-border last:border-0">
                <Link href={`/tickets/${f.ticketId}`} className="state-layer focus-ring -mx-2 flex items-start gap-3 rounded-md px-2 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <RadioTowerIcon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm break-all">
                      {f.platformStatus ?? "状态更新"} → {f.kind === "created" ? `新建 ${f.number}` : `${f.number} ${f.phase ?? ""}`}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {f.shopName} · {f.dueAt ? `时限 ${inTz(f.dueAt, tz)}` : "无平台截止"}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm tabular-nums">{inTz(f.at, tz, recent ? "HH:mm" : "MM-dd")}</span>
                    <PlatformBadge platform={f.platform} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
