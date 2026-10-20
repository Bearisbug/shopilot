"use client";

// 「待审核」页签（PAGE-RECEPTION-KB，API-KB-013、018、019）：资料整理出的候选，逐条通过或驳回；已驳回的可以回看
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, ChevronRightIcon, FileTextIcon, InboxIcon, PencilIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { QA_REJECT_REASON_MAX, QA_STATUS_LABEL, type KnowledgeQa, type KnowledgeQaList, type KnowledgeQaResult } from "@/contracts/knowledge";
import { charCount } from "@/contracts/reception";
import { EmptyState, ErrorState, LoadingRows, Panel } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, api, errorText } from "@/lib/api";
import { cn } from "@/lib/utils";
import { marketsText, useUrlParams } from "./knowledge-ui";
import { productsText, qaItemKey, qaKey, stageText } from "./qa-ui";

type ReviewView = "pending" | "rejected";

function staleRefresh(qc: ReturnType<typeof useQueryClient>, e: unknown): boolean {
  if (e instanceof ApiError && e.status === 409) {
    toast.error("这条候选的状态已经变了（可能已被别人审核），已刷新。");
    qc.invalidateQueries({ queryKey: qaKey });
    return true;
  }
  return false;
}

export function ReviewTab({ onEdit, onReject, onGoDocs }: { onEdit: (id: string) => void; onReject: (id: string) => void; onGoDocs: () => void }) {
  const { params, update } = useUrlParams();
  const view: ReviewView = params.get("review") === "rejected" ? "rejected" : "pending";
  const list = useInfiniteQuery({
    queryKey: [...qaKey, "review", view],
    queryFn: ({ pageParam }) => api.get<KnowledgeQaList>(`/api/v1/knowledge/qa?status=${view}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const counts = list.data?.pages[0]?.counts;

  return (
    <Panel className="flex min-w-0 flex-col gap-4" aria-labelledby="kb-review-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="kb-review-title" className="text-lg font-semibold">
            待审核
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">AI 从资料里整理出的候选问答，人工通过后才发布给 AI 出稿用</p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={view}
          aria-label="候选状态"
          onValueChange={(v) => v && update({ review: v === "pending" ? null : v })}
          className="data-[state=on]:*:font-semibold"
        >
          <ToggleGroupItem value="pending" className="px-3 data-[state=on]:bg-accent data-[state=on]:text-(--semantic-color-text-link)">
            待审核{counts ? ` ${counts.pending}` : ""}
          </ToggleGroupItem>
          <ToggleGroupItem value="rejected" className="px-3 data-[state=on]:bg-accent data-[state=on]:text-(--semantic-color-text-link)">
            已驳回{counts ? ` ${counts.rejected}` : ""}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <LoadingRows rows={4} />
      ) : items.length === 0 ? (
        view === "pending" ? (
          <EmptyState
            icon={InboxIcon}
            title="没有待审核的候选"
            description="到「资料」页签，对已解析好的资料点「整理成问答」，AI 整理出的候选会出现在这里。"
            action={
              <Button variant="outline" onClick={onGoDocs}>
                <FileTextIcon />
                去资料页签
              </Button>
            }
          />
        ) : (
          <EmptyState icon={InboxIcon} title="没有驳回的候选" />
        )
      ) : (
        <>
          <ul className="flex flex-col">
            {items.map((qa) => (
              <CandidateRow key={qa.id} qa={qa} onEdit={() => onEdit(qa.id)} onReject={() => onReject(qa.id)} />
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

/** 一条候选：问法、回复、范围、来源原文（可展开）；疑似重复时并排显示已有的那条 */
function CandidateRow({ qa, onEdit, onReject }: { qa: KnowledgeQa; onEdit: () => void; onReject: () => void }) {
  const qc = useQueryClient();
  const approve = useMutation({
    mutationFn: () => api.post<KnowledgeQaResult>(`/api/v1/knowledge/qa/${qa.id}/approve`, { version: qa.version }),
    onSuccess: () => {
      toast.success("已通过并发布");
      qc.invalidateQueries({ queryKey: qaKey });
    },
    onError: (e) => staleRefresh(qc, e) || toast.error(errorText(e)),
  });
  const pending = qa.status === "pending";
  return (
    <li className="flex flex-col gap-3 border-b border-border py-4 first:pt-0 last:border-0">
      {/* 疑似重复时两条并排：按面板宽度（容器查询）决定并排还是上下排 */}
      <div className="@container">
        <div className={cn("grid grid-cols-1 gap-3", qa.duplicateOf && "@2xl:grid-cols-2")}>
          <QaBlock qa={qa} label={qa.duplicateOf ? "这条候选" : undefined} />
          {qa.duplicateOf && <DuplicateBlock id={qa.duplicateOf.id} fallback={qa.duplicateOf.question} status={qa.duplicateOf.status} />}
        </div>
      </div>
      {qa.sourceDocument && (
        <details className="group">
          <summary className="state-layer focus-ring -mx-2 inline-flex cursor-pointer list-none items-center gap-1 rounded-sm px-2 py-1 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon className="size-3.5 transition-transform duration-(--semantic-motion-duration-fast) group-open:rotate-90" aria-hidden />
            来源《{qa.sourceDocument.name}》的原文片段
          </summary>
          <p className="mt-1 rounded-md bg-muted px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{qa.sourceExcerpt || "没有保存原文片段。"}</p>
        </details>
      )}
      {qa.status === "rejected" && <p className="text-xs text-muted-foreground">驳回原因：{qa.rejectReason || "没有填写"}{qa.reviewedByName ? ` · ${qa.reviewedByName}` : ""}</p>}
      {pending && (
        <div className="flex flex-wrap items-center gap-2">
          {/* 一屏有多条候选：「通过」用描边样式，不用芒果主按钮（brand：每屏至多一个主按钮） */}
          <Button size="sm" variant="outline" aria-disabled={approve.isPending || undefined} onClick={() => !approve.isPending && approve.mutate()}>
            {approve.isPending ? <Spinner /> : <CheckIcon />}
            通过
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <PencilIcon />
            改后通过
          </Button>
          <Button size="sm" variant="ghost" onClick={onReject}>
            <XIcon />
            驳回
          </Button>
        </div>
      )}
    </li>
  );
}

function QaBlock({ qa, label }: { qa: Pick<KnowledgeQa, "questions" | "answer" | "products" | "stage" | "markets">; label?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {label && <p className="text-xs font-semibold text-muted-foreground">{label}</p>}
      <p className="font-medium [overflow-wrap:anywhere]">{qa.questions[0]}</p>
      {qa.questions.length > 1 && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">另有问法：{qa.questions.slice(1).join(" / ")}</p>}
      <p className="text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{qa.answer}</p>
      <p className="text-xs text-muted-foreground">
        {productsText(qa.products)} · {stageText(qa.stage)} · {marketsText(qa.markets)}
      </p>
    </div>
  );
}

/** 疑似重复：取已有那条的完整内容并排显示；取不到时只显示问法 */
function DuplicateBlock({ id, fallback, status }: { id: string; fallback: string; status: KnowledgeQa["status"] }) {
  const q = useQuery({ queryKey: qaItemKey(id), queryFn: () => api.get<KnowledgeQaResult>(`/api/v1/knowledge/qa/${id}`) });
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border border-dashed border-(--semantic-color-feedback-warning) px-3 py-2">
      <p className="text-xs font-semibold text-(--semantic-color-feedback-warning)">疑似重复：已有问答（{QA_STATUS_LABEL[status]}）</p>
      {q.data ? (
        <QaBlock qa={q.data.qa} />
      ) : q.isError ? (
        <p className="font-medium [overflow-wrap:anywhere]">{fallback}</p>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          正在取已有问答
        </div>
      )}
      <p className="text-xs text-muted-foreground">内容一样就驳回这条候选；有新信息就改后通过，或去「问答」页签补进已有那条。</p>
    </div>
  );
}

/** 驳回弹窗：?dialog=qa-reject&qa=<id>，原因选填 */
export function RejectDialog({ open, qaId, onClose }: { open: boolean; qaId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const item = useQuery({ queryKey: qaItemKey(qaId ?? ""), queryFn: () => api.get<KnowledgeQaResult>(`/api/v1/knowledge/qa/${qaId}`), enabled: open && Boolean(qaId) });
  const n = charCount(reason.trim());
  const tooLong = n > QA_REJECT_REASON_MAX;
  const reject = useMutation({
    mutationFn: () => api.post<KnowledgeQaResult>(`/api/v1/knowledge/qa/${qaId}/reject`, { version: item.data!.qa.version, reason: reason.trim() || undefined }),
    onSuccess: () => {
      toast.success("已驳回，AI 不会引用这条候选");
      setReason("");
      qc.invalidateQueries({ queryKey: qaKey });
      onClose();
    },
    onError: (e) => {
      if (staleRefresh(qc, e)) return onClose();
      toast.error(errorText(e));
    },
  });
  const ready = Boolean(item.data);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason("");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>驳回这条候选？</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">{item.data ? `「${item.data.qa.questions[0]}」驳回后不会发布，可以在「已驳回」里回看。` : "驳回后不会发布，可以在「已驳回」里回看。"}</DialogDescription>
        </DialogHeader>
        {item.isError ? (
          <ErrorState error={item.error} onRetry={() => item.refetch()} />
        ) : (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ready || tooLong || reject.isPending) return;
              reject.mutate();
            }}
          >
            <Field data-invalid={tooLong || undefined}>
              <div className="flex items-end justify-between gap-3">
                <FieldLabel htmlFor="qa-reject-reason">原因（选填）</FieldLabel>
                <span className={cn("text-xs tabular-nums", tooLong ? "text-destructive" : "text-muted-foreground")}>
                  {n} / {QA_REJECT_REASON_MAX}
                </span>
              </div>
              <Textarea id="qa-reject-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如 与已有问答重复、资料已过期" aria-invalid={tooLong || undefined} aria-describedby={tooLong ? "qa-reject-error" : undefined} />
              {tooLong && <FieldError id="qa-reject-error">原因最多 {QA_REJECT_REASON_MAX} 个字</FieldError>}
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button type="submit" variant="destructive" aria-disabled={!ready || reject.isPending || undefined}>
                {reject.isPending && <Spinner />}
                驳回
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
