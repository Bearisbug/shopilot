"use client";

// 写卡弹窗（API-KB-030、API-KB-032、API-KB-012 带卡测试）：新建与编辑共用一张表单，保存即发布；
// 字段多，输入停 3 秒自动存本机草稿（按用户、商户、卡与版本区分），提交成功后清掉。
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, FlaskConicalIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useFieldArray, useForm, useFormState, useWatch, type Control, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import {
  BRANCH_ACTION_LABEL,
  BRANCH_ACTIONS,
  CARD_ACTION_LABEL,
  CARD_BRANCHES_MAX,
  CARD_CONDITIONS_MAX,
  CARD_QA_MAX,
  CARD_STEPS_MAX,
  CARD_TIPS_MAX,
  CARD_TITLE_MAX,
  CONDITION_MODE_LABEL,
  CONDITION_MODES,
  type BranchAction,
  type CardDetail,
  type CardResult,
  type ExperienceCard,
} from "@/contracts/cards";
import type { KnowledgeTestResult } from "@/contracts/knowledge";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, api, errorText, newKey } from "@/lib/api";
import { cardFormSchema, cardToForm, emptyBranch, emptyStep, toCardContent, type CardFormValues } from "@/lib/card-form";
import { inTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cardItemKey, cardsKey, QaPicker } from "./cards-ui";
import { MarketsPicker, marketsText } from "./knowledge-ui";
import { ProductPicker, STAGE_OPTIONS, stageText, useProducts } from "./qa-ui";

/** 版本冲突：提示刷新到最新内容 */
function conflictText(e: unknown): string | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  return "这张经验卡刚被别人改过，已刷新为最新内容，请核对后再保存。";
}

/** 弹窗：cardId 为空是新建（保存即发布）；有 cardId 时先取详情再编辑 */
export function CardDialog({ me, open, cardId, onClose }: { me: Me; open: boolean; cardId: string | null; onClose: () => void }) {
  const item = useQuery({ queryKey: cardItemKey(cardId ?? ""), queryFn: () => api.get<CardDetail>(`/api/v1/knowledge/cards/${cardId}`), enabled: open && Boolean(cardId) });
  const card = item.data?.card;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{cardId ? "编辑经验卡" : "新建经验卡"}</DialogTitle>
          <DialogDescription>{cardId ? "保存后写一个新版本并立即生效，AI 之后的出稿按新内容。" : "保存即发布：买家情况满足调用条件时，AI 按步骤出稿。"}</DialogDescription>
        </DialogHeader>
        {cardId && item.isError ? (
          <ErrorState error={item.error} onRetry={() => item.refetch()} />
        ) : cardId && !card ? (
          <LoadingRows rows={6} />
        ) : (
          // key：切换到另一张或版本变了时重建表单
          <CardForm key={card ? `${card.id}:${card.version}` : "new"} me={me} card={card} onClose={onClose} onStale={() => item.refetch()} />
        )}
      </DialogContent>
    </Dialog>
  );
}

type Draft = { values: CardFormValues; savedAt: string };
const DRAFT_DELAY_MS = 3_000;

function draftKeyOf(me: Me, card?: ExperienceCard) {
  return `shopilot:card-draft:${me.user.id}:${me.active.merchantId}:${card ? `${card.id}:${card.version}` : "new"}`;
}
function readDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    const d = raw ? (JSON.parse(raw) as Draft) : null;
    return d && d.values && typeof d.savedAt === "string" ? d : null;
  } catch {
    return null;
  }
}

