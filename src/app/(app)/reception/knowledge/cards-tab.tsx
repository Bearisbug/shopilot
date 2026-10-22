"use client";

// 「经验卡」页签（PAGE-RECEPTION-KB，API-KB-029）：已发布与已下架的卡，筛选存地址；点一行打开卡抽屉。
// 顶部写 Agent 自动改卡的状态（API-KB-045）：暂停时横幅写原因与日期，管理员可恢复（API-KB-044）
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArchiveIcon, BotIcon, PlusIcon, SearchIcon, TriangleAlertIcon, WaypointsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import { CARD_STATUSES, CARD_STATUS_LABEL, type CardList, type CardStatus, type ExperienceCard } from "@/contracts/cards";
import { KNOWLEDGE_MARKETS, QA_STAGES, type KnowledgeMarket, type QaStage } from "@/contracts/knowledge";
import { EmptyState, ErrorState, LoadingRows, Panel } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorText, newKey } from "@/lib/api";
import { inTz } from "@/lib/format";
import { adoptionRate, agentStatusKey, cardsKey, handoffRate, useAgentStatus } from "./cards-ui";
import { MARKET_LABEL, marketsText, useUrlParams } from "./knowledge-ui";
import { ProductFilter, productsText, STAGE_OPTIONS, stageText, useProducts } from "./qa-ui";

