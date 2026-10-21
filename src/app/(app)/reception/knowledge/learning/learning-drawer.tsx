"use client";

// 学习任务抽屉（?task=<id>，API-KB-039 至 API-KB-043）：原始消息、背景、相似内容、测试结果、判断依据与建议、建议更新内容；
// 待审核的可改内容 → 复测 → 发布，或无需更新、驳回；分析失败的可重新分析。
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, FlaskConicalIcon, RotateCcwIcon, SearchXIcon, SendIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import {
  CARD_ACTION_LABEL,
  CONDITION_MODE_LABEL,
  DIAGNOSIS_LABEL,
  LEARNING_REASON_MAX,
  LEARNING_RESULT_LABEL,
  LEARNING_SOURCE_LABEL,
  zCardContent,
  type CardContent,
  type LearningTask,
  type LearningTaskResult,
  type SimResult,
} from "@/contracts/cards";
import { charCount } from "@/contracts/reception";
import { Notice } from "@/components/orders/order-ui";
import { EmptyState, ErrorState, LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, errorText } from "@/lib/api";
import { cardFormSchema, cardToForm, contentToForm, formToContent, toCardContent, type CardFormValues } from "@/lib/card-form";
import { inTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HANDOFF_LABEL, STAGE_LABEL } from "../../../wb/wb-shared";
import { marketsText, useUrlParams } from "../knowledge-ui";
import { stageText, useProducts } from "../qa-ui";
import { CardFields } from "../card-fields";
import { TaskStatus } from "./learning-tab";
import { learningDraftKey, learningItemKey, learningKey, POLL_MS, readLearningDraft, type LearningDraft } from "./learning-ui";

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const sortKeys = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sortKeys(x)])) : v;
const stableJson = (v: unknown) => JSON.stringify(sortKeys(v));
const cardHref = (id: string) => `/reception/knowledge?tab=cards&card=${id}`;

export function LearningDrawer({ me }: { me: Me }) {
  const { params, update } = useUrlParams();
  const taskId = params.get("task");
  return (
    <Sheet open={Boolean(taskId)} onOpenChange={(o) => !o && update({ task: null })}>
      <SheetContent
        className="w-full gap-0 overscroll-contain data-[side=right]:sm:max-w-3xl"
        aria-describedby={undefined}
        // 打开它的那一行不在了（被筛掉、从链接直接打开）时焦点落到「学习」标题上（A11Y-013）
        onCloseAutoFocus={() =>
          requestAnimationFrame(() => {
            if (document.activeElement === document.body) document.getElementById("kb-learning-title")?.focus();
          })
        }
      >
        {taskId && <DrawerBody key={taskId} me={me} taskId={taskId} onClose={() => update({ task: null })} />}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ me, taskId, onClose }: { me: Me; taskId: string; onClose: () => void }) {
  const valid = isUuid(taskId);
  const q = useQuery({
    queryKey: learningItemKey(taskId),
    queryFn: () => api.get<LearningTaskResult>(`/api/v1/knowledge/learning/${taskId}`),
    enabled: valid,
    refetchInterval: (query) => (query.state.data?.task.status === "analyzing" ? POLL_MS : false),
  });
  const notFound = !valid || (q.error instanceof ApiError && q.error.status === 404);
  if (notFound || q.isError)
    return (
      <>
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle className="text-lg">学习任务</SheetTitle>
        </SheetHeader>
        {notFound ? (
          <EmptyState
            icon={SearchXIcon}
            title="找不到这个学习任务"
            description="会话被删除时，它的学习任务会一起删除。"
            action={
              <Button variant="outline" onClick={onClose}>
                回到学习列表
              </Button>
            }
          />
        ) : (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        )}
      </>
    );
  if (!q.data)
    return (
      <>
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle className="text-lg">学习任务</SheetTitle>
          <Skeleton className="h-4 w-56 bg-muted" />
        </SheetHeader>
        <div className="px-4 pt-4">
          <LoadingRows rows={6} />
        </div>
      </>
    );
  return <TaskDetail me={me} t={q.data.task} />;
}

