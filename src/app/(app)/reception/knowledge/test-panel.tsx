"use client";

import { useMutation } from "@tanstack/react-query";
import { ChevronRightIcon, CircleCheckIcon, MessageCircleQuestionIcon, SendIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Me } from "@/contracts/auth";
import { CARD_ACTION_LABEL } from "@/contracts/cards";
import { KNOWLEDGE_TEST_QUESTION_MAX, knowledgeTestBody, QA_STAGE_LABEL, type KnowledgeRoute, type KnowledgeTestBody, type KnowledgeTestResult } from "@/contracts/knowledge";
import { charCount } from "@/contracts/reception";
import { Notice } from "@/components/orders/order-ui";
import { Panel } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, errorText } from "@/lib/api";
import { PLATFORM_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AiTag, HANDOFF_LABEL } from "../../wb/wb-shared";
import { productLabel, useProducts } from "./qa-ui";

/** API-KB-012 前端超时 60 秒，不自动重试 */
const TIMEOUT_MS = 60_000;
const NO_SHOP = "none";
const ANY = "any";
const TEST_STAGES = ["presale", "insale", "aftersale"] as const;
const ROUTE_LABEL: Record<KnowledgeRoute["kind"], string> = { rewritten: "改写路", original: "原话路" };
const ROUTE_ERROR: Record<string, string> = { timeout: "超时", no_vector: "结果里没有向量分" };

const seconds = (ms: number) => (ms < 1000 ? `${Math.round(ms)} 毫秒` : `${(ms / 1000).toFixed(1)} 秒`);
const score = (n: number | null | undefined) => (typeof n === "number" ? n.toFixed(2) : "—");

/** 提问失败的说明（PAGE-RECEPTION-KB 页态：AI 不可用时保留问题可重试） */
function askError(e: unknown): { title: string; detail: string } {
  if (e instanceof ApiError) {
    if (e.type === "ai-unavailable") return { title: "AI 暂时不可用", detail: "问题已保留，稍后再点「提问」重试。" };
    if (e.type === "rate-limited") {
      const wait = Number(e.problem.extra?.retryAfter);
      return { title: "提问太频繁", detail: `测试问答每分钟最多 20 次${wait > 0 ? `，请 ${wait} 秒后再试` : "，请稍后再试"}。` };
    }
    if (e.type === "platform-timeout") return { title: "60 秒内没有等到回答", detail: "AI 或检索服务这次太慢，问题已保留，可以再试一次。" };
  }
  return { title: "提问没有成功", detail: errorText(e) };
}

