"use client";

// 问答编辑弹窗（API-KB-014、016、018）：新建、编辑已发布或已下架的问答、审核待审核的候选共用一张表单
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { toast } from "sonner";
import { QA_ANSWER_MAX, QA_QUESTIONS_MAX, QA_STATUS_LABEL, type KnowledgeQa, type KnowledgeQaResult } from "@/contracts/knowledge";
import type { Product } from "@/contracts/products";
import { charCount } from "@/contracts/reception";
import { Notice } from "@/components/orders/order-ui";
import { ErrorState, LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, errorText, newKey } from "@/lib/api";
import { qaFormSchema, qaToForm, toQaBody, type QaFormValues } from "@/lib/qa-form";
import { cn } from "@/lib/utils";
import { MarketsPicker, marketsText } from "./knowledge-ui";
import { ProductPicker, qaItemKey, qaKey, STAGE_OPTIONS, stageText, useProducts } from "./qa-ui";

/** 版本冲突或已被处置：提示刷新到最新内容 */
function conflictText(e: unknown): string | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const code = e.problem.code;
  if (code === "version_conflict") return "这条问答刚被别人改过，已刷新为最新内容，请核对后再保存。";
  if (code === "invalid_state") return "这条问答的状态已经变了（可能已被别人审核或下架），已刷新。";
  return null;
}

/**
 * 弹窗：qaId 为空是新建（保存即发布）；有 qaId 时先取详情，待审核的显示「驳回」「通过并发布」，其余显示「保存」
 */
