"use client";

import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { FolderCogIcon, LibraryBigIcon, RotateCcwIcon, SearchIcon, SparklesIcon, UploadIcon } from "lucide-react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import { KNOWLEDGE_MARKETS, type KnowledgeDocument, type KnowledgeDocumentList, type KnowledgeDocumentResult, type KnowledgeMarket } from "@/contracts/knowledge";
import { Notice } from "@/components/orders/order-ui";
import { useDialogParam } from "@/components/shell/global-dialogs";
import { EmptyState, ErrorState, Panel } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { ApiError, api, errorText } from "@/lib/api";
import { inTz } from "@/lib/format";
import { kbTab, type KbTab } from "@/lib/qa-form";
import { cn } from "@/lib/utils";
import { ReceptionFrame } from "../reception-frame";
import { CardDialog } from "./card-dialog";
import { CardDrawer } from "./card-drawer";
import { useCardParams, useUnseenCount } from "./cards-ui";
import { CardsTab } from "./cards-tab";
import { CategoriesDialog } from "./categories-dialog";
import { DocumentDrawer } from "./document-drawer";
import { ACCEPT, DOC_STATE_LABEL, DOC_STATE_QUERY, DOC_STATES, DocStatus, docsKey, inProgress, MARKET_LABEL, marketsText, UPLOAD_FORMATS, UPLOAD_LIMITS, useCategories, useUrlParams, type DocState } from "./knowledge-ui";
import { ProductsTab } from "./products-tab";
import { QaDialog } from "./qa-dialog";
import { QaTab, useQaDialog } from "./qa-tab";
import { qaKey, usePendingCount } from "./qa-ui";
import { RejectDialog, ReviewTab } from "./review-tab";
import { TestPanel } from "./test-panel";
import { UploadDialog } from "./upload-dialog";

const POLL_MS = 5_000;

/** 列表缓存里改一份资料（开关、改分类后立即反映，不等下一次刷新） */
export function patchDocInCache(qc: ReturnType<typeof useQueryClient>, doc: KnowledgeDocument) {
  qc.setQueriesData<InfiniteData<KnowledgeDocumentList>>({ queryKey: docsKey }, (data) =>
    data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((d) => (d.id === doc.id ? doc : d)) })) } : data,
  );
}

/** 重新解析（API-KB-006）：列表失败行与抽屉共用；正在排队或解析时 409 */
export function useReparse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<KnowledgeDocumentResult>(`/api/v1/knowledge/documents/${id}/reparse`, {}),
    onSuccess: (r) => {
      patchDocInCache(qc, r.document);
      toast.success(`《${r.document.name}》已重新排队解析`, { description: "解析完成前 AI 不会引用它。" });
      qc.invalidateQueries({ queryKey: docsKey });
      qc.invalidateQueries({ queryKey: ["knowledge-doc", r.document.id] });
    },
    onError: (e) => toast.error(e instanceof ApiError && e.type === "conflict" ? "这份资料正在解析，完成后再试" : errorText(e)),
  });
}

/** AI 可用开关（API-KB-005）：先改界面，失败时改回并提示 */
export function useToggleAi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ doc, aiEnabled }: { doc: KnowledgeDocument; aiEnabled: boolean }) => api.patch<KnowledgeDocumentResult>(`/api/v1/knowledge/documents/${doc.id}`, { aiEnabled }),
    onMutate: ({ doc, aiEnabled }) => patchDocInCache(qc, { ...doc, aiEnabled }),
    onSuccess: (r) => {
      patchDocInCache(qc, r.document);
      qc.setQueryData(["knowledge-doc", r.document.id], (old: { document: KnowledgeDocument } | undefined) => (old ? { ...old, document: r.document } : old));
      toast.success(r.document.aiEnabled ? `《${r.document.name}》已开启，AI 可以引用` : `《${r.document.name}》已停用，之后的出稿与测试问答不再引用`);
    },
    onError: (e, { doc }) => {
      patchDocInCache(qc, doc);
      toast.error(errorText(e));
    },
  });
}

