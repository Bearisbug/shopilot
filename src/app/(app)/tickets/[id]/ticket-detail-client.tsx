"use client";

// PAGE-TICKET（/tickets/<id>）：进度、时间线与备注、时限、关联、操作（REQ-TKT-003、API-TKT-002、004…008）。
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  BanIcon,
  CalendarClockIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardPlusIcon,
  HandIcon,
  LockIcon,
  PlusIcon,
  RadioTowerIcon,
  StickyNoteIcon,
  TriangleAlertIcon,
  UserRoundPlusIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { Me } from "@/contracts/auth";
import type { MemberOption } from "@/contracts/team";
import { OPEN_TICKET_STATUSES, TYPE_LABEL, WAITING_LABEL, statusText, type TicketDetail, type TicketEventItem, type TicketItem } from "@/contracts/tickets";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { CancelRequestDialog } from "@/components/orders/cancel-request-dialog";
import { ReturnReviewSheet } from "@/components/orders/return-review-sheet";
import { useDialogParam } from "@/components/shell/global-dialogs";
import { EmptyState, ErrorState, LoadingRows, PageHeader, PageScroll, Panel, PanelHeader } from "@/components/shell/page";
import { DUE_SOURCE_LABEL, DueBar, SourceTag, dueLevel, fromLocalInput, remaining, toLocalInput } from "@/components/tickets/ticket-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError, api, errorText, newKey } from "@/lib/api";
import { inTz } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { LIST_URL_KEY, ticketsPoll, useChangeStatus } from "../tickets-shared";

const EVENT_ICON: Record<TicketEventItem["type"], LucideIcon> = {
  created: ClipboardPlusIcon,
  status: ArrowRightIcon,
  platform_event: RadioTowerIcon,
  assign: UserRoundPlusIcon,
  note: StickyNoteIcon,
  due_change: CalendarClockIcon,
  action: HandIcon,
  void: BanIcon,
};
const PLATFORM_NAME = { shopee: "Shopee", tiktok: "TikTok" } as const;
const HANDLING_LABEL = { bot: "AI 接待中", awaiting_human: "待认领", human: "处理中", closed: "已结束" } as const;
const PLATFORM_HINT = "平台类工单随平台事件推进，用上方「处理申请」处理";

const noopSubscribe = () => () => {};
/** 「返回列表」回到上次看的列表或看板（带筛选）；直接打开详情时回 /tickets */
function useListHref(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => sessionStorage.getItem(LIST_URL_KEY) ?? "/tickets",
    () => "/tickets",
  );
}

const NOT_FOUND_TEXT = {
  agent: "它可能不存在，或不在你的可见范围内（员工只能看指派给自己的工单）。",
  lead: "它可能不存在，或这张工单不在你负责的店铺里。",
  admin: "它可能不存在或已被删除。",
} as const;

const isNotFound = (e: unknown) => e instanceof ApiError && e.type === "not-found";

export function TicketDetailClient({ me, id }: { me: Me; id: string }) {
  const q = useQuery({ queryKey: ["ticket", id], queryFn: () => api.get<TicketDetail>(`/api/v1/tickets/${id}`), refetchInterval: ticketsPoll });
  const d = q.data;
  const tz = me.active.timezone;
  const listHref = useListHref();
  // 提交备注时失去访问权（被改派走等）：页面进入说明态，没提交的备注留在说明下方
  const [lostNote, setLostNote] = useState<string | null>(null);

  // 404 是确定结果：即使还有旧数据也不再显示工单（轮询或提交时发现已无权查看）
  if (isNotFound(q.error)) {
    return (
      <PageScroll>
        <EmptyState
          icon={LockIcon}
          title="找不到这张工单"
          description={NOT_FOUND_TEXT[me.active.role]}
          action={
            <Button asChild variant="outline">
              <Link href={listHref}>返回工单列表</Link>
            </Button>
          }
        />
        {lostNote && (
          <Field className="mx-auto max-w-lg">
            <FieldLabel htmlFor="lost-note">没有提交的备注</FieldLabel>
            <Textarea id="lost-note" readOnly value={lostNote} className="max-h-50" />
            <FieldDescription>这张工单已看不到，备注没有加上；需要时复制保存。</FieldDescription>
          </Field>
        )}
      </PageScroll>
    );
  }
  if (q.isError && !d) {
    return (
      <PageScroll>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </PageScroll>
    );
  }
  if (!d) {
    return (
      <PageScroll>
        <LoadingRows rows={8} />
      </PageScroll>
    );
  }
  const t = d.ticket;
  const facts = [t.buyerName, `${PLATFORM_NAME[t.shop.platform]} ${t.shop.market}`, t.shop.name, t.externalOrderId ? `订单 ${t.externalOrderId}` : null].filter(Boolean).join(" · ");
  return (
    <PageScroll>
      <PageHeader title={`${t.number} · ${TYPE_LABEL[t.type]}`} facts={facts}>
        <Button asChild variant="ghost" size="sm">
          <Link href={listHref}>返回列表</Link>
        </Button>
      </PageHeader>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <ProgressPanel d={d} />
          <TimelinePanel d={d} tz={tz} onLost={setLostNote} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <DuePanel d={d} tz={tz} now={q.dataUpdatedAt} />
          <RelatedPanel d={d} tz={tz} />
          <ActionsPanel d={d} me={me} tz={tz} />
        </div>
      </div>
      <DueDialog d={d} tz={tz} />
    </PageScroll>
  );
}

