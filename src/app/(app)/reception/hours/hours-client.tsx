"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlusIcon, CheckIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch, type FieldErrors } from "react-hook-form";
import { toast } from "sonner";
import { TIMEZONES } from "@/contracts/common";
import {
  HOLIDAYS_MAX,
  KEYWORD_MAX_LENGTH,
  KEYWORDS_MAX,
  REMIND_MINUTES,
  WEEK_DAYS,
  charCount,
  hoursBody,
  type HoursBody,
  type ReceptionSettings,
  type WeekDay,
} from "@/contracts/reception";
import { PageActions } from "@/components/shell/app-shell";
import { ErrorState, LoadingRows, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ApiError, api, errorText } from "@/lib/api";
import { TIMEZONE_LABEL, inTz } from "@/lib/format";
import { ReceptionFrame } from "../reception-frame";

const DAY_LABEL: Record<WeekDay, string> = { mon: "周一", tue: "周二", wed: "周三", thu: "周四", fri: "周五", sat: "周六", sun: "周日" };
const FORM_ID = "reception-hours-form";

export function HoursClient() {
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
  return <HoursForm settings={data.data} />;
}

function firstError(e: FieldErrors<HoursBody>[keyof HoursBody]): string | undefined {
  if (!e) return undefined;
  if (Array.isArray(e)) return e.find(Boolean)?.message;
  return (e as { message?: string; root?: { message?: string } }).message ?? (e as { root?: { message?: string } }).root?.message;
}

