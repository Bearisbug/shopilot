"use client";

// 「学习」页签（PAGE-RECEPTION-KB，API-KB-038）：客服提交的与 Agent 挑的学习任务；点一条在右侧抽屉里审核（?task=<id>）
import { useInfiniteQuery } from "@tanstack/react-query";
import { BotIcon, GraduationCapIcon, UserIcon } from "lucide-react";
import {
  DIAGNOSIS_LABEL,
  LEARNING_RESULT_LABEL,
  LEARNING_RESULTS,
  LEARNING_SOURCE_LABEL,
  LEARNING_SOURCES,
  LEARNING_STATUS_LABEL,
  LEARNING_STATUSES,
  type LearningList,
  type LearningResult,
  type LearningSource,
  type LearningStatus,
  type LearningTask,
} from "@/contracts/cards";
import type { Me } from "@/contracts/auth";
import { EmptyState, ErrorState, LoadingRows, Panel } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/api";
import { inTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useUrlParams } from "../knowledge-ui";
import { learningKey, POLL_MS } from "./learning-ui";

const pick = <T extends string>(v: string | null, all: readonly T[]): T | null => ((all as readonly string[]).includes(v ?? "") ? (v as T) : null);

export function LearningTab({ me }: { me: Me }) {
  const { params, update } = useUrlParams();
  const status = pick<LearningStatus>(params.get("lstatus"), LEARNING_STATUSES);
  const source = pick<LearningSource>(params.get("lsource"), LEARNING_SOURCES);
  const result = pick<LearningResult>(params.get("lresult"), LEARNING_RESULTS);
  const qs = [status && `status=${status}`, source && `source=${source}`, result && `result=${result}`].filter(Boolean).join("&");
  const list = useInfiniteQuery({
    queryKey: [...learningKey, "list", status, source, result],
    queryFn: ({ pageParam }) => api.get<LearningList>(`/api/v1/knowledge/learning?${qs}${pageParam ? `${qs ? "&" : ""}cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // 有分析中的任务时 5 秒刷新一次，结果出来只更新这一行（INT-008）
    refetchInterval: (q) => (q.state.data?.pages.some((p) => p.items.some((t) => t.status === "analyzing")) ? POLL_MS : false),
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const counts = list.data?.pages[0]?.counts;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null;
  const filtered = Boolean(status || source || result);
  const toggleItem = "px-3 whitespace-nowrap data-[state=on]:bg-accent data-[state=on]:font-semibold data-[state=on]:text-(--semantic-color-text-link)";

  return (
    <Panel className="flex min-w-0 flex-col gap-4" aria-labelledby="kb-learning-title">
      <div className="min-w-0">
        <h2 id="kb-learning-title" tabIndex={-1} className="text-lg font-semibold focus-visible:outline-none">
          学习
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">客服在工作台勾选消息提交的，和 Agent 每天从已结束会话里挑的。新经验卡审核、复测通过才发布；Agent 改已有卡复测通过就生效。</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="scroll-nav max-w-full overflow-x-auto">
          <ToggleGroup type="single" variant="outline" size="sm" value={status ?? "all"} aria-label="按状态筛选" onValueChange={(v) => v && update({ lstatus: v === "all" ? null : v })}>
            <ToggleGroupItem value="all" className={toggleItem}>
              全部{total !== null ? ` ${total}` : ""}
            </ToggleGroupItem>
            {LEARNING_STATUSES.map((s) => (
              <ToggleGroupItem key={s} value={s} className={toggleItem}>
                {LEARNING_STATUS_LABEL[s]}
                {counts ? ` ${counts[s]}` : ""}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <Select value={source ?? "all"} onValueChange={(v) => update({ lsource: v === "all" ? null : v })}>
          <SelectTrigger size="sm" className="w-32" aria-label="按来源筛选">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部来源</SelectItem>
            {LEARNING_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {LEARNING_SOURCE_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={result ?? "all"} onValueChange={(v) => update({ lresult: v === "all" ? null : v })}>
          <SelectTrigger size="sm" className="w-36" aria-label="按结论筛选">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部结论</SelectItem>
            {LEARNING_RESULTS.map((r) => (
              <SelectItem key={r} value={r}>
                {LEARNING_RESULT_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <LoadingRows rows={5} />
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={GraduationCapIcon}
            title="没有符合筛选的学习任务"
            action={
              <Button variant="outline" onClick={() => update({ lstatus: null, lsource: null, lresult: null })}>
                清除筛选
              </Button>
            }
          />
        ) : (
          <EmptyState icon={GraduationCapIcon} title="还没有学习任务" description="客服在工作台的会话里点「提交学习」、勾选消息提交后会出现在这里；Agent 每天也会从已结束的会话里挑一些。" />
        )
      ) : (
        <>
          <ul className="flex flex-col">
            {items.map((t) => (
              <TaskRow key={t.id} t={t} tz={me.active.timezone} active={params.get("task") === t.id} onOpen={() => update({ task: t.id }, "push")} />
            ))}
          </ul>
          {list.hasNextPage && (
            <Button variant="outline" size="sm" className="self-center" aria-disabled={list.isFetchingNextPage || undefined} onClick={() => !list.isFetchingNextPage && list.fetchNextPage()}>
              {list.isFetchingNextPage && <Spinner />}
              加载更多
            </Button>
          )}
        </>
      )}
    </Panel>
  );
}

/** 状态：文字 + 图标或圆点，不只靠颜色（A11Y-001） */
export function TaskStatus({ status, className }: { status: LearningStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs whitespace-nowrap",
        status === "pending_review" ? "font-semibold text-(--semantic-color-text-link)" : status === "failed" ? "text-destructive" : status === "published" ? "text-(--semantic-color-feedback-success)" : "text-muted-foreground",
        className,
      )}
    >
      {status === "analyzing" ? <Spinner className="size-3.5" /> : <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {LEARNING_STATUS_LABEL[status]}
    </span>
  );
}

function TaskRow({ t, tz, active, onOpen }: { t: LearningTask; tz: string; active: boolean; onOpen: () => void }) {
  const Icon = t.source === "agent" ? BotIcon : UserIcon;
  const picked = t.messages.filter((m) => m.selected && m.from === "buyer");
  const quote = (picked.at(-1) ?? t.messages.filter((m) => m.from === "buyer").at(-1))?.text ?? "";
  return (
    <li className="border-b border-border last:border-0">
      <button type="button" onClick={onOpen} aria-current={active || undefined} className={cn("state-layer focus-ring flex w-full items-start gap-3 rounded-md px-2 py-3 text-left", active && "bg-(--semantic-color-surface-selected)")}>
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={LEARNING_SOURCE_LABEL[t.source]} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate font-medium">{t.conversation ? `${t.conversation.buyerName} · ${t.conversation.shopName}` : "会话已删除"}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{inTz(t.createdAt, tz, "MM-dd HH:mm")}</span>
          </span>
          {quote && <span className="line-clamp-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">「{quote}」</span>}
          <span className="text-xs text-muted-foreground">
            {LEARNING_SOURCE_LABEL[t.source]}
            {t.submittedByName ? `（${t.submittedByName}）` : ""}
            {t.diagnosis ? ` · ${DIAGNOSIS_LABEL[t.diagnosis]}` : ""}
            {t.result ? ` · ${LEARNING_RESULT_LABEL[t.result]}` : ""}
          </span>
        </span>
        <TaskStatus status={t.status} className="mt-0.5 shrink-0" />
      </button>
    </li>
  );
}