function ProgressPanel({ d }: { d: TicketDetail }) {
  const t = d.ticket;
  const desc = t.platformDriven
    ? `${PLATFORM_NAME[t.shop.platform]} ${TYPE_LABEL[t.type]}由平台事件驱动，事件到达后自动推进`
    : t.origin === "platform"
      ? "由平台事件建单，之后由负责人手动推进"
      : "由负责人手动改状态";
  const footer = [t.platformStatus ? `平台状态 ${t.platformStatus}` : null, d.related.afterSale?.nextAction ? `卖家下一步 ${d.related.afterSale.nextAction}` : null].filter(Boolean).join(" · ");
  return (
    <Panel>
      <PanelHeader title="进度" description={desc}>
        <span className={cn("text-sm font-medium", t.status === "void" && "text-muted-foreground")}>{statusText(t)}</span>
      </PanelHeader>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="进度">
        {t.phases.map((p, i) => (
          <li key={`${p.label}-${i}`} aria-current={p.state === "current" ? "step" : undefined} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-6 bg-border" aria-hidden="true" />}
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-xs tabular-nums",
                p.state === "done" && "bg-(--semantic-color-surface-inverse) text-(--semantic-color-text-on-inverse)",
                p.state === "current" && "bg-primary font-semibold text-primary-foreground",
                p.state === "todo" && "border border-border text-muted-foreground",
              )}
            >
              {p.state === "done" ? <CheckIcon className="size-3" aria-hidden="true" /> : i + 1}
            </span>
            <span className={cn("text-sm", p.state === "current" ? "font-semibold text-(--semantic-color-text-link)" : p.state === "todo" && "text-muted-foreground")}>
              {p.label}
              <span className="sr-only">{p.state === "done" ? "（已完成）" : p.state === "current" ? "（当前）" : ""}</span>
            </span>
          </li>
        ))}
      </ol>
      {(footer || t.voidReason || t.description) && (
        <div className="mt-4 flex flex-col gap-1 text-xs text-muted-foreground">
          {footer && <p className="break-all">{footer}</p>}
          {t.description && <p>说明：{t.description}</p>}
          {t.voidReason && <p>作废原因：{t.voidReason}</p>}
        </div>
      )}
    </Panel>
  );
}

const noteSchema = z.object({ text: z.string().trim().min(1, "备注不能为空").max(2000, "备注最多 2000 字，请删减后再加") });

const NOTE_MAX = 2000;