function CardForm({ me, card, onClose, onStale }: { me: Me; card?: ExperienceCard; onClose: () => void; onStale: () => void }) {
  const qc = useQueryClient();
  const products = useProducts();
  const [key, setKey] = useState(newKey);
  const draftKey = draftKeyOf(me, card);
  // 首帧前恢复本机草稿（INT-021）
  const [restored] = useState(() => readDraft(draftKey));
  const [savedAt, setSavedAt] = useState<string | null>(restored?.savedAt ?? null);
  const [draftError, setDraftError] = useState(false);
  const form = useForm<CardFormValues>({ resolver: zodResolver(cardFormSchema), mode: "onTouched", defaultValues: restored?.values ?? cardToForm(card) });
  const conditions = useFieldArray({ control: form.control, name: "conditions" });
  const steps = useFieldArray({ control: form.control, name: "steps" });
  const errors = form.formState.errors;
  const tz = me.active.timezone;

  const saveDraft = () => {
    try {
      const at = new Date().toISOString();
      window.localStorage.setItem(draftKey, JSON.stringify({ values: form.getValues(), savedAt: at } satisfies Draft));
      setSavedAt(at);
      setDraftError(false);
    } catch {
      setDraftError(true);
    }
  };
  const discardDraft = () => {
    window.localStorage.removeItem(draftKey);
    setSavedAt(null);
    form.reset(cardToForm(card));
  };
  // 输入停 3 秒存一次草稿；没改过（还是初始内容）不存
  const values = useWatch({ control: form.control });
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!form.formState.isDirty) return;
    const t = setTimeout(saveDraft, DRAFT_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只跟随表单内容变化
  }, [values]);

  const save = useMutation({
    mutationFn: (v: CardFormValues) => {
      const body = toCardContent(v);
      if (!card) return api.post<CardResult>("/api/v1/knowledge/cards", body, key);
      return api.patch<CardResult>(`/api/v1/knowledge/cards/${card.id}`, { version: card.version, card: body });
    },
    onSuccess: (r) => {
      window.localStorage.removeItem(draftKey);
      toast.success(!card ? "已发布新经验卡" : r.card.version === card.version ? "内容没有变化" : `已保存为第 ${r.card.version} 版`, {
        description: r.card.embedded ? undefined : "检索向量稍后在后台补上，最多 5 分钟后 AI 出稿才找得到这张卡。",
      });
      qc.invalidateQueries({ queryKey: cardsKey });
      qc.invalidateQueries({ queryKey: cardItemKey(r.card.id) });
      onClose();
    },
    onError: (e) => {
      const stale = conflictText(e);
      if (stale) {
        saveDraft();
        toast.error(stale, { description: "你填的内容已存为本机草稿。" });
        qc.invalidateQueries({ queryKey: cardsKey });
        return onStale();
      }
      const fields = e instanceof ApiError ? (e.problem.extra?.fields as Record<string, string> | undefined) : undefined;
      for (const [path, message] of Object.entries(fields ?? {})) form.setError(path as keyof CardFormValues, { message });
      toast.error(errorText(e));
      setKey(newKey());
    },
  });

  return (
    <form noValidate onSubmit={form.handleSubmit((v) => !save.isPending && save.mutate(v))} className="flex min-w-0 flex-col gap-4">
      {restored && (
        <Notice tone="info">
          已恢复你 {inTz(restored.savedAt, tz)} 存在本机的草稿。
          <Button type="button" variant="link" size="sm" className="h-auto px-1 py-0" onClick={discardDraft}>
            丢弃草稿
          </Button>
        </Notice>
      )}
      {card?.status === "archived" && <Notice tone="info">这张卡目前已下架，AI 出稿不会用；保存只改内容，不改状态。</Notice>}
      <FieldGroup>
        <Controller
          name="title"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-end justify-between gap-3">
                <FieldLabel htmlFor="card-title">标题与目标</FieldLabel>
                <span className={cn("text-xs tabular-nums", charCount(field.value) > CARD_TITLE_MAX ? "text-destructive" : "text-muted-foreground")}>
                  {charCount(field.value)} / {CARD_TITLE_MAX}
                </span>
              </div>
              <Input {...field} id="card-title" placeholder="例如 摄像头接上电脑后识别不到：帮买家恢复使用，不行就换货" aria-invalid={fieldState.invalid} />
              {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : <FieldDescription>写清这张卡解决什么情况、要达到什么结果。</FieldDescription>}
            </Field>
          )}
        />

        <Field data-invalid={Boolean(errors.conditions?.message || errors.conditions?.root?.message) || undefined}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <FieldLabel htmlFor="card-c-0">调用条件</FieldLabel>
            <Controller
              name="conditionMode"
              control={form.control}
              render={({ field }) => (
                <ToggleGroup type="single" size="sm" variant="outline" spacing={0} value={field.value} onValueChange={(v) => v && field.onChange(v)} aria-label="调用条件怎么算成立">
                  {CONDITION_MODES.map((m) => (
                    <ToggleGroupItem key={m} value={m} className="px-3 whitespace-nowrap data-[state=on]:bg-accent data-[state=on]:font-semibold data-[state=on]:text-(--semantic-color-text-link)">
                      {CONDITION_MODE_LABEL[m]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
          </div>
          <ol className="flex flex-col gap-2">
            {conditions.fields.map((f, i) => (
              <Controller
                key={f.id}
                name={`conditions.${i}.value`}
                control={form.control}
                render={({ field, fieldState }) => (
                  <li className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Input {...field} id={`card-c-${i}`} placeholder={i === 0 ? "例如 买家说设备已经接上电脑" : "另一条条件"} aria-invalid={fieldState.invalid} aria-label={`调用条件 ${i + 1}`} />
                      {conditions.fields.length > 1 && (
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`删除调用条件 ${i + 1}`} onClick={() => conditions.remove(i)}>
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
          {(errors.conditions?.message || errors.conditions?.root?.message) && <FieldError>{errors.conditions?.message ?? errors.conditions?.root?.message}</FieldError>}
          <div className="flex items-start justify-between gap-3">
            <FieldDescription className="min-w-0 flex-1">AI 逐条判断这些条件对眼前的买家成不成立；标签相似不会触发这张卡。</FieldDescription>
            {conditions.fields.length < CARD_CONDITIONS_MAX && (
              <Button type="button" variant="ghost" size="sm" className="-mr-2 shrink-0" onClick={() => conditions.append({ value: "" })}>
                <PlusIcon />
                加一条
              </Button>
            )}
          </div>
        </Field>

        <Field data-invalid={Boolean(errors.steps?.message || errors.steps?.root?.message) || undefined}>
          <div className="flex items-end justify-between gap-3">
            <FieldLabel htmlFor="card-s-0">处理步骤</FieldLabel>
            <span className="text-xs text-muted-foreground tabular-nums">
              {steps.fields.length} / {CARD_STEPS_MAX}
            </span>
          </div>
          <ol className="flex flex-col gap-3">
            {steps.fields.map((f, i) => (
              <StepEditor key={f.id} form={form} index={i} count={steps.fields.length} onMove={(to) => steps.move(i, to)} onRemove={() => steps.remove(i)} />
            ))}
          </ol>
          {(errors.steps?.message || errors.steps?.root?.message) && <FieldError>{errors.steps?.message ?? errors.steps?.root?.message}</FieldError>}
          <div className="flex items-start justify-between gap-3">
            <FieldDescription className="min-w-0 flex-1">AI 每次回复只推进一步，下一条消息从这一步接着走。调整顺序后，记得核对分支里「跳到第几步」。</FieldDescription>
            {steps.fields.length < CARD_STEPS_MAX && (
              <Button type="button" variant="ghost" size="sm" className="-mr-2 shrink-0" onClick={() => steps.append(emptyStep())}>
                <PlusIcon />
                加一步
              </Button>
            )}
          </div>
        </Field>

        <Controller
          name="tips"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-end justify-between gap-3">
                <FieldLabel htmlFor="card-tips">沟通提示（选填）</FieldLabel>
                <span className={cn("text-xs tabular-nums", charCount(field.value) > CARD_TIPS_MAX ? "text-destructive" : "text-muted-foreground")}>
                  {charCount(field.value)} / {CARD_TIPS_MAX}
                </span>
              </div>
              <Textarea {...field} id="card-tips" rows={2} className="scroll-y max-h-40" placeholder="例如 每次只让买家做一步，做完再问结果" aria-invalid={fieldState.invalid} />
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
                <FieldLabel htmlFor="card-products">产品</FieldLabel>
                <ProductPicker id="card-products" value={field.value} onChange={field.onChange} products={products.data?.items ?? []} invalid={fieldState.invalid} />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : <FieldDescription>不选 = 通用，所有产品都可能用上。</FieldDescription>}
              </Field>
            )}
          />
          <Controller
            name="stage"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="card-stage">服务阶段</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="card-stage" className="w-full">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Controller
            name="qaIds"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="card-qa">关联问答（选填）</FieldLabel>
                <QaPicker id="card-qa" value={field.value} onChange={field.onChange} max={CARD_QA_MAX} />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : <FieldDescription>出稿时作为这张卡的回答依据一起给 AI，最多 {CARD_QA_MAX} 条。</FieldDescription>}
              </Field>
            )}
          />
          <Controller
            name="tagsText"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="card-tags">标签（选填）</FieldLabel>
                <Input {...field} id="card-tags" placeholder="用逗号分隔，例如 连接，首次使用" aria-invalid={fieldState.invalid} />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : <FieldDescription>只用于查询和描述，不决定用不用这张卡。</FieldDescription>}
              </Field>
            )}
          />
        </div>
      </FieldGroup>

      <TestBox form={form} card={card} />
      <PublishSummary control={form.control} products={products.data?.items ?? []} editing={Boolean(card)} />

      <DialogFooter className="items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button type="button" variant="ghost" size="sm" onClick={saveDraft}>
            保存草稿
          </Button>
          {/* 常驻插槽：有无保存时间都占同一行，不挤动按钮（RESP-010） */}
          <span role="status" className={cn("min-w-28 whitespace-nowrap tabular-nums", draftError && "text-destructive")}>
            {draftError ? "草稿没存上，再点一次" : savedAt ? `草稿 ${inTz(savedAt, tz).slice(-5)} 已存` : ""}
          </span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          {/* aria-disabled：按下后不失焦，提交中仍可被读屏发现（A11Y-013） */}
          <Button type="submit" aria-disabled={save.isPending || undefined}>
            {save.isPending && <Spinner />}
            {card ? "保存" : "发布"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

/** 一个步骤：正文、上下移动、删除，最多 3 个分支（条件 + 跳到第几步 / 转人工 / 建工单） */
function StepEditor({ form, index, count, onMove, onRemove }: { form: UseFormReturn<CardFormValues>; index: number; count: number; onMove: (to: number) => void; onRemove: () => void }) {
  const branches = useFieldArray({ control: form.control, name: `steps.${index}.branches` });
  const n = index + 1;
  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-start gap-2">
        <span className="mt-1.5 w-6 shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">{n}.</span>
        <Controller
          name={`steps.${index}.text`}
          control={form.control}
          render={({ field, fieldState }) => (
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Textarea {...field} id={`card-s-${index}`} rows={2} className="min-h-0" placeholder={index === 0 ? "例如 问清电脑系统和连接方式" : "这一步做什么"} aria-invalid={fieldState.invalid} aria-label={`第 ${n} 步`} />
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </div>
          )}
        />
        <div className="flex shrink-0 flex-col gap-0.5">
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`第 ${n} 步上移`} aria-disabled={index === 0 || undefined} onClick={() => index > 0 && onMove(index - 1)}>
            <ArrowUpIcon />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`第 ${n} 步下移`} aria-disabled={index === count - 1 || undefined} onClick={() => index < count - 1 && onMove(index + 1)}>
            <ArrowDownIcon />
          </Button>
        </div>
        {count > 1 && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`删除第 ${n} 步`} onClick={onRemove}>
            <Trash2Icon />
          </Button>
        )}
      </div>
      {branches.fields.length > 0 && (
        <ul className="flex flex-col gap-2 pl-8">
          {branches.fields.map((b, j) => (
            <BranchRow key={b.id} control={form.control} step={index} index={j} count={count} onRemove={() => branches.remove(j)} />
          ))}
        </ul>
      )}
      {branches.fields.length < CARD_BRANCHES_MAX && (
        <Button type="button" variant="ghost" size="sm" className="ml-6 self-start" onClick={() => branches.append(emptyBranch())}>
          <PlusIcon />
          加分支
        </Button>
      )}
    </li>
  );
}

