"use client";

// 「问答」页签（PAGE-RECEPTION-KB，API-KB-013、016、017、026、027）：已发布与已下架的问答，筛选存地址
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArchiveIcon, ArchiveRestoreIcon, MessagesSquareIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import { KNOWLEDGE_MARKETS, QA_STAGES, type KnowledgeMarket, type KnowledgeQa, type KnowledgeQaList, type KnowledgeQaResult, type QaStage } from "@/contracts/knowledge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingRows, Panel } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, api, errorText } from "@/lib/api";
import { inTz } from "@/lib/format";
import { MARKET_LABEL, marketsText, useUrlParams } from "./knowledge-ui";
import { ProductFilter, productsText, qaKey, STAGE_OPTIONS, stageText, useProducts } from "./qa-ui";

const LIST_STATUSES = ["published", "archived"] as const;
type ListStatus = (typeof LIST_STATUSES)[number];
const LIST_STATUS_LABEL: Record<ListStatus, string> = { published: "已发布", archived: "已下架" };

/** 打开问答弹窗：新建 ?dialog=qa；编辑或审核 ?dialog=qa&qa=<id>（工作台依据链到 ?tab=qa&qa=<id>，没有 dialog 也打开） */
export function useQaDialog() {
  const { params, update } = useUrlParams();
  const qaId = params.get("qa");
  const dialog = params.get("dialog");
  return {
    open: dialog === "qa" || (Boolean(qaId) && !dialog),
    qaId,
    openNew: () => update({ dialog: "qa", qa: null }, "push"),
    openFor: (id: string) => update({ dialog: "qa", qa: id }, "push"),
    close: () => update({ dialog: null, qa: null }),
    reject: (id: string) => update({ dialog: "qa-reject", qa: id }),
  };
}

/** 下架、恢复：成功后刷新列表；版本或状态变了 409，刷新后再试 */
export function useQaStatusChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ qa, to }: { qa: KnowledgeQa; to: "archive" | "restore" }) => api.post<KnowledgeQaResult>(`/api/v1/knowledge/qa/${qa.id}/${to}`, { version: qa.version }),
    onSuccess: (_r, { to }) => {
      toast.success(to === "archive" ? "已下架，AI 出稿不再引用" : "已恢复发布");
      qc.invalidateQueries({ queryKey: qaKey });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        toast.error("这条问答刚被别人改过，已刷新，请再试一次。");
        return qc.invalidateQueries({ queryKey: qaKey });
      }
      toast.error(errorText(e));
    },
  });
}

