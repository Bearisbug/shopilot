"use client";

// 工作台共用：URL 状态、查询键、显示用的小组件与文案。
import { type InfiniteData, type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { BuyerPanel, ConversationDetail, ConversationList, ConversationListItem, ConvView, DraftCitationItem, HandlingState, ProductCardInfo, SendBody, SendResult, Stage } from "@/contracts/conversations";
import { Avatar as AvatarRoot, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useCan } from "@/hooks/use-me";
import { api, ApiError, errorText, newKey } from "@/lib/api";
import { cn } from "@/lib/utils";

export const VIEW_LABEL: Record<ConvView, string> = { queue: "待认领", ai: "AI 草稿", mine: "我处理中", team: "他人处理中", done: "已结束" };
export const STAGE_LABEL: Record<Stage, string> = { presale: "售前", insale: "售中", aftersale: "售后", unknown: "未确认" };
export const STATE_LABEL: Record<HandlingState, string> = { bot: "AI 接待中", awaiting_human: "待认领", human: "处理中", closed: "已结束" };
export const HANDOFF_LABEL: Record<string, string> = {
  keyword: "命中转人工关键词",
  low_confidence: "AI 置信度低",
  non_text: "非文本消息",
  model_error: "模型出错",
  timeout: "模型超时",
  send_failed: "发送失败",
  human_request: "买家要求人工",
  policy: "超出 AI 可处理范围",
  quota: "出稿用量已满",
  manual: "人工转交",
  shop_off: "店铺未开 AI",
  shadow: "影子模式",
  platform_human: "平台后台已有人回复",
};
export const LANG_LABEL: Record<string, string> = { ms: "马来语", en: "英语", th: "泰语", vi: "越南语", id: "印尼语", tl: "菲律宾语", zh: "中文" };

const isGone = (e: unknown) => e instanceof ApiError && e.status === 404;
// 页面在后台时暂停；确认 404（会话看不到了）后停止轮询，换一个会话是另一个查询，照常轮询
const POLL = (ms: number) => (query: { state: { error: unknown } }) => ((typeof document !== "undefined" && document.visibilityState === "hidden") || isGone(query.state.error) ? false : ms);

const conversationQuery = (id: string) => queryOptions({ queryKey: ["conversation", id], queryFn: () => api.get<ConversationDetail>(`/api/v1/conversations/${id}`) });
const buyerQuery = (id: string) => queryOptions({ queryKey: ["conversation", id, "buyer"], queryFn: () => api.get<BuyerPanel>(`/api/v1/conversations/${id}/buyer`) });

export function useConversation(id: string) {
  return useQuery({ ...conversationQuery(id), refetchInterval: POLL(2_000) });
}

export function useBuyer(id: string) {
  return useQuery({ ...buyerQuery(id), refetchInterval: POLL(10_000) });
}

/** 悬停、聚焦或按下会话行时先取详情与买家侧栏，点开时多半已经到了；缓存还新鲜就不重取 */
export function prefetchConversation(qc: QueryClient, id: string) {
  void qc.prefetchQuery(conversationQuery(id));
  void qc.prefetchQuery(buyerQuery(id));
}

/** 会话列表缓存里的这一行：详情还没到时，会话头先用它占位 */
export function listItemFor(qc: QueryClient, id: string): ConversationListItem | undefined {
  for (const [, data] of qc.getQueriesData<InfiniteData<ConversationList>>({ queryKey: ["conversations"] })) {
    for (const page of data?.pages ?? []) {
      const hit = page.items.find((x) => x.id === id);
      if (hit) return hit;
    }
  }
  return undefined;
}

// 点下会话行到新会话的路由就位之间，旧会话会停在原处（路由载荷要一次往返）：先记下点的是哪一行，工作台立刻换成它的占位。
// from 是点击时选中的会话；地址一离开 from（到了目标或别处）就清掉
type PendingOpen = { item: ConversationListItem; from: string | null };
let pendingOpen: PendingOpen | null = null;
const pendingListeners = new Set<() => void>();
export function setPendingOpen(next: PendingOpen | null) {
  pendingOpen = next;
  for (const l of pendingListeners) l();
}
export function usePendingOpen() {
  return useSyncExternalStore(
    (cb) => {
      pendingListeners.add(cb);
      return () => pendingListeners.delete(cb);
    },
    () => pendingOpen,
    () => null,
  );
}

/** 「获取中」的商品卡每 2 秒查一次进度；没有获取中的就停（会话详情的 2 秒轮询照常） */
export function useProductProgress(id: string, ids: string[]) {
  const key = ids.join(",");
  return useQuery({
    queryKey: ["conversation", id, "products", key],
    queryFn: () => api.get<{ products: Record<string, ProductCardInfo> }>(`/api/v1/conversations/${id}/products?ids=${encodeURIComponent(key)}`),
    enabled: ids.length > 0,
    refetchInterval: (query) => (query.state.data && !Object.values(query.state.data.products).some((p) => p.state === "loading") ? false : POLL(2_000)(query)),
  });
}

export const listPoll = POLL(3_000);

/** 工作台的查询参数（view、platform、shop、dialog、panel）读写；参数微调用 replace（INT-020） */
export function useWbParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = (patch: Record<string, string | null>, mode: "push" | "replace" = "replace") => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (mode === "push") router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  };
  /** 切换会话时保留列表筛选，去掉弹层与抽屉 */
  const hrefFor = (conversationId: string) => {
    const next = new URLSearchParams(params.toString());
    next.delete("dialog");
    next.delete("panel");
    next.delete("orderDetail");
    const qs = next.toString();
    return `/wb/${conversationId}${qs ? `?${qs}` : ""}`;
  };
  return { params, set, hrefFor };
}