export function QaDialog({ open, qaId, onClose, onReject }: { open: boolean; qaId: string | null; onClose: () => void; onReject: (qa: KnowledgeQa) => void }) {
  const item = useQuery({ queryKey: qaItemKey(qaId ?? ""), queryFn: () => api.get<KnowledgeQaResult>(`/api/v1/knowledge/qa/${qaId}`), enabled: open && Boolean(qaId) });
  const qa = item.data?.qa;
  const review = qa?.status === "pending";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{!qaId ? "新建问答" : review ? "审核候选问答" : "编辑问答"}</DialogTitle>
          <DialogDescription>
            {!qaId ? "保存即发布，AI 出稿时按问法检索，按回复作答。" : review ? "核对 AI 从资料里整理出的内容，可以先改再通过；通过后立即发布。" : "保存后立即生效，AI 之后的出稿用新内容。"}
          </DialogDescription>
        </DialogHeader>
        {qaId && item.isError ? (
          <ErrorState error={item.error} onRetry={() => item.refetch()} />
        ) : qaId && !qa ? (
          <LoadingRows rows={4} />
        ) : (
          // key：切换到另一条或版本变了时重建表单
          <QaForm key={qa ? `${qa.id}:${qa.version}` : "new"} qa={qa} onClose={onClose} onReject={onReject} onStale={() => item.refetch()} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function QaForm({ qa, onClose, onReject, onStale }: { qa?: KnowledgeQa; onClose: () => void; onReject: (qa: KnowledgeQa) => void; onStale: () => void }) {
  const qc = useQueryClient();
  const products = useProducts();
  const [key, setKey] = useState(newKey);
  const review = qa?.status === "pending";
  const form = useForm<QaFormValues>({ resolver: zodResolver(qaFormSchema), mode: "onTouched", defaultValues: qaToForm(qa) });
  const questions = useFieldArray({ control: form.control, name: "questions" });
  const answer = useWatch({ control: form.control, name: "answer" });
  const n = charCount(answer ?? "");
  const errors = form.formState.errors;

  const save = useMutation({
    mutationFn: (v: QaFormValues) => {
      const body = toQaBody(v);
      if (!qa) return api.post<KnowledgeQaResult>("/api/v1/knowledge/qa", body, key);
      if (review) return api.post<KnowledgeQaResult>(`/api/v1/knowledge/qa/${qa.id}/approve`, { ...body, version: qa.version });
      return api.patch<KnowledgeQaResult>(`/api/v1/knowledge/qa/${qa.id}`, { ...body, version: qa.version });
    },
    onSuccess: (r) => {
      toast.success(!qa ? "已发布新问答" : review ? "已通过并发布" : "已保存", { description: r.qa.embedded ? undefined : "检索向量稍后在后台补上，最多 5 分钟后 AI 才能检索到。" });
      qc.invalidateQueries({ queryKey: qaKey });
      qc.setQueryData(qaItemKey(r.qa.id), r);
      onClose();
    },
    onError: (e) => {
      const stale = conflictText(e);
      if (stale) {
        toast.error(stale);
        qc.invalidateQueries({ queryKey: qaKey });
        return onStale();
      }
      const fields = e instanceof ApiError ? (e.problem.extra?.fields as Record<string, string> | undefined) : undefined;
      for (const [path, message] of Object.entries(fields ?? {})) {
        const p = /^questions\.\d+$/.test(path) ? `${path}.value` : path === "tags" || path.startsWith("tags.") ? "tagsText" : path;
        form.setError(p as keyof QaFormValues, { message });
      }
      toast.error(errorText(e));
      setKey(newKey());
    },
  });

  return (
    <form noValidate onSubmit={form.handleSubmit((v) => !save.isPending && save.mutate(v))} className="flex flex-col gap-4">
      {qa && qa.status !== "published" && qa.status !== "pending" && (
        <Notice tone="info">这条问答目前「{QA_STATUS_LABEL[qa.status]}」，AI 出稿不会引用；保存只改内容，不改状态。</Notice>
      )}
      {review && qa?.sourceDocument && (
        <details className="group rounded-md border border-border">
          <summary className="state-layer focus-ring cursor-pointer list-none rounded-md px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
            来源：《{qa.sourceDocument.name}》<span className="text-muted-foreground"> · 点开看原文片段</span>
          </summary>
          <p className="border-t border-border px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{qa.sourceExcerpt || "没有保存原文片段。"}</p>
        </details>
      )}
      <FieldGroup>
        <Field data-invalid={Boolean(errors.questions?.message || errors.questions?.root?.message) || undefined}>
          <div className="flex items-end justify-between gap-3">
            <FieldLabel htmlFor="qa-q-0">问法</FieldLabel>
            <span className="text-xs text-muted-foreground tabular-nums">
              {questions.fields.length} / {QA_QUESTIONS_MAX}
            </span>
          </div>
          <ol className="flex flex-col gap-2">
            {questions.fields.map((f, i) => (
              <Controller
                key={f.id}
                name={`questions.${i}.value`}
                control={form.control}
                render={({ field, fieldState }) => (
                  <li className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Input {...field} id={`qa-q-${i}`} placeholder={i === 0 ? "买家最常用的问法，例如 保修多久" : "同一问题的另一种问法"} aria-invalid={fieldState.invalid} aria-label={`问法 ${i + 1}`} />
                      {questions.fields.length > 1 && (
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`删除问法 ${i + 1}`} onClick={() => questions.remove(i)}>
                          <XIcon />
                        </Button>
                      )}
                    </div>
                    {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                  </li>
                )}
              />
            ))}
          </ol>
          {(errors.questions?.message || errors.questions?.root?.message) && <FieldError>{errors.questions?.message ?? errors.questions?.root?.message}</FieldError>}
          <div className="flex items-start justify-between gap-3">
            <FieldDescription className="min-w-0 flex-1">问法写得越像买家的原话，越容易被检索到；不同语言的问法也可以加。</FieldDescription>
            {questions.fields.length < QA_QUESTIONS_MAX && (
              <Button type="button" variant="ghost" size="sm" className="-mr-2 shrink-0" onClick={() => questions.append({ value: "" })}>
                <PlusIcon />
                加一个问法
              </Button>
            )}
          </div>
        </Field>
        <Controller
          name="answer"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-end justify-between gap-3">
                <FieldLabel htmlFor="qa-answer">回复</FieldLabel>
                <span className={cn("text-xs tabular-nums", n > QA_ANSWER_MAX ? "text-destructive" : "text-muted-foreground")}>
                  {n.toLocaleString("en-US")} / {QA_ANSWER_MAX.toLocaleString("en-US")}
                </span>
              </div>
              <Textarea {...field} id="qa-answer" rows={5} className="scroll-y max-h-72" placeholder="AI 回答这类问题时依据的内容，写事实与政策，不用写客套话" aria-invalid={fieldState.invalid} />
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </Field>
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]">
          <Controller
            name="productIds"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="qa-products">产品</FieldLabel>
                <ProductPicker id="qa-products" value={field.value} onChange={field.onChange} products={products.data?.items ?? []} invalid={fieldState.invalid} />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : <FieldDescription>不选 = 通用，所有产品的买家问到都可能用上。</FieldDescription>}
              </Field>
            )}
          />
          <Controller
            name="stage"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="qa-stage">服务阶段</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="qa-stage" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {stageText(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
        </div>
        <Controller
          name="markets"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>适用站点</FieldLabel>
              <MarketsPicker value={field.value} onChange={field.onChange} label="适用站点" invalid={fieldState.invalid} />
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </Field>
          )}
        />
        <Controller
          name="tagsText"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="qa-tags">标签（选填）</FieldLabel>
              <Input {...field} id="qa-tags" placeholder="用逗号分隔，例如 连接，macOS" aria-invalid={fieldState.invalid} />
              {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : <FieldDescription>标签只用于查询和描述，不决定 AI 用不用这条问答。</FieldDescription>}
            </Field>
          )}
        />
      </FieldGroup>
      {(!qa || review) && <PublishSummary control={form.control} products={products.data?.items ?? []} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          取消
        </Button>
        {review && qa && (
          <Button type="button" variant="outline" disabled={save.isPending} onClick={() => onReject(qa)}>
            驳回
          </Button>
        )}
        {/* aria-disabled：按下后不失焦，提交中仍可被读屏发现（A11Y-013） */}
        <Button type="submit" aria-disabled={save.isPending || undefined}>
          {save.isPending && <Spinner />}
          {review ? "通过并发布" : qa ? "保存" : "发布"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** 发布前核对（INT-003 ⑤）：发布后 AI 出稿就会用，写出当前的适用范围 */
function PublishSummary({ control, products }: { control: Control<QaFormValues>; products: Product[] }) {
  const [ids, stage, markets] = useWatch({ control, name: ["productIds", "stage", "markets"] });
  const names = products.filter((p) => ids.includes(p.id)).map((p) => p.name);
  return (
    <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
      发布后 AI 出稿立即可用：{names.length ? names.join("、") : "通用（全部产品）"} · {stageText(stage)} · {markets.length ? marketsText(markets) : "未选站点"}
    </p>
  );
}