function TimelinePanel({ d, tz, onLost }: { d: TicketDetail; tz: string; onLost: (text: string) => void }) {
  const qc = useQueryClient();
  const [key, setKey] = useState(newKey);
  const form = useForm<{ text: string }>({ resolver: zodResolver(noteSchema), defaultValues: { text: "" } });
  const noteLength = useWatch({ control: form.control, name: "text" }).trim().length;
  const add = useMutation({
    mutationFn: (v: { text: string }) => api.post<TicketEventItem>(`/api/v1/tickets/${d.ticket.id}/notes`, v, key),
    onSuccess: () => {
      form.reset({ text: "" });
      setKey(newKey());
      toast.success("备注已加到时间线");
      qc.invalidateQueries({ queryKey: ["ticket", d.ticket.id] });
    },
    onError: (e, v) => {
      if (isNotFound(e)) {
        onLost(v.text);
        qc.invalidateQueries({ queryKey: ["ticket", d.ticket.id] });
        return;
      }
      toast.error("备注没有加上", { description: errorText(e) });
    },
  });
  return (
    <Panel>
      <PanelHeader title="时间线" description="平台事件与人工操作按时间排列，右侧标来源，与审计日志「来源」一致" />
      <ol className="flex flex-col">
        {d.events.map((e) => {
          const Icon = EVENT_ICON[e.type];
          return (
            <li key={e.id} className="flex items-start gap-3 border-b border-border py-3 first:pt-0 last:border-0">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm break-words">{e.title}</p>
                <p className="text-xs break-words text-muted-foreground">
                  <span className="tabular-nums">{inTz(e.at, tz)}</span>
                  {e.detail ? ` · ${e.detail}` : ""}
                </p>
              </div>
              <SourceTag source={e.source} />
            </li>
          );
        })}
      </ol>
      {d.permissions.canNote && (
        <form noValidate onSubmit={form.handleSubmit((v) => add.mutate(v))} className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          <Controller
            name="text"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor="ticket-note">内部备注</FieldLabel>
                <Textarea
                  {...field}
                  id="ticket-note"
                  rows={3}
                  className="max-h-50"
                  placeholder="只在 Shopilot 内可见，不会发给买家"
                  aria-invalid={fieldState.invalid || noteLength > NOTE_MAX}
                  aria-describedby="ticket-note-count"
                />
                <div className="flex items-start justify-between gap-3">
                  {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : <span />}
                  <p id="ticket-note-count" className={cn("shrink-0 text-xs tabular-nums", noteLength > NOTE_MAX ? "text-destructive" : "text-muted-foreground")}>
                    {noteLength} / {NOTE_MAX}
                  </p>
                </div>
              </Field>
            )}
          />
          <Button type="submit" variant="outline" className="self-end" disabled={add.isPending}>
            {add.isPending ? <Spinner /> : <PlusIcon />}
            加备注
          </Button>
        </form>
      )}
    </Panel>
  );
}

function remindText(t: TicketDetail["ticket"]): string | null {
  if (t.remind.hoursBefore) return `截止前 ${t.remind.hoursBefore} 小时提醒负责人`;
  if (t.remind.remainingPercent) return `剩 ${t.remind.remainingPercent}% 时提醒负责人`;
  return null;
}

function DuePanel({ d, tz, now }: { d: TicketDetail; tz: string; now: number }) {
  const t = d.ticket;
  const { openIt } = useDialogParam("due");
  const open = t.status === "open" || t.status === "in_progress" || t.status === "waiting";
  const r = open ? remaining(t.dueAt, now) : null;
  const level = dueLevel(r);
  const as = d.related.afterSale;
  const explain =
    t.dueSource === "platform"
      ? [as?.dueField ? `取自平台字段 ${as.dueField}` : "取自平台截止字段", remindText(t)].filter(Boolean).join("；")
      : t.dueSource === "merchant"
        ? ["按接待设置里该类型的商户时限，组长与管理员可改单张", remindText(t)].filter(Boolean).join("；")
        : t.status === "waiting"
          ? "等待中不计时"
          : "这张工单没有时限";
  return (
    <Panel>
      <PanelHeader title="时限" description={`来源：${t.dueSource ? DUE_SOURCE_LABEL[t.dueSource] : "无"}`} />
      <p className={cn("flex items-center gap-2 text-[1.875rem] leading-tight font-semibold tabular-nums", level === "overdue" && "text-destructive", level === "soon" && "text-(--semantic-color-feedback-warning)")}>
        {level === "soon" && <TriangleAlertIcon className="size-5 shrink-0" aria-hidden="true" />}
        {r ? r.text : "—"}
      </p>
      {r && <DueBar ticket={t} now={now} className="mt-3 max-w-none" />}
      {t.dueAt && (
        <p className="mt-3 text-sm tabular-nums">
          {t.dueSource ? DUE_SOURCE_LABEL[t.dueSource] : "截止"} {inTz(t.dueAt, tz, "yyyy-MM-dd HH:mm")}
        </p>
      )}
      <p className="mt-1 text-xs break-words text-muted-foreground">{explain}</p>
      {d.permissions.canChangeDue ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={openIt}>
          <CalendarClockIcon />
          改时限
        </Button>
      ) : (
        open &&
        t.dueSource === "platform" &&
        d.permissions.canAssign && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="mt-4" aria-disabled="true" aria-label="改时限（不可用：平台截止不能改）">
                <CalendarClockIcon />
                改时限
              </Button>
            </TooltipTrigger>
            <TooltipContent>时限来自平台截止字段，不能改</TooltipContent>
          </Tooltip>
        )
      )}
    </Panel>
  );
}

