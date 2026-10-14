"use client";

// 会话列表行、会话右栏上的未结工单徽标（REQ-CONV-002「行上显示未结工单徽标」）：工单号 + 剩余时间，点开进工单详情。
import { ClipboardListIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { TYPE_LABEL, type TicketType } from "@/contracts/tickets";
import { cn } from "@/lib/utils";
import { dueLevel, dueTone, remaining } from "./ticket-ui";

/** 与 `contracts/conversations.ts` 的 TicketChip 同形 */
export type ChipTicket = { id: string; number: string; type: string; dueAt: string | null; overdue: boolean };

/** now：调用方取数的时刻（如 query.dataUpdatedAt），保证渲染是纯函数 */
export function TicketChip({ ticket, now, className }: { ticket: ChipTicket; now: number; className?: string }) {
  const r = remaining(ticket.dueAt, now);
  const overdue = ticket.overdue || !!r?.overdue;
  const soon = !overdue && dueLevel(r) === "soon";
  const typeLabel = TYPE_LABEL[ticket.type as TicketType] ?? "工单";
  return (
    <Link
      href={`/tickets/${ticket.id}`}
      aria-label={`工单 ${ticket.number} ${typeLabel}${r ? `，${r.text}` : ""}`}
      className={cn("state-layer focus-ring inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-sm border border-border bg-card px-1.5 text-xs whitespace-nowrap", className)}
    >
      {overdue || soon ? (
        <TriangleAlertIcon className={cn("size-3.5 shrink-0", overdue ? "text-destructive" : "text-(--semantic-color-feedback-warning)")} aria-hidden="true" />
      ) : (
        <ClipboardListIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="tabular-nums">{ticket.number}</span>
      {r && <span className={cn("truncate tabular-nums", dueTone(r))}>{r.text}</span>}
    </Link>
  );
}

/** 多张时显示第一张（最早到期）+「等 N 张」 */
export function TicketChips({ tickets, now, className }: { tickets: ChipTicket[]; now: number; className?: string }) {
  if (tickets.length === 0) return null;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <TicketChip ticket={tickets[0]} now={now} />
      {tickets.length > 1 && <span className="text-xs whitespace-nowrap text-muted-foreground">等 {tickets.length} 张</span>}
    </span>
  );
}
