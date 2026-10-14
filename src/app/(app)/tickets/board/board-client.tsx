"use client";

// PAGE-TICKETS-BOARD（/tickets/board）：四列看板；平台驱动卡片带锁、没有改状态菜单（REQ-TKT-003、API-TKT-001 view=board、API-TKT-004）。
import { useQuery } from "@tanstack/react-query";
import { LockIcon, MoreHorizontalIcon } from "lucide-react";
import Link from "next/link";
import type { Me } from "@/contracts/auth";
import { TYPE_LABEL, WAITING_LABEL, type BoardColumn, type TicketBoard, type TicketItem } from "@/contracts/tickets";
import { PlatformBadge } from "@/components/common/platform-badge";
import { ErrorState, LoadingRows, PageScroll, Panel } from "@/components/shell/page";
import { AssigneeCell, DueBar, DueStatus, remaining } from "@/components/tickets/ticket-ui";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { inTz } from "@/lib/format";
import { STATUS_OPTIONS, TicketsFrame, ticketsPoll, useChangeStatus } from "../tickets-shared";

type ColKey = keyof TicketBoard["columns"];

export function BoardClient({ me }: { me: Me }) {
  const board = useQuery({ queryKey: ["tickets", "board"], queryFn: () => api.get<TicketBoard>("/api/v1/tickets?view=board"), refetchInterval: ticketsPoll });
  const d = board.data;
  const now = board.dataUpdatedAt;
  const cols: Array<{ key: ColKey; title: string; desc: string; listStatus: string }> = [
    { key: "open", title: "待处理", desc: "已建单，还没人动", listStatus: "open" },
    { key: "in_progress", title: "处理中", desc: "负责人正在处理", listStatus: "in_progress" },
    { key: "waiting", title: "等待中", desc: "角标写明在等谁", listStatus: "waiting" },
    { key: "resolved_today", title: "今日已解决", desc: d?.autoCloseDays ? `${d.autoCloseDays} 天后自动转已关闭` : "不自动关闭", listStatus: "resolved" },
  ];
  return (
    <PageScroll>
      <TicketsFrame stats={d?.stats}>
        {board.isError && !d ? (
          <ErrorState error={board.error} onRetry={() => board.refetch()} />
        ) : !d ? (
          <LoadingRows />
        ) : (
          <>
            <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <LockIcon className="size-3.5" aria-hidden="true" />
              带锁的卡片由平台事件推进，不能手动改状态；其余卡片用右上角菜单改状态
            </p>
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
              {cols.map((c) => (
                <Column key={c.key} col={d.columns[c.key]} title={c.title} desc={c.desc} listStatus={c.listStatus} resolved={c.key === "resolved_today"} now={now} tz={me.active.timezone} />
              ))}
            </div>
          </>
        )}
      </TicketsFrame>
    </PageScroll>
  );
}

function Column({ col, title, desc, listStatus, resolved, now, tz }: { col: BoardColumn; title: string; desc: string; listStatus: string; resolved: boolean; now: number; tz: string }) {
  const rest = col.count - col.items.length;
  return (
    <Panel as="div" className="flex min-w-0 flex-col gap-3 p-4" role="group" aria-label={`${title}，${col.count} 张`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs tabular-nums">{col.count}</span>
      </div>
      {col.items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">{resolved ? "今天还没有解决的工单" : "没有工单"}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {col.items.map((t) => (
            <li key={t.id}>
              <Card t={t} resolved={resolved} now={now} tz={tz} />
            </li>
          ))}
        </ul>
      )}
      {rest > 0 && (
        <Link href={`/tickets?status=${listStatus}`} className="focus-ring self-start rounded-sm text-xs font-semibold text-(--semantic-color-text-link) underline-offset-4 hover:underline">
          还有 {rest} 张，在列表查看
        </Link>
      )}
    </Panel>
  );
}

function Card({ t, resolved, now, tz }: { t: TicketItem; resolved: boolean; now: number; tz: string }) {
  const change = useChangeStatus();
  const r = remaining(t.dueAt, now);
  const options = STATUS_OPTIONS.filter((o) => !(o.status === t.status && (o.waitingOn ?? null) === t.waitingOn));
  return (
    <article className="flex flex-col gap-2 rounded-md border border-border bg-card p-3" aria-busy={change.isPending || undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/tickets/${t.id}`} className="focus-ring rounded-sm text-sm font-medium tabular-nums">
            {t.number}
          </Link>
          <p className="text-xs text-muted-foreground">{TYPE_LABEL[t.type]}</p>
        </div>
        {resolved ? null : t.platformDriven ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="focus-ring flex size-7 items-center justify-center rounded-md text-muted-foreground" aria-label="平台驱动，不能手动改状态">
                <LockIcon className="size-4" />
              </span>
            </TooltipTrigger>
            <TooltipContent>由平台事件推进，不能手动改状态</TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`${t.number} 改状态`} disabled={change.isPending}>
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs text-muted-foreground">改状态</DropdownMenuLabel>
              {options.map((o) => (
                <DropdownMenuItem key={`${o.status}-${o.waitingOn ?? ""}`} onSelect={() => change.mutate({ ticket: t, status: o.status, waitingOn: o.waitingOn })}>
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <p className="truncate text-sm">{t.buyerName ?? t.description ?? TYPE_LABEL[t.type]}</p>
      <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <PlatformBadge platform={t.shop.platform} market={t.shop.market} />
        <span className="truncate">{t.shop.name}</span>
      </p>
      {resolved ? (
        <p className="text-xs text-(--semantic-color-feedback-success) tabular-nums">
          {t.platformDriven && t.phase ? t.phase : "已解决"} · {inTz(t.resolvedAt, tz, "HH:mm")}
        </p>
      ) : r ? (
        <div className="flex flex-col gap-1">
          <DueBar ticket={t} now={now} className="max-w-none" />
          <p className="text-xs tabular-nums">
            <DueStatus dueAt={t.dueAt} now={now} className="font-medium" />
            <span className="text-muted-foreground"> · {t.dueSource === "platform" ? "平台" : "商户"}</span>
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t.status === "waiting" ? "等待中不计时" : "没有时限"}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <AssigneeCell assignee={t.assignee} small />
        {t.status === "waiting" && t.waitingOn && <span className="inline-flex h-5 shrink-0 items-center rounded-sm bg-secondary px-1.5 text-xs">{WAITING_LABEL[t.waitingOn]}</span>}
      </div>
    </article>
  );
}
