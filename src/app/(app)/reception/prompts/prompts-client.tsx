"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, HistoryIcon, LockIcon, RotateCcwIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch, type Control } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { Me } from "@/contracts/auth";
import {
  BRAND_VOICE_MAX_LENGTH,
  PROMPT_MAX_LENGTH,
  PROMPT_STAGE_KEYS,
  charCount,
  promptsBody,
  type PromptStageKey,
  type PromptStageState,
  type PromptsBody,
  type ReceptionSettings,
} from "@/contracts/reception";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageActions } from "@/components/shell/app-shell";
import { ErrorState, LoadingRows, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, errorText } from "@/lib/api";
import { inTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PROMPT_VARIABLES, STAGE_LABEL } from "@/server/ai/prompts";
import { ReceptionFrame } from "../reception-frame";
import { QuickRepliesPanel } from "./quick-replies";

const FORM_ID = "reception-prompts-form";
const formSchema = z.object({ brandVoice: promptsBody.shape.brandVoice.unwrap(), stages: promptsBody.shape.stages.unwrap().required() });
type FormValues = z.infer<typeof formSchema>;

const VARIABLE_HELP: Record<(typeof PROMPT_VARIABLES)[number], string> = {
  "{shop_name}": "店铺名",
  "{platform}": "平台（Shopee 或 TikTok）",
  "{market}": "站点，如 MY、TH",
  "{merchant_name}": "商户名",
};
const STAGE_RULE =
  "阶段判定：消息指向某张订单时只看这一单 → 有未终结售后为售后 → 有未完结订单或取消处理中为售中 → 60 天内已完成或已签收为售后 → 没有进行中的订单为售前 → 订单还没同步完时按关键词判断，仍判断不了为未确认。";

export function PromptsClient({ me }: { me: Me }) {
  const data = useQuery({ queryKey: ["reception"], queryFn: () => api.get<ReceptionSettings>("/api/v1/reception") });
  if (data.isError)
    return (
      <ReceptionFrame>
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      </ReceptionFrame>
    );
  if (!data.data)
    return (
      <ReceptionFrame>
        <LoadingRows />
      </ReceptionFrame>
    );
  return <PromptsForm settings={data.data} timezone={me.active.timezone} />;
}

function Counter({ control, name, max }: { control: Control<FormValues>; name: "brandVoice" | `stages.${PromptStageKey}`; max: number }) {
  const value = useWatch({ control, name });
  const n = charCount(value ?? "");
  return (
    <span className={cn("text-xs font-normal tabular-nums", n > max ? "text-destructive" : "text-muted-foreground")}>
      {n.toLocaleString("en-US")} / {max.toLocaleString("en-US")}
    </span>
  );
}