/** 整理成问答（API-KB-028）：资料解析完成后排队，AI 把它整理成待审核的候选问答 */
function useQaExtract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<KnowledgeDocumentResult>(`/api/v1/knowledge/documents/${id}/qa-extract`, {}),
    onSuccess: (r) => {
      patchDocInCache(qc, r.document);
      toast.success(`《${r.document.name}》已开始整理成问答`, { description: "整理完的候选在「待审核」页签，审核通过才发布。" });
      qc.invalidateQueries({ queryKey: docsKey });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) qc.invalidateQueries({ queryKey: docsKey });
      toast.error(errorText(e));
    },
  });
}

const extracting = (d: Pick<KnowledgeDocument, "qaExtract">) => d.qaExtract.status === "running";

export function KnowledgePage({ me }: { me: Me }) {
  const { params, update } = useUrlParams();
  const tab = kbTab(params.get("tab"), params.has("doc"), params.has("card"));
  const pending = usePendingCount();
  const unseen = useUnseenCount();
  const qaDialog = useQaDialog();
  const card = useCardParams();
  const go = (t: KbTab) => update({ tab: t === "qa" ? null : t }, "push");
  const TABS: Array<{ value: KbTab; label: React.ReactNode }> = [
    { value: "qa", label: "问答" },
    {
      value: "cards",
      label: (
        <>
          经验卡{unseen ? <span className="ml-1 rounded-full bg-accent px-1.5 text-xs text-(--semantic-color-text-link) tabular-nums" aria-label={`${unseen} 张 Agent 改过、还没人看过`}>{unseen}</span> : null}
        </>
      ),
    },
    {
      value: "review",
      label: (
        <>
          待审核{pending ? <span className="ml-1 rounded-full bg-accent px-1.5 text-xs text-(--semantic-color-text-link) tabular-nums">{pending}</span> : null}
        </>
      ),
    },
    { value: "docs", label: "资料" },
    { value: "products", label: "产品" },
    { value: "test", label: "测试问答" },
  ];
  return (
    <ReceptionFrame facts="AI 出稿前先查已发布的问答与经验卡，再查可用资料；客服在草稿下方看到依据。知识库全商户共享">
      <Tabs value={tab} onValueChange={(v) => go(v as KbTab)} className="gap-4">
        {/* 页签多时横向滚动、不露滚动条（RESP-016）；共享 TabsTrigger 的 line 变体与 state-layer 的 ::after 冲突，直接用 Radix 触发器画底边线 */}
        <TabsList variant="line" aria-label="知识库" className="scroll-nav w-full justify-start gap-5 overflow-x-auto rounded-none border-b border-border p-0 group-data-[orientation=horizontal]/tabs:h-auto">
          {TABS.map((t) => (
            <TabsPrimitive.Trigger
              key={t.value}
              value={t.value}
              className="state-layer focus-ring -mb-px inline-flex h-10 items-center rounded-t-sm border-b-2 border-transparent px-1 text-sm whitespace-nowrap text-muted-foreground data-[state=active]:border-(--semantic-color-text-link) data-[state=active]:font-semibold data-[state=active]:text-(--semantic-color-text-link)"
            >
              {t.label}
            </TabsPrimitive.Trigger>
          ))}
        </TabsList>
        <TabsContent value="qa">
          <QaTab me={me} onNew={qaDialog.openNew} onOpen={qaDialog.openFor} />
        </TabsContent>
        <TabsContent value="cards">
          <CardsTab me={me} onNew={card.openNew} onOpen={card.openDrawer} />
        </TabsContent>
        <TabsContent value="review">
          <ReviewTab onEdit={qaDialog.openFor} onReject={qaDialog.reject} onGoDocs={() => go("docs")} />
        </TabsContent>
        <TabsContent value="docs">
          <DocsTab me={me} onGoReview={() => go("review")} />
        </TabsContent>
        <TabsContent value="products">
          <ProductsTab />
        </TabsContent>
        <TabsContent value="test">
          <div className="max-w-3xl">
            <TestPanel me={me} onOpenDoc={(id) => update({ tab: "docs", doc: id, docTab: null }, "push")} onOpenQa={qaDialog.openFor} />
          </div>
        </TabsContent>
      </Tabs>
      <QaDialog open={qaDialog.open} qaId={qaDialog.qaId} onClose={qaDialog.close} onReject={(qa) => qaDialog.reject(qa.id)} />
      <RejectDialog open={params.get("dialog") === "qa-reject"} qaId={qaDialog.qaId} onClose={qaDialog.close} />
      <DocumentDrawer me={me} />
      <CardDialog me={me} open={card.dialogOpen} cardId={card.cardId} onClose={card.closeDialog} />
      <CardDrawer me={me} />
    </ReceptionFrame>
  );
}

