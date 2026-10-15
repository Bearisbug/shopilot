"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, InfoIcon, LayoutGridIcon, LoaderCircleIcon, SendIcon, TicketPercentIcon, XIcon, ZapIcon } from "lucide-react";
import { useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { ConversationDetail, DraftItem, SendBody, UploadedFile } from "@/contracts/conversations";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMe } from "@/hooks/use-me";
import { api, ApiError, errorText, newKey } from "@/lib/api";
import { SlashRepliesContent, useSlashReplies } from "./slash-replies";
import { CardsDialog, CouponsDialog, RepliesDialog } from "./wb-dialogs";
import { AiTag, Citations, LANG_LABEL, STAGE_LABEL, useBuyer, useReplyText, useSend, useWbParams } from "./wb-shared";

const LANGS = ["ms", "en", "th", "vi", "id", "tl", "zh"] as const;
const IMAGE_RULE = "JPG、PNG、WebP，不超过 10 MB";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** 买家语言未知时按店铺站点预选翻译目标；新加坡、菲律宾买家多用英语 */
const MARKET_LANG: Record<string, (typeof LANGS)[number]> = { MY: "ms", TH: "th", VN: "vi", ID: "id", PH: "en", SG: "en" };

/** 默认翻译目标：买家语言已知就用它（中文不翻译），否则按店铺站点 */
function defaultTranslate(c: ConversationDetail["conversation"]): string {
  const lang = c.buyerLanguage;
  if (lang?.startsWith("zh")) return "none";
  if (lang && LANGS.includes(lang as (typeof LANGS)[number])) return lang;
  return MARKET_LANG[c.shop.market.toUpperCase()] ?? "none";
}

// 手动改过的翻译目标按会话存进 sessionStorage：切走再回来、刷新都保留；改回默认即删除
const translateKey = (id: string) => `wb-translate:${id}`;
const translateListeners = new Set<() => void>();
const subscribeTranslate = (cb: () => void) => {
  translateListeners.add(cb);
  return () => {
    translateListeners.delete(cb);
  };
};
const readTranslate = (id: string) => {
  try {
    return sessionStorage.getItem(translateKey(id));
  } catch {
    return null;
  }
};

function useTranslateTo(id: string, fallback: string): [string, (lang: string) => void] {
  const saved = useSyncExternalStore(subscribeTranslate, () => readTranslate(id), () => null);
  const value = saved && (saved === "none" || LANGS.includes(saved as (typeof LANGS)[number])) ? saved : fallback;
  const set = (lang: string) => {
    try {
      if (lang === fallback) sessionStorage.removeItem(translateKey(id));
      else sessionStorage.setItem(translateKey(id), lang);
    } catch {
      // 存储不可用（无痕、配额满）：只是不记住手动选择
    }
    translateListeners.forEach((l) => l());
  };
  return [value, set];
}