function HoursForm({ settings }: { settings: ReceptionSettings }) {
  const qc = useQueryClient();
  const form = useForm<HoursBody>({
    resolver: zodResolver(hoursBody),
    mode: "onTouched",
    defaultValues: {
      timezone: settings.hours.timezone as HoursBody["timezone"],
      schedule: settings.hours.schedule,
      holidays: settings.hours.holidays,
      keywords: settings.handoff.keywords,
      confidenceThreshold: settings.handoff.confidenceThreshold,
      unclaimedRemindMinutes: settings.handoff.unclaimedRemindMinutes as HoursBody["unclaimedRemindMinutes"],
      responseSlaMinutes: settings.handoff.responseSlaMinutes,
    },
  });
  const { errors, isDirty } = form.formState;
  const timezone = useWatch({ control: form.control, name: "timezone" });

  const save = useMutation({
    mutationFn: (v: HoursBody) => api.put("/api/v1/reception/hours", v),
    onSuccess: async (_r, v) => {
      form.reset(v);
      await qc.invalidateQueries({ queryKey: ["reception"] });
      if (v.timezone !== settings.hours.timezone) qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("已保存，下一条入站消息起生效");
    },
    onError: (e) => {
      const fields = e instanceof ApiError ? (e.problem.extra?.fields as Record<string, string> | undefined) : undefined;
      if (fields) {
        for (const [path, message] of Object.entries(fields)) {
          const name = (path.startsWith("keywords") ? "keywords" : path.startsWith("holidays") ? "holidays" : path) as keyof HoursBody;
          form.setError(name, { message });
        }
      }
      toast.error(errorText(e));
    },
  });

  const facts = `时区 ${settings.hours.timezone} · 转人工关键词 ${settings.handoff.keywords.length} 个 · 接待时限 ${settings.handoff.responseSlaMinutes} 分钟`;

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
          <PanelHeader title="工作时间" description="决定每家店用「工作时间内」还是「工作时间外」的模式" />
          <FieldGroup>
            <Controller
              name="timezone"
              control={form.control}
              render={({ field }) => (
                <Field className="max-w-sm">
                  <FieldLabel htmlFor="rcp-timezone">时区</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="rcp-timezone" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {TIMEZONE_LABEL[tz] ?? tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>商户级，全部店铺共用；与「商户设置」里的时区是同一个</FieldDescription>
                </Field>
              )}
            />
            <div role="group" aria-label="周排班">
              <ul className="flex flex-col">
                {WEEK_DAYS.map((day) => (
                  <Controller
                    key={day}
                    name={`schedule.${day}`}
                    control={form.control}
                    render={({ field }) => {
                      const err = errors.schedule?.[day]?.end?.message ?? errors.schedule?.[day]?.start?.message;
                      return (
                        <li className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border py-1.5 last:border-0">
                          <span className="w-8 text-sm">{DAY_LABEL[day]}</span>
                          <Switch checked={field.value.on} onCheckedChange={(on) => field.onChange({ ...field.value, on })} aria-label={`${DAY_LABEL[day]}工作`} />
                          {field.value.on ? (
                            <span className="flex items-center gap-2">
                              <Input
                                type="time"
                                value={field.value.start}
                                onChange={(e) => field.onChange({ ...field.value, start: e.target.value })}
                                onBlur={field.onBlur}
                                aria-label={`${DAY_LABEL[day]}开始时间`}
                                aria-invalid={Boolean(err)}
                                className="h-8 w-36 tabular-nums"
                              />
                              <span className="text-muted-foreground">–</span>
                              <Input
                                type="time"
                                value={field.value.end}
                                onChange={(e) => field.onChange({ ...field.value, end: e.target.value })}
                                onBlur={field.onBlur}
                                aria-label={`${DAY_LABEL[day]}结束时间`}
                                aria-invalid={Boolean(err)}
                                className="h-8 w-36 tabular-nums"
                              />
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">休息，按工作时间外处理</span>
                          )}
                          {err && <FieldError>{err}</FieldError>}
                        </li>
                      );
                    }}
                  />
                ))}
              </ul>
            </div>
            <Controller
              name="holidays"
              control={form.control}
              render={({ field }) => <HolidayEditor value={field.value} onChange={field.onChange} error={firstError(errors.holidays)} timezone={timezone} />}
            />
          </FieldGroup>
        </Panel>

        <Panel>
          <PanelHeader title="转人工" description="命中任一条件就转人工；auto 模式转人工时 AI 先回一句安抚，买家不会被晾着" />
          <FieldGroup>
            <Controller
              name="keywords"
              control={form.control}
              render={({ field }) => <KeywordEditor value={field.value} onChange={field.onChange} error={firstError(errors.keywords)} />}
            />
            <Field className="max-w-sm" data-invalid={Boolean(errors.confidenceThreshold)}>
              <FieldLabel htmlFor="rcp-threshold">低于这个置信度转人工</FieldLabel>
              <Input
                id="rcp-threshold"
                type="number"
                inputMode="decimal"
                step={0.05}
                min={0.5}
                max={0.95}
                className="tabular-nums"
                aria-invalid={Boolean(errors.confidenceThreshold)}
                {...form.register("confidenceThreshold", { valueAsNumber: true })}
              />
              <FieldDescription>AI 自评置信度低于它时不出稿，会话进待认领；0.50 到 0.95，默认 0.60</FieldDescription>
              {errors.confidenceThreshold && <FieldError>{errors.confidenceThreshold.message}</FieldError>}
            </Field>
          </FieldGroup>
        </Panel>

        <Panel>
          <PanelHeader title="接待时限与提醒" description="工作台的等待时长与待认领提醒按这里计算" />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Field data-invalid={Boolean(errors.responseSlaMinutes)}>
              <FieldLabel htmlFor="rcp-sla">接待时限（分钟）</FieldLabel>
              <Input
                id="rcp-sla"
                type="number"
                inputMode="numeric"
                step={1}
                min={5}
                max={120}
                className="tabular-nums"
                aria-invalid={Boolean(errors.responseSlaMinutes)}
                {...form.register("responseSlaMinutes", { valueAsNumber: true })}
              />
              <FieldDescription>工作时间内买家等待超过这个时长，会话在工作台标警示；5 到 120 分钟</FieldDescription>
              {errors.responseSlaMinutes && <FieldError>{errors.responseSlaMinutes.message}</FieldError>}
            </Field>
            <Controller
              name="unclaimedRemindMinutes"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="rcp-remind">待认领提醒</FieldLabel>
                  <Select value={field.value === null ? "none" : String(field.value)} onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))}>
                    <SelectTrigger id="rcp-remind" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REMIND_MINUTES.map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m} 分钟后通知组长
                        </SelectItem>
                      ))}
                      <SelectItem value="none">不提醒</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldDescription>会话待认领超过这个时长，站内通知负责该店的组长一次</FieldDescription>
                </Field>
              )}
            />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">草稿 24 小时未处置自动过期；会话 72 小时没有新消息自动结束本段。</p>
        </Panel>
      </form>
    </ReceptionFrame>
  );
}

