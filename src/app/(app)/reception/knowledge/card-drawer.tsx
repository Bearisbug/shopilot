"use client";

// 卡抽屉（API-KB-031、API-KB-033 至 API-KB-037）：?card=<id> 打开；当前内容、近 30 天效果、版本与逐字段对比、回退、标为已看、下架恢复、删除
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveIcon, ArchiveRestoreIcon, BotIcon, EyeIcon, PencilIcon, RotateCcwIcon, SearchXIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import { CARD_STATUS_LABEL, type CardDetail, type CardResult, type CardVersionView, type ExperienceCard } from "@/contracts/cards";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, api, errorText } from "@/lib/api";
import { diffCards } from "@/lib/card-form";
import { inTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { adoptionRate, branchText, cardItemKey, cardsKey, editRate, handoffRate, modeText, shadowSameRate, usePublishedQa, useCardParams } from "./cards-ui";
import { marketsText, useUrlParams } from "./knowledge-ui";
import { productsText, stageText, useProducts } from "./qa-ui";

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export function CardDrawer({ me }: { me: Me }) {
  const p = useCardParams();
  return (
    <Sheet open={p.drawerOpen} onOpenChange={(o) => !o && p.closeDrawer()}>
      <SheetContent
        className="w-full gap-0 overscroll-contain data-[side=right]:sm:max-w-2xl"
        aria-describedby={undefined}
        // 打开它的那一行已不在（删除后、或从草稿依据直接打开）时焦点落到经验卡列表的标题上
        onCloseAutoFocus={() =>
          requestAnimationFrame(() => {
            if (document.activeElement === document.body) document.getElementById("kb-cards-title")?.focus();
          })
        }
      >
        {p.drawerOpen && p.cardId && <DrawerBody key={p.cardId} me={me} cardId={p.cardId} onClose={p.closeDrawer} onEdit={() => p.openEdit(p.cardId!)} />}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ me, cardId, onClose, onEdit }: { me: Me; cardId: string; onClose: () => void; onEdit: () => void }) {
  const valid = isUuid(cardId);
  const q = useQuery({ queryKey: cardItemKey(cardId), queryFn: () => api.get<CardDetail>(`/api/v1/knowledge/cards/${cardId}`), enabled: valid });
  const notFound = !valid || (q.error instanceof ApiError && q.error.status === 404);
  if (notFound || q.isError)
    return (
      <>
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle className="text-lg">经验卡</SheetTitle>
        </SheetHeader>
        {notFound ? (
          <EmptyState
            icon={SearchXIcon}
            title="找不到这张经验卡"
            description="它可能已被删除；草稿里的旧链接也会落到这里。"
            action={
              <Button variant="outline" onClick={onClose}>
                回到经验卡列表
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
          <SheetTitle className="text-lg">经验卡</SheetTitle>
          <Skeleton className="h-4 w-48 bg-muted" />
        </SheetHeader>
        <div className="px-4 pt-4">
          <LoadingRows rows={6} />
        </div>
      </>
    );
  return <DrawerContent me={me} detail={q.data} onClose={onClose} onEdit={onEdit} />;
}

function useCardAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ card, action, body }: { card: ExperienceCard; action: "archive" | "restore" | "seen" | "rollback"; body?: Record<string, unknown> }) =>
      api.post<CardResult>(`/api/v1/knowledge/cards/${card.id}/${action}`, { version: card.version, ...body }),
    onSuccess: (r, { action, body }) => {
      const text = { archive: "已下架，AI 出稿不再用这张卡", restore: "已恢复发布", seen: "已标为看过", rollback: `已回退到第 ${body?.toVersion} 版，保存为第 ${r.card.version} 版` }[action];
      toast.success(text);
      qc.invalidateQueries({ queryKey: cardsKey });
      qc.invalidateQueries({ queryKey: cardItemKey(r.card.id) });
    },
    onError: (e, { card }) => {
      if (e instanceof ApiError && e.status === 409) {
        toast.error("这张经验卡刚被别人改过，已刷新，请核对后再试。");
        qc.invalidateQueries({ queryKey: cardsKey });
        return qc.invalidateQueries({ queryKey: cardItemKey(card.id) });
      }
      toast.error(errorText(e));
    },
  });
}

