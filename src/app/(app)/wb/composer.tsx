"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, InfoIcon, LayoutGridIcon, LoaderCircleIcon, SendIcon, TicketPercentIcon, XIcon, ZapIcon } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { ConversationDetail, DraftItem, MessageItem, SendBody } from "@/contracts/conversations";
import type { QuickReply, QuickReplyLang } from "@/contracts/reception";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMe } from "@/hooks/use-me";
import { api, ApiError, errorText, newKey } from "@/lib/api";
import { acceptFiles, IMAGE_RULE, MEDIA_RULE, runPlan, sendPlan } from "@/lib/attachments";
import { quickReplyInsert } from "@/lib/quick-reply";
import { AttachmentStrip, useAttachments, type Attachment } from "./composer-attachments";
import { SlashRepliesContent, useSlashReplies } from "./slash-replies";
import { usePretranslate, type Pretranslation } from "./use-pretranslate";
import { CardsDialog, CouponsDialog, RepliesDialog } from "./wb-dialogs";
import { AiTag, Citations, LANG_LABEL, STAGE_LABEL, useBuyer, useReplyText, useSend, useWbParams } from "./wb-shared";

const LANGS = ["ms", "en", "th", "vi", "id", "tl", "zh"] as const;
/** Shopee 视频在后台传到平台并等平台处理（DESIGN §15：≤120 秒），处理完才发下一条，保证平台上的顺序 */
const VIDEO_WAIT_MS = 150_000;
const VIDEO_POLL_MS = 2_500;
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
const readSession = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