function PromptsForm({ settings, timezone }: { settings: ReceptionSettings; timezone: string }) {
  const qc = useQueryClient();
  const { prompts } = settings;
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: { brandVoice: prompts.brandVoice, stages: { presale: prompts.stages.presale.text, insale: prompts.stages.insale.text, aftersale: prompts.stages.aftersale.text } },
  });
  const { isDirty, dirtyFields } = form.formState;
  const [resetStage, setResetStage] = useState<PromptStageKey | null>(null);

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body: PromptsBody = {};
      if (dirtyFields.brandVoice) body.brandVoice = v.brandVoice;
      const stages = Object.fromEntries(PROMPT_STAGE_KEYS.filter((s) => dirtyFields.stages?.[s]).map((s) => [s, v.stages[s]]));
      if (Object.keys(stages).length) body.stages = stages;
      return api.put("/api/v1/reception/prompts", body);
    },
    onSuccess: async (_r, v) => {
      form.reset(v);
      await qc.invalidateQueries({ queryKey: ["reception"] });
      toast.success("已保存，下一条入站消息起生效");
    },
    onError: (e) => {
      const fields = e instanceof ApiError ? (e.problem.extra?.fields as Record<string, string> | undefined) : undefined;
      for (const [path, message] of Object.entries(fields ?? {})) form.setError(path as "brandVoice", { message });
      toast.error(errorText(e));
    },
  });

  const reset = useMutation({
    mutationFn: (stage: PromptStageKey) => api.post<PromptStageState>(`/api/v1/reception/prompts/${stage}/reset`),
    onSuccess: async (r, stage) => {
      form.resetField(`stages.${stage}`, { defaultValue: r.text });
      setResetStage(null);
      await qc.invalidateQueries({ queryKey: ["reception"] });
      toast.success(`${STAGE_LABEL[stage]}提示词已恢复默认，下一条入站消息起生效`);
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const customCount = PROMPT_STAGE_KEYS.filter((s) => !prompts.stages[s].isDefault).length;
  const facts = `品牌语气${prompts.brandVoice ? "已填" : "未填"} · 阶段提示词 3 段（${customCount ? `${customCount} 段已自定义` : "都是内置默认"}）+ 未确认 1 段（固定）· 护栏锁定`;

  return (
    <ReceptionFrame facts={facts} dirty={isDirty}>
      <PageActions>
        <Button type="submit" form={FORM_ID} disabled={!isDirty || save.isPending}>
          {save.isPending ? <Spinner /> : <CheckIcon />}
          保存
        </Button>
      </PageActions>
      <form id={FORM_ID} noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-4">
        <Panel>
          <Controller
            name="brandVoice"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <FieldLabel htmlFor="rcp-voice" className="text-lg font-semibold">
                      品牌语气
                    </FieldLabel>
                    <p className="text-xs text-muted-foreground">所有店铺共用，只调整语气；回复语言跟随买家</p>
                  </div>
                  <Counter control={form.control} name="brandVoice" max={BRAND_VOICE_MAX_LENGTH} />
                </div>
                <Textarea {...field} id="rcp-voice" rows={3} placeholder="例如：亲切、简洁、专业；先确认买家的问题，再给步骤；不用表情符号。" aria-invalid={fieldState.invalid} className="scroll-y max-h-60" />
                {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
              </Field>
            )}
          />
        </Panel>

        <Panel>
          <PanelHeader title="按买家阶段的提示词" description="AI 先判断会话阶段，再用对应提示词出稿；保存保留最近 10 个版本" />
          <div className="flex flex-col">
            {PROMPT_STAGE_KEYS.map((stage) => {
              const state = prompts.stages[stage];
              const savedAt = state.versions[0]?.savedAt;
              return (
                <Controller
                  key={stage}
                  name={`stages.${stage}`}
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} className="border-b border-border py-4 first:pt-0 last:border-0">
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <FieldLabel htmlFor={`rcp-stage-${stage}`} className="font-semibold">
                          {STAGE_LABEL[stage]}
                        </FieldLabel>
                        <span className="text-xs text-muted-foreground">
                          {state.isDefault ? "内置默认" : `已自定义${savedAt ? ` · ${inTz(savedAt, timezone)} 保存` : ""}`}
                          {dirtyFields.stages?.[stage] ? " · 有未保存的修改" : ""}
                        </span>
                      </div>
                      <Textarea {...field} id={`rcp-stage-${stage}`} rows={6} aria-invalid={fieldState.invalid} className="scroll-y max-h-96 min-h-32" />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={state.isDefault || reset.isPending} onClick={() => setResetStage(stage)}>
                          <RotateCcwIcon />
                          恢复默认
                        </Button>
                        <HistoryButton stage={stage} count={state.versions.length} />
                        <span className="ml-auto">
                          <Counter control={form.control} name={`stages.${stage}`} max={PROMPT_MAX_LENGTH} />
                        </span>
                      </div>
                      {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                    </Field>
                  )}
                />
              );
            })}
            <div className="flex flex-col gap-2 pt-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="text-sm font-semibold">阶段未确认</p>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <LockIcon className="size-3.5" />
                  固定正文 · 不可编辑
                </span>
              </div>
              <p className="rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{prompts.unknownStageText}</p>
              <p className="text-xs text-muted-foreground">订单接口失败、关键词也判断不了阶段时使用；不套用会断言订单状态的阶段模板。{STAGE_RULE}</p>
            </div>
          </div>
        </Panel>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel>
            <PanelHeader title="护栏（不可编辑）" description="拼在每段提示词末尾，由服务端强制" />
            <p className="flex gap-2 rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
              <LockIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
              <span>{prompts.guardrails}</span>
            </p>
          </Panel>
          <Panel>
            <PanelHeader title="变量" description="写在阶段提示词里，出稿时按会话所在店铺替换" />
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              {PROMPT_VARIABLES.map((v) => (
                <div key={v} className="contents">
                  <dt>
                    <code className="rounded-sm bg-muted px-1.5 py-0.5 text-xs">{v}</code>
                  </dt>
                  <dd className="text-muted-foreground">{VARIABLE_HELP[v]}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </form>

      <QuickRepliesPanel />

      <HistoryDialog
        prompts={prompts}
        timezone={timezone}
        onUse={(stage, text) => {
          form.setValue(`stages.${stage}`, text, { shouldDirty: true, shouldValidate: true });
          toast.success(`已放回${STAGE_LABEL[stage]}编辑框，点「保存」后生效`);
        }}
      />
      <ConfirmDialog
        open={resetStage !== null}
        onOpenChange={(o) => !o && setResetStage(null)}
        title={resetStage ? `${STAGE_LABEL[resetStage]}提示词恢复为内置默认？` : ""}
        desc="正文换回内置默认，立即生效；已保存过的版本保留在历史版本里，之后可以放回。编辑框里未保存的修改会丢掉。"
        confirmText="恢复默认"
        pending={reset.isPending}
        onConfirm={() => resetStage && reset.mutate(resetStage)}
      />
    </ReceptionFrame>
  );
}

// 历史版本对话框：?dialog=prompt-history&stage=<阶段>，刷新与分享链接时回到同一段
function useHistoryParam() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const stage = PROMPT_STAGE_KEYS.find((s) => s === params.get("stage")) ?? "presale";
  const go = (mutate: (p: URLSearchParams) => void, mode: "push" | "replace") => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    const qs = next.toString();
    router[mode](qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return {
    open: params.get("dialog") === "prompt-history",
    stage,
    openFor: (s: PromptStageKey) =>
      go((p) => {
        p.set("dialog", "prompt-history");
        p.set("stage", s);
      }, "push"),
    close: () =>
      go((p) => {
        p.delete("dialog");
        p.delete("stage");
      }, "replace"),
  };
}

function HistoryButton({ stage, count }: { stage: PromptStageKey; count: number }) {
  const { openFor } = useHistoryParam();
  if (count === 0) return <span className="text-xs text-muted-foreground">还没有保存过的版本</span>;
  return (
    <Button type="button" variant="ghost" size="sm" onClick={() => openFor(stage)}>
      <HistoryIcon />
      历史版本 {count}
    </Button>
  );
}

function HistoryDialog({ prompts, timezone, onUse }: { prompts: ReceptionSettings["prompts"]; timezone: string; onUse: (stage: PromptStageKey, text: string) => void }) {
  const { open, close, stage } = useHistoryParam();
  const state = prompts.stages[stage];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{STAGE_LABEL[stage]}提示词 · 历史版本</DialogTitle>
          <DialogDescription>最近保存过的 {state.versions.length} 个版本，新的在前；放回编辑框后点「保存」才生效。</DialogDescription>
        </DialogHeader>
        <ol className="scroll-y flex max-h-[60dvh] flex-col gap-3">
          {state.versions.map((v, i) => (
            <li key={v.savedAt + i} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm tabular-nums">
                  {inTz(v.savedAt, timezone, "yyyy-MM-dd HH:mm")}
                  {!state.isDefault && i === 0 && <span className="ml-2 text-xs text-(--semantic-color-text-link)">当前生效</span>}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onUse(stage, v.text);
                    close();
                  }}
                >
                  放回编辑框
                </Button>
              </div>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{v.text}</p>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
