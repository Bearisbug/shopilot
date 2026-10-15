"use client";

// 回复输入框里输入 `/` 唤起快捷回复：输入框是 combobox，菜单锚在输入框上方，焦点始终留在输入框。
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { QuickReply, QuickReplyList } from "@/contracts/reception";
import { Button } from "@/components/ui/button";
import { PopoverContent } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError, errorText } from "@/lib/api";
import { cn } from "@/lib/utils";
import { REPLY_TAB_LABEL } from "./wb-dialogs";

/** 光标所在的 `/` 片段的起点：`/` 在开头或紧跟空白之后，且 `/` 到光标之间没有空白；`a/b`、网址里的 `/` 不算 */
function slashAt(text: string, caret: number): number | null {
  let i = caret;
  while (i > 0 && !/\s/.test(text[i - 1])) i--;
  return i < caret && text[i] === "/" ? i : null;
}

/** 把光标行滚进框内（INT-010）：脚本插入与 setSelectionRange 都不会像键盘输入那样自动滚动。
    用同宽同样式的隐形副本量出光标前文字的高度 */
function revealCaret(el: HTMLTextAreaElement) {
  const probe = el.cloneNode() as HTMLTextAreaElement;
  probe.removeAttribute("id");
  probe.style.cssText = `position:absolute;visibility:hidden;height:0;min-height:0;width:${el.offsetWidth}px`;
  probe.value = el.value.slice(0, el.selectionEnd);
  el.after(probe);
  const bottom = probe.scrollHeight;
  probe.remove();
  if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
}

type Slash = { start: number; caret: number; active: number };

export function useSlashReplies({ text, stage }: { text: string; stage: string | undefined }) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [slash, setSlash] = useState<Slash | null>(null);
  // 按 Esc 或点外面关掉的片段：在它里面接着打字不再弹出，删掉或换一个 `/` 后恢复
  const dismissed = useRef<number | null>(null);
  // 输入法组字中框里是拼音等中间态：不打开菜单、不更新查询词，组字结束后再对齐
  const composing = useRef(false);
  const listId = useId();
  const open = slash !== null;

  const replies = useQuery({ queryKey: ["quick-replies"], queryFn: () => api.get<QuickReplyList>("/api/v1/quick-replies"), enabled: open });
  const query = slash ? text.slice(slash.start + 1, slash.caret) : "";
  const q = query.toLowerCase();
  const rank = (r: QuickReply) => (r.stage === stage ? 0 : r.stage === "any" ? 1 : 2);
  const items = (replies.data?.items ?? []).filter((r) => r.title.toLowerCase().includes(q) || r.text.toLowerCase().includes(q)).sort((a, b) => rank(a) - rank(b));
  const current = slash && items.length ? Math.min(slash.active, items.length - 1) : -1;
  const optionId = (i: number) => `${listId}-${i}`;

  /** 输入或光标变化后对齐菜单：typed 为真（打字、组字结束）才会打开，光标移动只会更新或关闭 */
  const sync = (el: HTMLTextAreaElement, typed: boolean) => {
    if (composing.current) return;
    const caret = el.selectionStart;
    const start = caret === el.selectionEnd ? slashAt(el.value, caret) : null;
    if (start === null) dismissed.current = null;
    const blocked = dismissed.current;
    setSlash((m) => {
      if (start === null) return null;
      if (m?.start === start) return m.caret === caret ? m : { start, caret, active: 0 };
      return typed && start !== blocked ? { start, caret, active: 0 } : null;
    });
  };

  const dismiss = () => {
    if (slash) dismissed.current = slash.start;
    setSlash(null);
  };

  /** 用快捷回复正文替换 `/查询词`，光标落在插入文字之后。用 execCommand 插入：触发正常的 input 事件，⌘Z 可撤销 */
  const pick = (r: QuickReply) => {
    const el = inputRef.current;
    if (!slash || !el) return;
    el.focus();
    el.setSelectionRange(slash.start, slash.caret);
    document.execCommand("insertText", false, r.text);
    revealCaret(el);
    setSlash(null);
  };

  /** 菜单打开时接管 ↑↓、Enter、Tab、⌘/Ctrl+Enter；返回 true 表示已处理。组字中一律放行 */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!slash || e.nativeEvent.isComposing || e.keyCode === 229) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length) return false;
      e.preventDefault();
      const next = (current + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      setSlash({ ...slash, active: next });
      document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" });
      return true;
    }
    const send = e.key === "Enter" && (e.metaKey || e.ctrlKey);
    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
      if (current >= 0) {
        e.preventDefault();
        pick(items[current]);
        return true;
      }
      // 没有可插入的项：⌘/Ctrl+Enter 也不发送，普通 Enter、Tab 照常
      if (send) e.preventDefault();
      return send;
    }
    return false;
  };

  const inputProps = {
    ref: inputRef,
    role: "combobox",
    "aria-autocomplete": "list" as const,
    "aria-expanded": open,
    "aria-controls": listId,
    "aria-activedescendant": current >= 0 ? optionId(current) : undefined,
    onSelect: (e: React.SyntheticEvent<HTMLTextAreaElement>) => sync(e.currentTarget, false),
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (e: React.CompositionEvent<HTMLTextAreaElement>) => {
      composing.current = false;
      sync(e.currentTarget, true);
    },
    onBlur: () => setSlash(null),
  };

  return { open, dismiss, sync, onKeyDown, inputProps, inputRef, replies, items, current, query, listId, optionId, pick, setActive: (i: number) => setSlash((m) => (m && m.active !== i ? { ...m, active: i } : m)) };
}