function TaskDetail({ me, t }: { me: Me; t: LearningTask }) {
  const tz = me.active.timezone;
  return (
    <>
      <SheetHeader className="border-b border-border pr-12">
        <SheetTitle className="text-lg">学习任务</SheetTitle>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <TaskStatus status={t.status} />
          <span>
            {LEARNING_SOURCE_LABEL[t.source]}
            {t.submittedByName ? `（${t.submittedByName}）` : ""} · {inTz(t.createdAt, tz, "yyyy-MM-dd HH:mm")}
          </span>
          {t.conversation && (
            <Link href={`/wb/${t.conversation.id}`} className="focus-ring inline-flex items-center gap-1 rounded-sm text-(--semantic-color-text-link) underline-offset-2 hover:underline">
              {t.conversation.buyerName} · {t.conversation.shopName}
              <ExternalLinkIcon className="size-3" aria-hidden />
            </Link>
          )}
        </p>
      </SheetHeader>
      <div className="scroll-y min-h-0 flex-1 overscroll-contain px-4 py-4">
        <div className="flex flex-col gap-6">
          <Outcome t={t} tz={tz} />
          <Section title="原始消息" hint={t.source === "agent" ? "Agent 挑的整段会话" : "高亮的是客服勾选的消息，其余是前后对话"}>
            <Transcript t={t} tz={tz} />
            {t.note && <p className="text-sm">客服备注：{t.note}</p>}
          </Section>
          <Section title="背景">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">产品</dt>
              <dd className="[overflow-wrap:anywhere]">
                {t.products.length ? t.products.map((p) => `${p.name}（${p.code}）`).join("、") : "没识别到"}
                {t.productStatus !== "identified" && t.status === "pending_review" && <span className="ml-2 text-xs text-(--semantic-color-feedback-warning)">待确认产品：在下方的建议内容里选定</span>}
                {t.productBasis && <span className="block text-xs text-muted-foreground">{t.productBasis}</span>}
              </dd>
              <dt className="text-muted-foreground">服务阶段</dt>
              <dd>{STAGE_LABEL[t.stage as keyof typeof STAGE_LABEL] ?? t.stage}</dd>
            </dl>
          </Section>
          {t.status !== "analyzing" && t.status !== "failed" && (
            <Section title="判断依据与建议">
              <p className="text-sm">
                <span className="font-medium">{t.diagnosis ? DIAGNOSIS_LABEL[t.diagnosis] : "没有诊断"}</span>
              </p>
              {t.reason && <p className="text-sm leading-relaxed [overflow-wrap:anywhere]">依据：{t.reason}</p>}
              {t.suggestion && <p className="text-sm leading-relaxed [overflow-wrap:anywhere]">建议：{t.suggestion}</p>}
            </Section>
          )}
          {t.similar.length > 0 && (
            <Section title="相似内容" hint="AI 分析时参考的已发布经验卡">
              <ul className="flex flex-col gap-1.5">
                {t.similar.map((s) => (
                  <li key={s.cardId} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <Link href={cardHref(s.cardId)} className="focus-ring min-w-0 rounded-sm text-(--semantic-color-text-link) underline-offset-2 [overflow-wrap:anywhere] hover:underline">
                      {s.title}
                    </Link>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      相似度 {Math.round(Math.max(0, 1 - s.distance) * 100)}% · {s.productMatch ? "产品对得上" : "产品不同"} · {s.stageMatch ? "阶段对得上" : "阶段不同"}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {(t.test || t.retest) && (
            <Section title="测试结果" hint={t.testQuestion ? `用买家的「${t.testQuestion}」按现在的出稿流程试跑，不发给买家` : undefined}>
              {t.test && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <SimBlock label="改前（现有知识）" r={t.test.before} />
                  <SimBlock label="改后（加上这张卡）" r={t.test.after} />
                </div>
              )}
              {t.retest && <RetestBlock t={t} tz={tz} />}
            </Section>
          )}
          {t.status === "pending_review" && <ReviewForm key={t.version} me={me} t={t} />}
          {t.status === "failed" && <FailedActions t={t} />}
        </div>
      </div>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const FROM_LABEL = { buyer: "买家", seller: "客服", ai: "AI", system: "系统" } as const;

function Transcript({ t, tz }: { t: LearningTask; tz: string }) {
  return (
    <ol className="flex flex-col gap-1 rounded-md border border-border p-2">
      {t.messages.map((m) => (
        <li key={m.id} className={cn("flex gap-2 rounded-sm px-2 py-1 text-sm", m.selected && "bg-(--semantic-color-surface-selected)")}>
          <span className="w-10 shrink-0 text-xs leading-5 text-muted-foreground">{FROM_LABEL[m.from]}</span>
          <span className="min-w-0 flex-1 leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]">{m.text}</span>
          <span className="shrink-0 text-xs leading-5 text-muted-foreground tabular-nums">{inTz(m.at, tz, "MM-dd HH:mm")}</span>
          {m.selected && <span className="sr-only">（已勾选）</span>}
        </li>
      ))}
    </ol>
  );
}

/** 一次模拟出稿：回复、用到的卡与步骤、会不会转人工 */
function SimBlock({ label, r, className }: { label: string; r: SimResult; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-md border border-border px-3 py-2", className)}>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{r.reply || "（空回复）"}</p>
      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
        {r.card ? `经验卡：${r.card.title} · 第 ${r.card.step} 步 · ${CARD_ACTION_LABEL[r.card.action]}` : "没有用经验卡"}
        {r.handoff ? ` · 会转人工（${HANDOFF_LABEL[r.handoffReason ?? ""] ?? "转人工"}）` : ""}
        {r.insufficient ? " · 判定资料不足" : ""}
      </p>
    </div>
  );
}

function RetestBlock({ t, tz }: { t: LearningTask; tz: string }) {
  const r = t.retest!;
  return (
    <div className="flex flex-col gap-2">
      <p className={cn("text-sm font-medium", r.passed ? "text-(--semantic-color-feedback-success)" : "text-destructive")}>
        复测{r.passed ? "通过" : "没通过"}
        <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">{inTz(r.at, tz, "MM-dd HH:mm")}</span>
      </p>
      {r.failReason && <p className="text-sm [overflow-wrap:anywhere]">{r.failReason}</p>}
      <SimBlock label="原问题（用拟发布的内容）" r={r.original} />
      {r.regressions.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {r.regressions.map((g) => (
            <li key={g.taskId} className="flex flex-col gap-2 rounded-md bg-muted px-3 py-2">
              <p className="text-sm [overflow-wrap:anywhere]">
                以前测过的「{g.question}」：<span className={g.notWorse ? "text-(--semantic-color-feedback-success)" : "text-destructive"}>{g.notWorse ? "不比改前差" : "改后变差"}</span>
                {g.reason && <span className="text-muted-foreground"> · {g.reason}</span>}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <SimBlock label="改前" r={g.before} className="bg-card" />
                <SimBlock label="改后" r={g.after} className="bg-card" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{t.targetCard ? "这张卡还没有以前测过的问题。" : "新卡没有以前测过的问题。"}</p>
      )}
    </div>
  );
}

/** 已有结论的任务：Agent 改了卡、审核人发布、无需更新、驳回、复测没通过、分析失败 */
function Outcome({ t, tz }: { t: LearningTask; tz: string }) {
  if (t.status === "analyzing")
    return (
      <Notice tone="info">
        <span className="inline-flex items-center gap-2">
          <Spinner className="size-4" />
          AI 正在分析这段会话，通常 1 分钟内出结果；这里会自动刷新。
        </span>
      </Notice>
    );
  if (t.status === "failed") return <Notice tone="error">分析失败：{t.error ?? "原因不明"}</Notice>;
  if (t.status === "published" && t.publishedCard)
    return (
      <Notice tone="info">
        {t.reviewedByName ? `${t.reviewedByName} 审核后` : "Agent 复测通过后直接"}
        {t.result === "new_card" ? "新建了" : "改了"}经验卡
        <Link href={cardHref(t.publishedCard.id)} className="focus-ring mx-1 rounded-sm text-(--semantic-color-text-link) underline-offset-2 hover:underline">
          「{t.publishedCard.title}」
        </Link>
        ，现在是第 {t.publishedCard.version} 版
        {t.reviewedAt ? ` · ${inTz(t.reviewedAt, tz, "MM-dd HH:mm")}` : ""}
        {!t.reviewedByName && "。改动标为「Agent 改过、还没人看过」，可在经验卡里查看改前改后或一键回退。"}
      </Notice>
    );
  if (t.status === "closed")
    return (
      <Notice tone={t.result === "retest_failed" ? "warn" : "info"}>
        {t.result ? LEARNING_RESULT_LABEL[t.result] : "已结束"}
        {t.result === "retest_failed" && t.targetCard ? `：Agent 想改「${t.targetCard.title}」，复测没通过，卡没有改动。${t.error ?? ""}` : ""}
        {t.result === "need_qa" ? "：缺的是事实，建议到「问答」页签补一条问答。" : ""}
        {t.reviewNote ? ` 原因：${t.reviewNote}` : ""}
        {t.reviewedByName ? ` · ${t.reviewedByName}` : ""}
      </Notice>
    );
  return null;
}

function useTaskMutation<B>(t: LearningTask, path: string, timeoutMs?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: B) => api.post<LearningTaskResult>(`/api/v1/knowledge/learning/${t.id}/${path}`, body, undefined, timeoutMs),
    onSuccess: (r) => {
      qc.setQueryData(learningItemKey(t.id), r);
      qc.invalidateQueries({ queryKey: learningKey });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409 && e.problem.code !== "retest_required") qc.invalidateQueries({ queryKey: learningItemKey(t.id) });
    },
  });
}

/** 审核：编辑拟发布内容 → 复测 → 发布；或无需更新、驳回。表单与写卡弹窗共用 CardFields 与 cardFormSchema */
function ReviewForm({ me, t }: { me: Me; t: LearningTask }) {
  const products = useProducts();
  const targetCardId = t.proposal && t.targetCard ? t.targetCard.id : null;
  const draftKey = learningDraftKey(me.user.id, me.active.merchantId, t.id, t.version);
  // 首帧前恢复本机草稿（INT-021）
  const [restored] = useState(() => readLearningDraft(draftKey));
  const [savedAt, setSavedAt] = useState<string | null>(restored?.savedAt ?? null);
  const [draftError, setDraftError] = useState(false);
  const form = useForm<CardFormValues>({
    resolver: zodResolver(cardFormSchema),
    mode: "onTouched",
    defaultValues: restored?.values ?? (t.proposal ? contentToForm(t.proposal) : { ...cardToForm(), title: t.testQuestion ? [...t.testQuestion].slice(0, 40).join("") : "" }),
  });
  const [closing, setClosing] = useState<"none_needed" | "rejected" | null>(null);
  const retest = useTaskMutation<{ version: number; card: CardContent; targetCardId: string | null }>(t, "retest", 90_000);
  const publish = useTaskMutation<{ version: number; card: CardContent; targetCardId: string | null }>(t, "publish");
  const busy = retest.isPending || publish.isPending;

  const saveDraft = () => {
    try {
      const at = new Date().toISOString();
      window.localStorage.setItem(draftKey, JSON.stringify({ values: form.getValues(), savedAt: at } satisfies LearningDraft));
      setSavedAt(at);
      setDraftError(false);
    } catch {
      setDraftError(true);
    }
  };
  const clearDraft = () => {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // 存储不可用时没有草稿可清
    }
  };
  // 输入停 3 秒存一次草稿；没改过不存
  const values = useWatch({ control: form.control }) as CardFormValues;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!form.formState.isDirty) return;
    const timer = setTimeout(saveDraft, 3_000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只跟随表单内容变化
  }, [values]);

  // 服务端存的 jsonb 会重排键的顺序，按键排序后再比（发布时服务端另按内容指纹核对）
  const parsed = zCardContent.safeParse(formToContent(values));
  const sameAsRetested = Boolean(t.retest?.passed && t.proposal && parsed.success && stableJson(parsed.data) === stableJson(t.proposal));
  const canPublish = sameAsRetested && !busy;

  /** 服务端的字段错误放回对应字段（路径去掉 card. 前缀，条件换成 conditions.N.value） */
  const onError = (e: unknown) => {
    const fields = e instanceof ApiError ? (e.problem.extra?.fields as Record<string, string> | undefined) : undefined;
    for (const [raw, message] of Object.entries(fields ?? {})) {
      const path = raw.replace(/^card\./, "").replace(/^conditions\.(\d+)$/, "conditions.$1.value");
      form.setError(path as keyof CardFormValues, { message });
    }
    toast.error(errorText(e));
  };
  const doRetest = form.handleSubmit((v) => {
    if (busy) return;
    retest.mutate(
      { version: t.version, card: toCardContent(v), targetCardId },
      {
        onSuccess: (r) => {
          clearDraft();
          if (r.task.retest?.passed) toast.success("复测通过，可以发布");
          else toast.error("复测没通过", { description: r.task.retest?.failReason ?? undefined });
        },
        onError,
      },
    );
  });
  const doPublish = form.handleSubmit((v) => {
    if (!canPublish) return;
    const card = toCardContent(v);
    publish.mutate(
      { version: t.version, card, targetCardId },
      {
        onSuccess: (r) => {
          clearDraft();
          toast.success(`已发布经验卡「${r.task.publishedCard?.title ?? card.title}」`, { description: "下一次出稿起 AI 就会按这张卡处理。" });
        },
        onError,
      },
    );
  });
  const productNames = products.data?.items.filter((p) => values.productIds.includes(p.id)) ?? [];

  return (
    <Section
      title="建议更新内容"
      hint={t.proposal ? (t.targetCard ? `改的是已有经验卡「${t.targetCard.title}」（第 ${t.targetCard.version} 版）` : "AI 写的新经验卡，改好后复测、发布") : "AI 判断有冲突，没有写拟发布内容；需要的话在这里写一张新卡，或直接结束"}
    >
      <form noValidate onSubmit={(e) => e.preventDefault()} className="flex min-w-0 flex-col gap-4">
        {restored && <Notice tone="info">已恢复你 {inTz(restored.savedAt, me.active.timezone)} 存在本机的草稿。</Notice>}
        <fieldset disabled={busy} className="min-w-0">
          <CardFields form={form} />
        </fieldset>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button type="button" variant="ghost" size="sm" onClick={saveDraft}>
            保存草稿
          </Button>
          {/* 常驻插槽：有无保存时间都占同一行，不挤动按钮（RESP-010） */}
          <span role="status" className={cn("min-w-28 whitespace-nowrap tabular-nums", draftError && "text-destructive")}>
            {draftError ? "草稿没存上，再点一次" : savedAt ? `草稿 ${inTz(savedAt, me.active.timezone).slice(-5)} 已存` : ""}
          </span>
        </div>
        {/* 发布前的检查清单：写出这次会发布的实际内容（INT-003 ⑤） */}
        <div className="rounded-md bg-muted px-3 py-2 text-sm">
          <p className="font-medium">发布后：{targetCardId ? `「${t.targetCard?.title}」写成第 ${(t.targetCard?.version ?? 0) + 1} 版` : "新建一张经验卡"}，AI 出稿时就会按它处理</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
            <li className="[overflow-wrap:anywhere]">
              产品：{productNames.length ? productNames.map((p) => p.name).join("、") : "通用"} · 阶段：{stageText(values.stage)} · 站点：{values.markets.length ? marketsText(values.markets) : "未选"}
            </li>
            <li>
              调用条件 {values.conditions.filter((c) => c.value.trim()).length} 条（{CONDITION_MODE_LABEL[values.conditionMode]}）· 步骤 {values.steps.length} 步 · 分支 {values.steps.reduce((n, st) => n + st.branches.length, 0)} 个
            </li>
            <li className={cn(sameAsRetested ? "text-(--semantic-color-feedback-success)" : "text-(--semantic-color-feedback-warning)")}>
              {sameAsRetested ? "复测：当前内容已复测通过" : t.retest && !t.retest.passed ? "复测：上次没通过，改好后再复测" : "复测：当前内容还没复测，复测通过才能发布"}
            </li>
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* aria-disabled：按下后不失焦，处理中仍可被读屏发现（A11Y-013） */}
          <Button type="button" variant="outline" aria-disabled={busy || undefined} onClick={() => void doRetest()}>
            {retest.isPending ? <Spinner /> : <FlaskConicalIcon />}
            {retest.isPending ? "复测中" : "复测"}
          </Button>
          <Button type="button" aria-disabled={!canPublish || undefined} aria-describedby="lt-publish-hint" onClick={() => void doPublish()}>
            {publish.isPending ? <Spinner /> : <SendIcon />}
            发布
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setClosing("none_needed")}>
            无需更新
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setClosing("rejected")}>
            <XIcon />
            驳回
          </Button>
        </div>
        <p id="lt-publish-hint" className="text-xs text-muted-foreground">
          {retest.isPending ? "正在用原问题和这张卡以前测过的问题各跑一遍出稿，约 10–40 秒。" : canPublish ? "复测已通过，发布后立即生效。" : "当前内容复测通过后才能发布。"}
        </p>
      </form>
      <CloseDialog t={t} result={closing} onClose={() => setClosing(null)} onDone={clearDraft} />
    </Section>
  );
}

