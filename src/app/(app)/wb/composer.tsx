"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, InfoIcon, LayoutGridIcon, LoaderCircleIcon, SendIcon, TicketPercentIcon, XIcon, ZapIcon } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { ConversationDetail, DraftItem, SendBody, UploadedFile } from "@/contracts/conversations";
import type { QuickReply, QuickReplyLang } from "@/contracts/reception";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMe } from "@/hooks/use-me";
import { api, ApiError, errorText, newKey } from "@/lib/api";
import { quickReplyInsert } from "@/lib/quick-reply";
import { SlashRepliesContent, useSlashReplies } from "./slash-replies";
import { CardsDialog, CouponsDialog, RepliesDialog } from "./wb-dialogs";
import { AiTag, Citations, LANG_LABEL, STAGE_LABEL, useBuyer, useReplyText, useSend, useWbParams } from "./wb-shared";

const LANGS = ["ms", "en", "th", "vi", "id", "tl", "zh"] as const;
const IMAGE_RULE = "JPG、PNG、WebP，不超过 10 MB";
const MEDIA_RULE = "JPG、PNG、WebP 图片不超过 10 MB，MP4 视频不超过 30 MB";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 30 * 1024 * 1024;
/** 一次粘贴最多发几个文件 */
const PASTE_MAX = 9;
const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${mb(n)} MB`);

type Media = { file: File; kind: "image" | "video" };

/** 能不能发、按什么发：视频只有 Shopee 能发（TikTok 客服接口没有视频上传）；返回字符串是不能发的原因 */
function checkMedia(f: File, shopee: boolean): Media | string {
  if (IMAGE_TYPES.includes(f.type)) return f.size > IMAGE_MAX_BYTES ? `图片 ${mb(f.size)} MB，超过 10 MB 上限。` : { file: f, kind: "image" };
  if (f.type.startsWith("video/")) {
    if (!shopee) return "TikTok 接口暂不支持发视频。";
    if (f.type !== "video/mp4") return "只支持 MP4 视频，MOV 等格式请先导出为 MP4。";
    return f.size > VIDEO_MAX_BYTES ? `视频 ${mb(f.size)} MB，超过 30 MB 上限。` : { file: f, kind: "video" };
  }
  if (f.type.startsWith("image/")) return `只支持 ${IMAGE_RULE}。`;
  return shopee ? "平台聊天只能发图片和 MP4 视频，PDF 等文件发不出去。" : "平台聊天只能发图片，视频、PDF 等文件发不出去。";
}
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
  const upload = useMutation({ mutationFn: (m: Media) => sendMedia(m) });
  // 粘贴的图片、视频先确认再发（误粘贴发出去收不回）；sent 是已发出的个数，running 表示正在逐个发
  const [pasted, setPasted] = useState<{ items: (Media & { preview: string })[]; sent: number; running: boolean } | null>(null);

  /** 上传后发送；视频较大，上传进度显示在提示条上。视频发送在后台进行，时间线先显示「发送中」 */
  async function sendMedia(m: Media) {
    const what = m.kind === "image" ? "图片" : "视频";
    const form = new FormData();
    form.set("file", m.file);
    const tid = m.kind === "video" ? toast.loading("视频上传中 0%") : undefined;
    let up: UploadedFile;
    try {
      up = tid
        ? await api.uploadWithProgress<UploadedFile>("/api/v1/files", form, (r) => toast.loading(`视频上传中 ${Math.round(r * 100)}%`, { id: tid }))
        : await api.upload<UploadedFile>("/api/v1/files", form);
    } catch (e) {
      toast.error(`${what}没有发出`, { description: errorText(e) });
      throw e;
    } finally {
      if (tid) toast.dismiss(tid);
    }
    // 发送这一步失败时 useSend 自己提示
    return send.mutateAsync({ type: m.kind, fileId: up.id });
  }

  const max = detail.capabilities.maxTextLength;
  const length = Array.from(text).length;
  const over = length - max;
  const tiktok = c.shop.platform === "tiktok";
  const busy = send.isPending || upload.isPending || pasted !== null;
  const canSubmit = text.trim().length > 0 && over <= 0 && !busy;

  const submit = () => {
    if (!canSubmit) return;
    const body = text.trim();
    const clientRequestId = attempt.current?.text === body ? attempt.current.key : newKey();
    attempt.current = { text: body, key: clientRequestId };
    const done = () => {
      attempt.current = null;
      setText("");
      setDraftLang(null);
      onDoneEditing();
    };
    send.mutate(
      {
        type: "text",
        text: body,
        clientRequestId,
        translateTo: sendLang === "none" ? undefined : (sendLang as SendBody["translateTo"]),
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

  const pickFile = (f: File) => {
    const m = checkMedia(f, shopee);
    if (typeof m === "string") toast.error("没有发出", { description: m });
    else upload.mutate(m);
  };

  /** 剪贴板里有文件（截图、复制的图片）：拦下来走确认发送。同时带文字的（表格、网页片段）按文字粘贴 */
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (!files.length || e.clipboardData.getData("text/plain").trim()) return;
    e.preventDefault();
    if (busy) return;
    const ok: Media[] = [];
    const bad: string[] = [];
    for (const f of files) {
      const m = checkMedia(f, shopee);
      if (typeof m === "string") bad.push(m);
      else ok.push(m);
    }
    if (ok.length > PASTE_MAX) bad.push(`一次最多发 ${PASTE_MAX} 个，只取前 ${PASTE_MAX} 个。`);
    if (bad.length) toast.error(ok.length ? "有文件不能发" : "没有可发的图片或视频", { description: [...new Set(bad)].join(" ") });
    if (ok.length) setPasted({ items: ok.slice(0, PASTE_MAX).map((m) => ({ ...m, preview: URL.createObjectURL(m.file) })), sent: 0, running: false });
  };

  const closePasted = () => {
    pasted?.items.forEach((m) => URL.revokeObjectURL(m.preview));
    setPasted(null);
  };

  /** 依次发出粘贴的文件；某个失败就停下，已发出的不撤回 */
  const sendPasted = async () => {
    if (!pasted || pasted.running) return;
    setPasted({ ...pasted, running: true });
    for (let i = pasted.sent; i < pasted.items.length; i++) {
      try {
        await sendMedia(pasted.items[i]);
      } catch {
        closePasted();
        return;
      }
      setPasted((p) => p && { ...p, sent: i + 1 });
    }
    closePasted();
    slash.inputRef.current?.focus();
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
                <Tip label={`${shopee ? "发图片或视频" : "发图片"}（${mediaRule}；也可直接粘贴）`}>
                  <Button variant="ghost" size="icon-sm" aria-label={`${shopee ? "发图片或视频" : "发图片"}（${mediaRule}）`} disabled={busy} onClick={() => fileRef.current?.click()} className="-ml-2">
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
        accept={shopee ? "image/jpeg,image/png,image/webp,video/mp4" : "image/jpeg,image/png,image/webp"}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) pickFile(f);
        }}
      />
      <ConfirmDialog
        open={pasted !== null}
        // 逐个发送期间不能关（Esc 也不行），发完自动关
        onOpenChange={(o) => !o && !pasted?.running && closePasted()}
        title={`发给 ${c.buyerName}？`}
        desc={pasted && pasted.items.length > 1 ? `从剪贴板粘贴了 ${pasted.items.length} 个文件，确认后按顺序逐个发出。` : "从剪贴板粘贴的内容，确认后发出。"}
        confirmText={pasted && pasted.items.length > 1 ? `发送 ${pasted.items.length} 个` : "发送"}
        pending={pasted?.running}
        onConfirm={sendPasted}
      >
        <PastedPreview items={pasted?.items ?? []} sent={pasted?.sent ?? 0} />
      </ConfirmDialog>
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

/** 粘贴确认里的预览：图片缩略图、视频首帧；已发出的打勾 */
function PastedPreview({ items, sent }: { items: (Media & { preview: string })[]; sent: number }) {
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {items.map((m, i) => (
        <li key={m.preview} className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
          {m.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- 本地剪贴板文件的 blob 地址，不经图片优化
            <img src={m.preview} alt={`粘贴的图片 ${i + 1}`} className="size-full object-contain" />
          ) : (
            <video src={m.preview} muted playsInline preload="metadata" aria-label={`粘贴的视频 ${i + 1}`} className="size-full object-contain" />
          )}
          <span className="absolute inset-x-0 bottom-0 truncate bg-background/85 px-1.5 py-0.5 text-[11px] text-muted-foreground tabular-nums">
            {i < sent ? "已发出" : m.kind === "video" ? `视频 · ${size(m.file.size)}` : size(m.file.size)}
          </span>
        </li>
      ))}
    </ul>
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
