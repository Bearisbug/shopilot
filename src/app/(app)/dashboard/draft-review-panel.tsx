"use client";

// 「AI 草稿与人工回复」面板（会话分析层）：影子回复 / 辅助草稿两个视图；影子回复看一致率，辅助草稿看客服的处置；
// 修改分类分布（表格带占比条），点分类看对比样例（AI 草稿、人工回复、理由与证据）。
import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, GitCompareArrowsIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState, ErrorState, LoadingRows, Panel, PanelHeader } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DRAFT_EDIT_CLASSES,
  DRAFT_EDIT_LABEL,
  DRAFT_REVIEW_KINDS,
  DRAFT_REVIEW_LIST_LIMIT,
  type DashboardDraftReviewList,
  type DashboardResponse,
  type DraftConsistency,
  type DraftEditClass,
  type DraftReviewKind,
} from "@/contracts/dashboard";
import { api } from "@/lib/api";
import { inTz } from "@/lib/format";
import { num, pct } from "./dashboard-lib";

const KIND_LABEL: Record<DraftReviewKind, string> = { shadow: "影子回复", assist: "辅助草稿" };
const CONSISTENCY_LABEL: Record<DraftConsistency, string> = { same: "一致", partial: "部分一致", different: "不一致" };
const STATUS_LABEL: Record<string, string> = { sent: "原样发送", edited_sent: "修改后发送", ignored: "弃用后人工另回", shadow: "影子回复" };

/** 视图与打开的分类写进 URL（?reviews=assist、?review=<分类>）：切视图、打开分类是导航（push），关闭抽屉回到原地址（replace） */
function useReviewParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("reviews");
  const kind: DraftReviewKind = (DRAFT_REVIEW_KINDS as readonly string[]).includes(raw ?? "") ? (raw as DraftReviewKind) : "shadow";
  const openRaw = params.get("review");
  const openClass = (DRAFT_EDIT_CLASSES as readonly string[]).includes(openRaw ?? "") ? (openRaw as DraftEditClass) : null;
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
    kind,
    setKind: (k: DraftReviewKind) => go({ reviews: k === "shadow" ? null : k, review: null }, "push"),
    openClass,
    open: (c: DraftEditClass) => go({ review: c }, "push"),
    close: () => go({ review: null }, "replace"),
  };
}