export function QaTab({ me, onNew, onOpen }: { me: Me; onNew: () => void; onOpen: (id: string) => void }) {
  const { params, update } = useUrlParams();
  const products = useProducts();
  const rawStatus = params.get("qaStatus");
  const rawStage = params.get("qaStage");
  const rawMarket = params.get("qaMarket");
  const rawProduct = params.get("qaProduct");
  const status: ListStatus = (LIST_STATUSES as readonly string[]).includes(rawStatus ?? "") ? (rawStatus as ListStatus) : "published";
  const stage = (QA_STAGES as readonly string[]).includes(rawStage ?? "") ? (rawStage as QaStage) : "all";
  const market = (KNOWLEDGE_MARKETS as readonly string[]).includes(rawMarket ?? "") ? (rawMarket as KnowledgeMarket) : "all";
  const product = rawProduct === "none" || products.data?.items.some((p) => p.id === rawProduct) ? rawProduct! : "all";
  const qParam = (params.get("qaQ") ?? "").slice(0, 100);
  const [search, setSearch] = useState(qParam);

  // 地址里不认识的筛选值清掉，不发给接口（INT-020）
  useEffect(() => {
    const bad: Record<string, null> = {};
    if (rawStatus !== null && status === "published" && rawStatus !== "published") bad.qaStatus = null;
    if (rawStage !== null && stage === "all") bad.qaStage = null;
    if (rawMarket !== null && market === "all") bad.qaMarket = null;
    if (rawProduct !== null && products.data && product === "all") bad.qaProduct = null;
    if (Object.keys(bad).length) update(bad);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在地址里的筛选或产品清单变化时校验
  }, [rawStatus, rawStage, rawMarket, rawProduct, products.data]);

  useEffect(() => {
    if (search.trim() === qParam) return;
    const t = setTimeout(() => update({ qaQ: search.trim() || null }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只跟随输入变化
  }, [search]);

  const filters = new URLSearchParams({ status });
  if (stage !== "all") filters.set("stage", stage);
  if (market !== "all") filters.set("market", market);
  if (product !== "all") filters.set("productId", product);
  if (qParam) filters.set("q", qParam);
  const qs = filters.toString();
  const waitProducts = rawProduct !== null && rawProduct !== "none" && !products.data && !products.isError;

  const list = useInfiniteQuery({
    queryKey: [...qaKey, "list", qs],
    queryFn: ({ pageParam }) => api.get<KnowledgeQaList>(`/api/v1/knowledge/qa?${qs}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !waitProducts,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const counts = list.data?.pages[0]?.counts;
  const filtered = stage !== "all" || market !== "all" || product !== "all" || qParam !== "";
  const clearFilters = () => {
    setSearch("");
    update({ qaStage: null, qaMarket: null, qaProduct: null, qaQ: null });
  };

  return (
    <Panel className="@container flex min-w-0 flex-col gap-4" aria-labelledby="kb-qa-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="kb-qa-title" className="flex items-baseline gap-2 text-lg font-semibold">
            问答
            {counts && <span className="text-sm font-normal text-muted-foreground tabular-nums">已发布 {counts.published}</span>}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">AI 出稿时先按问法检索这里的问答，再查资料；点一行编辑</p>
        </div>
        <Button onClick={onNew}>
          <PlusIcon />
          新建问答
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => update({ qaStatus: v === "published" ? null : v })}>
          <SelectTrigger size="sm" aria-label="按状态筛选">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LIST_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {LIST_STATUS_LABEL[s]}
                {counts ? ` ${counts[s]}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <InputGroup className="h-8 w-full @lg:w-52">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜问法或回复" aria-label="按问法或回复搜索" />
        </InputGroup>
        <ProductFilter value={product} onChange={(v) => update({ qaProduct: v === "all" ? null : v })} products={products.data?.items ?? []} />
        <Select value={stage} onValueChange={(v) => update({ qaStage: v === "all" ? null : v })}>
          <SelectTrigger size="sm" aria-label="按服务阶段筛选">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部阶段</SelectItem>
            {STAGE_OPTIONS.filter((s) => s !== "any").map((s) => (
              <SelectItem key={s} value={s}>
                {stageText(s)}
              </SelectItem>
            ))}
            <SelectItem value="any">只看「全部阶段」的</SelectItem>
          </SelectContent>
        </Select>
        <Select value={market} onValueChange={(v) => update({ qaMarket: v === "all" ? null : v })}>
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
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <LoadingRows rows={5} />
      ) : items.length === 0 && filtered ? (
        <EmptyState
          icon={SearchIcon}
          title="没有符合筛选条件的问答"
          description="换个产品、阶段或站点，或改一下关键词。"
          action={
            <Button variant="outline" onClick={clearFilters}>
              清除筛选
            </Button>
          }
        />
      ) : items.length === 0 ? (
        status === "archived" ? (
          <EmptyState icon={ArchiveIcon} title="没有下架的问答" description="下架的问答 AI 不会引用，可以随时恢复发布。" />
        ) : (
          <EmptyState
            icon={MessagesSquareIcon}
            title="还没有发布的问答"
            description="手写一条，或到「资料」页签对已上传的资料点「整理成问答」，审核通过后出现在这里。"
            action={
              <Button variant="outline" onClick={onNew}>
                <PlusIcon />
                新建问答
              </Button>
            }
          />
        )
      ) : (
        <>
          <QaTable me={me} items={items} onOpen={onOpen} />
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              已显示 {items.length} 条{filtered ? "（筛选后）" : ""}
            </span>
            {list.hasNextPage ? (
              <Button variant="outline" size="sm" aria-disabled={list.isFetchingNextPage || undefined} onClick={() => !list.isFetchingNextPage && list.fetchNextPage()}>
                {list.isFetchingNextPage && <Spinner />}
                加载更多
              </Button>
            ) : (
              <span>已全部显示</span>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

function QaTable({ me, items, onOpen }: { me: Me; items: KnowledgeQa[]; onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const change = useQaStatusChange();
  const [deleting, setDeleting] = useState<KnowledgeQa | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/knowledge/qa/${id}`),
    onSuccess: () => {
      toast.success("已删除问答");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: qaKey });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const tz = me.active.timezone;
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>问法与回复</TableHead>
            <TableHead className="hidden w-40 @3xl:table-cell">产品</TableHead>
            <TableHead className="hidden w-24 @3xl:table-cell">阶段</TableHead>
            <TableHead className="hidden w-28 @4xl:table-cell">站点</TableHead>
            <TableHead className="hidden w-28 @xl:table-cell">更新时间</TableHead>
            <TableHead className="w-28">
              <span className="sr-only">操作</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((qa) => {
            const busy = change.isPending && change.variables?.qa.id === qa.id;
            const more = qa.questions.length - 1;
            return (
              <TableRow key={qa.id} className="state-layer cursor-pointer align-top" onClick={() => onOpen(qa.id)}>
                <TableCell className="py-3 whitespace-normal">
                  <button type="button" className="focus-ring rounded-sm text-left font-medium [overflow-wrap:anywhere]" onClick={(e) => (e.stopPropagation(), onOpen(qa.id))}>
                    {qa.questions[0]}
                  </button>
                  {more > 0 && <span className="ml-2 text-xs whitespace-nowrap text-muted-foreground">另 {more} 个问法</span>}
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">{qa.answer}</p>
                  <p className="mt-1 text-xs text-muted-foreground @3xl:hidden">
                    {productsText(qa.products)} · {stageText(qa.stage)} · {marketsText(qa.markets)}
                  </p>
                  {qa.status === "published" && !qa.embedded && <p className="mt-1 text-xs text-(--semantic-color-feedback-warning)">检索向量生成中，最多 5 分钟后 AI 才能检索到</p>}
                </TableCell>
                <TableCell className="hidden py-3 whitespace-normal text-muted-foreground [overflow-wrap:anywhere] @3xl:table-cell">{productsText(qa.products)}</TableCell>
                <TableCell className="hidden py-3 text-muted-foreground @3xl:table-cell">{stageText(qa.stage)}</TableCell>
                <TableCell className="hidden py-3 whitespace-normal text-muted-foreground @4xl:table-cell">{marketsText(qa.markets)}</TableCell>
                <TableCell className="hidden py-3 text-muted-foreground tabular-nums @xl:table-cell">{inTz(qa.updatedAt ?? qa.createdAt, tz)}</TableCell>
                <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={`编辑「${qa.questions[0]}」`} onClick={() => onOpen(qa.id)}>
                      <PencilIcon />
                    </Button>
                    {qa.status === "published" ? (
                      <Button variant="ghost" size="icon-sm" aria-label={`下架「${qa.questions[0]}」`} aria-disabled={busy || undefined} onClick={() => !busy && change.mutate({ qa, to: "archive" })}>
                        {busy ? <Spinner /> : <ArchiveIcon />}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon-sm" aria-label={`恢复发布「${qa.questions[0]}」`} aria-disabled={busy || undefined} onClick={() => !busy && change.mutate({ qa, to: "restore" })}>
                        {busy ? <Spinner /> : <ArchiveRestoreIcon />}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" aria-label={`删除「${qa.questions[0]}」`} onClick={() => setDeleting(qa)}>
                      <Trash2Icon />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`删除问答「${deleting?.questions[0] ?? ""}」？`}
        desc="删除后不能恢复，AI 出稿不再引用；只想暂时停用请用「下架」。已出的草稿依据会显示为已下架。"
        confirmText="删除"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
