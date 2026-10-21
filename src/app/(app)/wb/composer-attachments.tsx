"use client";

import { FilmIcon, LoaderCircleIcon, RotateCwIcon, XIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { UploadedFile } from "@/contracts/conversations";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, errorText, newKey } from "@/lib/api";
import type { MediaKind } from "@/lib/attachments";

/**
 * 输入框里待发送的附件。按会话放在页面内存里：切换会话再回来还在，刷新页面就没了（文件本身不进 sessionStorage）。
 * 加入时立即上传，发送时用上传得到的 fileId；requestKey 是这个附件的发送幂等键，结果未知后再点发送不会发两遍。
 */
export type Attachment = {
  key: string;
  kind: MediaKind;
  file: File;
  preview: string;
  requestKey: string;
  state: "uploading" | "ready" | "upload_failed" | "sending" | "send_failed";
  progress: number | null;
  fileId: string | null;
  error: string | null;
};

const store = new Map<string, Attachment[]>();
const listeners = new Set<() => void>();
const EMPTY: Attachment[] = [];
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

function patch(conversationId: string, key: string, change: Partial<Attachment>) {
  const list = store.get(conversationId);
  if (!list?.some((a) => a.key === key)) return;
  store.set(
    conversationId,
    list.map((a) => (a.key === key ? { ...a, ...change } : a)),
  );
  emit();
}

function upload(conversationId: string, a: Attachment) {
  const form = new FormData();
  form.set("file", a.file);
  const req =
    a.kind === "video"
      ? api.uploadWithProgress<UploadedFile>("/api/v1/files", form, (r) => patch(conversationId, a.key, { progress: r }))
      : api.upload<UploadedFile>("/api/v1/files", form);
  req.then(
    (up) => patch(conversationId, a.key, { state: "ready", fileId: up.id, progress: null, error: null }),
    (e) => patch(conversationId, a.key, { state: "upload_failed", progress: null, error: errorText(e) }),
  );
}

export function useAttachments(conversationId: string) {
  const list = useSyncExternalStore(subscribe, () => store.get(conversationId) ?? EMPTY, () => EMPTY);
  return {
    list,
    add(items: Array<{ file: File; kind: MediaKind }>) {
      const added: Attachment[] = items.map(({ file, kind }) => ({
        key: newKey(),
        kind,
        file,
        preview: URL.createObjectURL(file),
        requestKey: newKey(),
        state: "uploading",
        progress: kind === "video" ? 0 : null,
        fileId: null,
        error: null,
      }));
      store.set(conversationId, [...(store.get(conversationId) ?? []), ...added]);
      emit();
      added.forEach((a) => upload(conversationId, a));
    },
    remove(key: string) {
      const list = store.get(conversationId) ?? [];
      const gone = list.find((a) => a.key === key);
      if (!gone) return;
      URL.revokeObjectURL(gone.preview);
      store.set(
        conversationId,
        list.filter((a) => a.key !== key),
      );
      emit();
    },
    retryUpload(key: string) {
      const a = store.get(conversationId)?.find((x) => x.key === key);
      if (!a) return;
      patch(conversationId, key, { state: "uploading", progress: a.kind === "video" ? 0 : null, error: null });
      upload(conversationId, a);
    },
    set(key: string, change: Partial<Attachment>) {
      patch(conversationId, key, change);
    },
  };
}

const label = (a: Attachment, i: number) => `第 ${i + 1} 个附件：${a.kind === "image" ? "图片" : "视频"}`;

/** 文字区下方的附件条：按加入顺序排，上传中、上传失败、发送中、发送失败各有标记；没有附件时不渲染 */
export function AttachmentStrip({ list, locked, onRemove, onRetryUpload }: { list: Attachment[]; locked: boolean; onRemove: (key: string) => void; onRetryUpload: (key: string) => void }) {
  if (list.length === 0) return null;
  return (
    <ul aria-label="待发送的附件，按发送顺序排列" className="flex flex-wrap gap-2 px-3 pb-2">
      {list.map((a, i) => (
        <li key={a.key} className="relative size-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          {a.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- 本地文件的 blob 地址，不经图片优化
            <img src={a.preview} alt={label(a, i)} className="size-full object-cover" />
          ) : (
            <>
              <video src={a.preview} muted playsInline preload="metadata" aria-label={label(a, i)} className="size-full object-cover" />
              <FilmIcon aria-hidden className="absolute bottom-1 left-1 size-3.5 text-background drop-shadow" />
            </>
          )}
          {(a.state === "uploading" || a.state === "sending") && (
            <span role="status" className="absolute inset-0 flex items-center justify-center gap-1 bg-background/70 text-[11px] tabular-nums text-muted-foreground">
              <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
              <span className={a.progress !== null && a.state === "uploading" ? undefined : "sr-only"}>
                {a.state === "sending" ? "发送中" : a.progress !== null ? `${Math.round(a.progress * 100)}%` : "上传中"}
              </span>
            </span>
          )}
          {(a.state === "upload_failed" || a.state === "send_failed") && (
            <Tooltip>
              <TooltipTrigger asChild>
                {a.state === "upload_failed" ? (
                  <button type="button" onClick={() => onRetryUpload(a.key)} aria-label={`${label(a, i)}上传失败，重新上传`} className="focus-ring absolute inset-0 flex items-center justify-center bg-destructive/15 text-destructive">
                    <RotateCwIcon aria-hidden className="size-4" />
                  </button>
                ) : (
                  <span tabIndex={0} aria-label={`${label(a, i)}没有发出`} className="focus-ring absolute inset-x-0 bottom-0 bg-destructive/90 py-0.5 text-center text-[11px] text-destructive-foreground">
                    没发出
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{a.state === "upload_failed" ? `上传失败，点一下重新上传：${a.error ?? ""}` : `没有发出，再点发送会从这里接着发：${a.error ?? ""}`}</TooltipContent>
            </Tooltip>
          )}
          <Button
            type="button"
            variant="secondary"
            size="icon-xs"
            aria-label={`移除${label(a, i)}`}
            disabled={locked}
            onClick={() => onRemove(a.key)}
            className="absolute top-0.5 right-0.5 size-5 rounded-full bg-background/90 [&_svg]:size-3"
          >
            <XIcon />
          </Button>
        </li>
      ))}
    </ul>
  );
}
