"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleCheckIcon, CircleXIcon, FileIcon, UploadIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { KNOWLEDGE_EXTENSIONS, KNOWLEDGE_FILE_MAX, KNOWLEDGE_NON_PDF_MAX, type KnowledgeDocumentResult, type KnowledgeMarket } from "@/contracts/knowledge";
import { useDialogParam } from "@/components/shell/global-dialogs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, api, errorText, newKey } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ACCEPT, categoriesKey, docsKey, fileSize, MarketsPicker, UPLOAD_FORMATS, UPLOAD_LIMITS, useCategories } from "./knowledge-ui";

type ItemState = "waiting" | "uploading" | "done" | "rejected";
type Item = { key: string; file: File; state: ItemState; progress: number; reason?: string; existing?: { id: string; name: string } };

const MB = 1024 * 1024;
const QUOTA_REASON = "资料已满，请先删除不用的";

const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

/** 选文件时先按格式与大小挡一遍（与 API-KB-002 同一套规则与文案），免得 25 MB 的文件传完才被拒；以服务端结果为准 */
function precheck(f: File): string | undefined {
  const e = ext(f.name);
  if (e === "ppt" || e === "pptx") return "请先把 PPT 导出为 PDF 再上传";
  if (!(KNOWLEDGE_EXTENSIONS as readonly string[]).includes(e)) return "这种格式暂不支持";
  if (f.size > KNOWLEDGE_FILE_MAX) return `单个文件不能超过 ${KNOWLEDGE_FILE_MAX / MB} MB`;
  if (e !== "pdf" && f.size > KNOWLEDGE_NON_PDF_MAX) return `PDF 以外的文件不能超过 ${KNOWLEDGE_NON_PDF_MAX / MB} MB`;
}

/** 服务端拒收的原因（FLOW-KB-INGEST S2、S3 的提示） */
function rejectReason(e: unknown): Pick<Item, "reason" | "existing"> {
  if (!(e instanceof ApiError)) return { reason: errorText(e) };
  const code = e.problem.code;
  if (e.type === "too-large") return { reason: code === "retrieval_limit" ? `PDF 以外的文件不能超过 ${KNOWLEDGE_NON_PDF_MAX / MB} MB` : `单个文件不能超过 ${KNOWLEDGE_FILE_MAX / MB} MB` };
  if (e.type === "unsupported-type") return { reason: code === "ppt_export_pdf" ? "请先把 PPT 导出为 PDF 再上传" : "这种格式暂不支持" };
  if (e.type === "not-allowed") return { reason: QUOTA_REASON };
  if (e.type === "duplicate") {
    const x = e.problem.extra ?? {};
    const id = typeof x.existingId === "string" ? x.existingId : undefined;
    const name = typeof x.existingName === "string" ? x.existingName : undefined;
    return { reason: "已有同样的文件", existing: id && name ? { id, name } : undefined };
  }
  return { reason: errorText(e) };
}

const toItems = (files: File[]): Item[] =>
  files.map((file) => {
    const reason = precheck(file);
    return { key: newKey(), file, state: reason ? "rejected" : "waiting", progress: 0, reason };
  });

/** ?dialog=upload：拖入或选择多个文件，选一个分类与适用站点，逐个上传、逐个显示进度与结果（REQ-KB-001） */
export function UploadDialog({ initialFiles, remaining, onOpenDoc }: { initialFiles: File[]; remaining: number | null; onOpenDoc: (id: string) => void }) {
  const { open, close } = useDialogParam("upload");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && close()}>
      <DialogContent
        className="flex flex-col sm:max-w-xl"
        showCloseButton={!busy}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => busy && e.preventDefault()}
      >
        {open && <UploadForm initialFiles={initialFiles} remaining={remaining} onBusy={setBusy} onClose={close} onOpenDoc={onOpenDoc} />}
      </DialogContent>
    </Dialog>
  );
}