function FailedActions({ t }: { t: LearningTask }) {
  const reanalyze = useTaskMutation<{ version: number }>(t, "reanalyze");
  const [closing, setClosing] = useState<"none_needed" | "rejected" | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        aria-disabled={reanalyze.isPending || undefined}
        onClick={() => !reanalyze.isPending && reanalyze.mutate({ version: t.version }, { onSuccess: () => toast.success("已重新排队分析"), onError: (e) => toast.error(errorText(e)) })}
      >
        {reanalyze.isPending ? <Spinner /> : <RotateCcwIcon />}
        重新分析
      </Button>
      <Button variant="ghost" onClick={() => setClosing("none_needed")}>
        无需更新
      </Button>
      <Button variant="ghost" onClick={() => setClosing("rejected")}>
        驳回
      </Button>
      <CloseDialog t={t} result={closing} onClose={() => setClosing(null)} />
    </div>
  );
}

function CloseDialog({ t, result, onClose, onDone }: { t: LearningTask; result: "none_needed" | "rejected" | null; onClose: () => void; onDone?: () => void }) {
  const [reason, setReason] = useState("");
  const close = useTaskMutation<{ version: number; result: "none_needed" | "rejected"; reason?: string }>(t, "close");
  const n = charCount(reason);
  const over = n > LEARNING_REASON_MAX;
  const submit = () => {
    if (!result || close.isPending || over) return;
    close.mutate(
      { version: t.version, result, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          onDone?.();
          toast.success(result === "rejected" ? "已驳回" : "已标为无需更新");
          onClose();
        },
        onError: (e) => toast.error(errorText(e)),
      },
    );
  };
  return (
    <Dialog open={result !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{result === "rejected" ? "驳回这个学习任务？" : "标为无需更新？"}</DialogTitle>
          <DialogDescription>任务连同分析与测试材料会保留，可以在「学习」页签按结论筛出来。</DialogDescription>
        </DialogHeader>
        <Field data-invalid={over || undefined}>
          <FieldLabel htmlFor="lt-close-reason">原因（选填）</FieldLabel>
          <Textarea id="lt-close-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={over || undefined} />
          <FieldDescription className={cn("tabular-nums", over && "text-destructive")}>
            {n} / {LEARNING_REASON_MAX}
          </FieldDescription>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button aria-disabled={close.isPending || over || undefined} onClick={submit}>
            {close.isPending && <Spinner />}
            {result === "rejected" ? "驳回" : "无需更新"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
