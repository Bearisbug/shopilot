"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DownloadIcon, FileIcon, RotateCcwIcon, SearchXIcon, Trash2Icon } from "lucide-react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { useState } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import type { KnowledgeChunkPage, KnowledgeDocument, KnowledgeDocumentDetail, KnowledgeDocumentResult, KnowledgeMarket, KnowledgePart } from "@/contracts/knowledge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Notice } from "@/components/orders/order-ui";
import { EmptyState, ErrorState, LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { ApiError, api, errorText } from "@/lib/api";
import { inTz } from "@/lib/format";
import { patchDocInCache, useReparse, useToggleAi } from "./knowledge-client";
import { categoriesKey, DocStatus, docsKey, fileSize, inProgress, MarketsPicker, useCategories, useUrlParams } from "./knowledge-ui";

const POLL_MS = 5_000;
const TABS = ["file", "parsed"] as const;
type Tab = (typeof TABS)[number];
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/** ?doc=<id> 资料抽屉；?docTab=parsed 记住当前标签（INT-020） */
export function DocumentDrawer({ me }: { me: Me }) {
  const { params, update } = useUrlParams();
  const docId = params.get("doc");
  return (
    <Sheet open={Boolean(docId)} onOpenChange={(o) => !o && update({ doc: null, docTab: null })}>
      <SheetContent
        className="w-full gap-0 overscroll-contain data-[side=right]:sm:max-w-2xl"
        aria-describedby={undefined}
        // 打开它的那一行已被删除（或从草稿依据直接打开）时焦点没处可还，落到资料列表的标题上
        onCloseAutoFocus={() =>
          requestAnimationFrame(() => {
            if (document.activeElement === document.body) document.getElementById("kb-docs-title")?.focus();
          })
        }
      >
        {docId && <DrawerBody key={docId} me={me} docId={docId} onClose={() => update({ doc: null, docTab: null })} />}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ me, docId, onClose }: { me: Me; docId: string; onClose: () => void }) {
  const valid = isUuid(docId);
  const q = useQuery({
    queryKey: ["knowledge-doc", docId],
    queryFn: () => api.get<KnowledgeDocumentDetail>(`/api/v1/knowledge/documents/${docId}`),
    enabled: valid,
    // 排队或解析中时每 5 秒刷新状态
    refetchInterval: (query) => (query.state.data && inProgress(query.state.data.document) ? POLL_MS : false),
  });
  const notFound = !valid || (q.error instanceof ApiError && q.error.status === 404);
  if (notFound || q.isError)
    return (
      <>
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle className="text-lg">资料详情</SheetTitle>
        </SheetHeader>
        {notFound ? (
          <EmptyState
            icon={SearchXIcon}
            title="找不到这份资料"
            description="它可能已被删除；草稿依据里的旧链接也会落到这里。"
            action={
              <Button variant="outline" onClick={onClose}>
                回到资料列表
              </Button>
            }
          />
        ) : (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        )}
      </>
    );
  if (!q.data)
    return (
      <>
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle className="text-lg">资料详情</SheetTitle>
          <Skeleton className="h-4 w-48 bg-muted" />
        </SheetHeader>
        <div className="px-4 pt-4">
          <LoadingRows rows={5} />
        </div>
      </>
    );
  return <DrawerContent me={me} detail={q.data} onClose={onClose} />;
}

function DrawerContent({ me, detail, onClose }: { me: Me; detail: KnowledgeDocumentDetail; onClose: () => void }) {
  const d = detail.document;
  const tz = me.active.timezone;
  const qc = useQueryClient();
  const { params, update } = useUrlParams();
  const rawTab = params.get("docTab");
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "file";
  const categories = useCategories();
  const toggle = useToggleAi();
  const reparse = useReparse();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 站点是多选，逐次点选时先改本地，合法才保存；一个都不选时只提示、不发请求
  const [markets, setMarkets] = useState<KnowledgeMarket[]>(d.markets);
  const [marketsSaved, setMarketsSaved] = useState(d.markets);
  if (marketsSaved !== d.markets && JSON.stringify(marketsSaved) !== JSON.stringify(d.markets)) {
    setMarketsSaved(d.markets);
    setMarkets(d.markets);
  }

  const save = useMutation({
    mutationFn: (body: { categoryId?: string; markets?: KnowledgeMarket[] }) => api.patch<KnowledgeDocumentResult>(`/api/v1/knowledge/documents/${d.id}`, body),
    onSuccess: (r, body) => {
      patchDocInCache(qc, r.document);
      qc.setQueryData<KnowledgeDocumentDetail>(["knowledge-doc", d.id], (old) => (old ? { ...old, document: r.document } : old));
      if (body.categoryId) qc.invalidateQueries({ queryKey: categoriesKey });
      toast.success(body.categoryId ? "分类已改，立即生效" : "适用站点已改，下一次出稿起按新站点检索");
    },
    onError: (e) => {
      setMarkets(d.markets);
      toast.error(errorText(e));
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/v1/knowledge/documents/${d.id}`),
    onSuccess: () => {
      toast.success(`已删除《${d.name}》`, { description: "检索服务里的副本与原文件随后删除。" });
      setConfirmDelete(false);
      qc.invalidateQueries({ queryKey: docsKey });
      qc.invalidateQueries({ queryKey: categoriesKey });
      onClose();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const busy = inProgress(d);
  const reparsing = reparse.isPending;

  return (
    <>
      <SheetHeader className="border-b border-border pr-12">
        <SheetTitle className="text-lg [overflow-wrap:anywhere]">{d.name}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <DocStatus doc={d} />
          <span className="tabular-nums">{fileSize(d.size)}</span>
          <span>{d.chunksCount ? `${d.chunksCount} 段分块${d.partsCount > 1 ? ` · 拆成 ${d.partsCount} 个条目` : ""}` : "还没有分块"}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="scroll-y flex min-h-0 flex-1 flex-col gap-5 px-4 pt-4 pb-6">
        {d.status === "failed" && (
          <Notice tone="error">
            <p className="font-medium">解析失败</p>
            <p className="[overflow-wrap:anywhere]">{d.failureReason ?? "检索服务没有给出原因。"}</p>
          </Notice>
        )}
        {busy && <Notice tone="info">{d.status === "queued" ? "排队中" : "解析中"}：完成前 AI 不会引用这份资料，这里每 5 秒刷新一次。</Notice>}

        <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-[6rem_minmax(0,1fr)] sm:items-center">
          <dt className="text-sm text-muted-foreground">分类</dt>
          <dd>
            <Select value={d.categoryId} onValueChange={(v) => v !== d.categoryId && save.mutate({ categoryId: v })} disabled={!categories.data || save.isPending}>
              <SelectTrigger size="sm" className="w-full max-w-60" aria-label="分类">
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
          </dd>
          <dt className="text-sm text-muted-foreground">适用站点</dt>
          <dd className="flex flex-col gap-1">
            <MarketsPicker
              value={markets}
              label="适用站点"
              invalid={markets.length === 0}
              disabled={save.isPending}
              onChange={(next) => {
                setMarkets(next);
                if (next.length > 0) save.mutate({ markets: next });
              }}
            />
            {markets.length === 0 && <p className="text-xs text-destructive">至少选一个站点</p>}
          </dd>
          <dt className="text-sm text-muted-foreground">AI 可用</dt>
          <dd className="flex items-center gap-3">
            <Switch checked={d.aiEnabled} onCheckedChange={(v) => toggle.mutate({ doc: d, aiEnabled: v })} aria-label="AI 可用" aria-describedby="doc-ai-hint" />
            <span id="doc-ai-hint" className="text-xs text-muted-foreground">
              {d.aiEnabled ? "解析完成后出稿与测试问答会引用" : "已关闭：之后的出稿与测试问答不再引用，已有草稿保留依据"}
            </span>
          </dd>
        </dl>

        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">上传</dt>
          <dd className="tabular-nums">
            {inTz(d.createdAt, tz, "yyyy-MM-dd HH:mm")} · {d.uploadedByName ?? "已删除的成员"}
          </dd>
          <dt className="text-muted-foreground">解析完成</dt>
          <dd className="tabular-nums">{d.readyAt ? inTz(d.readyAt, tz, "yyyy-MM-dd HH:mm") : "—"}</dd>
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-disabled={busy || reparsing || undefined}
            aria-describedby={busy ? "doc-reparse-hint" : undefined}
            onClick={() => !busy && !reparsing && reparse.mutate(d.id)}
          >
            {reparsing ? <Spinner /> : <RotateCcwIcon />}
            重新解析
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={detail.fileUrl} download={d.name}>
              <DownloadIcon />
              下载原文件
            </a>
          </Button>
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2Icon />
            删除
          </Button>
          {busy && (
            <p id="doc-reparse-hint" className="self-center text-xs text-muted-foreground">
              正在解析，完成后才能重新解析
            </p>
          )}
        </div>

        <Tabs value={tab} onValueChange={(v) => update({ docTab: v === "file" ? null : v }, "push")} className="min-h-0">
          {/* 与工作台右栏相同：line 变体的指示线会和 state-layer 的 ::after 冲突，直接用 Radix 触发器画底边线 */}
          <TabsList variant="line" aria-label="资料内容" className="w-full justify-start gap-4 rounded-none border-b border-border p-0 group-data-[orientation=horizontal]/tabs:h-auto">
            {([
              ["file", "原文件"],
              ["parsed", `解析内容${d.chunksCount ? `（${d.chunksCount} 段）` : ""}`],
            ] as const).map(([value, label]) => (
              <TabsPrimitive.Trigger
                key={value}
                value={value}
                className="state-layer focus-ring -mb-px h-9 rounded-t-sm border-b-2 border-transparent px-1 text-sm whitespace-nowrap text-muted-foreground data-[state=active]:border-(--semantic-color-text-link) data-[state=active]:font-semibold data-[state=active]:text-(--semantic-color-text-link)"
              >
                {label}
              </TabsPrimitive.Trigger>
            ))}
          </TabsList>
          <TabsContent value="file" className="pt-3">
            <OriginalFile doc={d} url={detail.fileUrl} />
          </TabsContent>
          <TabsContent value="parsed" className="pt-3">
            <ParsedContent doc={d} parts={detail.parts} />
          </TabsContent>
        </Tabs>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => !o && !remove.isPending && setConfirmDelete(false)}
        title={`删除《${d.name}》？`}
        desc={
          <div className="flex flex-col gap-2">
            <p>资料会立即从列表消失，检索服务里的副本与原文件随后一并删除，删除后不能恢复。</p>
            <p>已生成草稿的依据仍显示文件名，但不能再点开。</p>
          </div>
        }
        confirmText="删除资料"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

/** 原文件：PDF 内嵌浏览器自带阅读器（同 PdfPreview 的做法），图片看大图，其他格式只给下载；文件已不存在时提示 */
function OriginalFile({ doc, url }: { doc: KnowledgeDocument; url: string }) {
  const pdf = doc.mime === "application/pdf";
  const image = doc.mime.startsWith("image/");
  // 浏览器不能内嵌 PDF 时（多数手机浏览器）只给下载，免得 iframe 直接触发一次下载
  const [pdfInline] = useState(() => typeof navigator === "undefined" || navigator.pdfViewerEnabled !== false);
  // 先确认文件还在：只读响应头，拿到就断开，不把整份文件读完
  const exists = useQuery({
    queryKey: ["knowledge-file", url],
    queryFn: async () => {
      const res = await api.download(url);
      void res.body?.cancel();
      return true;
    },
    retry: false,
    staleTime: 60_000,
  });
  if (exists.isPending) return <Skeleton className="h-[60dvh] w-full rounded-md bg-muted motion-safe:animate-pulse" />;
  if (exists.isError)
    return (
      <Notice tone="error">
        {exists.error instanceof ApiError && exists.error.status === 404 ? "文件已不存在：原文件读不到了，可以删除这份资料后重新上传。" : errorText(exists.error)}
      </Notice>
    );
  if (pdf && pdfInline)
    return (
      <iframe src={url} title={`${doc.name} 预览`} className="h-[70dvh] w-full rounded-md border border-border bg-muted" />
    );
  if (image)
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element -- 原文件经 API-CONV-011 鉴权返回，不走图片优化 */}
        <img src={url} alt={doc.name} className="h-[70dvh] w-full rounded-md bg-muted object-contain" />
      </>
    );
  return (
    <div className="flex flex-col items-center gap-2 rounded-md bg-muted px-6 py-10 text-center">
      <FileIcon className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium [overflow-wrap:anywhere]">{doc.name}</p>
      <p className="text-sm text-muted-foreground">{pdf ? "这个浏览器不能直接预览 PDF，点上方「下载原文件」查看。" : "这种格式不能在页面里预览，点上方「下载原文件」查看；AI 用的是「解析内容」里的文字。"}</p>
    </div>
  );
}

function partLabel(p: KnowledgePart | undefined, n: number): string {
  if (p?.pageFrom && p.pageTo) return `条目 ${n} · 第 ${p.pageFrom}–${p.pageTo} 页`;
  return `条目 ${n}`;
}

/** 解析内容：按序号列出检索服务切出的分块；拆分的 PDF 在每个条目开头标页码范围 */
function ParsedContent({ doc, parts }: { doc: KnowledgeDocument; parts: KnowledgePart[] }) {
  const ready = doc.status === "ready";
  const chunks = useInfiniteQuery({
    queryKey: ["knowledge-chunks", doc.id, doc.readyAt],
    queryFn: ({ pageParam }) => api.get<KnowledgeChunkPage>(`/api/v1/knowledge/documents/${doc.id}/chunks${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: ready,
  });
  if (!ready)
    return (
      <p className="rounded-md bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
        {doc.status === "failed" ? "解析失败，没有解析内容。重新解析成功后在这里按序号列出分块文字。" : "解析完成后在这里按序号列出分块文字。"}
      </p>
    );
  if (chunks.isError) return <ErrorState error={chunks.error} onRetry={() => chunks.refetch()} />;
  if (!chunks.data) return <LoadingRows rows={4} />;
  const items = chunks.data.pages.flatMap((p) => p.items);
  if (items.length === 0) return <p className="rounded-md bg-muted px-4 py-6 text-center text-sm text-muted-foreground">这份资料没有解析出文字，AI 引用不到它。</p>;
  const split = parts.length > 1;
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col">
        {items.map((c, i) => {
          const newPart = split && (i === 0 || items[i - 1].partNo !== c.partNo);
          return (
            <li key={c.no} className="flex flex-col">
              {newPart && <p className="mt-2 mb-1 text-xs font-semibold text-muted-foreground tabular-nums first:mt-0">{partLabel(parts.find((p) => p.partNo === c.partNo), c.partNo)}</p>}
              <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-baseline gap-2 border-b border-border py-2.5 last:border-0">
                <span className="text-xs text-muted-foreground tabular-nums">#{c.no}</span>
                <p className="text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{c.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span className="tabular-nums">
          已显示 {items.length} / {doc.chunksCount} 段
        </span>
        {chunks.hasNextPage && (
          <Button variant="outline" size="sm" disabled={chunks.isFetchingNextPage} onClick={() => chunks.fetchNextPage()}>
            {chunks.isFetchingNextPage && <Spinner />}
            加载更多
          </Button>
        )}
      </div>
    </div>
  );
}