function RelatedPanel({ d, tz }: { d: TicketDetail; tz: string }) {
  const { conversation: c, order: o, afterSale: a } = d.related;
  if (!c && !o && !a) {
    return (
      <Panel>
        <PanelHeader title="关联" />
        <p className="text-sm text-muted-foreground">这张工单没有关联会话或订单。</p>
      </Panel>
    );
  }
  return (
    <Panel>
      <PanelHeader title="关联" />
      <ul className="flex flex-col">
        {c && (
          <RelatedRow
            title={`会话 · ${c.buyerName}`}
            sub={[HANDLING_LABEL[c.handlingState], c.claimedByName ? `处理人 ${c.claimedByName}` : null, c.lastMessageAt ? `最近消息 ${inTz(c.lastMessageAt, tz)}` : null].filter(Boolean).join(" · ")}
            href={`/wb/${c.id}`}
            action="打开会话"
          />
        )}
        {o && <RelatedRow title={`订单 ${o.externalOrderId}`} sub={[o.itemsText, `${o.currency} ${o.total}`, o.platformStatus].filter(Boolean).join(" · ")} href={`/orders?order=${o.id}`} action="订单" />}
        {a && (
          <RelatedRow
            title={`${a.kind === "return" ? "退货单" : "取消申请"} ${a.externalId}`}
            sub={[a.platformStatus, a.reason ? `原因「${a.reason}」` : null].filter(Boolean).join(" · ")}
          />
        )}
      </ul>
    </Panel>
  );
}

function RelatedRow({ title, sub, href, action }: { title: string; sub: string; href?: string; action?: string }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-border py-3 first:pt-0 last:border-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm break-all">{title}</p>
        {sub && <p className="text-xs break-words text-muted-foreground">{sub}</p>}
      </div>
      {href && action && (
        <Link href={href} className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-sm text-xs font-semibold text-(--semantic-color-text-link) underline-offset-4 hover:underline">
          {action}
          <ChevronRightIcon className="size-4" aria-hidden="true" />
        </Link>
      )}
    </li>
  );
}

