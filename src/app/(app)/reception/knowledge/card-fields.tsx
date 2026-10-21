"use client";

// 写卡表单的字段（标题与目标、调用条件、步骤与分支、沟通提示、产品、阶段、站点、关联问答、标签）：
// 写卡弹窗（API-KB-030、API-KB-032）与学习任务审核（API-KB-040、API-KB-041）共用；校验只用 card-form 的 cardFormSchema。
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { Controller, useFieldArray, useFormState, useWatch, type Control, type UseFormReturn } from "react-hook-form";
import { BRANCH_ACTION_LABEL, BRANCH_ACTIONS, CARD_BRANCHES_MAX, CARD_CONDITIONS_MAX, CARD_QA_MAX, CARD_STEPS_MAX, CARD_TIPS_MAX, CARD_TITLE_MAX, CONDITION_MODE_LABEL, CONDITION_MODES, type BranchAction } from "@/contracts/cards";
import { charCount } from "@/contracts/reception";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { emptyBranch, emptyStep, type CardFormValues } from "@/lib/card-form";
import { cn } from "@/lib/utils";
import { QaPicker } from "./cards-ui";
import { MarketsPicker } from "./knowledge-ui";
import { ProductPicker, STAGE_OPTIONS, stageText, useProducts } from "./qa-ui";

export function CardFields({ form }: { form: UseFormReturn<CardFormValues> }) {
  const products = useProducts();
  const conditions = useFieldArray({ control: form.control, name: "conditions" });
  const steps = useFieldArray({ control: form.control, name: "steps" });
  const errors = form.formState.errors;
  return (
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