function DrawerContent({ me, detail, onClose, onEdit }: { me: Me; detail: CardDetail; onClose: () => void; onEdit: () => void }) {
  const c = detail.card;
  const tz = me.active.timezone;
  const qc = useQueryClient();
  const { update } = useUrlParams();
  const act = useCardAction();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/v1/knowledge/cards/${c.id}`),
    onSuccess: () => {
      toast.success(`已删除经验卡「${c.title}」`);
      setConfirmDelete(false);
      qc.invalidateQueries({ queryKey: cardsKey });
      onClose();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const busy = act.isPending;
  const s = c.stats;
  return (
    <>
      <SheetHeader className="gap-2 border-b border-border pr-12">
        <SheetTitle className="text-lg [overflow-wrap:anywhere]">{c.title}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className={cn("font-medium", c.status === "published" ? "text-(--semantic-color-feedback-success)" : "text-muted-foreground")}>{CARD_STATUS_LABEL[c.status]}</span>
          <span>· 第 {c.version} 版</span>
          <span>
            · 最近改动 {c.lastAuthor === "agent" ? "Agent" : (c.updatedByName ?? c.createdByName ?? "—")} {inTz(c.updatedAt ?? c.createdAt, tz)}
          </span>
          {c.agentUnseen && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-1.5 text-(--semantic-color-text-link)">
              <BotIcon className="size-3" aria-hidden />
              Agent 改过，还没人看过
            </span>
          )}
        </SheetDescription>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={onEdit}>
            <PencilIcon />
            编辑
          </Button>
          {c.agentUnseen && (
            <Button size="sm" variant="outline" aria-disabled={busy || undefined} onClick={() => !busy && act.mutate({ card: c, action: "seen" })}>
              {busy && act.variables?.action === "seen" ? <Spinner /> : <EyeIcon />}
              标为已看
            </Button>
          )}
          {c.status === "published" ? (
            <Button size="sm" variant="outline" aria-disabled={busy || undefined} onClick={() => !busy && act.mutate({ card: c, action: "archive" })}>
              {busy && act.variables?.action === "archive" ? <Spinner /> : <ArchiveIcon />}
              下架
            </Button>
          ) : (
            <Button size="sm" variant="outline" aria-disabled={busy || undefined} onClick={() => !busy && act.mutate({ card: c, action: "restore" })}>
              {busy && act.variables?.action === "restore" ? <Spinner /> : <ArchiveRestoreIcon />}
              恢复发布
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2Icon />
            删除
          </Button>
        </div>
      </SheetHeader>
      <div className="scroll-y flex min-h-0 flex-1 flex-col gap-6 overscroll-contain px-4 py-4">
        <Section title={`调用条件（${modeText(c.conditionMode)}）`}>
          <ul className="flex flex-col gap-1 text-sm">
            {c.conditions.map((x, i) => (
              <li key={i} className="[overflow-wrap:anywhere]">
                · {x}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="处理步骤">
          <ol className="flex flex-col gap-2 text-sm">
            {c.steps.map((st, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-5 shrink-0 font-semibold text-muted-foreground tabular-nums">{i + 1}.</span>
                <div className="min-w-0">
                  <p className="[overflow-wrap:anywhere]">{st.text}</p>
                  {st.branches.map((b, j) => (
                    <p key={j} className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      ↳ {branchText(b)}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </Section>
        {c.tips && (
          <Section title="沟通提示">
            <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{c.tips}</p>
          </Section>
        )}
        <Section title="适用范围">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">产品</dt>
            <dd className="[overflow-wrap:anywhere]">{productsText(c.products)}</dd>
            <dt className="text-muted-foreground">阶段</dt>
            <dd>{stageText(c.stage)}</dd>
            <dt className="text-muted-foreground">站点</dt>
            <dd>{marketsText(c.markets)}</dd>
            <dt className="text-muted-foreground">标签</dt>
            <dd className="[overflow-wrap:anywhere]">{c.tags.length ? c.tags.join("，") : "—"}</dd>
            <dt className="text-muted-foreground">关联问答</dt>
            <dd className="flex flex-col items-start gap-0.5">
              {c.qa.length === 0
                ? "—"
                : c.qa.map((q) => (
                    <button key={q.id} type="button" className="focus-ring rounded-sm text-left text-(--semantic-color-text-link) [overflow-wrap:anywhere] hover:underline" onClick={() => update({ dialog: "qa", qa: q.id, card: null }, "push")}>
                      {q.question}
                      {q.status !== "published" && <span className="ml-1 text-xs text-muted-foreground">（{q.status === "archived" ? "已下架" : "未发布"}）</span>}
                    </button>
                  ))}
            </dd>
          </dl>
        </Section>
        <Section title="近 30 天效果">
          {s.calls === 0 ? (
            <p className="text-sm text-muted-foreground">近 30 天 AI 出稿还没有用到这张卡。</p>
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Metric label="调用" value={`${s.calls} 次`} />
              <Metric label="采纳率" value={adoptionRate(s)} hint={`原样 ${s.sent} · 改后 ${s.edited} · 弃用 ${s.ignored}`} />
              <Metric label="改写率" value={editRate(s)} />
              <Metric label="转人工率" value={handoffRate(s)} hint={`转人工或建工单 ${s.handoffs} 次`} />
              {s.shadowSame + s.shadowPartial + s.shadowDifferent > 0 && <Metric label="影子一致" value={shadowSameRate(s)} hint={`一致 ${s.shadowSame} · 部分 ${s.shadowPartial} · 不同 ${s.shadowDifferent}`} />}
            </dl>
          )}
        </Section>
        {/* key：版本变了（编辑、回退、Agent 改卡）时对比重新默认为「上一版 → 当前版」 */}
        <Versions key={c.version} me={me} card={c} versions={detail.versions} />
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`删除经验卡「${c.title}」？`}
        desc="删除后不能恢复，版本记录一起删掉；已出的草稿里仍显示当时用的卡名。只想暂时停用请用「下架」。"
        confirmText="删除"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

/** 版本列表与逐字段对比：默认比较当前版与上一版；可选任意两版；非当前版可回退（写一个新版本） */
function Versions({ me, card, versions }: { me: Me; card: ExperienceCard; versions: CardVersionView[] }) {
  const tz = me.active.timezone;
  const products = useProducts();
  const qa = usePublishedQa();
  const act = useCardAction();
  const nums = versions.map((v) => v.version);
  const [to, setTo] = useState(nums[0]);
  const [from, setFrom] = useState(nums[1] ?? nums[0]);
  const [rollbackTo, setRollbackTo] = useState<CardVersionView | null>(null);
  const a = versions.find((v) => v.version === from);
  const b = versions.find((v) => v.version === to);
  const productName = (id: string) => products.data?.items.find((p) => p.id === id)?.name ?? "（已删除的产品）";
  const qaName = (id: string) => qa.data?.items.find((q) => q.id === id)?.questions[0] ?? "（已下架或已删除的问答）";
  const diffs = a && b && a.version !== b.version ? diffCards(a.snapshot, b.snapshot, { product: productName, qa: qaName, stage: stageText, markets: marketsText }).filter((d) => d.before !== d.after) : [];
  const versionLabel = (v: CardVersionView) => `第 ${v.version} 版 · ${v.author === "agent" ? "Agent" : (v.memberName ?? "—")}`;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="card-versions-title">
      <h3 id="card-versions-title" className="text-sm font-semibold">
        版本（{versions.length}）
      </h3>
      <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
        {versions.map((v) => (
          <li key={v.version} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium tabular-nums">第 {v.version} 版</span>
                <span className="text-muted-foreground">{v.author === "agent" ? "Agent" : (v.memberName ?? "—")}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{inTz(v.createdAt, tz)}</span>
                {v.version === card.version && <span className="text-xs text-(--semantic-color-text-link)">当前</span>}
              </p>
              {v.note && <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{v.note}</p>}
              {v.retest && (
                <p className={cn("mt-0.5 text-xs", v.retest.passed ? "text-muted-foreground" : "text-destructive")}>
                  复测{v.retest.passed ? "通过" : "没通过"} · 回归用例 {v.retest.regressions} 个{v.retest.failReason ? ` · ${v.retest.failReason}` : ""}
                </p>
              )}
              {v.author === "agent" && v.seenByName && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {v.seenByName} {v.seenAt ? inTz(v.seenAt, tz) : ""} 看过
                </p>
              )}
            </div>
            {v.version !== card.version && (
              <Button type="button" variant="outline" size="sm" onClick={() => setRollbackTo(v)}>
                <RotateCcwIcon />
                回退到这一版
              </Button>
            )}
          </li>
        ))}
      </ol>
      {versions.length > 1 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">对比</span>
            <Select value={String(from)} onValueChange={(v) => setFrom(Number(v))}>
              <SelectTrigger size="sm" aria-label="对比的旧版本">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.version} value={String(v.version)}>
                    {versionLabel(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">→</span>
            <Select value={String(to)} onValueChange={(v) => setTo(Number(v))}>
              <SelectTrigger size="sm" aria-label="对比的新版本">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.version} value={String(v.version)}>
                    {versionLabel(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {from === to ? (
            <p className="text-sm text-muted-foreground">选两个不同的版本看改了什么。</p>
          ) : diffs.length === 0 ? (
            <p className="text-sm text-muted-foreground">这两版内容一样。</p>
          ) : (
            <dl className="flex flex-col gap-3">
              {diffs.map((d) => (
                <div key={d.key} className="flex flex-col gap-1">
                  <dt className="text-xs font-medium text-muted-foreground">{d.label}</dt>
                  <dd className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="flex flex-col gap-0.5 rounded-md bg-muted px-2 py-1.5">
                      <span className="text-xs text-muted-foreground">第 {from} 版</span>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{d.before}</p>
                    </div>
                    <div className="flex flex-col gap-0.5 rounded-md border border-border px-2 py-1.5">
                      <span className="text-xs text-muted-foreground">第 {to} 版</span>
                      <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{d.after}</p>
                    </div>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(rollbackTo)}
        onOpenChange={(o) => !o && setRollbackTo(null)}
        title={`回退到第 ${rollbackTo?.version ?? ""} 版？`}
        desc={`用第 ${rollbackTo?.version ?? ""} 版的内容保存为新的第 ${card.version + 1} 版并立即生效；现在的第 ${card.version} 版仍留在版本记录里。`}
        confirmText="回退"
        pending={act.isPending}
        onConfirm={() => rollbackTo && act.mutate({ card, action: "rollback", body: { toVersion: rollbackTo.version } }, { onSettled: () => setRollbackTo(null) })}
      />
    </section>
  );
}