function KeywordEditor({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const [input, setInput] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const full = value.length >= KEYWORDS_MAX;
  const add = () => {
    const kw = input.trim();
    if (!kw) return setHint("先输入关键词");
    if (charCount(kw) > KEYWORD_MAX_LENGTH) return setHint(`每个关键词最多 ${KEYWORD_MAX_LENGTH} 个字`);
    if (value.some((k) => k.toLowerCase() === kw.toLowerCase())) return setHint(`「${kw}」已经在列表里`);
    onChange([...value, kw]);
    setInput("");
    setHint(null);
  };
  const message = error ?? hint;
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="rcp-keyword">
        关键词
        <span className="font-normal text-muted-foreground tabular-nums">
          {value.length} / {KEYWORDS_MAX}
        </span>
      </FieldLabel>
      <ul className="flex flex-wrap gap-2" aria-label="转人工关键词">
        {value.map((k) => (
          <li key={k} className="inline-flex h-7 items-center gap-1 rounded-sm border border-border pr-1 pl-2 text-sm">
            {k}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== k))} aria-label={`移除 ${k}`} className="state-layer focus-ring flex size-5 items-center justify-center rounded-sm">
              <XIcon className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex max-w-md gap-2">
        <Input
          id="rcp-keyword"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setHint(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!full) add();
            }
          }}
          placeholder="例如 退货、ร้องเรียน"
          aria-invalid={Boolean(hint || error)}
          disabled={full}
        />
        <Button type="button" variant="outline" onClick={add} disabled={full}>
          <PlusIcon />
          添加
        </Button>
      </div>
      <FieldDescription>
        {full ? `已满 ${KEYWORDS_MAX} 个，先移除一个再添加。` : ""}买家消息包含任一关键词（不分大小写）就转人工；每个最多 {KEYWORD_MAX_LENGTH} 个字
      </FieldDescription>
      <div className="min-h-5">{message && <FieldError>{message}</FieldError>}</div>
    </Field>
  );
}

function HolidayEditor({ value, onChange, error, timezone }: { value: string[]; onChange: (v: string[]) => void; error?: string; timezone: string }) {
  const [date, setDate] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const full = value.length >= HOLIDAYS_MAX;
  // 「今天」按商户时区算
  const today = inTz(new Date(), timezone, "yyyy-MM-dd");
  const add = () => {
    if (!date) return setHint("先选一个日期");
    if (date < today) return setHint(`${date} 已经过去，只能加今天（${today}）及以后的日期`);
    if (value.includes(date)) return setHint(`${date} 已经是节假日`);
    onChange([...value, date].sort());
    setDate("");
    setHint(null);
  };
  const message = error ?? hint;
  return (
    <Field>
      <FieldLabel htmlFor="rcp-holiday">节假日</FieldLabel>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="节假日">
          {value.map((d) => (
            <li key={d} className="inline-flex h-7 items-center gap-1 rounded-sm border border-border pr-1 pl-2 text-sm tabular-nums">
              {d}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== d))} aria-label={`移除节假日 ${d}`} className="state-layer focus-ring flex size-5 items-center justify-center rounded-sm">
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex max-w-md gap-2">
        <Input
          id="rcp-holiday"
          type="date"
          min={today}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setHint(null);
          }}
          className="w-44 tabular-nums"
          disabled={full}
        />
        <Button type="button" variant="outline" onClick={add} disabled={full}>
          <CalendarPlusIcon />
          添加节假日
        </Button>
      </div>
      <FieldDescription>
        节假日全天按工作时间外处理；{value.length ? `已设 ${value.length} 天` : "还没有设节假日"}
        {full ? `，已满 ${HOLIDAYS_MAX} 天，先移除一个再添加` : ""}
      </FieldDescription>
      <div className="min-h-5">{message && <FieldError>{message}</FieldError>}</div>
    </Field>
  );
}
