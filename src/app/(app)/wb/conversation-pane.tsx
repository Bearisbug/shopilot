"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeftIcon, CircleCheckIcon, ClipboardListIcon, CopyIcon, HandIcon, PanelRightIcon, TimerIcon, TriangleAlertIcon, UserPlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import type { BuyerOrder, ConversationDetail, DraftItem, MessageItem } from "@/contracts/conversations";
import { ErrorState, LoadingRows } from "@/components/shell/page";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMe } from "@/hooks/use-me";
import { api, ApiError, errorText } from "@/lib/api";
import { inTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Composer, DraftCard, type EditingDraft } from "./composer";
import { Timeline } from "./timeline";
import { Avatar, focusReply, HANDOFF_LABEL, PlatformTag, PollErrorBar, readReply, rememberClaimLost, useBuyer, useConversation, useReplyText, useWbParams, waitText, writeReply } from "./wb-shared";

export function ConversationPane({ id }: { id: string }) {
  const q = useConversation(id);
  const buyer = useBuyer(id);
  const me = useMe();
  const tz = me.data?.active.timezone ?? "Asia/Kuala_Lumpur";
  const qc = useQueryClient();
  const [older, setOlder] = useState<MessageItem[]>([]);
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null);
  const [editing, setEditing] = useState<EditingDraft>(null);
  const [replacing, setReplacing] = useState<DraftItem | null>(null);

  const loadOlder = useMutation({
    mutationFn: (before: string) => api.get<ConversationDetail>(`/api/v1/conversations/${id}?before=${before}`),
    onSuccess: (d) => {
      setOlder((prev) => [...d.messages, ...prev]);
      setOlderHasMore(d.hasMore);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const retry = useMutation({
    mutationFn: (messageId: string) => api.post(`/api/v1/conversations/${id}/messages/${messageId}/retry`, {}),
    onSettled: () => qc.invalidateQueries({ queryKey: ["conversation", id] }),
    onError: (e) => toast.error("重试没有成功", { description: errorText(e) }),
  });

  // 改后发送：把草稿放进输入框；输入框里原有的字先存进 editing.before，「不改了」时放回去
  const beginEdit = (x: DraftItem) => {
    setEditing({ id: x.id, before: readReply(id) });
    writeReply(id, x.text);
  };
  const startEdit = (x: DraftItem) => {
    const current = readReply(id).trim();
    if (current && current !== x.text.trim()) setReplacing(x);
    else {
      beginEdit(x);
      focusReply();
    }
  };

  if (q.isPending) {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl bg-card p-4">
        <LoadingRows rows={6} />
      </section>
    );
  }
  // 会话看不到了（404）才换成说明页；其他错误在已有数据时只提示、不替换内容
  const gone = q.error instanceof ApiError && q.error.status === 404;
  if (gone || !q.data) {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center rounded-xl bg-card p-6">
        {gone ? <Gone id={id} lostTo={qc.getQueryData<string>(["claim-lost", id])} wasMine={!!q.data && q.data.conversation.claimedBy?.id === me.data?.active.membershipId} /> : <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      </section>
    );
  }

  const d = q.data;
  const recentIds = new Set(d.messages.map((m) => m.id));
  const messages = [...older.filter((m) => !recentIds.has(m.id)), ...d.messages];
  const hasMore = olderHasMore ?? d.hasMore;
  const ordersById = new Map<string, BuyerOrder>((buyer.data?.orders ?? []).map((o) => [o.externalOrderId, o]));

  return (
    <section aria-label={`与 ${d.conversation.buyerName} 的会话`} className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl bg-card">
      <Header d={d} tz={tz} />
      {q.isError && <PollErrorBar className="mx-4 mt-2 shrink-0" onRetry={() => q.refetch()} />}
      <Timeline
        key={id}
        messages={messages}
        shadowDrafts={d.shadowDrafts}
        ordersById={ordersById}
        tz={tz}
        hasMore={hasMore}
        loadingMore={loadOlder.isPending}
        onLoadMore={() => messages[0] && loadOlder.mutate(messages[0].id)}
        onRetry={(mid) => retry.mutate(mid)}
        retryingId={retry.isPending ? (retry.variables ?? null) : null}
      />
      {d.draft && d.conversation.handlingState !== "closed" && editing?.id !== d.draft.id && <DraftCard detail={d} draft={d.draft} onEdit={startEdit} />}
      <Footer
        d={d}
        editing={editing}
        onDoneEditing={() => setEditing(null)}
        onCancelEditing={() => {
          if (editing) writeReply(id, editing.before);
          setEditing(null);
          focusReply();
        }}
      />
      <AlertDialog open={replacing !== null} onOpenChange={(o) => !o && setReplacing(null)}>
        <AlertDialogContent
          onCloseAutoFocus={(e) => {
            // 确认后焦点交给输入框；取消时回到触发按钮（Radix 默认）
            if (editing) {
              e.preventDefault();
              focusReply();
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>替换当前输入？</AlertDialogTitle>
            <AlertDialogDescription>输入框里有还没发出的内容。改后发送会把 AI 草稿放进输入框；点「不改了」可以换回现在的内容。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button
              onClick={() => {
                if (replacing) beginEdit(replacing);
                setReplacing(null);
              }}
            >
              替换
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** 会话看不到了（404）：并发认领输给同事（员工看不到同事处理中的会话），或已删除、不在可见范围 */
function Gone({ id, lostTo, wasMine }: { id: string; lostTo?: string; wasMine: boolean }) {
  const { params } = useWbParams();
  const listParams = new URLSearchParams(params.toString());
  listParams.delete("dialog");
  listParams.delete("panel");
  return (
    <div className="flex max-w-sm flex-col items-center gap-2 text-center">
      <p className="text-sm font-medium">{lostTo ? `${lostTo} 已认领这个会话` : wasMine ? "这个会话已不在你名下" : "找不到或已删除"}</p>
      <p className="text-sm text-muted-foreground">
        {lostTo
          ? "同事处理中的会话只有组长和管理员能查看，回到列表接待其他买家。"
          : wasMine
            ? "组长或管理员把它改派给了同事，或调整了你负责的店铺。同事处理中的会话只有组长和管理员能查看。"
            : "会话可能已被删除，或不在你负责的店铺与可见范围内。"}
      </p>
      <Button asChild variant="outline" size="sm" className="mt-2">
        <Link href={`/wb${listParams.toString() ? `?${listParams.toString()}` : ""}`}>回到会话列表</Link>
      </Button>
      <UnsentReply id={id} className="mt-4 w-full text-left" />
    </div>
  );
}

/** 输入框已经不在（会话被他人接手、已结束、看不到了）时，把没发出的回复留给本人复制 */
function UnsentReply({ id, className }: { id: string; className?: string }) {
  const [text, setText] = useReplyText(id);
  if (!text.trim()) return null;
  return (
    <div className={cn("rounded-md border border-border px-3 py-2", className)}>
      <p className="text-xs text-muted-foreground">你未发出的回复</p>
      <p className="mt-1 line-clamp-4 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</p>
      <div className="mt-2 flex gap-2">
        <Button
          size="xs"
          variant="outline"
          onClick={() =>
            navigator.clipboard
              .writeText(text)
              .then(() => toast.success("已复制"))
              .catch(() => toast.error("复制没有成功，请手动选中文字复制"))
          }
        >
          <CopyIcon />
          复制
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setText("")}>
          不要了
        </Button>
      </div>
    </div>
  );
}

function Header({ d, tz }: { d: ConversationDetail; tz: string }) {
  const c = d.conversation;
  const { set, params } = useWbParams();
  const listParams = new URLSearchParams(params.toString());
  listParams.delete("dialog");
  listParams.delete("panel");
  const listHref = `/wb${listParams.toString() ? `?${listParams.toString()}` : ""}`;
  const qc = useQueryClient();
  const me = useMe();
  const claim = useMutation({
    mutationFn: () => api.post(`/api/v1/conversations/${c.id}/claim`, { version: c.version }),
    onSuccess: () => {
      toast.success("已认领");
      // 认领按钮随即消失，焦点交给输入框，接着就能回复
      focusReply();
    },
    onError: (e) => {
      rememberClaimLost(qc, c.id, e);
      toast.error("没有认领成功", { description: errorText(e) });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["conversation", c.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["nav-summary"] });
    },
  });
  const mine = c.claimedBy?.id === me.data?.active.membershipId;
  const stateText =
    c.handlingState === "human"
      ? c.claimedBy
        ? mine
          ? "我处理中"
          : `${c.claimedBy.name} 处理中`
        : "平台后台已有人回复"
      : c.handlingState === "bot"
        ? d.draft
          ? "AI 草稿待审"
          : "AI 接待中"
        : c.handlingState === "awaiting_human"
          ? `待认领${c.handoffReason ? ` · ${HANDOFF_LABEL[c.handoffReason] ?? c.handoffReason}` : ""}`
          : "已结束";

  return (
    <div className="shrink-0 border-b border-border px-4 pt-3 pb-3">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon-sm" className="md:hidden">
          <Link href={listHref} aria-label="返回会话列表">
            <ChevronLeftIcon />
          </Link>
        </Button>
        <Avatar name={c.buyerName} />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="min-w-0 truncate font-semibold">{c.buyerName}</span>
              </TooltipTrigger>
              <TooltipContent>{c.buyerName}</TooltipContent>
            </Tooltip>
            <PlatformTag platform={c.shop.platform} market={c.shop.market} className="hidden shrink-0 sm:inline-flex" />
            {c.buyerKind === "affiliate" && <span className="text-xs text-muted-foreground">达人会话</span>}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {c.shop.name} · {stateText}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {d.permissions.canClaim && (
            <Button size="sm" variant="outline" disabled={claim.isPending} onClick={() => claim.mutate()}>
              <HandIcon />
              认领
            </Button>
          )}
          {d.permissions.canTransfer && (
            <IconAction label={c.claimedBy && !mine ? "改派给其他同事" : "转交给同事"} onClick={() => set({ dialog: "transfer" }, "push")}>
              <UserPlusIcon />
            </IconAction>
          )}
          {d.permissions.canClose && (
            <IconAction label={c.shop.platform === "tiktok" ? "结束会话（同步结束 TikTok 会话）" : "结束会话（Shopee 没有结束会话接口，只在 Shopilot 内结束）"} onClick={() => set({ dialog: "end" }, "push")}>
              <CircleCheckIcon />
            </IconAction>
          )}
          <IconAction label="建工单" onClick={() => set({ dialog: "ticket" }, "push")}>
            <ClipboardListIcon />
          </IconAction>
          {/* 右栏并排时（工作台宽度够放三栏，见 BuyerColumn）不需要抽屉入口 */}
          <IconAction label="买家与订单" className="@min-[68rem]/wb:hidden" onClick={() => set({ panel: "buyer" }, "push")}>
            <PanelRightIcon />
          </IconAction>
        </div>
      </div>
      {(c.waitingSinceSec !== null || c.shop.status !== "connected") && (
        <div className={cn("mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground")}>
          {c.waitingSinceSec !== null && (
            <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", c.overdue && "text-(--semantic-color-feedback-warning)")}>
              {c.overdue ? <TriangleAlertIcon className="size-3.5" aria-hidden="true" /> : <TimerIcon className="size-3.5" aria-hidden="true" />}
              {c.waitingSinceSec < 60 ? "买家等待不到 1 分钟" : `买家已等 ${waitText(c.waitingSinceSec)}`}
              {c.overdue ? "，超过接待时限" : ""}
            </span>
          )}
          {c.waitingSinceSec !== null && <span className="whitespace-nowrap">接待时限 {c.responseSlaMinutes} 分钟（商户设置）</span>}
          {c.shop.status !== "connected" && (
            <span className="inline-flex items-center gap-1 text-destructive">
              <TriangleAlertIcon className="size-3.5" aria-hidden="true" />
              {c.shop.status === "disconnected" ? "店铺已断开，暂时不能发送" : "店铺授权已失效，暂时不能发送"}
            </span>
          )}
          {c.lastBuyerAt && c.waitingSinceSec === null && <span>买家最后发言 {inTz(c.lastBuyerAt, tz, "MM-dd HH:mm")}</span>}
        </div>
      )}
    </div>
  );
}

function IconAction({ label, onClick, children, className }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label={label} onClick={onClick} className={className}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Footer({ d, editing, onDoneEditing, onCancelEditing }: { d: ConversationDetail; editing: EditingDraft; onDoneEditing: () => void; onCancelEditing: () => void }) {
  const c = d.conversation;
  let reason: string | null = null;
  if (c.handlingState === "closed") reason = "会话已结束。买家再发消息时会开新的会话段，按当时的接待模式进入 AI 或待认领。";
  else if (c.shop.status === "disconnected") reason = "店铺已断开，管理员在「店铺与连接」重新授权后恢复发送。";
  else if (!d.permissions.canSend || !c.canReply)
    reason = c.replyBlockedReason ?? (c.handlingState === "human" ? `${c.claimedBy ? `${c.claimedBy.name} ` : "平台后台"}正在处理，只有处理人能发送。` : "当前角色不能在这个会话里发送。");
  if (reason) {
    return (
      <div className="shrink-0 border-t border-border px-4 py-3">
        <p className="text-sm text-muted-foreground">{reason}</p>
        <UnsentReply id={c.id} className="mt-2" />
      </div>
    );
  }
  return <Composer detail={d} editing={editing} onDoneEditing={onDoneEditing} onCancelEditing={onCancelEditing} />;
}