function useTranslateTo(id: string, fallback: string): [string, (lang: string) => void] {
  const saved = useSyncExternalStore(subscribeTranslate, () => readSession(translateKey(id)), () => null);
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

// 输入框里插入了快捷回复的某个语言版本：这条草稿发送时不翻译。按会话存，切走再回来仍在；发出或清空后删除
const draftLangKey = (id: string) => `wb-draft-lang:${id}`;

function useDraftLang(id: string): [QuickReplyLang | null, (lang: QuickReplyLang | null) => void] {
  const saved = useSyncExternalStore(subscribeTranslate, () => readSession(draftLangKey(id)), () => null);
  const value = saved && LANGS.includes(saved as (typeof LANGS)[number]) ? (saved as QuickReplyLang) : null;
  const set = (lang: QuickReplyLang | null) => {
    if (lang === value) return;
    try {
      if (lang) sessionStorage.setItem(draftLangKey(id), lang);
      else sessionStorage.removeItem(draftLangKey(id));
    } catch {
      // 存储不可用：本条照常翻译
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
  const [draftLang, setDraftLang] = useDraftLang(c.id);
  // 本条实际的发送前翻译：插入了某个语言版本的快捷回复就不翻译
  const sendLang = draftLang ? "none" : translateTo;
  const pre = usePretranslate(text, sendLang);
  const fileRef = useRef<HTMLInputElement>(null);
  // 同一段文字重发沿用同一个 clientRequestId：结果未知（504）后再点发送，服务端按它去重，不会发两遍
  const attempt = useRef<{ text: string; key: string } | null>(null);
  const send = useSend(detail);
  const { set } = useWbParams();
  const buyer = useBuyer(c.id);
  const me = useMe();
  const canManageReplies = Boolean(me.data?.active.permissions.includes("reception.manage"));
  const resolveReply = (r: QuickReply, hasText: boolean) => quickReplyInsert(r, { target: translateTo, draftLang, hasText });
  const slash = useSlashReplies({ text, stage: detail.segment?.stage, resolve: resolveReply, onPicked: setDraftLang });
  const shopee = c.shop.platform === "shopee";
  const mediaRule = shopee ? MEDIA_RULE : IMAGE_RULE;
  const atts = useAttachments(c.id);
  const [sending, setSending] = useState(false);

  const max = detail.capabilities.maxTextLength;
  const length = Array.from(text).length;
  const over = length - max;
  const tiktok = c.shop.platform === "tiktok";
  const hasText = text.trim().length > 0;
  // 附件都上传完、没有上传失败的才能发：跳过某个附件会打乱发送顺序
  const attsReady = atts.list.every((a) => a.state === "ready" || a.state === "send_failed");
  const canSubmit = (hasText || atts.list.length > 0) && over <= 0 && !sending && attsReady;

  const clearText = () => {
    attempt.current = null;
    setText("");
    setDraftLang(null);
    onDoneEditing();
  };

  /** 发文字：译文、草稿、重发去重沿用原规则；失败抛出，让后面的附件停下 */
  async function sendText() {
    const body = text.trim();
    const clientRequestId = attempt.current?.text === body ? attempt.current.key : newKey();
    attempt.current = { text: body, key: clientRequestId };
    // 停顿时已经翻好的译文随消息带上，服务端不再同步翻译；没翻好（还在翻、失败、刚改字）由服务端照旧翻译
    const translatedText = sendLang === "none" ? undefined : pre.get(body, sendLang);
    try {
      await send.mutateAsync({
        type: "text",
        text: body,
        clientRequestId,
        translateTo: sendLang === "none" ? undefined : (sendLang as SendBody["translateTo"]),
        ...(translatedText ? { translatedText } : {}),
        ...(editing ? { draftId: editing.id, disposition: "edited_sent" as const } : {}),
      });
    } catch (e) {
      // 平台没发出但消息已存成失败气泡（带 messageId）：在气泡上重试，输入框清空，免得同一句再发一遍
      if (e instanceof ApiError && e.problem.extra?.messageId) clearText();
      throw e;
    }
    clearText();
  }

  /** 发一个附件：进了时间线就移出附件条；Shopee 视频在后台发出，等它处理完（成功或失败）再返回 */
  async function sendAttachment(a: Attachment) {
    atts.set(a.key, { state: "sending", error: null });
    let res: { message: MessageItem };
    try {
      res = await send.mutateAsync({ type: a.kind, fileId: a.fileId!, clientRequestId: a.requestKey });
    } catch (e) {
      // 已存成失败气泡的在气泡上重试，这里移除；没进时间线的（被拒、网络）留在附件条上，再点发送从它接着发
      if (e instanceof ApiError && e.problem.extra?.messageId) atts.remove(a.key);
      else atts.set(a.key, { state: "send_failed", error: errorText(e) });
      throw e;
    }
    atts.remove(a.key);
    if (a.kind === "video" && res.message.sendStatus === "sending") await waitVideo(res.message.id);
  }

  async function waitVideo(messageId: string) {
    const deadline = Date.now() + VIDEO_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, VIDEO_POLL_MS));
      const d = await api.get<ConversationDetail>(`/api/v1/conversations/${c.id}`).catch(() => null);
      const m = d?.messages.find((x) => x.id === messageId);
      if (m?.sendStatus === "sent") return;
      if (m?.sendStatus === "failed") {
        toast.error("视频没有发出", { description: "可以在时间线的气泡上重试；后面的附件先不发。" });
        throw new Error("video failed");
      }
    }
    toast.error("视频还在处理", { description: "等它发出后再点发送，后面的附件会接着发。" });
    throw new Error("video timeout");
  }

  /** 先文字、再按附件顺序逐条发；某条失败就停下，没发出的留在输入框 */
  const submit = async () => {
    if (!canSubmit) return;
    setSending(true);
    const byKey = new Map(atts.list.map((a) => [a.key, a]));
    await runPlan(sendPlan(hasText, atts.list.map((a) => a.key)), (step) => (step.kind === "text" ? sendText() : sendAttachment(byKey.get(step.key)!)));
    setSending(false);
    slash.inputRef.current?.focus();
  };

  /** 按给出的顺序把文件放进附件条，不能发的说明原因 */
  const addFiles = (files: File[]) => {
    const { accepted, errors } = acceptFiles(files, atts.list.length, shopee);
    if (errors.length) toast.error(accepted.length ? "有文件没有加入" : "没有可发的图片或视频", { description: errors.join(" ") });
    if (accepted.length) atts.add(accepted);
  };

  /** 剪贴板里有文件（截图、复制的图片）：放进附件条。同时带文字的（表格、网页片段）按文字粘贴 */
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (!files.length || e.clipboardData.getData("text/plain").trim()) return;
    e.preventDefault();
    addFiles(files);
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
                if (!e.target.value.trim()) setDraftLang(null);
                slash.sync(e.currentTarget, true);
              }}
              onPaste={onPaste}
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
            {/* 粘贴或选择的图片、视频先放这里，和文字一起发：先文字，再按这里的顺序 */}
            <AttachmentStrip list={atts.list} locked={sending} onRemove={atts.remove} onRetryUpload={atts.retryUpload} />
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
                <Tip label={`${shopee ? "添加图片或视频" : "添加图片"}（${mediaRule}；也可直接粘贴），和文字一起发`}>
                  <Button variant="ghost" size="icon-sm" aria-label={`${shopee ? "添加图片或视频" : "添加图片"}（${mediaRule}）`} onClick={() => fileRef.current?.click()} className="-ml-2">
                    <ImageIcon />
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
                <Select
                  value={sendLang}
                  onValueChange={(v) => {
                    setDraftLang(null);
                    setTranslateTo(v);
                  }}
                >
                  <SelectTrigger size="sm" aria-label="发送前翻译" className="-ml-2.5 min-w-0 border-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{draftLang ? `不翻译 · 已插入${LANG_LABEL[draftLang]}版` : "不翻译"}</SelectItem>
                    {LANGS.map((l) => (
                      <SelectItem key={l} value={l}>
                        译成{LANG_LABEL[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* 预览只占这一行剩下的宽度、单行截断：出现、消失、切换状态都不改变输入框高度 */}
                {pre.state.status !== "idle" && <SendPreview key={pre.key} state={pre.state} lang={sendLang} />}
                <span className={`ml-auto text-xs whitespace-nowrap tabular-nums ${over > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {length.toLocaleString("en-US")} / {max.toLocaleString("en-US")}
                </span>
                <Tip label="发送（⌘ / Ctrl + Enter）">
                  <Button size="icon-sm" variant="outline" aria-label={sending ? "发送中" : "发送"} disabled={!canSubmit} onClick={submit}>
                    {sending ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
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
        multiple
        accept={shopee ? "image/jpeg,image/png,image/webp,video/mp4" : "image/jpeg,image/png,image/webp"}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) addFiles(files);
        }}
      />
      <RepliesDialog
        stage={detail.segment?.stage ?? "unknown"}
        canManage={canManageReplies}
        resolve={(r) => resolveReply(r, text.trim().length > 0)}
        onPick={(r) => {
          const v = resolveReply(r, text.trim().length > 0);
          setDraftLang(v.draftLang);
          setText(text.trim() ? `${text}\n${v.text}` : v.text);
        }}
      />
      {tiktok && <CardsDialog detail={detail} orders={buyer.data?.orders ?? []} />}
      {tiktok && detail.capabilities.coupons && <CouponsDialog detail={detail} />}
    </div>
  );
}

/**
 * 工具栏里「将发送」的译文预览：单行截断，点开在浮层里看全文；翻译中、失败只给一句说明。
 * 盒子窄于 24rem（手机宽度）时只留「将发送」标签，点开看全文。
 * contain:inline-size 让预览不按译文长度撑宽工具栏：只占剩下的宽度，工具栏换不换行与有无预览无关，输入框高度不跳。
 */
function SendPreview({ state, lang }: { state: Exclude<Pretranslation, { status: "idle" }>; lang: string }) {
  const label = (
    <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
      将发送
    </Badge>
  );
  if (state.status !== "done") {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-xs text-muted-foreground [contain:inline-size]">
        {label}
        <span className="truncate @max-sm/composer:sr-only">{state.status === "pending" ? "翻译中…" : "预翻译没成功，发送时再翻译"}</span>
      </span>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="focus-ring flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 overflow-hidden rounded-sm text-left text-xs text-muted-foreground [contain:inline-size]">
          {label}
          <span lang={lang} className="truncate @max-sm/composer:sr-only">
            {state.text}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-80 max-w-[calc(100vw-1.5rem)] text-sm">
        <p className="mb-1.5 text-xs text-muted-foreground">将发送给买家的译文</p>
        <p lang={lang} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
          {state.text}
        </p>
      </PopoverContent>
    </Popover>
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