export function CardsTab({ me, onNew, onOpen }: { me: Me; onNew: () => void; onOpen: (id: string) => void }) {
  const { params, update } = useUrlParams();
  const products = useProducts();
  const rawStatus = params.get("cStatus");
  const rawStage = params.get("cStage");
  const rawMarket = params.get("cMarket");
  const rawProduct = params.get("cProduct");
  const status: CardStatus = (CARD_STATUSES as readonly string[]).includes(rawStatus ?? "") ? (rawStatus as CardStatus) : "published";
  const stage = (QA_STAGES as readonly string[]).includes(rawStage ?? "") ? (rawStage as QaStage) : "all";
  const market = (KNOWLEDGE_MARKETS as readonly string[]).includes(rawMarket ?? "") ? (rawMarket as KnowledgeMarket) : "all";
  const product = rawProduct === "none" || products.data?.items.some((p) => p.id === rawProduct) ? rawProduct! : "all";
  const unseen = params.get("cUnseen") === "1";
  const qParam = (params.get("cQ") ?? "").slice(0, 100);
  const [search, setSearch] = useState(qParam);

  // 地址里不认识的筛选值清掉，不发给接口（INT-020）
  useEffect(() => {
    const bad: Record<string, null> = {};
    if (rawStatus !== null && status === "published" && rawStatus !== "published") bad.cStatus = null;
    if (rawStage !== null && stage === "all") bad.cStage = null;
    if (rawMarket !== null && market === "all") bad.cMarket = null;
    if (rawProduct !== null && products.data && product === "all") bad.cProduct = null;
    if (params.has("cUnseen") && !unseen) bad.cUnseen = null;
    if (Object.keys(bad).length) update(bad);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在地址里的筛选或产品清单变化时校验
  }, [rawStatus, rawStage, rawMarket, rawProduct, unseen, products.data]);

  useEffect(() => {
    if (search.trim() === qParam) return;
    const t = setTimeout(() => update({ cQ: search.trim() || null }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只跟随输入变化
  }, [search]);

  const filters = new URLSearchParams({ status });
  if (stage !== "all") filters.set("stage", stage);
  if (market !== "all") filters.set("market", market);
  if (product !== "all") filters.set("productId", product);
  if (unseen) filters.set("unseen", "1");
  if (qParam) filters.set("q", qParam);
  const qs = filters.toString();
  const waitProducts = rawProduct !== null && rawProduct !== "none" && !products.data && !products.isError;

  const list = useInfiniteQuery({
    queryKey: [...cardsKey, "list", qs],
    queryFn: ({ pageParam }) => api.get<CardList>(`/api/v1/knowledge/cards?${qs}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !waitProducts,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const first = list.data?.pages[0];
  const filtered = stage !== "all" || market !== "all" || product !== "all" || unseen || qParam !== "";
  const clearFilters = () => {
    setSearch("");
    update({ cStage: null, cMarket: null, cProduct: null, cQ: null, cUnseen: null });
  };

  return (
    <Panel className="@container flex min-w-0 flex-col gap-4" aria-labelledby="kb-cards-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="kb-cards-title" tabIndex={-1} className="flex items-baseline gap-2 text-lg font-semibold focus-visible:outline-none">
            经验卡
            {first && <span className="text-sm font-normal text-muted-foreground tabular-nums">已发布 {first.counts.published}</span>}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">写遇到什么情况、按什么步骤处理；买家情况满足调用条件时，AI 按卡上的步骤出稿。点一行查看</p>
          <AgentTodayLine />
        </div>
        <Button onClick={onNew}>
          <PlusIcon />
          新建经验卡
        </Button>
      </div>
      <AgentPausedBanner me={me} />
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => update({ cStatus: v === "published" ? null : v })}>
          <SelectTrigger size="sm" aria-label="按状态筛选">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CARD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {CARD_STATUS_LABEL[s]}
                {first ? ` ${first.counts[s]}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <InputGroup className="h-8 w-full @lg:w-52">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜标题或调用条件" aria-label="按标题或调用条件搜索" />
        </InputGroup>
        <ProductFilter value={product} onChange={(v) => update({ cProduct: v === "all" ? null : v })} products={products.data?.items ?? []} />
        <Select value={stage} onValueChange={(v) => update({ cStage: v === "all" ? null : v })}>
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
        <Select value={market} onValueChange={(v) => update({ cMarket: v === "all" ? null : v })}>
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
        <label className="flex h-8 items-center gap-2 rounded-md px-1 text-sm">
          <Switch checked={unseen} onCheckedChange={(on) => update({ cUnseen: on ? "1" : null })} aria-label="只看 Agent 改过、还没人看过的卡" />
          <span>Agent 改过未看</span>
          {first ? <span className="rounded-full bg-accent px-1.5 text-xs text-(--semantic-color-text-link) tabular-nums">{first.unseenCount}</span> : null}
        </label>
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <LoadingRows rows={5} />
      ) : items.length === 0 && filtered ? (
        <EmptyState
          icon={SearchIcon}
          title={unseen ? "没有 Agent 改过、还没人看过的卡" : "没有符合筛选条件的经验卡"}
          description={unseen ? "Agent 改卡复测通过后会出现在这里，看过或回退后消失。" : "换个产品、阶段或站点，或改一下关键词。"}
          action={
            <Button variant="outline" onClick={clearFilters}>
              清除筛选
            </Button>
          }
        />
      ) : items.length === 0 ? (
        status === "archived" ? (
          <EmptyState icon={ArchiveIcon} title="没有下架的经验卡" description="下架的卡 AI 出稿不会用，可以随时恢复发布。" />
        ) : (
          <EmptyState
            icon={WaypointsIcon}
            title="还没有经验卡"
            description="把一类问题的处理流程写成卡：遇到什么情况、按什么步骤处理、走不通时转人工还是建工单。"
            action={
              <Button variant="outline" onClick={onNew}>
                <PlusIcon />
                新建经验卡
              </Button>
            }
          />
        )
      ) : (
        <>
          <CardsTable me={me} items={items} onOpen={onOpen} />
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              已显示 {items.length} 张{filtered ? "（筛选后）" : ""}
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

/** 最近改动的人：Agent 写的当前版本显示「Agent」，否则显示人名 */
function authorText(c: ExperienceCard) {
  return c.lastAuthor === "agent" ? "Agent" : (c.updatedByName ?? c.createdByName ?? "—");
}

function CardsTable({ me, items, onOpen }: { me: Me; items: ExperienceCard[]; onOpen: (id: string) => void }) {
  const tz = me.active.timezone;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>标题与调用条件</TableHead>
          <TableHead className="hidden w-36 @3xl:table-cell">产品 · 阶段</TableHead>
          <TableHead className="hidden w-32 @2xl:table-cell">最近改动</TableHead>
          <TableHead className="hidden w-44 @xl:table-cell">近 30 天</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((c) => (
          <TableRow key={c.id} className="state-layer cursor-pointer align-top" onClick={() => onOpen(c.id)}>
            <TableCell className="py-3 whitespace-normal">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <button type="button" className="focus-ring rounded-sm text-left font-medium [overflow-wrap:anywhere]" onClick={(e) => (e.stopPropagation(), onOpen(c.id))}>
                  {c.title}
                </button>
                {c.agentUnseen && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent px-1.5 text-xs whitespace-nowrap text-(--semantic-color-text-link)">
                    <BotIcon className="size-3" aria-hidden />
                    Agent 改过，未看
                  </span>
                )}
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {c.conditionMode === "all" ? "全部满足：" : "满足任一："}
                {c.conditions.join("；")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.steps.length} 步 · 第 {c.version} 版<span className="@3xl:hidden"> · {productsText(c.products)} · {stageText(c.stage)}</span>
                <span className="@4xl:hidden"> · {marketsText(c.markets)}</span>
              </p>
              {c.status === "published" && !c.embedded && <p className="mt-1 text-xs text-(--semantic-color-feedback-warning)">检索向量生成中，最多 5 分钟后 AI 出稿才找得到这张卡</p>}
            </TableCell>
            <TableCell className="hidden py-3 whitespace-normal text-muted-foreground [overflow-wrap:anywhere] @3xl:table-cell">
              {productsText(c.products)}
              <br />
              {stageText(c.stage)}
            </TableCell>
            <TableCell className="hidden py-3 text-muted-foreground @2xl:table-cell">
              {authorText(c)}
              <br />
              <span className="text-xs tabular-nums">{inTz(c.updatedAt ?? c.createdAt, tz)}</span>
            </TableCell>
            <TableCell className="hidden py-3 text-muted-foreground tabular-nums @xl:table-cell">
              调用 {c.stats.calls} 次
              <br />
              <span className="text-xs">
                采纳 {adoptionRate(c.stats)} · 转人工 {handoffRate(c.stats)}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** 没暂停时：今天 Agent 已直接改卡几次（RULE-KB-007 上限） */
function AgentTodayLine() {
  const q = useAgentStatus();
  if (!q.data || q.data.paused) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
      <BotIcon className="size-3.5" aria-hidden />
      今天 Agent 已直接改卡 {q.data.todayApplied} / {q.data.dailyLimit} 次
    </p>
  );
}

/** 暂停时的横幅：原因与日期；恢复只给管理员（reception.manage） */
function AgentPausedBanner({ me }: { me: Me }) {
  const qc = useQueryClient();
  const q = useAgentStatus();
  const [key, setKey] = useState(newKey);
  const resume = useMutation({
    mutationFn: () => api.post("/api/v1/knowledge/agent-autoapply/resume", {}, key),
    onSuccess: () => {
      setKey(newKey());
      qc.invalidateQueries({ queryKey: agentStatusKey });
      toast.success("已恢复自动生效", { description: "之后 Agent 改卡复测通过就直接生效。" });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const paused = q.data?.paused;
  if (!paused) return null;
  return (
    <div role="status" className="flex items-start gap-3 rounded-md bg-(--semantic-color-surface-warm) px-4 py-3">
      <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-(--semantic-color-feedback-warning)" aria-hidden />
      {/* 窄屏时按钮换到文字下面，不挤压文字 */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-sm font-medium [overflow-wrap:anywhere]">
            Agent 自动改卡已暂停：{paused.reason ?? "AI 质量周指标连续回落"}（{inTz(paused.at, me.active.timezone, "M 月 d 日")}）
          </p>
          <p className="text-xs text-muted-foreground">暂停期间 Agent 照常体检、照常学习，改卡一律进「学习」页签待审核。</p>
        </div>
        {me.active.permissions.includes("reception.manage") && (
          <Button variant="outline" size="sm" disabled={resume.isPending} onClick={() => resume.mutate()}>
            {resume.isPending && <Spinner />}
            恢复自动生效
          </Button>
        )}
      </div>
    </div>
  );
}