/** 待审草稿：原样发送 / 改后发送 / 忽略（11.2）；未认领时「发送」即认领并发送 */
export function DraftCard({ detail, draft, onEdit }: { detail: ConversationDetail; draft: DraftItem; onEdit: (d: DraftItem) => void }) {
  const qc = useQueryClient();
  const send = useSend(detail);
  const ignore = useMutation({
    mutationFn: () => api.post(`/api/v1/conversations/${detail.conversation.id}/drafts/${draft.id}/ignore`, {}),
    onSuccess: () => {
      toast.success("已忽略草稿", { description: detail.conversation.handlingState === "bot" ? "会话转为待认领。" : undefined });
      qc.invalidateQueries({ queryKey: ["conversation", detail.conversation.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const claimed = detail.conversation.handlingState === "human";
  const can = detail.permissions.canSend && detail.conversation.canReply;
  return (
    <div className="mx-4 mb-2 shrink-0 rounded-lg bg-(--semantic-color-surface-warm) px-4 py-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <AiTag />
        <span className="font-medium text-foreground">AI 草稿</span>
        <span>{STAGE_LABEL[detail.segment?.stage ?? "unknown"]}</span>
        <span>
          置信度 <span className="tabular-nums">{draft.confidence.toFixed(2)}</span>
        </span>
      </p>
      <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{draft.text}</p>
      <Citations items={draft.citations} className="mt-2" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!can || send.isPending} onClick={() => send.mutate({ type: "text", text: draft.text, draftId: draft.id, disposition: "sent" })}>
          {send.isPending ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
          {claimed ? "发送草稿" : "认领并发送"}
        </Button>
        <Button size="sm" variant="outline" disabled={!can} onClick={() => onEdit(draft)}>
          改后发送
        </Button>
        <Button size="sm" variant="ghost" disabled={ignore.isPending} onClick={() => ignore.mutate()}>
          忽略
        </Button>
      </div>
    </div>
  );
}

/** 正在改的草稿；before 是进入编辑前输入框里的字，「不改了」时放回去 */
export type EditingDraft = { id: string; before: string } | null;

export function Composer({ detail, editing, onDoneEditing, onCancelEditing }: { detail: ConversationDetail; editing: EditingDraft; onDoneEditing: () => void; onCancelEditing: () => void }) {
  const c = detail.conversation;
  const [text, setText] = useReplyText(c.id);
  const [translateTo, setTranslateTo] = useTranslateTo(c.id, defaultTranslate(c));
  const fileRef = useRef<HTMLInputElement>(null);
  // 同一段文字重发沿用同一个 clientRequestId：结果未知（504）后再点发送，服务端按它去重，不会发两遍
  const attempt = useRef<{ text: string; key: string } | null>(null);
  const send = useSend(detail);
  const { set } = useWbParams();
  const buyer = useBuyer(c.id);
  const me = useMe();
  const canManageReplies = Boolean(me.data?.active.permissions.includes("reception.manage"));
  const slash = useSlashReplies({ text, stage: detail.segment?.stage });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.set("file", file);
      const up = await api.upload<UploadedFile>("/api/v1/files", form);
      return send.mutateAsync({ type: "image", fileId: up.id });
    },
    onError: (e) => toast.error("图片没有发出", { description: errorText(e) }),
  });

  const max = detail.capabilities.maxTextLength;
  const length = Array.from(text).length;
  const over = length - max;
  const tiktok = c.shop.platform === "tiktok";
  const busy = send.isPending || upload.isPending;
  const canSubmit = text.trim().length > 0 && over <= 0 && !busy;

  const submit = () => {
    if (!canSubmit) return;
    const body = text.trim();
    const clientRequestId = attempt.current?.text === body ? attempt.current.key : newKey();
    attempt.current = { text: body, key: clientRequestId };
    const done = () => {
      attempt.current = null;
      setText("");
      onDoneEditing();
    };
    send.mutate(
      {
        type: "text",
        text: body,
        clientRequestId,
        translateTo: translateTo === "none" ? undefined : (translateTo as SendBody["translateTo"]),
        ...(editing ? { draftId: editing.id, disposition: "edited_sent" as const } : {}),
      },
      {
        onSuccess: done,
        // 平台没发出但消息已存成失败气泡（带 messageId）：在气泡上重试，输入框清空，免得同一句再发一遍
        onError: (e) => {
          if (e instanceof ApiError && e.problem.extra?.messageId) done();
        },
      },
    );
  };

  const pickImage = (f: File) => {
    if (!IMAGE_TYPES.includes(f.type)) {
      toast.error("图片没有发出", { description: `只支持 ${IMAGE_RULE}。` });
      return;
    }
    if (f.size > IMAGE_MAX_BYTES) {
      toast.error("图片没有发出", { description: `这张图片 ${(f.size / 1024 / 1024).toFixed(1)} MB，超过 10 MB 上限。` });
      return;
    }
    upload.mutate(f);
  };

  return (
    <div className="shrink-0 px-4 pt-2 pb-4">
      <label htmlFor="wb-reply" className="sr-only">
        回复 {c.buyerName}
      </label>
      <Popover open={slash.open} onOpenChange={(o) => !o && slash.dismiss()}>
        {/* 输入盒子：提示、文字区、超限说明、工具栏共用 px-3 这一条左右缘；聚焦态只挂在盒子上（细描边换焦点色），文字区自身不出焦点环。
            焦点期间的透明 outline 只在强制颜色模式下被系统着色，兜住描边换色在该模式下失效（A11Y-008） */}
        <PopoverAnchor asChild>
          <div
            className="@container/composer rounded-lg border border-border bg-card focus-within:border-ring focus-within:outline focus-within:outline-transparent has-[[aria-invalid=true]]:border-destructive"
            // 文字区上下的留白属于盒子本身：点在这里也聚焦输入框
            onMouseDown={(e) => {
              if (e.target !== e.currentTarget) return;
              e.preventDefault();
              slash.inputRef.current?.focus();
            }}
          >
            {detail.readOnlyNotice && (
              <p role="note" className="flex items-start gap-2 px-3 pt-3 text-xs text-muted-foreground">
                <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
                {detail.readOnlyNotice}
              </p>
            )}
            {editing && (
              <p className="flex items-center gap-2 px-3 pt-2 text-xs text-muted-foreground">
                <AiTag />
                正在修改 AI 草稿，发送后记为「改后发送」
                <Button variant="ghost" size="icon-xs" aria-label="不改了" onClick={onCancelEditing}>
                  <XIcon />
                </Button>
              </p>
            )}
            <Textarea
              id="wb-reply"
              rows={1}
              value={text}
              {...slash.inputProps}
              onChange={(e) => {
                setText(e.target.value);
                slash.sync(e.currentTarget, true);
              }}
              onKeyDown={(e) => {
                if (slash.onKeyDown(e)) return;
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={translateTo === "none" ? `回复 ${c.buyerName}，输入 / 选快捷回复` : `回复 ${c.buyerName}，可写中文，发送前译成${LANG_LABEL[translateTo]}`}
              aria-invalid={over > 0 || undefined}
              aria-describedby={over > 0 ? "wb-reply-over" : undefined}
              // 写满 max-h-40 后在框内滚动，不显示滚动条（复用 globals.css 的 scroll-nav）。
              // 上下留白用外边距而不是内边距：内边距会随内容一起滚走，滚动时文字贴到盒子描边上
              className="scroll-nav mt-3 mb-2 max-h-40 min-h-11 resize-none border-0 bg-transparent px-3 py-0 leading-relaxed shadow-none focus-visible:outline-none"
            />
            {/* 超限说明单独一行、右缘与文字区对齐，窄屏不挤掉发送按钮 */}
            {over > 0 && (
              <p id="wb-reply-over" className="px-3 pb-1 text-right text-xs text-destructive tabular-nums">
                超出 {over.toLocaleString("en-US")} 字，最多 {max.toLocaleString("en-US")} 字
              </p>
            )}
            {/* 盒子窄于 24rem（手机宽度）时固定分两行：图标一行，翻译、计数、发送一行，发送始终在右下角；更宽时放不下也整组换行 */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2">
              <div className="flex items-center gap-0.5">
                {/* -ml-2 抵消 ghost 图标按钮的内边距（(32−16)/2 = 8px），图形左缘与文字左缘对齐 */}
                <Tip label={`发图片（${IMAGE_RULE}）`}>
                  <Button variant="ghost" size="icon-sm" aria-label={`发图片（${IMAGE_RULE}）`} disabled={busy} onClick={() => fileRef.current?.click()} className="-ml-2">
                    {upload.isPending ? <LoaderCircleIcon className="animate-spin" /> : <ImageIcon />}
                  </Button>
                </Tip>
                {tiktok && (
                  <Tip label="发卡片：订单、物流、退货退款">
                    <Button variant="ghost" size="icon-sm" aria-label="发卡片" onClick={() => set({ dialog: "cards" }, "push")}>
                      <LayoutGridIcon />
                    </Button>
                  </Tip>
                )}
                {tiktok && detail.capabilities.coupons && (
                  <Tip label="发优惠券">
                    <Button variant="ghost" size="icon-sm" aria-label="发优惠券" onClick={() => set({ dialog: "coupons" }, "push")}>
                      <TicketPercentIcon />
                    </Button>
                  </Tip>
                )}
                <Tip label="快捷回复（也可在输入框输入 / 唤起）">
                  <Button variant="ghost" size="icon-sm" aria-label="快捷回复（也可在输入框输入 / 唤起）" onClick={() => set({ dialog: "replies" }, "push")}>
                    <ZapIcon />
                  </Button>
                </Tip>
              </div>
              <div className="flex min-w-0 flex-auto items-center gap-2 @max-sm/composer:basis-full">
                {/* -ml-2.5 抵消触发器左内边距（pl-2.5），换到第二行时文字与输入框文字左缘对齐 */}
                <Select value={translateTo} onValueChange={setTranslateTo}>
                  <SelectTrigger size="sm" aria-label="发送前翻译" className="-ml-2.5 min-w-0 border-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不翻译</SelectItem>
                    {LANGS.map((l) => (
                      <SelectItem key={l} value={l}>
                        译成{LANG_LABEL[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className={`ml-auto text-xs whitespace-nowrap tabular-nums ${over > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {length.toLocaleString("en-US")} / {max.toLocaleString("en-US")}
                </span>
                <Tip label="发送（⌘ / Ctrl + Enter）">
                  <Button size="icon-sm" variant="outline" aria-label="发送" disabled={!canSubmit} onClick={submit}>
                    {send.isPending ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
                  </Button>
                </Tip>
              </div>
            </div>
          </div>
        </PopoverAnchor>
        <SlashRepliesContent slash={slash} canManage={canManageReplies} />
      </Popover>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) pickImage(f);
        }}
      />
      <RepliesDialog
        stage={detail.segment?.stage ?? "unknown"}
        canManage={canManageReplies}
        onPick={(t) => setText(text.trim() ? `${text}\n${t}` : t)}
      />
      {tiktok && <CardsDialog detail={detail} orders={buyer.data?.orders ?? []} />}
      {tiktok && detail.capabilities.coupons && <CouponsDialog detail={detail} />}
    </div>
  );
}

function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
