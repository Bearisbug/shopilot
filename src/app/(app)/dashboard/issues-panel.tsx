"use client";

// 「问题与转人工原因」面板：全部问题（有买家发言的会话段）/ 转人工的（转人工的 AI 接待段）两个视图；
// 类别分布（点类别看会话段）、按日趋势（图表配同数据明细表）、转人工的视图另显示转人工原因；管理员可管理类别。
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, LockIcon, MessageSquareTextIcon, PencilIcon, PlusIcon, Settings2Icon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { BrandChart, stripes, useBrandColors } from "@/components/charts/chart";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useDialogParam } from "@/components/shell/global-dialogs";
import { EmptyState, ErrorState, LoadingRows, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ISSUE_LIST_LIMIT, ISSUE_VIEWS, type DashboardIssueList, type DashboardResponse, type IssueView } from "@/contracts/dashboard";
import { ISSUE_CATEGORY_LIMIT, ISSUE_OTHER, issueCategoryBody, type IssueCategory, type IssueCategoryDeleteResult, type IssueCategoryList } from "@/contracts/issues";
import { ApiError, api, errorText, newKey } from "@/lib/api";
import { inTz } from "@/lib/format";
import { axes, num } from "./dashboard-lib";
import { HandoffReasonsChart, Legend } from "./dashboard-panels";

const VIEW_LABEL: Record<IssueView, string> = { all: "全部问题", handoff: "转人工的" };
/** 趋势图最多单列的类别数，其余合成「其余类别」 */
const TREND_TOP = 5;

/** 视图与打开的类别都写进 URL（?issues=handoff、?issue=<类别 ID>）：切视图、打开类别是导航（push），关闭抽屉回到原地址（replace） */
function useIssueParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("issues");
  const view: IssueView = (ISSUE_VIEWS as readonly string[]).includes(raw ?? "") ? (raw as IssueView) : "all";
  const go = (patch: Record<string, string | null>, mode: "push" | "replace") => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router[mode](qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return {
    view,
    setView: (v: IssueView) => go({ issues: v === "all" ? null : v, issue: null }, "push"),
    openCat: params.get("issue"),
    open: (id: string) => go({ issue: id }, "push"),
    close: () => go({ issue: null }, "replace"),
  };
}