function DocsTab({ me, onGoReview }: { me: Me; onGoReview: () => void }) {
  const { params, update } = useUrlParams();
  const categories = useCategories();
  const upload = useDialogParam("upload");
  const [dropped, setDropped] = useState<File[]>([]);

  // 地址里的筛选先校验，不认识的值不发给接口（INT-020）
  const rawCategory = params.get("category");
  const rawMarket = params.get("market");
  const rawState = params.get("state");
  const category = categories.data?.items.some((c) => c.id === rawCategory) ? rawCategory! : "all";
  const market = (KNOWLEDGE_MARKETS as readonly string[]).includes(rawMarket ?? "") ? (rawMarket as KnowledgeMarket) : "all";
  const state = (DOC_STATES as string[]).includes(rawState ?? "") ? (rawState as DocState) : "all";
  const qParam = (params.get("q") ?? "").slice(0, 100);
  const [search, setSearch] = useState(qParam);

  useEffect(() => {
    const bad: Record<string, null> = {};
    if (rawCategory !== null && categories.data && category === "all") bad.category = null;
    if (rawMarket !== null && market === "all") bad.market = null;
    if (rawState !== null && state === "all") bad.state = null;
    if (Object.keys(bad).length) update(bad);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在地址里的筛选或分类变化时校验
  }, [rawCategory, rawMarket, rawState, categories.data]);

  // 搜索框输入停 400ms 后写进地址
  useEffect(() => {
    if (search.trim() === qParam) return;
    const t = setTimeout(() => update({ q: search.trim() || null }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只跟随输入变化
  }, [search]);

  const filters = new URLSearchParams();
  if (category !== "all") filters.set("categoryId", category);
  if (market !== "all") filters.set("market", market);
  if (state !== "all") for (const [k, v] of Object.entries(DOC_STATE_QUERY[state])) filters.set(k, v);
  if (qParam) filters.set("q", qParam);
  const qs = filters.toString();
  // 分类筛选要等分类列表回来才能校验，先不发请求，免得带着失效的分类查一次
  const waitCategories = rawCategory !== null && !categories.data && !categories.isError;

  const list = useInfiniteQuery({
    queryKey: [...docsKey, qs],
    queryFn: ({ pageParam }) => api.get<KnowledgeDocumentList>(`/api/v1/knowledge/documents?${qs}${pageParam ? `${qs ? "&" : ""}cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !waitCategories,
    // 有排队或解析中的资料时每 5 秒刷新（§15），标签页在后台时不刷
    refetchInterval: (q) => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
      return q.state.data?.pages.some((p) => p.items.some((d) => inProgress(d) || extracting(d))) ? POLL_MS : false;
    },
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const counts = list.data?.pages[0]?.counts;
  const full = counts ? counts.total >= counts.limit : false;
  const filtered = category !== "all" || market !== "all" || state !== "all" || qParam !== "";
  const processing = items.filter(inProgress).length;
  const extractingCount = items.filter(extracting).length;
  // 整理完成或失败时，待审核的候选变了：刷新问答查询（页签上的待审核数）
  const qc = useQueryClient();
  const extractSig = items.map((d) => `${d.id}:${d.qaExtract.status}:${d.qaExtract.extractedAt ?? ""}`).join("|");
  const lastSig = useRef(extractSig);
  useEffect(() => {
    if (lastSig.current !== extractSig) qc.invalidateQueries({ queryKey: qaKey });
    lastSig.current = extractSig;
  }, [extractSig, qc]);

  const openWithFiles = (files: File[]) => {
    if (full) return toast.error("资料已满，请先删除不用的");
    setDropped(files);
    upload.openIt();
  };
  const clearFilters = () => {
    setSearch("");
    update({ category: null, market: null, state: null, q: null });
  };

  return (
    <>
      <div className="@container">
          <DocumentsPanel
            me={me}
            onFiles={openWithFiles}
            header={
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="kb-docs-title" tabIndex={-1} className="flex items-baseline gap-2 text-lg font-semibold focus-visible:outline-none">
                    资料
                    {counts ? (
                      <span className={cn("text-sm font-normal tabular-nums", full ? "text-destructive" : "text-muted-foreground")}>
                        {counts.total} / {counts.limit}
                      </span>
                    ) : list.isError ? null : (
                      <Skeleton className="h-4 w-14 self-center bg-muted" />
                    )}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground" aria-live="polite">
                    {processing + extractingCount > 0
                      ? `${processing > 0 ? `${processing} 份在排队或解析` : ""}${processing > 0 && extractingCount > 0 ? "，" : ""}${extractingCount > 0 ? `${extractingCount} 份在整理成问答` : ""}，列表每 5 秒刷新`
                      : items.length > 0
                        ? "点一行看原文件与解析内容；解析好的资料可以「整理成问答」，审核后发布"
                        : "上传后在后台解析，完成后 AI 才会引用"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CategoriesButton />
                  <Button onClick={() => (full ? toast.error("资料已满，请先删除不用的") : openWithFiles([]))} aria-disabled={full || undefined}>
                    <UploadIcon />
                    上传资料
                  </Button>
                </div>
              </div>
            }
          >
            {full && (
              <Notice tone="error">
                资料已满（{counts?.total} / {counts?.limit}），请先删除不用的资料再上传。
              </Notice>
            )}
            {(items.length > 0 || filtered) && (
              <div className="flex flex-wrap items-center gap-2">
                <InputGroup className="h-8 w-full @lg:w-52">
                  <InputGroupAddon>
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜文件名" aria-label="按文件名搜索" />
                </InputGroup>
                <Select value={category} onValueChange={(v) => update({ category: v === "all" ? null : v })}>
                  <SelectTrigger size="sm" className="max-w-40" aria-label="按分类筛选">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部分类</SelectItem>
                    {categories.data?.items.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={market} onValueChange={(v) => update({ market: v === "all" ? null : v })}>
                  <SelectTrigger size="sm" aria-label="按站点筛选">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">不限站点</SelectItem>
                    <SelectItem value="ALL">只看全部站点</SelectItem>
                    {KNOWLEDGE_MARKETS.filter((m) => m !== "ALL").map((m) => (
                      <SelectItem key={m} value={m}>
                        {MARKET_LABEL[m]} 可用
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={state} onValueChange={(v) => update({ state: v === "all" ? null : v })}>
                  <SelectTrigger size="sm" aria-label="按状态筛选">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    {DOC_STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {DOC_STATE_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {list.isError ? (
              <ErrorState error={list.error} onRetry={() => list.refetch()} />
            ) : !list.data ? (
              <ListSkeleton />
            ) : items.length === 0 && filtered ? (
              <EmptyState
                icon={SearchIcon}
                title="没有符合筛选条件的资料"
                description="换个分类、站点或状态，或改一下文件名关键词。"
                action={
                  <Button variant="outline" onClick={clearFilters}>
                    清除筛选
                  </Button>
                }
              />
            ) : items.length === 0 ? (
              <FirstUpload onFiles={openWithFiles} />
            ) : (
              <>
                <DocumentsTable me={me} items={items} categoryName={(id) => categories.data?.items.find((c) => c.id === id)?.name ?? "—"} onOpen={(id) => update({ doc: id, docTab: null }, "push")} onGoReview={onGoReview} />
                <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span className="tabular-nums">
                    已显示 {items.length} 份{filtered ? "（筛选后）" : ""}
                  </span>
                  {list.hasNextPage ? (
                    <Button variant="outline" size="sm" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
                      {list.isFetchingNextPage && <Spinner />}
                      加载更多
                    </Button>
                  ) : (
                    <span>已全部显示</span>
                  )}
                </div>
              </>
            )}
          </DocumentsPanel>
      </div>
      <UploadDialog initialFiles={dropped} remaining={counts ? counts.limit - counts.total : null} onOpenDoc={(id) => update({ dialog: null, doc: id, docTab: null })} />
      <CategoriesDialog />
    </>
  );
}

function CategoriesButton() {
  const { openIt } = useDialogParam("categories");
  return (
    <Button variant="outline" onClick={openIt}>
      <FolderCogIcon />
      分类管理
    </Button>
  );
}

/** 资料面板：整块可以拖入文件，拖入时显示放下提示 */
function DocumentsPanel({ header, children, onFiles }: { me: Me; header: React.ReactNode; children: React.ReactNode; onFiles: (files: File[]) => void }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  return (
    <Panel
      className="@container relative flex min-w-0 flex-col gap-4"
      aria-label="资料"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
    >
      {header}
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-(--semantic-radius-lg) border-2 border-dashed border-(--semantic-color-text-link) bg-accent text-(--semantic-color-text-link)">
          <UploadIcon className="size-8" aria-hidden />
          <p className="font-medium">松开即可选择分类与站点并上传</p>
        </div>
      )}
    </Panel>
  );
}

/** 没有任何资料：引导拖入文件；测试问答照样能用 */
function FirstUpload({ onFiles }: { onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border-2 border-dashed border-border px-6 py-12 text-center">
      <LibraryBigIcon className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">还没有资料。把产品手册、保修与退换政策拖到这里</p>
      <p className="max-w-md text-sm text-pretty text-muted-foreground">
        AI 出稿前会先查这里的资料，回答产品参数、保修与政策问题。支持 {UPLOAD_FORMATS}；{UPLOAD_LIMITS}。
      </p>
      <Button variant="outline" className="mt-2" onClick={() => input.current?.click()}>
        <UploadIcon />
        选择文件
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      <p className="mt-2 text-xs text-muted-foreground">没有资料时也能用测试问答提问，回答会标「资料不足」。</p>
    </div>
  );
}

/** 加载骨架：与表格同结构（文件名两行、状态、开关） */
function ListSkeleton() {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="正在加载资料">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border py-3 last:border-0">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-3/5 bg-muted motion-safe:animate-pulse" />
            <Skeleton className="h-3 w-2/5 bg-muted motion-safe:animate-pulse" />
          </div>
          <Skeleton className="h-4 w-14 bg-muted motion-safe:animate-pulse" />
          <Skeleton className="h-[18px] w-8 rounded-full bg-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/**
 * 资料表：面板宽时分类、站点、上传时间各占一列；窄时（测试问答在右侧、手机）合进文件名下方的说明行。
 * 失败行直接写原因并给「重新解析」
 */
function DocumentsTable({ me, items, categoryName, onOpen, onGoReview }: { me: Me; items: KnowledgeDocument[]; categoryName: (id: string) => string; onOpen: (id: string) => void; onGoReview: () => void }) {
  const toggle = useToggleAi();
  const reparse = useReparse();
  const extract = useQaExtract();
  const tz = me.active.timezone;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>文件名</TableHead>
          <TableHead className="hidden w-28 @3xl:table-cell">分类</TableHead>
          <TableHead className="hidden w-28 @3xl:table-cell">站点</TableHead>
          <TableHead className="w-24">状态</TableHead>
          <TableHead className="w-16">AI 可用</TableHead>
          <TableHead className="hidden w-28 @xl:table-cell">上传时间</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((d) => {
          const cat = categoryName(d.categoryId);
          const busy = reparse.isPending && reparse.variables === d.id;
          const extractBusy = extract.isPending && extract.variables === d.id;
          return (
            <TableRow key={d.id} className="state-layer cursor-pointer align-top" onClick={() => onOpen(d.id)}>
              <TableCell className="py-3 whitespace-normal">
                <button type="button" className="focus-ring line-clamp-2 rounded-sm text-left font-medium [overflow-wrap:anywhere]" onClick={(e) => (e.stopPropagation(), onOpen(d.id))}>
                  {d.name}
                </button>
                <p className="mt-0.5 text-xs text-muted-foreground @3xl:hidden">
                  {cat} · {marketsText(d.markets)}
                  <span className="@xl:hidden">
                    {" · "}
                    <span className="whitespace-nowrap">{inTz(d.createdAt, tz)}</span>
                  </span>
                </p>
                {d.status === "failed" && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="min-w-0 text-xs text-destructive [overflow-wrap:anywhere]">{d.failureReason ?? "解析失败"}</p>
                    <Button
                      variant="outline"
                      size="xs"
                      aria-disabled={busy || undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!busy) reparse.mutate(d.id);
                      }}
                    >
                      {busy ? <Spinner /> : <RotateCcwIcon />}
                      重新解析
                    </Button>
                  </div>
                )}
                {d.status === "ready" && <QaExtractLine doc={d} busy={extractBusy} onExtract={() => extract.mutate(d.id)} onGoReview={onGoReview} />}
              </TableCell>
              <TableCell className="hidden py-3 whitespace-normal text-muted-foreground [overflow-wrap:anywhere] @3xl:table-cell">
                {cat}
              </TableCell>
              <TableCell className="hidden py-3 whitespace-normal text-muted-foreground @3xl:table-cell">{marketsText(d.markets)}</TableCell>
              <TableCell className="py-3">
                <DocStatus doc={d} />
              </TableCell>
              <TableCell className="py-3" onClick={(e) => e.stopPropagation()}>
                {/* 包一层 flex：开关不坐在文字基线上，与同行状态文字垂直居中 */}
                <div className="flex">
                  <Switch checked={d.aiEnabled} onCheckedChange={(v) => toggle.mutate({ doc: d, aiEnabled: v })} aria-label={`${d.name} AI 可用`} />
                </div>
              </TableCell>
              <TableCell className="hidden py-3 text-muted-foreground tabular-nums @xl:table-cell">{inTz(d.createdAt, tz)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * 资料行里的「整理成问答」：整理中显示进度（列表每 5 秒刷新），完成写候选数并可去审核，失败写原因可重试；
 * 已有问答发布、资料仍 AI 可用时提示可以关掉这份资料（不自动关）
 */
function QaExtractLine({ doc, busy, onExtract, onGoReview }: { doc: KnowledgeDocument; busy: boolean; onExtract: () => void; onGoReview: () => void }) {
  const x = doc.qaExtract;
  const running = x.status === "running";
  return (
    <div className="mt-1.5 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {running ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner className="size-3.5" />
            正在整理成问答
          </span>
        ) : (
          <Button variant="outline" size="xs" aria-disabled={busy || undefined} onClick={() => !busy && onExtract()}>
            {busy ? <Spinner /> : <SparklesIcon />}
            {x.status === "idle" ? "整理成问答" : "重新整理"}
          </Button>
        )}
        {x.status === "done" && (
          <button type="button" className="focus-ring rounded-sm text-xs text-(--semantic-color-text-link)" onClick={onGoReview}>
            整理出 {x.count} 条候选，去审核
          </button>
        )}
        {x.status === "failed" && <span className="min-w-0 text-xs text-destructive [overflow-wrap:anywhere]">整理失败：{x.error ?? "原因未知"}</span>}
      </div>
      {doc.publishedQaCount > 0 && doc.aiEnabled && (
        <p className="text-xs text-muted-foreground">已有 {doc.publishedQaCount} 条问答由它整理发布，可以关掉这份资料的「AI 可用」，让 AI 只引用审核过的问答。</p>
      )}
    </div>
  );
}