/** 测试问答：用出稿同一条链路回答，不存草稿、不计出稿用量（REQ-KB-005） */
export function TestPanel({ me, onOpenDoc, onOpenQa }: { me: Me; onOpenDoc: (id: string) => void; onOpenQa: (id: string) => void }) {
  const [question, setQuestion] = useState("");
  const [shopId, setShopId] = useState(NO_SHOP);
  const [stage, setStage] = useState<string>(ANY);
  const [productId, setProductId] = useState<string>(ANY);
  const [error, setError] = useState<string>();
  const products = useProducts();
  const ask = useMutation({
    mutationFn: (body: KnowledgeTestBody) => api.post<KnowledgeTestResult>("/api/v1/knowledge/test", body, undefined, TIMEOUT_MS),
  });
  const count = charCount(question.trim());
  const check = (q: string) => {
    const r = knowledgeTestBody.shape.question.safeParse(q);
    return r.success ? undefined : r.error.issues[0]?.message;
  };
  const run = () => {
    if (ask.isPending) return;
    const msg = check(question);
    if (msg) return setError(msg);
    ask.mutate({
      question: question.trim(),
      shopId: shopId === NO_SHOP ? undefined : shopId,
      stage: stage === ANY ? undefined : (stage as KnowledgeTestBody["stage"]),
      productId: productId === ANY ? undefined : productId,
    });
  };
  const shops = me.active.shops;

  return (
    <Panel className="flex min-w-0 flex-col gap-4" aria-labelledby="kb-test-title">
      <div>
        <h2 id="kb-test-title" className="text-lg font-semibold">
          测试问答
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">用 AI 出稿同一条链路回答，看它命中了哪些问答、引用了哪些资料；不存草稿、不计出稿用量</p>
      </div>
      <form noValidate onSubmit={(e) => (e.preventDefault(), run())} className="flex flex-col gap-3">
        <Field data-invalid={Boolean(error) || undefined}>
          <FieldLabel htmlFor="kb-question">问题（任意语言）</FieldLabel>
          <Textarea
            id="kb-question"
            value={question}
            rows={3}
            className="max-h-48 resize-none"
            spellCheck={false}
            placeholder="如：Berapa lama waranti?"
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? "kb-question-error" : "kb-question-count"}
            onChange={(e) => {
              setQuestion(e.target.value);
              if (error) setError(check(e.target.value));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
            }}
          />
          <div className="flex items-start justify-between gap-3 text-xs">
            {error ? <FieldError id="kb-question-error">{error}</FieldError> : <span />}
            <span id="kb-question-count" className={cn("shrink-0 tabular-nums", count > KNOWLEDGE_TEST_QUESTION_MAX ? "text-destructive" : "text-muted-foreground")}>
              {count} / {KNOWLEDGE_TEST_QUESTION_MAX}
            </span>
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="kb-shop">店铺（可不选）</FieldLabel>
          <Select value={shopId} onValueChange={setShopId}>
            <SelectTrigger id="kb-shop" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SHOP}>不选店铺：不按站点过滤</SelectItem>
              {shops.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} · {PLATFORM_LABEL[s.platform]} {s.market}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">选了店铺时只查适用该店站点的问答与资料，用该店的提示词变量</p>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="kb-stage">服务阶段（可不选）</FieldLabel>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger id="kb-stage" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>不按阶段过滤</SelectItem>
                {TEST_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {QA_STAGE_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="kb-product">买家问的产品（可不选）</FieldLabel>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger id="kb-product" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>没识别出产品</SelectItem>
                {products.data?.items.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {productLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Button type="submit" variant="outline" className="self-start" aria-disabled={ask.isPending || undefined}>
          {ask.isPending ? <Spinner /> : <SendIcon />}
          {ask.isPending ? "正在回答" : "提问"}
        </Button>
      </form>

      <div aria-live="polite" className="flex flex-col gap-4 border-t border-border pt-4">
        {ask.isPending ? (
          <AnswerSkeleton />
        ) : ask.isError ? (
          <Notice tone="error">
            <p className="font-medium">{askError(ask.error).title}</p>
            <p>{askError(ask.error).detail}</p>
          </Notice>
        ) : ask.data ? (
          <Result r={ask.data} onOpenDoc={onOpenDoc} onOpenQa={onOpenQa} />
        ) : (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <MessageCircleQuestionIcon className="size-8 text-muted-foreground" aria-hidden />
            <p className="max-w-xs text-sm text-muted-foreground">问一个买家常问的问题，看看 AI 会怎么答、命中了哪条问答、引用了哪份资料。</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

function AnswerSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="正在检索资料并生成回答">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-3.5" />
        正在改写问题、检索资料并生成回答，通常 10–25 秒
      </p>
      <Skeleton className="h-4 w-full bg-muted motion-safe:animate-pulse" />
      <Skeleton className="h-4 w-11/12 bg-muted motion-safe:animate-pulse" />
      <Skeleton className="h-4 w-2/3 bg-muted motion-safe:animate-pulse" />
    </div>
  );
}

function Result({ r, onOpenDoc, onOpenQa }: { r: KnowledgeTestResult; onOpenDoc: (id: string) => void; onOpenQa: (id: string) => void }) {
  const degraded = r.retrieval?.degraded;
  return (
    <>
      {degraded && (
        <Notice tone="warn">
          <p className="font-medium">这次没查到资料，回答没有引用</p>
          {r.retrieval?.degradedReason && <p className="text-xs text-muted-foreground">原因：{r.retrieval.degradedReason}</p>}
        </Notice>
      )}
      {!r.retrieval && !r.qa && <Notice tone="info">没有对这个范围可用的问答或资料，这次没有检索，回答只依据订单事实与提示词。</Notice>}
      {r.qa?.error && (
        <Notice tone="warn">
          <p className="font-medium">问答检索这次没成功，只用了资料</p>
          <p className="text-xs text-muted-foreground">原因：{r.qa.error}</p>
        </Notice>
      )}

      <section aria-labelledby="kb-answer-title" className="flex flex-col gap-2">
        <h3 id="kb-answer-title" className="flex items-center gap-2 text-sm font-semibold">
          <AiTag />
          回答
          {r.insufficient && (
            <span className="inline-flex h-5 items-center gap-1 rounded-sm border border-(--semantic-color-feedback-warning) px-1.5 text-xs font-medium text-(--semantic-color-feedback-warning)">
              <TriangleAlertIcon className="size-3 shrink-0" aria-hidden />
              资料不足
            </span>
          )}
        </h3>
        <p className="rounded-lg bg-(--semantic-color-surface-warm) px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{r.answer || "（没有生成回答）"}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="whitespace-nowrap">
            置信度 <span className="text-foreground tabular-nums">{r.confidence.toFixed(2)}</span>
          </span>
          {r.wouldHandoff ? (
            <span className="inline-flex items-center gap-1 text-(--semantic-color-feedback-warning)">
              <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />
              按当前阈值会转人工{r.handoffReason ? `（${HANDOFF_LABEL[r.handoffReason] ?? r.handoffReason}）` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-(--semantic-color-feedback-success)">
              <CircleCheckIcon className="size-3.5 shrink-0" aria-hidden />
              按当前阈值会出草稿
            </span>
          )}
          <span className="whitespace-nowrap tabular-nums">耗时 {seconds(r.latencyMs)}</span>
        </p>
        {r.insufficient && <p className="text-xs text-muted-foreground">AI 判定资料不足以回答：真实出稿时这类问题一律转人工。</p>}
      </section>

      <CardUsed card={r.card} />

      <section aria-labelledby="kb-qa-sources-title" className="flex flex-col gap-2">
        <h3 id="kb-qa-sources-title" className="text-sm font-semibold">
          引用的问答 <span className="font-normal text-muted-foreground tabular-nums">{r.qaSources.length}</span>
        </h3>
        {r.qaSources.length === 0 ? (
          <p className="text-sm text-muted-foreground">回答没有引用问答。</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {r.qaSources.map((s) => (
              <li key={s.n}>
                <button type="button" className="state-layer focus-ring flex w-full items-start gap-2 rounded-md px-2 py-2 text-left" onClick={() => onOpenQa(s.qaId)}>
                  <span className="mt-0.5 shrink-0 text-xs text-muted-foreground tabular-nums">[{s.n}]</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-(--semantic-color-text-link) [overflow-wrap:anywhere]">问答「{s.question}」</span>
                    <span className="line-clamp-3 text-xs text-muted-foreground [overflow-wrap:anywhere]">{s.answer}</span>
                  </span>
                  <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="kb-sources-title" className="flex flex-col gap-2">
        <h3 id="kb-sources-title" className="text-sm font-semibold">
          引用的资料 <span className="font-normal text-muted-foreground tabular-nums">{r.sources.length}</span>
        </h3>
        {r.sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">回答没有引用资料。</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {r.sources.map((s) => (
              <li key={s.n}>
                <button type="button" className="state-layer focus-ring flex w-full items-start gap-2 rounded-md px-2 py-2 text-left" onClick={() => onOpenDoc(s.documentId)}>
                  <span className="mt-0.5 shrink-0 text-xs text-muted-foreground tabular-nums">[{s.n}]</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-(--semantic-color-text-link) [overflow-wrap:anywhere]">《{s.name}》</span>
                    <span className="line-clamp-3 text-xs text-muted-foreground [overflow-wrap:anywhere]">{s.snippet}</span>
                  </span>
                  <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {r.qa && <QaHitsDetails qa={r.qa} />}
      {r.retrieval && <RetrievalDetails retrieval={r.retrieval} />}
    </>
  );
}

/** 回答用到的经验卡：第几步、按分支转人工或建工单、用卡理由；已保存的卡点名字切到「经验卡」页签打开这张卡 */
function CardUsed({ card }: { card: KnowledgeTestResult["card"] }) {
  const saved = !!card && /^[0-9a-f-]{36}$/i.test(card.cardId);
  return (
    <section aria-labelledby="kb-card-title" className="flex flex-col gap-2">
      <h3 id="kb-card-title" className="text-sm font-semibold">
        用到的经验卡
      </h3>
      {!card ? (
        <p className="text-sm text-muted-foreground">回答没有用经验卡。</p>
      ) : (
        <div className="flex flex-col gap-1 px-2 text-sm [overflow-wrap:anywhere]">
          <p>
            {saved ? (
              <Link href={`/reception/knowledge?tab=cards&card=${card.cardId}`} className="focus-ring rounded-sm font-medium text-(--semantic-color-text-link)">
                「{card.title}」
              </Link>
            ) : (
              <span className="font-medium">「{card.title}」（未保存）</span>
            )}
            <span className="text-muted-foreground">
              {" · "}第 <span className="tabular-nums">{card.step}</span> 步{card.action !== "continue" && ` · 按卡${CARD_ACTION_LABEL[card.action]}`}
            </span>
          </p>
          {card.reason && <p className="text-xs text-muted-foreground">用卡理由：{card.reason}</p>}
          {card.action === "ticket" && card.ticketSummary && <p className="text-xs text-muted-foreground">要跟进：{card.ticketSummary}</p>}
        </div>
      )}
    </section>
  );
}

function RetrievalDetails({ retrieval }: { retrieval: NonNullable<KnowledgeTestResult["retrieval"]> }) {
  const names = new Map(retrieval.routes.flatMap((rt) => rt.chunks.map((c) => [`${c.documentId}:${c.chunkNo}`, c.name] as const)));
  return (
    <details className="group rounded-md border border-border">
      <summary className="state-layer focus-ring flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-4 shrink-0 transition-transform duration-(--semantic-motion-duration-fast) group-open:rotate-90" aria-hidden />
        检索明细
      </summary>
      <div className="flex flex-col gap-4 border-t border-border px-3 py-3">
        <div>
          <p className="text-xs text-muted-foreground">改写后的问题</p>
          <p className="text-sm [overflow-wrap:anywhere]">{retrieval.rewrittenQuery ?? "改写失败，只用原话检索一路"}</p>
        </div>
        {retrieval.routes.map((rt, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <p className="flex flex-wrap items-center gap-x-2 text-xs">
              <span className="font-semibold">{ROUTE_LABEL[rt.kind]}</span>
              <span className="text-muted-foreground">{rt.mode === "vector_only" ? "纯向量重试" : "混合检索"}</span>
              <span className="text-muted-foreground tabular-nums">{seconds(rt.latencyMs)}</span>
              {rt.error && <span className="text-destructive">失败：{ROUTE_ERROR[rt.error] ?? rt.error}</span>}
              {!rt.error && <span className="text-muted-foreground tabular-nums">{rt.chunks.length} 段</span>}
            </p>
            {rt.chunks.length > 0 && (
              <ol className="flex flex-col">
                {rt.chunks.map((c) => (
                  <li key={`${c.documentId}:${c.chunkNo}`} className="border-b border-border py-1.5 last:border-0">
                    <p className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
                        {c.name} <span className="font-normal text-muted-foreground">#{c.chunkNo}</span>
                      </span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {score(c.score)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      向量 {score(c.scoreDetails.vectorScore)} · 关键词 {score(c.scoreDetails.keywordScore)} · 重排 {score(c.scoreDetails.rerankingScore)}
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{c.text}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold">合并后给 AI 的 {retrieval.merged.length} 段</p>
          {retrieval.merged.length === 0 ? (
            <p className="text-xs text-muted-foreground">两路都没有结果。</p>
          ) : (
            <ol className="flex flex-col gap-0.5 text-xs">
              {retrieval.merged.map((m) => (
                <li key={m.n} className="flex gap-2">
                  <span className="text-muted-foreground tabular-nums">[{m.n}]</span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {names.get(`${m.documentId}:${m.chunkNo}`) ?? "资料"} <span className="text-muted-foreground">#{m.chunkNo}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </details>
  );
}

const QA_ROUTE_LABEL = { rewritten: "改写路", original: "原话路" } as const;

/** 问答命中明细：每路命中的问法与距离（越小越近），合并后给 AI 的编号 */
function QaHitsDetails({ qa }: { qa: NonNullable<KnowledgeTestResult["qa"]> }) {
  const byId = new Map(qa.hits.map((h) => [h.qaId, h.question] as const));
  return (
    <details className="group rounded-md border border-border">
      <summary className="state-layer focus-ring flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-4 shrink-0 transition-transform duration-(--semantic-motion-duration-fast) group-open:rotate-90" aria-hidden />
        问答命中明细
        <span className="font-normal text-muted-foreground tabular-nums">
          {qa.merged.length} 条 · {seconds(qa.latencyMs)}
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
        <p className="text-xs text-muted-foreground">
          过滤：{qa.stage ? `阶段 ${QA_STAGE_LABEL[qa.stage]}（含全部阶段）` : "不按阶段"} · {qa.productIds.length ? `识别出 ${qa.productIds.length} 个产品（含通用问答）` : "没识别出产品"}
        </p>
        {qa.hits.length === 0 ? (
          <p className="text-xs text-muted-foreground">两路都没有足够相近的问答。</p>
        ) : (
          <ol className="flex flex-col">
            {qa.hits.map((h, i) => (
              <li key={`${h.route}:${h.qaId}:${i}`} className="flex items-baseline justify-between gap-2 border-b border-border py-1.5 text-xs last:border-0">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="text-muted-foreground">{QA_ROUTE_LABEL[h.route]}</span> {h.question}
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">距离 {h.distance.toFixed(2)}</span>
              </li>
            ))}
          </ol>
        )}
        {qa.merged.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold">合并后给 AI 的 {qa.merged.length} 条（排在资料前面）</p>
            <ol className="flex flex-col gap-0.5 text-xs">
              {qa.merged.map((m) => (
                <li key={m.n} className="flex gap-2">
                  <span className="text-muted-foreground tabular-nums">[{m.n}]</span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">{byId.get(m.qaId) ?? "问答"}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </details>
  );
}