function UploadForm({
  initialFiles,
  remaining,
  onBusy,
  onClose,
  onOpenDoc,
}: {
  initialFiles: File[];
  remaining: number | null;
  onBusy: (b: boolean) => void;
  onClose: () => void;
  onOpenDoc: (id: string) => void;
}) {
  const qc = useQueryClient();
  const categories = useCategories();
  const builtin = categories.data?.items.find((c) => c.builtin)?.id;
  const [items, setItems] = useState<Item[]>(() => toItems(initialFiles));
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [markets, setMarkets] = useState<KnowledgeMarket[]>(["ALL"]);
  const [phase, setPhase] = useState<"pick" | "uploading" | "finished">("pick");
  /** 这一批真正发出去的文件（选文件时已被挡下的不算） */
  const [batch, setBatch] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const category = categoryId ?? builtin;
  const waiting = items.filter((i) => i.state === "waiting");
  const marketsError = markets.length === 0 ? "至少选一个站点" : undefined;

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));
  const add = (files: File[]) => {
    if (phase !== "pick" || files.length === 0) return;
    setItems((list) => [...list, ...toItems(files)]);
  };

  const start = async () => {
    if (waiting.length === 0 || marketsError) return;
    setPhase("uploading");
    setBatch(waiting.map((i) => i.key));
    onBusy(true);
    let full = remaining !== null && remaining <= 0;
    for (const item of waiting) {
      if (full) {
        patch(item.key, { state: "rejected", reason: QUOTA_REASON });
        continue;
      }
      patch(item.key, { state: "uploading", progress: 0 });
      const form = new FormData();
      form.set("file", item.file);
      if (category) form.set("categoryId", category);
      for (const m of markets) form.append("markets", m);
      try {
        await api.uploadWithProgress<KnowledgeDocumentResult>("/api/v1/knowledge/documents", form, (r) => patch(item.key, { progress: r }), newKey());
        patch(item.key, { state: "done", progress: 1 });
        qc.invalidateQueries({ queryKey: docsKey });
      } catch (e) {
        const r = rejectReason(e);
        if (r.reason === QUOTA_REASON) full = true;
        patch(item.key, { state: "rejected", ...r });
      }
    }
    qc.invalidateQueries({ queryKey: docsKey });
    qc.invalidateQueries({ queryKey: categoriesKey });
    setPhase("finished");
    onBusy(false);
  };

  const done = items.filter((i) => i.state === "done").length;
  const rejected = items.filter((i) => i.state === "rejected").length;
  const settled = items.filter((i) => batch.includes(i.key) && (i.state === "done" || i.state === "rejected")).length;

  return (
    <>
      <DialogHeader>
        <DialogTitle>上传资料</DialogTitle>
        <DialogDescription>这一批文件用同一个分类与适用站点；上传后在后台解析，解析完成才会被 AI 引用。</DialogDescription>
      </DialogHeader>

      {phase === "pick" && (
        <div
          className={cn(
            "flex flex-col items-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-center",
            over ? "border-(--semantic-color-text-link) bg-accent" : "border-border",
          )}
          onDragEnter={(e) => {
            if (!Array.from(e.dataTransfer.types).includes("Files")) return;
            e.preventDefault();
            setOver(true);
          }}
          onDragOver={(e) => {
            if (!Array.from(e.dataTransfer.types).includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            add(Array.from(e.dataTransfer.files));
          }}
        >
          <UploadIcon className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm">
            把文件拖到这里，或
            <Button variant="link" className="h-auto px-1 py-0 text-(--semantic-color-text-link)" onClick={() => input.current?.click()}>
              选择文件
            </Button>
            （可多选）
          </p>
          <p id="upload-rules" className="text-xs text-pretty text-muted-foreground">
            支持 {UPLOAD_FORMATS}。{UPLOAD_LIMITS}。
          </p>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              add(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      )}

      {items.length > 0 && (
        <ul className="scroll-y -mr-2 flex max-h-64 flex-col pr-2" aria-label="待上传的文件" aria-live="polite">
          {items.map((i) => (
            <FileRow key={i.key} item={i} removable={phase === "pick"} onRemove={() => setItems((l) => l.filter((x) => x.key !== i.key))} onOpenDoc={onOpenDoc} />
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <Field>
          <FieldLabel htmlFor="upload-category">分类</FieldLabel>
          <Select value={category ?? ""} onValueChange={setCategoryId} disabled={phase !== "pick" || !categories.data}>
            <SelectTrigger id="upload-category" className="w-full">
              <SelectValue placeholder="正在加载分类" />
            </SelectTrigger>
            <SelectContent>
              {categories.data?.items.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field data-invalid={Boolean(marketsError) || undefined}>
          <FieldLabel id="upload-markets-label">适用站点</FieldLabel>
          <MarketsPicker value={markets} onChange={setMarkets} disabled={phase !== "pick"} label="适用站点" invalid={Boolean(marketsError)} />
          {marketsError && <FieldError>{marketsError}</FieldError>}
        </Field>
      </div>

      <DialogFooter className="items-center sm:justify-between">
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {phase === "pick"
            ? items.length === 0
              ? "还没有选文件"
              : `${waiting.length} 个可上传${rejected ? `，${rejected} 个不能上传` : ""}`
            : phase === "uploading"
              ? `正在上传 ${Math.min(settled + 1, batch.length)} / ${batch.length}`
              : `已上传 ${done} 个${rejected ? `，${rejected} 个被拒` : ""}`}
        </p>
        {/* 三个阶段共用同一对按钮，只换文字：按钮不被替换，焦点留在原处（A11Y-013） */}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            aria-disabled={phase === "uploading" || undefined}
            onClick={() => {
              if (phase === "pick") return onClose();
              if (phase === "finished") {
                setItems([]);
                setBatch([]);
                setPhase("pick");
              }
            }}
          >
            {phase === "finished" ? "继续上传" : "取消"}
          </Button>
          <Button
            disabled={phase === "pick" && (waiting.length === 0 || Boolean(marketsError) || !category)}
            aria-disabled={phase === "uploading" || undefined}
            onClick={() => {
              if (phase === "pick") void start();
              else if (phase === "finished") onClose();
            }}
          >
            {phase === "finished" ? null : <UploadIcon className={cn(phase === "uploading" && "motion-safe:animate-pulse")} />}
            {phase === "pick" ? (waiting.length > 0 ? `上传 ${waiting.length} 个文件` : "上传") : phase === "uploading" ? "上传中，请不要关闭" : "完成"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

function FileRow({ item, removable, onRemove, onOpenDoc }: { item: Item; removable: boolean; onRemove: () => void; onOpenDoc: (id: string) => void }) {
  const pct = Math.round(item.progress * 100);
  return (
    <li className="flex items-start gap-3 border-b border-border py-2.5 last:border-0">
      <FileIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm [overflow-wrap:anywhere]">{item.file.name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{fileSize(item.file.size)}</p>
        {item.state === "uploading" && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${item.file.name} 上传进度`}>
              <div className="h-full rounded-full bg-primary transition-[width] duration-(--semantic-motion-duration-fast)" style={{ width: `${Math.max(pct, 2)}%` }} />
            </div>
            <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{pct}%</span>
          </div>
        )}
        {item.state === "done" && (
          <p className="mt-1 flex items-center gap-1 text-xs text-(--semantic-color-feedback-success)">
            <CircleCheckIcon className="size-3.5 shrink-0" aria-hidden />
            已上传，排队解析
          </p>
        )}
        {item.state === "rejected" && (
          <p className="mt-1 flex items-start gap-1 text-xs text-destructive">
            <CircleXIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {item.reason}
              {item.existing && (
                <>
                  ：《{item.existing.name}》
                  <button type="button" className="focus-ring ml-1 rounded-sm font-medium text-(--semantic-color-text-link)" onClick={() => onOpenDoc(item.existing!.id)}>
                    查看
                  </button>
                </>
              )}
            </span>
          </p>
        )}
        {item.state === "waiting" && <p className="mt-1 text-xs text-muted-foreground">等待上传</p>}
      </div>
      {removable && (
        <Button variant="ghost" size="icon-xs" aria-label={`移除 ${item.file.name}`} onClick={onRemove}>
          <XIcon />
        </Button>
      )}
    </li>
  );
}