function ActionsPanel({ d, me, tz }: { d: TicketDetail; me: Me; tz: string }) {
  const t = d.ticket;
  const qc = useQueryClient();
  const change = useChangeStatus();
  const voidDlg = useDialogParam("void");
  const [reason, setReason] = useState("");
  const [handling, setHandling] = useState(false);
  const as = d.related.afterSale;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["ticket", t.id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
  };
  const statusActions = t.nextActions.filter((a) => a.kind === "status");
  const waiting = statusActions.filter((a) => a.kind === "status" && a.status === "waiting");
  const primary = statusActions.find((a) => a.kind === "status" && (t.status === "in_progress" ? a.status === "resolved" : a.status === "in_progress"));
  const resolve = statusActions.find((a) => a.kind === "status" && a.status === "resolved");

  const options = useQuery({
    queryKey: ["member-options", t.shop.id],
    queryFn: () => api.get<{ items: MemberOption[] }>(`/api/v1/members/options?shopId=${t.shop.id}`),
    enabled: d.permissions.canAssign,
  });
  const assign = useMutation({
    mutationFn: (assigneeId: string) => api.post<TicketItem>(`/api/v1/tickets/${t.id}/assign`, { assigneeId }),
    onSuccess: (x) => toast.success(`已改派给 ${x.assignee?.name ?? "—"}`),
    onError: (e) => toast.error("没有改派成功", { description: errorText(e) }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["ticket", t.id] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
  const voidIt = useMutation({
    mutationFn: () => api.post<TicketItem>(`/api/v1/tickets/${t.id}/void`, { reason: reason.trim() }),
    onSuccess: () => {
      toast.success(`${t.number} 已作废`);
      setReason("");
      voidDlg.close();
    },
    onError: (e) => toast.error("没有作废", { description: errorText(e) }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["ticket", t.id] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["nav-summary"] });
    },
  });
  const run = (a: { status: "in_progress" | "waiting" | "resolved"; waitingOn?: "buyer" | "platform" | "internal" }) => change.mutate({ ticket: t, status: a.status, waitingOn: a.waitingOn });
  const open = t.status === "open" || t.status === "in_progress" || t.status === "waiting";
  const reasonTooLong = reason.trim().length > 200;
  // 地址里带 ?dialog=void 也只在能作废时打开；无权或工单已结束时清掉参数
  const canVoidNow = d.permissions.canVoid && open;
  const { open: voidOpen, close: closeVoid } = voidDlg;
  useEffect(() => {
    if (voidOpen && !canVoidNow) closeVoid();
  }, [voidOpen, canVoidNow, closeVoid]);

  return (
    <Panel>
      <PanelHeader title="操作" description={`当前阶段：${statusText(t)}`} />
      <div className="flex flex-col gap-4">
        {!open ? (
          <p className="text-sm text-muted-foreground">
            {t.status === "void" ? `已作废${t.voidReason ? `：${t.voidReason}` : ""}` : t.status === "closed" ? `已关闭 · ${inTz(t.closedAt, tz)}` : `已解决 · ${inTz(t.resolvedAt, tz)}`}
          </p>
        ) : t.platformDriven ? (
          as ? (
            <div className="flex flex-col gap-2">
              <Button className="w-full" onClick={() => setHandling(true)}>
                <HandIcon />
                处理申请
              </Button>
              {t.orderId && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/orders?order=${t.orderId}`}>在订单页查看</Link>
                </Button>
              )}
            </div>
          ) : t.orderId ? (
            <Button asChild className="w-full">
              <Link href={`/orders?order=${t.orderId}`}>
                <HandIcon />
                去订单处理申请
              </Link>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">这张售后单没有关联订单，到平台卖家中心处理。</p>
          )
        ) : d.permissions.canChangeStatus ? (
          <div className="flex flex-col gap-2">
            {primary && primary.kind === "status" && (
              <Button className="w-full" onClick={() => run(primary)} disabled={change.isPending}>
                {change.isPending && <Spinner />}
                {primary.label}
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={change.isPending}>
                    {t.status === "waiting" ? "改等待对象" : "等待中"}
                    <ChevronDownIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {waiting.map((a) =>
                    a.kind === "status" ? (
                      <DropdownMenuItem key={a.label} onSelect={() => run(a)}>
                        {a.waitingOn ? WAITING_LABEL[a.waitingOn] : a.label}
                      </DropdownMenuItem>
                    ) : null,
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {resolve && resolve.kind === "status" && primary !== resolve && (
                <Button variant="outline" size="sm" onClick={() => run(resolve)} disabled={change.isPending}>
                  <CheckIcon />
                  {resolve.label}
                </Button>
              )}
            </div>
          </div>
        ) : null}

        <Field>
          <FieldLabel htmlFor="ticket-assignee">负责人</FieldLabel>
          {d.permissions.canAssign ? (
            <Select value={t.assignee?.id ?? ""} onValueChange={(v) => assign.mutate(v)} disabled={assign.isPending}>
              <SelectTrigger id="ticket-assignee" className="w-full">
                <SelectValue placeholder="未指派" />
              </SelectTrigger>
              <SelectContent>
                {t.assignee && !(options.data?.items ?? []).some((m) => m.membershipId === t.assignee!.id) && <SelectItem value={t.assignee.id}>{t.assignee.name}</SelectItem>}
                {(options.data?.items ?? []).map((m) => (
                  <SelectItem key={m.membershipId} value={m.membershipId}>
                    {m.name}
                    <span className="text-muted-foreground"> · {ROLE_LABEL[m.role]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p id="ticket-assignee" className="text-sm">
              {t.assignee?.name ?? "未指派"}
              {t.assignee?.id === me.active.membershipId ? "（本人）" : ""}
            </p>
          )}
          {d.permissions.canAssign && <FieldDescription>只列负责这家店的成员；改派后通知新负责人</FieldDescription>}
        </Field>

        {open && (t.platformDriven || d.permissions.canVoid) && (
          <div className="flex flex-wrap gap-2">
            {t.platformDriven && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" aria-disabled="true" aria-label={`由平台事件关闭（不可用：${PLATFORM_HINT}）`}>
                    <LockIcon />
                    由平台事件关闭
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">{PLATFORM_HINT}</TooltipContent>
              </Tooltip>
            )}
            {d.permissions.canVoid && (
              <Button variant="destructive" size="sm" onClick={voidDlg.openIt}>
                <BanIcon />
                作废
              </Button>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={voidDlg.open && canVoidNow}
        onOpenChange={(o) => {
          if (!o) {
            setReason("");
            voidDlg.close();
          }
        }}
        title={`作废 ${t.number}？`}
        desc={t.platformDriven ? "工单改为已作废，平台上的售后单不受影响，仍需在订单页或平台处理。作废后不能恢复。" : "工单改为已作废，不再提醒和计入超时。作废后不能恢复。"}
        confirmText="作废"
        destructive
        pending={voidIt.isPending}
        confirmDisabled={!reason.trim() || reasonTooLong}
        onConfirm={() => voidIt.mutate()}
      >
        <Field data-invalid={reasonTooLong}>
          <FieldLabel htmlFor="void-reason">作废原因</FieldLabel>
          <Textarea id="void-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：重复建单" aria-invalid={reasonTooLong} />
          {reasonTooLong ? <FieldError>原因最多 200 字</FieldError> : <FieldDescription>写进时间线与审计日志</FieldDescription>}
        </Field>
      </ConfirmDialog>
      <ReturnReviewSheet open={handling && as?.kind === "return"} onOpenChange={setHandling} afterSaleId={as?.id ?? null} onDone={refresh} />
      <CancelRequestDialog open={handling && as?.kind === "cancel"} onOpenChange={setHandling} afterSaleId={as?.id ?? null} onDone={refresh} />
    </Panel>
  );
}

const dueSchema = z.object({ due: z.string().min(1, "请选择新的时限") });

function DueDialog({ d, tz }: { d: TicketDetail; tz: string }) {
  const t = d.ticket;
  const { open, close } = useDialogParam("due");
  // 地址里带 ?dialog=due 也只在能改时打开；无权或工单已结束时清掉参数
  const allowed = d.permissions.canChangeDue && OPEN_TICKET_STATUSES.includes(t.status);
  useEffect(() => {
    if (open && !allowed) close();
  }, [open, allowed, close]);
  return (
    <Dialog open={open && allowed} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>改 {t.number} 的时限</DialogTitle>
          <DialogDescription>只改这一张；按商户时区 {tz} 填写。改后到期提醒重新计算。</DialogDescription>
        </DialogHeader>
        <DueForm t={t} tz={tz} close={close} />
      </DialogContent>
    </Dialog>
  );
}

function DueForm({ t, tz, close }: { t: TicketDetail["ticket"]; tz: string; close: () => void }) {
  const qc = useQueryClient();
  const form = useForm<{ due: string }>({ resolver: zodResolver(dueSchema), defaultValues: { due: toLocalInput(t.dueAt, tz) } });
  const save = useMutation({
    mutationFn: (iso: string) => api.patch<TicketItem>(`/api/v1/tickets/${t.id}/due`, { dueAt: iso }),
    onSuccess: (x) => {
      toast.success(`时限已改为 ${inTz(x.dueAt, tz, "MM-dd HH:mm")}`);
      qc.invalidateQueries({ queryKey: ["ticket", t.id] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["nav-summary"] });
      close();
    },
    onError: (e) => {
      if (isNotFound(e)) {
        qc.invalidateQueries({ queryKey: ["ticket", t.id] });
        close();
        return;
      }
      const msg = e instanceof ApiError ? (e.problem.extra?.fields as Record<string, string> | undefined)?.dueAt : undefined;
      if (msg) form.setError("due", { message: msg });
      else toast.error("没有改成", { description: errorText(e) });
    },
  });
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((v) => {
        const iso = fromLocalInput(v.due, tz);
        if (!iso) form.setError("due", { message: "时间格式不对" });
        else save.mutate(iso);
      })}
      className="flex flex-col gap-4"
    >
      <Controller
        name="due"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="due-input">新的时限</FieldLabel>
            <Input {...field} id="due-input" type="datetime-local" aria-invalid={fieldState.invalid} />
            {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : <FieldDescription>当前 {t.dueAt ? inTz(t.dueAt, tz, "yyyy-MM-dd HH:mm") : "没有时限"}</FieldDescription>}
          </Field>
        )}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          取消
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Spinner />}
          保存
        </Button>
      </DialogFooter>
    </form>
  );
}