type SlashState = ReturnType<typeof useSlashReplies>;

/** 菜单本体；放在 <Popover open={slash.open}> 里、输入框作 PopoverAnchor。键盘唤起，开合不加动画（MOTION-010） */
export function SlashRepliesContent({ slash, canManage }: { slash: SlashState; canManage: boolean }) {
  const { replies, items, current } = slash;
  const all = replies.data?.items ?? [];
  return (
    <PopoverContent
      side="top"
      align="start"
      sideOffset={6}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onCloseAutoFocus={(e) => e.preventDefault()}
      onEscapeKeyDown={(e) => {
        if (e.isComposing) e.preventDefault();
      }}
      // 点在输入框里交给光标判断（移出片段才关），不按「点外面」关
      onInteractOutside={(e) => {
        if (e.target instanceof Node && slash.inputRef.current?.contains(e.target)) e.preventDefault();
      }}
      // 点菜单任何位置都不让输入框失焦
      onMouseDown={(e) => e.preventDefault()}
      className="max-h-[min(22rem,var(--radix-popover-content-available-height))] w-(--radix-popover-trigger-width) gap-0 p-1 data-[state=closed]:animate-none data-[state=open]:animate-none"
    >
      <p aria-hidden="true" className="flex items-center justify-between gap-3 px-2.5 pt-1 pb-1.5 text-xs whitespace-nowrap text-muted-foreground">
        <span className="font-medium text-foreground">快捷回复</span>
        <span className="pointer-coarse:hidden">↑↓ 选择 · Enter 插入 · Esc 关闭</span>
      </p>
      {replies.isPending ? (
        <div aria-busy="true" aria-label="加载中" className="flex flex-col gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-1.5 px-2.5 py-2">
              <Skeleton className="h-4 w-1/3 motion-reduce:animate-none" />
              <Skeleton className="h-3.5 w-4/5 motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      ) : replies.isError ? (
        <div role="alert" className="flex items-center gap-3 px-2.5 py-2 text-sm">
          <p className="min-w-0 flex-1">
            快捷回复没有加载出来。
            <span className="text-muted-foreground">{replies.error instanceof ApiError ? errorText(replies.error) : "网络或服务暂时不可用。"}</span>
          </p>
          <Button variant="outline" size="xs" className="shrink-0" onClick={() => replies.refetch()}>
            重试
          </Button>
        </div>
      ) : all.length === 0 ? (
        <div className="flex flex-col items-start gap-1 px-2.5 py-2 text-sm">
          <p className="font-medium">没有快捷回复</p>
          <p className="text-muted-foreground">{canManage ? "快捷回复在「接待设置 · 语气与提示词」里添加。" : "请管理员在「接待设置」里添加。"}</p>
          {canManage && (
            <Button asChild variant="outline" size="xs" className="mt-1">
              <Link href="/reception/prompts">去添加快捷回复</Link>
            </Button>
          )}
        </div>
      ) : items.length === 0 ? (
        <p className="px-2.5 py-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">没有匹配「{slash.query}」的快捷回复</p>
      ) : null}
      {/* 菜单打开期间 listbox 一直在（aria-controls 指向它），没有可选项时为空 */}
      <ul id={slash.listId} role="listbox" aria-label="快捷回复" className="scroll-y min-h-0 flex-1">
        {items.map((r, i) => (
          <li
            key={r.id}
            id={slash.optionId(i)}
            role="option"
            aria-selected={i === current}
            // 触屏没有悬停：只跟随鼠标移动换高亮（INT-006）
            onPointerMove={(e) => e.pointerType === "mouse" && slash.setActive(i)}
            onClick={() => slash.pick(r)}
            // 高亮只认 current 一处（INT-015）；方向键高频换行，高亮不带过渡（MOTION-010）
            className={cn("state-layer flex cursor-default flex-col gap-0.5 rounded-md px-2.5 py-2 after:transition-none", i === current ? "is-hover" : "hover:after:opacity-0")}
          >
            <span className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{REPLY_TAB_LABEL[r.stage]}</span>
            </span>
            <span className="truncate text-xs text-muted-foreground">{r.text}</span>
          </li>
        ))}
      </ul>
    </PopoverContent>
  );
}
