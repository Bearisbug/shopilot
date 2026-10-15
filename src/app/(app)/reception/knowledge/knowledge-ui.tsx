"use client";

// 知识库页共用的小块：地址参数、状态标签、站点选择、文件大小、分类查询、上传规则（PAGE-RECEPTION-KB）
import { useQuery } from "@tanstack/react-query";
import { CircleXIcon, ClockIcon, LoaderCircleIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  KNOWLEDGE_EXTENSIONS,
  KNOWLEDGE_FILE_MAX,
  KNOWLEDGE_MARKETS,
  KNOWLEDGE_NON_PDF_MAX,
  type KnowledgeCategoryList,
  type KnowledgeDocument,
  type KnowledgeMarket,
} from "@/contracts/knowledge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * 改地址参数。以浏览器当前地址为底、叠上还没生效的上一次改动：搜索框的延时写入可能晚于筛选的改动，
 * 用渲染时拿到的参数为底会把刚选的筛选改回去
 */
export function useUrlParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const pending = useRef<string | null>(null);
  useEffect(() => {
    if (params.toString() === pending.current) pending.current = null;
  }, [params]);
  const update = (patch: Record<string, string | null>, mode: "push" | "replace" = "replace") => {
    const next = new URLSearchParams(pending.current ?? window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    pending.current = qs;
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (mode === "push") router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  };
  return { params, update };
}

export const docsKey = ["knowledge-docs"] as const;
export const categoriesKey = ["knowledge-categories"] as const;

export function useCategories() {
  return useQuery({ queryKey: categoriesKey, queryFn: () => api.get<KnowledgeCategoryList>("/api/v1/knowledge/categories") });
}

/** 页面上的状态：「可用」= ready 且 AI 可用，「已停用」= ready 且 AI 可用关闭（§9.6） */
export type DocState = "queued" | "processing" | "available" | "disabled" | "failed";
export const DOC_STATES: DocState[] = ["queued", "processing", "available", "disabled", "failed"];
export const DOC_STATE_LABEL: Record<DocState, string> = { queued: "排队中", processing: "解析中", available: "可用", disabled: "已停用", failed: "失败" };
/** 筛选值 → API-KB-001 的 status 与 aiEnabled */
export const DOC_STATE_QUERY: Record<DocState, Record<string, string>> = {
  queued: { status: "queued" },
  processing: { status: "processing" },
  available: { status: "ready", aiEnabled: "true" },
  disabled: { status: "ready", aiEnabled: "false" },
  failed: { status: "failed" },
};

export function docState(d: Pick<KnowledgeDocument, "status" | "aiEnabled">): DocState {
  if (d.status === "ready") return d.aiEnabled ? "available" : "disabled";
  return d.status;
}

export const inProgress = (d: Pick<KnowledgeDocument, "status">) => d.status === "queued" || d.status === "processing";

/** 状态标签：文字 + 图标或圆点；可用用 success，失败用 error，其余用次要文字色 */
export function DocStatus({ doc, className }: { doc: Pick<KnowledgeDocument, "status" | "aiEnabled">; className?: string }) {
  const s = docState(doc);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm whitespace-nowrap",
        s === "available" ? "text-(--semantic-color-feedback-success)" : s === "failed" ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      {s === "queued" && <ClockIcon className="size-3.5 shrink-0" aria-hidden />}
      {s === "processing" && <LoaderCircleIcon className="size-3.5 shrink-0 motion-safe:animate-spin" aria-hidden />}
      {s === "failed" && <CircleXIcon className="size-3.5 shrink-0" aria-hidden />}
      {(s === "available" || s === "disabled") && <span className={cn("size-1.5 shrink-0 rounded-full", s === "available" ? "bg-current" : "border border-current")} aria-hidden />}
      {DOC_STATE_LABEL[s]}
    </span>
  );
}

export const MARKET_LABEL: Record<KnowledgeMarket, string> = { ALL: "全部站点", MY: "MY", TH: "TH", VN: "VN", PH: "PH", SG: "SG", ID: "ID" };

export function marketsText(markets: KnowledgeMarket[]): string {
  return markets.includes("ALL") ? "全部站点" : markets.join("、");
}

/**
 * 适用站点：「全部站点」与具体站点互斥。选具体站点时去掉「全部站点」，选「全部站点」时清掉具体站点；
 * 一个都不选时把空数组交给调用方，由调用方提示「至少选一个站点」
 */
export function MarketsPicker({ value, onChange, disabled, label, invalid }: { value: KnowledgeMarket[]; onChange: (v: KnowledgeMarket[]) => void; disabled?: boolean; label: string; invalid?: boolean }) {
  const itemClass = "px-2.5 font-normal data-[state=on]:bg-accent data-[state=on]:font-semibold data-[state=on]:text-(--semantic-color-text-link)";
  return (
    <ToggleGroup
      type="multiple"
      variant="outline"
      size="sm"
      spacing={1}
      className="flex-wrap"
      value={value}
      disabled={disabled}
      aria-label={label}
      aria-invalid={invalid || undefined}
      onValueChange={(next) => {
        const picked = next as KnowledgeMarket[];
        const added = picked.find((m) => !value.includes(m));
        if (added === "ALL") return onChange(["ALL"]);
        onChange(picked.filter((m) => m !== "ALL"));
      }}
    >
      {KNOWLEDGE_MARKETS.map((m) => (
        <ToggleGroupItem key={m} value={m} className={itemClass}>
          {MARKET_LABEL[m]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const MB = 1024 * 1024;
/** 上传弹窗与空态里写的格式与上限（API-KB-002、§9.6） */
export const UPLOAD_FORMATS = "PDF、Word（docx）、Excel（xlsx、xls）、CSV、图片（JPG、PNG、WebP、GIF、BMP、TIFF、HEIC）、Markdown、TXT、HTML、ODT、ODS";
export const UPLOAD_LIMITS = `单个文件不超过 ${KNOWLEDGE_FILE_MAX / MB} MB，PDF 以外的文件不超过 ${KNOWLEDGE_NON_PDF_MAX / MB} MB；PPT 请先导出为 PDF 再上传`;
/** 文件选择框的 accept：只列收的扩展名（PPT 也可以选，选了再提示先导出为 PDF） */
export const ACCEPT = [...KNOWLEDGE_EXTENSIONS, "ppt", "pptx"].map((e) => `.${e}`).join(",");