export function DraftReviewPanel({ d, tz, rangeQs }: { d: DashboardResponse; tz: string; rangeQs: string }) {
  const { kind, setKind, openClass, open, close } = useReviewParams();
  const r = d.draftReview;
  const compared = kind === "shadow" ? r.shadow.compared : r.assist.compared;
  return (
    <Panel className="min-w-0">
      <PanelHeader title="AI 草稿与人工回复" description="按草稿生成日期统计 · 草稿生成满 15 分钟、有人工回复后，AI 先把两者转成中文再比较语义，约 10 分钟一轮">
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} className="overflow-hidden rounded-md" value={kind} onValueChange={(x) => x && setKind(x as DraftReviewKind)} aria-label="对比哪类草稿">
          {DRAFT_REVIEW_KINDS.map((x) => (
            <ToggleGroupItem key={x} value={x} className="px-3">
              {KIND_LABEL[x]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </PanelHeader>

      {compared === 0 ? (
        <EmptyState
          icon={GitCompareArrowsIcon}
          title={kind === "shadow" ? "这个范围内还没有对比过的影子回复" : "这个范围内还没有对比过的辅助草稿"}
          description={
            kind === "shadow"
              ? "影子模式下 AI 写了回复但不发送；人工另行回复买家后，AI 比较两者是否一致，一致率可以作为放开托管的依据。"
              : "辅助草稿被客服原样发送、修改后发送或弃用后另行回复，AI 比较草稿与最终发出的内容，修改分类用来发现知识缺口。"
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          {kind === "shadow" ? <ShadowSummary s={r.shadow} /> : <AssistSummary s={r.assist} />}
          <ClassTable rows={r.byClass[kind]} onOpen={open} />
        </div>
      )}

      <ReviewSheet kind={kind} editClass={openClass} rangeQs={rangeQs} tz={tz} onClose={close} />
    </Panel>
  );
}

function ShadowSummary({ s }: { s: DashboardResponse["draftReview"]["shadow"] }) {
  const rate = pct(s.consistency);
  const rows: Array<[string, number]> = [
    ["一致", s.same],
    ["部分一致", s.partial],
    ["不一致", s.different],
  ];
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold">影子回复一致率</h3>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{rate === null ? <span className="text-xl text-muted-foreground">数据不足</span> : `${rate}%`}</p>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        一致 / 已对比 = {num(s.same)} / {num(s.compared)}
        {rate === null ? `，满 10 份才计算` : ""}
      </p>
      <dl className="mt-4 flex flex-col gap-1.5 text-sm">
        {rows.map(([label, n]) => (
          <div key={label} className="flex items-center justify-between gap-2">
            <dt>{label}</dt>
            <dd className="text-muted-foreground tabular-nums">{num(n)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AssistSummary({ s }: { s: DashboardResponse["draftReview"]["assist"] }) {
  const rows: Array<[string, number]> = [
    ["原样发送", s.sent],
    ["修改后发送", s.editedSent],
    ["弃用后人工另回", s.ignored],
  ];
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold">客服怎么处置草稿</h3>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{num(s.compared)}</p>
      <p className="mt-1 text-xs text-muted-foreground">份已对比的辅助草稿</p>
      <dl className="mt-4 flex flex-col gap-1.5 text-sm">
        {rows.map(([label, n]) => (
          <div key={label} className="flex items-center justify-between gap-2">
            <dt>{label}</dt>
            <dd className="text-muted-foreground tabular-nums">{num(n)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ClassTable({ rows, onOpen }: { rows: Array<{ editClass: DraftEditClass; count: number }>; onOpen: (c: DraftEditClass) => void }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold">修改分类</h3>
      <div className="-mx-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>分类</TableHead>
              <TableHead className="w-2/5">
                <span className="sr-only">占比条</span>
              </TableHead>
              <TableHead className="text-right">份数</TableHead>
              <TableHead className="text-right">占比</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.editClass} className="h-11">
                <TableCell className="whitespace-nowrap">
                  {r.count > 0 ? (
                    <Button variant="link" className="h-auto" aria-label={`查看「${DRAFT_EDIT_LABEL[r.editClass]}」的对比样例`} onClick={() => onOpen(r.editClass)}>
                      {DRAFT_EDIT_LABEL[r.editClass]}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">{DRAFT_EDIT_LABEL[r.editClass]}</span>
                  )}
                </TableCell>
                <TableCell aria-hidden="true">{r.count > 0 && <span className="block h-2 rounded-full bg-(--semantic-color-text-link)/80" style={{ width: `${Math.max(4, (r.count / max) * 100)}%` }} />}</TableCell>
                <TableCell className={`text-right tabular-nums ${r.count === 0 ? "text-muted-foreground" : ""}`}>{num(r.count)}</TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">{total ? Math.round((r.count / total) * 100) : 0}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">补充信息、事实更正、流程改变三类最可能说明知识缺了或错了；点分类名查看样例。</p>
    </div>
  );
}

function ReviewSheet({ kind, editClass, rangeQs, tz, onClose }: { kind: DraftReviewKind; editClass: DraftEditClass | null; rangeQs: string; tz: string; onClose: () => void }) {
  return (
    <Sheet open={Boolean(editClass)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 data-[side=right]:sm:max-w-xl">
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle>
            {editClass ? DRAFT_EDIT_LABEL[editClass] : ""} · {KIND_LABEL[kind]}
          </SheetTitle>
          <SheetDescription>按草稿生成时间从新到旧，最多显示 {DRAFT_REVIEW_LIST_LIMIT} 份。</SheetDescription>
        </SheetHeader>
        {editClass && <ReviewList key={`${kind}-${editClass}-${rangeQs}`} kind={kind} editClass={editClass} rangeQs={rangeQs} tz={tz} />}
      </SheetContent>
    </Sheet>
  );
}

function ReviewList({ kind, editClass, rangeQs, tz }: { kind: DraftReviewKind; editClass: DraftEditClass; rangeQs: string; tz: string }) {
  const q = useQuery({
    queryKey: ["dashboard-draft-reviews", rangeQs, kind, editClass],
    queryFn: () => api.get<DashboardDraftReviewList>(`/api/v1/dashboard/draft-reviews?${rangeQs ? `${rangeQs}&` : ""}kind=${kind}&class=${editClass}`),
  });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data)
    return (
      <div className="p-4">
        <LoadingRows rows={4} />
      </div>
    );
  const r = q.data;
  if (r.items.length === 0) return <EmptyState icon={GitCompareArrowsIcon} title="这个分类下没有样例" description="改了范围或数据刚刷新时会出现这种情况，关掉后看板会刷新。" />;
  return (
    <div className="scroll-y min-h-0 flex-1 overscroll-contain">
      <p className="px-4 pt-3 text-xs text-muted-foreground tabular-nums">
        共 {num(r.total)} 份{r.total > r.items.length ? `，显示最近 ${r.items.length} 份` : ""}
      </p>
      <ul className="flex flex-col px-4 pb-4" aria-label={`「${DRAFT_EDIT_LABEL[editClass]}」的对比样例`}>
        {r.items.map((it) => (
          <li key={it.draftId} className="flex flex-col gap-2 border-b border-border py-4 last:border-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="min-w-0 flex-1 text-xs text-muted-foreground tabular-nums">
                {inTz(it.createdAt, tz)} · {it.shopName} · {it.buyerName}
              </p>
              <Badge variant="outline">{CONSISTENCY_LABEL[it.consistency]}</Badge>
              {kind === "assist" && <Badge variant="outline">{STATUS_LABEL[it.draftStatus] ?? it.draftStatus}</Badge>}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <TextBlock label="AI 草稿" text={it.draftText} />
              <TextBlock label="人工回复" text={it.humanText} />
            </div>
            {(it.reason || it.evidence) && (
              <p className="text-sm [overflow-wrap:anywhere]">
                {it.reason}
                {it.evidence && <span className="text-muted-foreground">{it.reason ? " · " : ""}「{it.evidence}」</span>}
              </p>
            )}
            <div>
              <Button asChild variant="ghost" size="sm" className="-ml-2">
                <Link href={`/wb/${it.conversationId}`} target="_blank" rel="noopener">
                  <ExternalLinkIcon />
                  打开会话
                </Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/60 p-2.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</p>
    </div>
  );
}