export function PlatformTag({ platform, market, className }: { platform: "shopee" | "tiktok"; market: string; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-sm border border-border px-1.5 text-xs whitespace-nowrap text-muted-foreground", className)}>
      {platform === "shopee" ? "Shopee" : "TikTok"} · {market}
    </span>
  );
}

/** 「AI」小标：可可底 + 反白字（brand/DESIGN.md 角色用法） */
export function AiTag({ className }: { className?: string }) {
  return <span className={cn("inline-flex h-5 items-center rounded-sm bg-(--semantic-color-surface-inverse) px-1.5 text-xs font-semibold text-(--semantic-color-text-on-inverse)", className)}>AI</span>;
}

/**
 * 草稿依据（REQ-KB-006）：「依据：问答「…」、《A》」，只给成员看。
 * 能管理知识库的成员（knowledge.manage）点开在新标签打开问答或资料抽屉；问答已下架或删除、资料已删除、或没有知识库权限时只显示名字
 */
export function Citations({ items, className }: { items: DraftCitationItem[]; className?: string }) {
  const can = useCan();
  if (items.length === 0) return null;
  const canOpen = can("knowledge.manage");
  return (
    <p className={cn("text-xs text-muted-foreground [overflow-wrap:anywhere]", className)}>
      依据：
      {items.map((c, i) => {
        const qa = c.kind === "qa";
        const label = qa ? `问答「${c.name}」` : `《${c.name}》`;
        return (
          <Fragment key={`${c.kind}:${c.qaId ?? c.documentId}`}>
            {i > 0 && "、"}
            {c.available && canOpen ? (
              <a href={qa ? `/reception/knowledge?tab=qa&qa=${c.qaId}` : `/reception/knowledge?tab=docs&doc=${c.documentId}`} target="_blank" rel="noopener" className="focus-ring rounded-sm font-medium text-(--semantic-color-text-link)">
                {label}
                <span className="sr-only">（在新标签打开）</span>
              </a>
            ) : (
              <span className="text-foreground">
                {label}
                {!c.available && (qa ? <span className="text-muted-foreground">（已下架）</span> : <span className="sr-only">（资料已删除）</span>)}
              </span>
            )}
          </Fragment>
        );
      })}
    </p>
  );
}

/** 买家头像：平台给了地址就显示图片，没有、加载中或加载失败（TikTok 的 CDN 链接会过期）时显示名字首字。名字已在旁边写出，头像本身对读屏隐藏 */
export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const ch = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <AvatarRoot aria-hidden="true" className={cn("size-8 after:hidden", className)}>
      {src && <AvatarImage src={src} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">{ch}</AvatarFallback>
    </AvatarRoot>
  );
}