function BranchRow({ control, step, index, count, onRemove }: { control: Control<CardFormValues>; step: number; index: number; count: number; onRemove: () => void }) {
  const action = useWatch({ control, name: `steps.${step}.branches.${index}.action` });
  const label = `第 ${step + 1} 步的分支 ${index + 1}`;
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-sm text-muted-foreground">如果</span>
        <Controller
          name={`steps.${step}.branches.${index}.when`}
          control={control}
          render={({ field, fieldState }) => <Input {...field} className="h-8 min-w-40 flex-1" placeholder="买家说急用" aria-invalid={fieldState.invalid} aria-label={`${label}：条件`} />}
        />
        <Controller
          name={`steps.${step}.branches.${index}.action`}
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={(v) => field.onChange(v as BranchAction)}>
              <SelectTrigger size="sm" className="w-28" aria-label={`${label}：怎么办`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BRANCH_ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a === "goto" ? "跳到第…步" : BRANCH_ACTION_LABEL[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {action === "goto" && (
          <Controller
            name={`steps.${step}.branches.${index}.goto`}
            control={control}
            render={({ field, fieldState }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger size="sm" className="w-24" aria-label={`${label}：跳到第几步`} aria-invalid={fieldState.invalid || undefined}>
                  <SelectValue placeholder="选步骤" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: count }, (_, k) => k + 1)
                    .filter((k) => k !== step + 1)
                    .map((k) => (
                      <SelectItem key={k} value={String(k)}>
                        第 {k} 步
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          />
        )}
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`删除${label}`} onClick={onRemove}>
          <XIcon />
        </Button>
      </div>
      <BranchError control={control} step={step} index={index} />
    </li>
  );
}

function BranchError({ control, step, index }: { control: Control<CardFormValues>; step: number; index: number }) {
  const { errors } = useFormState({ control, name: `steps.${step}.branches.${index}` });
  const e = errors.steps?.[step]?.branches?.[index];
  const msg = e?.when?.message ?? e?.goto?.message ?? e?.message;
  return msg ? <FieldError>{msg}</FieldError> : null;
}

/** 写卡时测试：用这张还没保存的卡试一句买家提问（API-KB-012 带 card），看 AI 用没用到、走到第几步、动作是什么 */
function TestBox({ form, card }: { form: UseFormReturn<CardFormValues>; card?: ExperienceCard }) {
  const [question, setQuestion] = useState("");
  const run = useMutation({
    mutationFn: async () => {
      const content = toCardContent(form.getValues());
      return api.post<KnowledgeTestResult>("/api/v1/knowledge/test", { question: question.trim(), card: content, ...(card ? { cardId: card.id } : {}), ...(content.stage !== "any" ? { stage: content.stage } : {}) });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const start = async () => {
    if (run.isPending) return;
    if (!question.trim()) return toast.error("先写一句买家可能会说的话");
    if (!(await form.trigger())) return toast.error("先把表单里标红的地方改好再测试");
    run.mutate();
  };
  const r = run.data;
  const self = card?.id ?? "proposal";
  const used = r?.card?.cardId === self;
  return (
    <section aria-labelledby="card-test-title" className="flex flex-col gap-2 rounded-md bg-muted p-3">
      <h3 id="card-test-title" className="text-sm font-semibold">
        测试这张卡
      </h3>
      <div className="flex flex-wrap gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void start();
            }
          }}
          className="min-w-48 flex-1 bg-card"
          placeholder="买家可能会说的一句话，例如 摄像头插上电脑没反应，我急用"
          aria-label="测试用的买家提问"
        />
        <Button type="button" variant="outline" aria-disabled={run.isPending || undefined} onClick={() => void start()}>
          {run.isPending ? <Spinner /> : <FlaskConicalIcon />}
          测试
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">只在这次测试里生效，不保存、不计出稿用量；每分钟最多 20 次。</p>
      {r && (
        <div role="status" className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-3 text-sm">
          <p className={cn("font-medium", used ? "text-(--semantic-color-feedback-success)" : "text-(--semantic-color-feedback-warning)")}>
            {used ? `用到了这张卡：第 ${r.card!.step} 步 · ${CARD_ACTION_LABEL[r.card!.action]}` : r.card ? `没用这张卡，用了「${r.card.title}」` : "没用到这张卡"}
          </p>
          {r.card?.reason && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">判断：{r.card.reason}</p>}
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{r.answer || "（空回复）"}</p>
          {r.wouldHandoff && <p className="text-xs text-muted-foreground">按当前设置这条会转人工。</p>}
        </div>
      )}
    </section>
  );
}

/** 发布前核对（INT-003 ⑤）：保存后 AI 出稿立即会用，写出当前实际的范围与流程 */
function PublishSummary({ control, products, editing }: { control: Control<CardFormValues>; products: Product[]; editing: boolean }) {
  const [ids, stage, markets, conds, mode, steps] = useWatch({ control, name: ["productIds", "stage", "markets", "conditions", "conditionMode", "steps"] });
  const names = products.filter((p) => ids.includes(p.id)).map((p) => p.name);
  const branchCount = steps.reduce((n, s) => n + s.branches.length, 0);
  const handoffs = steps.flatMap((s) => s.branches).filter((b) => b.action === "handoff" || b.action === "ticket").length;
  return (
    <ul className="flex flex-col gap-0.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
      <li>{editing ? "保存后立即生效" : "发布后 AI 出稿立即可用"}：{names.length ? names.join("、") : "通用（全部产品）"} · {stageText(stage)} · {markets.length ? marketsText(markets) : "未选站点"}</li>
      <li>
        调用条件 {conds.length} 条（{CONDITION_MODE_LABEL[mode]}）· {steps.length} 步 · {branchCount} 个分支{handoffs ? `，其中 ${handoffs} 个转人工或建工单` : ""}
      </li>
    </ul>
  );
}