export function IssuesPanel({ d, tz, rangeQs, canManage }: { d: DashboardResponse; tz: string; rangeQs: string; canManage: boolean }) {
  const { view, setView, openCat, open, close } = useIssueParams();
  const manage = useDialogParam("issue-categories");
  const v = d.issues.views[view];
  const nameOf = (id: string) => d.issues.categories.find((c) => c.id === id)?.name ?? ISSUE_OTHER;
  const extracted = v.segments - v.pending;
  const description =
    view === "all"
      ? `${num(v.segments)} 段有买家发言 · AI 已提取 ${num(extracted)} 段，每段一句话总结归到一个类别`
      : `${num(v.segments)} 段转人工的 AI 接待段 · 按问题类别与转人工原因`;

  return (
    <Panel className="min-w-0">
      <PanelHeader title="问题与转人工原因" description={description}>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} className="overflow-hidden rounded-md" value={view} onValueChange={(x) => x && setView(x as IssueView)} aria-label="统计哪些会话段">
            {ISSUE_VIEWS.map((x) => (
              <ToggleGroupItem key={x} value={x} className="px-3">
                {VIEW_LABEL[x]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {canManage && (
            <Button variant="outline" size="sm" onClick={manage.openIt}>
              <Settings2Icon />
              管理类别
            </Button>
          )}
        </div>
      </PanelHeader>

      {v.segments === 0 ? (
        <EmptyState
          icon={MessageSquareTextIcon}
          title={view === "all" ? "这个范围内没有买家发言的会话段" : "这个范围内没有转人工的会话段"}
          description={view === "all" ? "买家发来消息、停止发言 30 分钟后，AI 写一句问题总结并归到类别。" : "AI 接待中的会话因关键词、置信度低、买家要求人工等原因交给人工时计入。"}
        />
      ) : extracted === 0 ? (
        <EmptyState icon={MessageSquareTextIcon} title="问题还在提取" description={`${num(v.pending)} 段还没提取：买家停止发言 30 分钟后由 AI 提取，约 10 分钟一轮。`} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <CategoryTable stats={v} nameOf={nameOf} onOpen={open} />
          <IssueTrend stats={v} nameOf={nameOf} />
        </div>
      )}
      {v.pending > 0 && extracted > 0 && <p className="mt-3 text-xs text-muted-foreground tabular-nums">另有 {num(v.pending)} 段还没提取：买家停止发言 30 分钟后由 AI 提取，约 10 分钟一轮。</p>}

      {view === "handoff" && (
        <div className="mt-6 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">转人工原因</h3>
          <p className="mt-0.5 mb-3 text-xs text-muted-foreground tabular-nums">{num(d.handoffReasons.reduce((s, r) => s + r.count, 0))} 段 · 每段取最后一次转人工的原因</p>
          <HandoffReasonsChart rows={d.handoffReasons} />
        </div>
      )}

      <IssueSegmentsSheet categoryId={openCat} categoryName={openCat ? nameOf(openCat) : ""} view={view} rangeQs={rangeQs} tz={tz} onClose={close} />
      {canManage && <IssueCategoriesDialog open={manage.open} onClose={manage.close} />}
    </Panel>
  );
}

// ---------- 类别分布 ----------

function CategoryTable({ stats, nameOf, onOpen }: { stats: DashboardResponse["issues"]["views"][IssueView]; nameOf: (id: string) => string; onOpen: (id: string) => void }) {
  const total = stats.byCategory.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...stats.byCategory.map((r) => r.count));
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold">按类别</h3>
      <div className="-mx-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>类别</TableHead>
              <TableHead className="w-2/5">
                <span className="sr-only">占比条</span>
              </TableHead>
              <TableHead className="text-right">会话段</TableHead>
              <TableHead className="text-right">占比</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.byCategory.map((r) => (
              <TableRow key={r.categoryId} className="h-11">
                <TableCell className="max-w-48 whitespace-normal">
                  <Button variant="link" className="h-auto text-left whitespace-normal [overflow-wrap:anywhere]" aria-label={`查看「${nameOf(r.categoryId)}」的会话段`} onClick={() => onOpen(r.categoryId)}>
                    {nameOf(r.categoryId)}
                  </Button>
                </TableCell>
                <TableCell aria-hidden="true">
                  <span className="block h-2 rounded-full bg-(--semantic-color-text-link)/80" style={{ width: `${Math.max(4, (r.count / max) * 100)}%` }} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{num(r.count)}</TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">{Math.round((r.count / total) * 100)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">点类别名查看这些会话段的一句话总结。</p>
    </div>
  );
}

// ---------- 按日趋势 ----------

function IssueTrend({ stats, nameOf }: { stats: DashboardResponse["issues"]["views"][IssueView]; nameOf: (id: string) => string }) {
  const colors = useBrandColors();
  const top = stats.byCategory.slice(0, TREND_TOP).map((r) => r.categoryId);
  const hasRest = stats.byCategory.length > TREND_TOP;
  const series = [...top.map((id) => ({ key: id, label: nameOf(id) })), ...(hasRest ? [{ key: "rest", label: "其余类别" }] : [])];
  const valueOf = (counts: Record<string, number>, key: string) =>
    key === "rest" ? Object.entries(counts).reduce((s, [id, n]) => (top.includes(id) ? s : s + n), 0) : (counts[key] ?? 0);
  const rows = stats.trend.map((t) => ({ date: t.date, values: series.map((s) => valueOf(t.counts, s.key)) }));
  const nonEmpty = rows.filter((r) => r.values.some((x) => x > 0));
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">按日趋势</h3>
        <Legend items={series.map((s) => s.label)} />
      </div>
      {colors && (
        <BrandChart
          type="bar"
          height={220}
          label={`每日问题类别：${nonEmpty.map((r) => `${r.date} ${series.map((s, i) => `${s.label} ${r.values[i]}`).join("，")}`).join("；")}`}
          data={{
            labels: rows.map((r) => inTz(`${r.date}T12:00:00Z`, "UTC", "MM-dd")),
            datasets: series.map((s, i) => ({
              label: s.label,
              data: rows.map((r) => r.values[i]),
              backgroundColor: i === 0 ? stripes(colors.series[0], colors.surface) : colors.series[i],
              borderRadius: 4,
              stack: "s",
            })),
          }}
          options={{ interaction: { mode: "index", intersect: false }, scales: axes(colors, { stacked: true }) }}
        />
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground select-none">按日明细</summary>
        <div className="scroll-y mt-2 max-h-72 overscroll-contain">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                {series.map((s) => (
                  <TableHead key={s.key} className="text-right whitespace-nowrap">
                    {s.label}
                  </TableHead>
                ))}
                <TableHead className="text-right">合计</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nonEmpty.map((r) => (
                <TableRow key={r.date}>
                  <TableCell className="tabular-nums">{r.date}</TableCell>
                  {r.values.map((x, i) => (
                    <TableCell key={series[i].key} className="text-right tabular-nums">
                      {x || <span className="text-muted-foreground">0</span>}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{r.values.reduce((a, b) => a + b, 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </div>
  );
}

// ---------- 类别下的会话段 ----------

function IssueSegmentsSheet({ categoryId, categoryName, view, rangeQs, tz, onClose }: { categoryId: string | null; categoryName: string; view: IssueView; rangeQs: string; tz: string; onClose: () => void }) {
  return (
    <Sheet open={Boolean(categoryId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 data-[side=right]:sm:max-w-lg">
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle>
            {categoryName} · {VIEW_LABEL[view]}
          </SheetTitle>
          <SheetDescription>按会话段开始时间从新到旧，最多显示 {ISSUE_LIST_LIMIT} 段。</SheetDescription>
        </SheetHeader>
        {categoryId && <SegmentList key={`${categoryId}-${view}-${rangeQs}`} categoryId={categoryId} view={view} rangeQs={rangeQs} tz={tz} />}
      </SheetContent>
    </Sheet>
  );
}

function SegmentList({ categoryId, view, rangeQs, tz }: { categoryId: string; view: IssueView; rangeQs: string; tz: string }) {
  const q = useQuery({
    queryKey: ["dashboard-issues", rangeQs, view, categoryId],
    queryFn: () => api.get<DashboardIssueList>(`/api/v1/dashboard/issues?${rangeQs ? `${rangeQs}&` : ""}view=${view}&categoryId=${categoryId}`),
  });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data)
    return (
      <div className="p-4">
        <LoadingRows rows={5} />
      </div>
    );
  const r = q.data;
  if (r.items.length === 0) return <EmptyState icon={MessageSquareTextIcon} title="这个类别下没有会话段" description="类别刚被删除或改了范围时会出现这种情况，关掉后看板会刷新。" />;
  return (
    <div className="scroll-y min-h-0 flex-1 overscroll-contain">
      <p className="px-4 pt-3 text-xs text-muted-foreground tabular-nums">
        共 {num(r.total)} 段{r.total > r.items.length ? `，显示最近 ${r.items.length} 段` : ""}
      </p>
      <ul className="flex flex-col px-4 pb-4" aria-label={`「${r.categoryName}」的会话段`}>
        {r.items.map((it) => (
          <li key={it.segmentId} className="flex items-start gap-3 border-b border-border py-3 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm [overflow-wrap:anywhere]">{it.summary ?? <span className="text-muted-foreground">（没有总结）</span>}</p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {inTz(it.startedAt, tz)} · {it.shopName} · {it.buyerName}
              </p>
            </div>
            <Button asChild variant="ghost" size="sm" className="shrink-0">
              <Link href={`/wb/${it.conversationId}`} target="_blank" rel="noopener">
                <ExternalLinkIcon />
                打开会话
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- 管理类别（管理员） ----------

const CATEGORIES_KEY = ["issue-categories"] as const;

function nameError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.type === "duplicate") return "已有同名类别";
    if (e.type === "not-allowed" && e.problem.code === "category_quota") return `类别最多 ${ISSUE_CATEGORY_LIMIT} 个`;
  }
  return errorText(e);
}

function checkName(name: string): string | undefined {
  const r = issueCategoryBody.safeParse({ name });
  return r.success ? undefined : r.error.issues[0].message;
}

function IssueCategoriesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>管理问题类别</DialogTitle>
          <DialogDescription>AI 提取问题时只从这些类别里选；改名、删除都不会重新提取，删除的类别里的会话段归入「{ISSUE_OTHER}」。</DialogDescription>
        </DialogHeader>
        {open && <CategoriesBody />}
      </DialogContent>
    </Dialog>
  );
}

function CategoriesBody() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: CATEGORIES_KEY, queryFn: () => api.get<IssueCategoryList>("/api/v1/issue-categories") });
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [key, setKey] = useState(newKey);
  const [removing, setRemoving] = useState<IssueCategoryList["items"][number] | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["dashboard-issues"] });
  };
  const create = useMutation({
    mutationFn: (n: string) => api.post<IssueCategory>("/api/v1/issue-categories", { name: n }, key),
    onSuccess: (c) => {
      toast.success(`已新增类别「${c.name}」`, { description: "之后提取的问题会用到它，已提取的不重新归类。" });
      setName("");
      setError(undefined);
      setKey(newKey());
      refresh();
    },
    onError: (e) => {
      setKey(newKey());
      setError(nameError(e));
    },
  });
  const remove = useMutation({
    mutationFn: (c: IssueCategory) => api.delete<IssueCategoryDeleteResult>(`/api/v1/issue-categories/${c.id}`),
    onSuccess: (r, c) => {
      toast.success(`已删除类别「${c.name}」`, { description: r.movedSegments ? `${r.movedSegments} 个会话段归入「${ISSUE_OTHER}」。` : undefined });
      setRemoving(null);
      refresh();
    },
    onError: (e) => {
      toast.error(errorText(e));
      setRemoving(null);
      refresh();
    },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = checkName(name);
    if (msg) return setError(msg);
    create.mutate(name.trim());
  };

  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  if (!list.data) return <LoadingRows rows={4} />;
  const items = list.data.items;
  const full = items.length >= ISSUE_CATEGORY_LIMIT;
  return (
    <>
      <form noValidate onSubmit={submit} className="flex flex-col gap-1">
        <Field data-invalid={Boolean(error) || undefined}>
          <label htmlFor="new-issue-category" className="sr-only">
            新类别名
          </label>
          <div className="flex gap-2">
            <Input
              id="new-issue-category"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(checkName(e.target.value));
              }}
              placeholder={full ? `类别已满 ${ISSUE_CATEGORY_LIMIT} 个` : "新类别名，如「保修咨询」"}
              disabled={full}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? "new-issue-category-error" : "new-issue-category-hint"}
            />
            <Button type="submit" variant="outline" aria-disabled={create.isPending || full || undefined} onClick={(e) => (create.isPending || full) && e.preventDefault()}>
              {create.isPending ? <Spinner /> : <PlusIcon />}
              新增
            </Button>
          </div>
          {error ? (
            <FieldError id="new-issue-category-error">{error}</FieldError>
          ) : (
            <p id="new-issue-category-hint" className="text-xs text-muted-foreground tabular-nums">
              最多 20 个字；已有 {items.length} / {ISSUE_CATEGORY_LIMIT} 个类别
            </p>
          )}
        </Field>
      </form>
      <ul className="scroll-y -mr-2 flex max-h-80 flex-col overscroll-contain pr-2" aria-label="问题类别">
        {items.map((c) => (
          <CategoryRow key={c.id} c={c} onRemove={() => setRemoving(c)} onChanged={refresh} />
        ))}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && !remove.isPending && setRemoving(null)}
        title={`删除类别「${removing?.name ?? ""}」？`}
        desc={removing?.segmentCount ? `其中 ${removing.segmentCount} 个会话段会归入「${ISSUE_OTHER}」，不重新提取。` : "这个类别下没有会话段。"}
        confirmText="删除类别"
        destructive
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      />
    </>
  );
}

function CategoryRow({ c, onRemove, onChanged }: { c: IssueCategoryList["items"][number]; onRemove: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [error, setError] = useState<string>();
  const rename = useMutation({
    mutationFn: (n: string) => api.patch<IssueCategory>(`/api/v1/issue-categories/${c.id}`, { name: n }),
    onSuccess: (r) => {
      toast.success(`已改名为「${r.name}」`);
      setEditing(false);
      setError(undefined);
      onChanged();
    },
    onError: (e) => setError(nameError(e)),
  });
  const cancel = () => {
    setEditing(false);
    setName(c.name);
    setError(undefined);
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = checkName(name);
    if (msg) return setError(msg);
    if (name.trim() === c.name) return setEditing(false);
    rename.mutate(name.trim());
  };
  const errId = `issue-category-${c.id}-error`;

  if (editing)
    return (
      <li className="border-b border-border py-2 last:border-0">
        <form noValidate onSubmit={save} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={name}
              aria-label={`「${c.name}」的新名字`}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? errId : undefined}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(checkName(e.target.value));
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  cancel();
                }
              }}
            />
            <Button type="submit" size="sm" aria-disabled={rename.isPending || undefined} onClick={(e) => rename.isPending && e.preventDefault()}>
              {rename.isPending && <Spinner />}
              保存
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={cancel}>
              取消
            </Button>
          </div>
          {error && (
            <p id={errId} className="text-xs text-destructive">
              {error}
            </p>
          )}
        </form>
      </li>
    );

  return (
    <li className="flex min-h-12 items-center gap-3 border-b border-border py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium [overflow-wrap:anywhere]">{c.name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {num(c.segmentCount)} 个会话段{c.builtin ? " · 删除类别后会话段归到这里" : ""}
        </p>
      </div>
      {c.builtin ? (
        <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
          <LockIcon className="size-3.5" aria-hidden />
          内置，不能改名或删除
        </span>
      ) : (
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={`改名「${c.name}」`} onClick={() => setEditing(true)}>
            <PencilIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`删除「${c.name}」`} className="text-destructive" onClick={onRemove}>
            <Trash2Icon />
          </Button>
        </div>
      )}
    </li>
  );
}