export function waitText(sec: number | null): string {
  if (sec === null) return "";
  if (sec < 60) return "不到 1 分钟";
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} 小时${m % 60 ? ` ${m % 60} 分` : ""}`;
  return `${Math.floor(h / 24)} 天`;
}

/** 前缀接时长：不到 1 分钟时前缀与「不到」之间不留空格（「剩不到 1 分钟」） */
function withDuration(prefix: string, sec: number): string {
  return sec < 60 ? `${prefix}不到 1 分钟` : `${prefix} ${waitText(sec)}`;
}

/** 列表行的等待时长：「等待不到 1 分钟」「等 4 分钟」 */
export function waitedText(sec: number): string {
  return sec < 60 ? "等待不到 1 分钟" : `等 ${waitText(sec)}`;
}

export function remainText(iso: string | null, now: number): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - now;
  if (ms < 0) return withDuration("超时", Math.floor(-ms / 1000));
  return withDuration("剩", Math.floor(ms / 1000));
}

// ── 回复输入框的内容：按会话存进 sessionStorage，输入框卸载（改派、认领冲突、刷新）后不丢 ──

const replyKey = (id: string) => `wb-reply:${id}`;
const replyListeners = new Set<() => void>();
const subscribeReply = (cb: () => void) => {
  replyListeners.add(cb);
  return () => {
    replyListeners.delete(cb);
  };
};

export function readReply(id: string): string {
  return sessionStorage.getItem(replyKey(id)) ?? "";
}

export function writeReply(id: string, text: string) {
  if (text) sessionStorage.setItem(replyKey(id), text);
  else sessionStorage.removeItem(replyKey(id));
  replyListeners.forEach((l) => l());
}

export function useReplyText(id: string): [string, (text: string) => void] {
  const text = useSyncExternalStore(subscribeReply, () => readReply(id), () => "");
  return [text, (t) => writeReply(id, t)];
}

/** 把焦点交给回复输入框，光标放到末尾（TC-CONV-010）；等本帧渲染完再聚焦 */
export function focusReply() {
  requestAnimationFrame(() => {
    const el = document.getElementById("wb-reply");
    if (!(el instanceof HTMLTextAreaElement)) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
}

/** 已有数据时轮询失败：不替换内容，只给一条提示与「重试」 */
export function PollErrorBar({ onRetry, className }: { onRetry: () => void; className?: string }) {
  return (
    <div role="status" className={cn("flex items-center gap-2 rounded-md bg-(--semantic-color-surface-warm) px-3 py-1.5 text-xs", className)}>
      <span className="min-w-0 flex-1">连接中断，正在重试；下面显示的是断开前的内容。</span>
      <Button variant="ghost" size="xs" className="shrink-0" onClick={onRetry}>
        重试
      </Button>
    </div>
  );
}

/** 物流轨迹里时间最新的一条（平台返回的顺序不可靠，不取 events[0]） */
export function latestEvent<T extends { at: string }>(events: T[]): T | null {
  return events.reduce<T | null>((a, b) => (!a || new Date(b.at) > new Date(a.at) ? b : a), null);
}

/** 认领或发送撞上 409「已被 X 认领」时记下胜者：员工随后看不到这个会话（§10），对话栏据此说明去向 */
export function rememberClaimLost(qc: QueryClient, id: string, e: unknown) {
  const by = e instanceof ApiError && e.status === 409 ? (e.problem.extra?.claimedBy as { name?: string } | undefined)?.name : undefined;
  if (by) qc.setQueryData(["claim-lost", id], by);
}

/** 发送：成功后刷新会话与列表；409 时提示并刷新（会话已被他人认领或已结束）；502 / 504 时失败消息留在时间线上可重试 */
export function useSend(detail: ConversationDetail) {
  const qc = useQueryClient();
  const id = detail.conversation.id;
  return useMutation({
    mutationFn: (body: Omit<SendBody, "clientRequestId"> & { clientRequestId?: string }) =>
      api.post<SendResult>(`/api/v1/conversations/${id}/messages`, { clientRequestId: body.clientRequestId ?? newKey(), ...body }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["conversation", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["nav-summary"] });
    },
    onError: (e) => {
      rememberClaimLost(qc, id, e);
      toast.error(e instanceof ApiError && e.status === 409 ? "没有发出" : "发送失败", { description: errorText(e) });
    },
  });
}
