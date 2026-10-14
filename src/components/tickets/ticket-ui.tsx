"use client";

// 工单页面共用的小块：时限条与剩余时间、负责人、来源标签、类型图标。
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { ArrowLeftRightIcon, ClipboardCheckIcon, PackageSearchIcon, ReceiptTextIcon, TriangleAlertIcon, TruckIcon, Undo2Icon, XCircleIcon, type LucideIcon } from "lucide-react";
import { OPEN_TICKET_STATUSES, type TicketItem, type TicketType } from "@/contracts/tickets";
import { cn } from "@/lib/utils";

export const TYPE_ICON: Record<TicketType, LucideIcon> = {
  return_refund: Undo2Icon,
  cancel_request: XCircleIcon,
  logistics: TruckIcon,
  invoice: ReceiptTextIcon,
  stock: PackageSearchIcon,
  handover: ArrowLeftRightIcon,
  internal: ClipboardCheckIcon,
};

/** 时限时长的唯一写法：48 小时及以上「N 天」，以下「N 小时 M 分」，1 小时内「M 分」 */
export function dueDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const totalMin = Math.max(1, Math.floor(s / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 48) return `${Math.floor(h / 24)} 天`;
  if (h === 0) return `${m} 分`;
  return `${h} 小时${m ? ` ${m} 分` : ""}`;
}

/** 剩余时间：now 由调用方传入（取数时刻），渲染保持纯函数 */
export function remaining(dueAt: string | null, now: number): { sec: number; overdue: boolean; text: string } | null {
  if (!dueAt) return null;
  const sec = Math.round((new Date(dueAt).getTime() - now) / 1000);
  return sec < 0 ? { sec, overdue: true, text: `已超时 ${dueDuration(-sec)}` } : { sec, overdue: false, text: `剩 ${dueDuration(sec)}` };
}

export const DUE_SOURCE_LABEL = { platform: "平台截止", merchant: "商户时限" } as const;
const SOON_SEC = 6 * 3600;

/** overdue：已超时；soon：6 小时内到期（与统计「6 小时内到期」同一阈值） */
export function dueLevel(r: { sec: number; overdue: boolean } | null): "overdue" | "soon" | "normal" {
  if (!r) return "normal";
  if (r.overdue) return "overdue";
  return r.sec <= SOON_SEC ? "soon" : "normal";
}

const DUE_TONE = { overdue: "text-destructive", soon: "text-(--semantic-color-feedback-warning)", normal: "text-muted-foreground" } as const;

export function dueTone(r: { sec: number; overdue: boolean } | null): string {
  return DUE_TONE[dueLevel(r)];
}

/** 时限状态文字：「剩 N 小时 M 分」「已超时 N 天」；临近到期带三角图标与 warning 色，超时用 error 色 */
export function DueStatus({ dueAt, now, className }: { dueAt: string | null; now: number; className?: string }) {
  const r = remaining(dueAt, now);
  if (!r) return null;
  const level = dueLevel(r);
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap tabular-nums", dueTone(r), className)}>
      {level === "soon" && <TriangleAlertIcon className="size-4 shrink-0" aria-hidden="true" />}
      {level === "overdue" && <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />}
      {r.text}
    </span>
  );
}

/** 时限条：已用掉的比例（建单到截止），芒果填充 + 旁边写剩余（品牌：芒果只做填充，数值写在旁边）；超时用 error 色 */
export function DueBar({ ticket, now, className }: { ticket: Pick<TicketItem, "dueAt" | "createdAt" | "status">; now: number; className?: string }) {
  if (!ticket.dueAt || !OPEN_TICKET_STATUSES.includes(ticket.status)) return null;
  const start = new Date(ticket.createdAt).getTime();
  const end = new Date(ticket.dueAt).getTime();
  const overdue = now > end;
  const pct = end <= start ? 100 : Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  return (
    <div className={cn("flex h-1.5 w-full max-w-32 gap-0.5", className)} aria-hidden="true">
      {pct > 0 && <div className={cn("rounded-full", overdue ? "bg-(--semantic-color-feedback-error)" : "bg-primary")} style={{ width: `${Math.max(pct, 4)}%` }} />}
      {pct < 100 && <div className="flex-1 rounded-full bg-muted" />}
    </div>
  );
}

/** 列表与看板的时限单元：条 +「剩 3 小时 20 分」+ 来源 */
export function DueCell({ ticket, now, inline }: { ticket: TicketItem; now: number; inline?: boolean }) {
  const open = OPEN_TICKET_STATUSES.includes(ticket.status);
  const r = open ? remaining(ticket.dueAt, now) : null;
  if (!r) return <span className="text-sm text-muted-foreground">{open && ticket.status === "waiting" ? "等待中不计时" : "—"}</span>;
  const source = ticket.dueSource ? DUE_SOURCE_LABEL[ticket.dueSource] : "";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <DueBar ticket={ticket} now={now} />
      <p className="text-xs">
        <DueStatus dueAt={ticket.dueAt} now={now} className="font-medium" />
        {inline ? <span className="text-muted-foreground"> · {ticket.dueSource === "platform" ? "平台" : "商户"}</span> : null}
      </p>
      {!inline && <p className="text-xs text-muted-foreground">{source}</p>}
    </div>
  );
}

export function Initial({ name, className }: { name: string; className?: string }) {
  const ch = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <span aria-hidden="true" className={cn("flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground", className)}>
      {ch}
    </span>
  );
}

export function AssigneeCell({ assignee, small }: { assignee: TicketItem["assignee"]; small?: boolean }) {
  if (!assignee) return <span className="text-sm text-muted-foreground">未指派</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Initial name={assignee.name} className={small ? "size-6" : undefined} />
      <span className={cn("truncate", small ? "text-xs" : "text-sm")}>{assignee.name}</span>
    </span>
  );
}

/** 时间线来源：page = 页面、system = 系统、webhook = 平台（与审计日志「来源」一致） */
export const SOURCE_LABEL = { page: "页面", system: "系统", webhook: "平台" } as const;

export function SourceTag({ source }: { source: keyof typeof SOURCE_LABEL }) {
  return <span className="inline-flex h-5 shrink-0 items-center rounded-sm border border-border px-1.5 text-xs text-muted-foreground">{SOURCE_LABEL[source]}</span>;
}

/** 本地时间输入（datetime-local）与 ISO 互转，按商户时区解释 */
export function toLocalInput(iso: string | null, tz: string): string {
  if (!iso) return "";
  return format(new TZDate(new Date(iso), tz), "yyyy-MM-dd'T'HH:mm");
}

export function fromLocalInput(value: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new TZDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, tz);
  return new Date(d.getTime()).toISOString();
}
