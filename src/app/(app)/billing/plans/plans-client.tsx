"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, CheckIcon, PhoneIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import type { Me } from "@/contracts/auth";
import { salesLeadBody, type BillingResponse, type Cycle, type PlanItem, type PlansResponse, type SubscriptionView } from "@/contracts/billing";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useDialogParam } from "@/components/shell/global-dialogs";
import { ErrorState, LoadingRows, PageHeader, PageScroll, Panel } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError, api, errorText, newKey } from "@/lib/api";
import { inTz, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CYCLE_LABEL, num, useBilling, useOpenDialog } from "../billing-lib";

const RANK = ["basic", "growth", "pro", "enterprise"] as const;
const rank = (code: string) => RANK.indexOf(code as (typeof RANK)[number]);
const isContract = (p: PlanItem) => Number(p.monthlyPrice) === 0;
const DAY = 86_400_000;

/** dropsCycle：这次升级或降级会清掉已安排的付费周期变更（接口按本次周期重写 pendingCycle） */
type Change = { plan: PlanItem; cycle: Cycle; kind: "upgrade" | "downgrade" | "cycle" | "cancel"; dropsCycle?: { when: string; cycle: Cycle } };

function priceOf(p: PlanItem, cycle: Cycle) {
  return cycle === "yearly" ? p.yearlyPrice : p.monthlyPrice;
}

/** 非所有者：按钮保持可聚焦但标为不可用，悬停说明原因；点击仍给出同样的说明 */
function OwnerOnly({ reason, children }: { reason: string | null; children: React.ReactElement }) {
  if (!reason) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

export function PlansClient({ me }: { me: Me }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openDialog = useOpenDialog();
  const qc = useQueryClient();
  const tz = me.active.timezone;
  const plans = useQuery({ queryKey: ["billing-plans"], queryFn: () => api.get<PlansResponse>("/api/v1/billing/plans") });
  const billing = useBilling();
  const [change, setChange] = useState<Change | null>(null);
  const [now] = useState(() => Date.now());

  const d = plans.data;
  const cur = d?.current;
  const cycle = (params.get("cycle") as Cycle | null) ?? cur?.cycle ?? "monthly";
  const setCycle = (v: string) => {
    if (!v) return;
    const next = new URLSearchParams(params.toString());
    next.set("cycle", v);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const submit = useMutation({
    mutationFn: (c: Change) => api.post<SubscriptionView>("/api/v1/billing/plan", { planCode: c.plan.code, cycle: c.cycle }, newKey()),
    onSuccess: (s, c) => {
      const when = inTz(s.periodEnd, tz, "MM-dd");
      const dropped = c.dropsCycle && !s.pendingCycle ? `；之前安排的 ${c.dropsCycle.when} 起改为${CYCLE_LABEL[c.dropsCycle.cycle]}已取消` : "";
      if (c.kind === "upgrade") toast.success(`已升级到${c.plan.name}，新额度立即生效${s.pendingCycle ? `；${when} 起改为${CYCLE_LABEL[s.pendingCycle]}` : ""}${dropped}`);
      else if (c.kind === "cancel") toast.success("已撤销待生效的变更，下个周期保持现状");
      else toast.success(`已安排在下个计费周期生效：${when} 起改为${[s.pendingPlanName, s.pendingCycle && CYCLE_LABEL[s.pendingCycle]].filter(Boolean).join(" · ")}${dropped}`);
      setChange(null);
      qc.invalidateQueries({ queryKey: ["billing-plans"] });
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["nav-summary"] });
    },
    onError: (e) => {
      setChange(null);
      if (e instanceof ApiError && e.type === "payment-failed") {
        toast.error(errorText(e), { action: { label: "换卡", onClick: () => router.push("/billing?dialog=payment") } });
        return;
      }
      toast.error(errorText(e));
      qc.invalidateQueries({ queryKey: ["billing-plans"] });
    },
  });

  const lockedReason = me.active.isOwner ? null : `只有账号所有者 ${d?.owner.name ?? ""} 能改套餐`;
  function ask(c: Change) {
    if (lockedReason) {
      toast.error(lockedReason);
      return;
    }
    const dropsCycle = (c.kind === "upgrade" || c.kind === "downgrade") && cur?.pendingCycle && c.cycle === cur.cycle ? { when: inTz(cur.periodEnd, tz, "MM-dd"), cycle: cur.pendingCycle } : undefined;
    setChange({ ...c, dropsCycle });
  }

  const b = billing.data;
  return (
    <PageScroll>
      <div className="flex items-start gap-2">
        <Button asChild variant="ghost" size="icon-sm" className="mt-3">
          <Link href="/billing" aria-label="返回用量与套餐">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <PageHeader
          className="flex-1"
          title="全部套餐"
          facts={cur ? `当前${cur.planName} · ${CYCLE_LABEL[cur.cycle]} · 已接入 ${d.shopsUsed} 家店${b ? ` · 本期出稿 ${num(b.usage.used)} 次` : ""}` : " "}
        >
          <ToggleGroup type="single" variant="outline" value={cycle} onValueChange={setCycle} aria-label="付费周期">
            <ToggleGroupItem value="monthly" className="px-3 data-[state=on]:bg-accent data-[state=on]:text-(--semantic-color-text-link)">
              月付
            </ToggleGroupItem>
            <ToggleGroupItem value="yearly" className="px-3 data-[state=on]:bg-accent data-[state=on]:text-(--semantic-color-text-link)">
              年付 · 省 2 个月
            </ToggleGroupItem>
          </ToggleGroup>
        </PageHeader>
      </div>
      {plans.isError ? (
        <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
      ) : !d || !cur ? (
        <LoadingRows rows={4} />
      ) : (
        <>
          {(cur.pendingPlanCode || cur.pendingCycle) && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-(--semantic-radius-lg) bg-(--semantic-color-surface-warm) px-4 py-3 text-sm">
              <span>
                已安排 {inTz(cur.periodEnd, tz, "MM-dd")} 起改为{[cur.pendingPlanName, cur.pendingCycle && CYCLE_LABEL[cur.pendingCycle]].filter(Boolean).join(" · ")}，本期不变。
              </span>
              <OwnerOnly reason={lockedReason}>
                <Button variant="outline" size="sm" aria-disabled={lockedReason ? true : undefined} onClick={() => ask({ plan: d.items.find((i) => i.code === cur.planCode)!, cycle: cur.cycle, kind: "cancel" })}>
                  撤销
                </Button>
              </OwnerOnly>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {d.items.map((p) => (
              <PlanCard key={p.code} p={p} cur={cur} cycle={cycle} tz={tz} lockedReason={lockedReason} onChange={ask} onContact={() => openDialog("contact-sales")} />
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            升级立即生效，按本期剩余时间补差价；降级和改付费周期从下个计费周期（{inTz(cur.periodEnd, tz, "yyyy-MM-dd")}）开始生效。加购的出稿包当期有效。改套餐只有账号所有者（{d.owner.name}）能操作。
          </p>
        </>
      )}
      {change && cur && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && !submit.isPending && setChange(null)}
          title={change.kind === "upgrade" ? `升级到${change.plan.name}` : change.kind === "cancel" ? "撤销待生效的变更" : "确认下个周期的变更"}
          desc={<ChangeSummary change={change} cur={cur} b={b} tz={tz} now={now} />}
          confirmText={change.kind === "upgrade" ? "确认升级并付款" : "确认"}
          pending={submit.isPending}
          onConfirm={() => submit.mutate(change)}
        />
      )}
      <ContactSalesDialog me={me} />
    </PageScroll>
  );
}

function PlanCard({
  p,
  cur,
  cycle,
  tz,
  lockedReason,
  onChange,
  onContact,
}: {
  p: PlanItem;
  cur: SubscriptionView;
  cycle: Cycle;
  tz: string;
  lockedReason: string | null;
  onChange: (c: Change) => void;
  onContact: () => void;
}) {
  const isCurrent = p.code === cur.planCode;
  const r = rank(p.code);
  const cr = rank(cur.planCode);
  const when = inTz(cur.periodEnd, tz, "MM-dd");
  const price = priceOf(p, cycle);
  const features = [
    `店铺最多 ${num(p.shopLimit)} 家`,
    `AI 出稿 ${num(p.draftQuota)} 次 / 月${isContract(p) ? "" : `，超量 ${money(p.overagePrice, "USD")} / 次`}`,
    `成员最多 ${num(p.seatLimit)} 人`,
    "工作台、接待设置、工单、开票、看板",
  ];

  const locked = lockedReason ? true : undefined;
  let action: React.ReactNode;
  if (isContract(p) && !isCurrent) {
    action = (
      <Button variant="outline" className="w-full" onClick={onContact}>
        <PhoneIcon />
        联系销售
      </Button>
    );
  } else if (isCurrent) {
    if (cycle === cur.cycle) action = <Button variant="outline" className="w-full" disabled>当前套餐</Button>;
    else if (cur.pendingCycle === cycle) action = <Button variant="outline" className="w-full" disabled>{when} 起改为{CYCLE_LABEL[cycle]}</Button>;
    else
      action = (
        <OwnerOnly reason={lockedReason}>
          <Button variant="outline" className="w-full" aria-disabled={locked} onClick={() => onChange({ plan: p, cycle, kind: "cycle" })}>
            改为{CYCLE_LABEL[cycle]}
          </Button>
        </OwnerOnly>
      );
  } else if (r > cr) {
    action = (
      <OwnerOnly reason={lockedReason}>
        <Button variant="outline" className="w-full" aria-disabled={locked} onClick={() => onChange({ plan: p, cycle, kind: "upgrade" })}>
          升级到{p.name}
        </Button>
      </OwnerOnly>
    );
  } else if (cur.pendingPlanCode === p.code) {
    action = <Button variant="outline" className="w-full" disabled>{when} 起降级</Button>;
  } else {
    action = p.blockedReason ? (
      <Button variant="outline" className="w-full" disabled aria-describedby={`blocked-${p.code}`}>
        降级到{p.name}
      </Button>
    ) : (
      <OwnerOnly reason={lockedReason}>
        <Button variant="outline" className="w-full" aria-disabled={locked} onClick={() => onChange({ plan: p, cycle, kind: "downgrade" })}>
          降级到{p.name}
        </Button>
      </OwnerOnly>
    );
  }

  return (
    <Panel className={cn("flex flex-col border-2 border-transparent", isCurrent && "border-(--semantic-color-text-link)")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{p.name}</h2>
          <p className="text-xs text-muted-foreground tabular-nums">最多 {num(p.shopLimit)} 家店</p>
        </div>
        {isCurrent && <Badge className="bg-accent text-(--semantic-color-text-link)">当前</Badge>}
      </div>
      <p className="mt-4 flex items-baseline gap-1">
        {isContract(p) ? (
          <span className="text-[1.875rem] leading-tight font-semibold tracking-tight">按合同</span>
        ) : (
          <>
            <span className="text-[1.875rem] leading-tight font-semibold tracking-tight tabular-nums">USD {Number(price).toLocaleString("en-US")}</span>
            <span className="text-sm text-muted-foreground">/ {cycle === "yearly" ? "年" : "月"}</span>
          </>
        )}
      </p>
      <p className="mt-1 h-4 text-xs text-muted-foreground tabular-nums">
        {!isContract(p) && cycle === "yearly" ? `相当于 ${money(Number(p.yearlyPrice) / 12, "USD")} / 月` : ""}
      </p>
      <ul className="mt-4 flex flex-1 flex-col gap-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <CheckIcon className="mt-0.5 size-4 shrink-0 text-(--semantic-color-text-link)" />
            <span className="tabular-nums">{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        {p.blockedReason && r < cr && (
          <p id={`blocked-${p.code}`} className="mb-2 text-xs text-muted-foreground">
            {p.blockedReason}
          </p>
        )}
        {action}
      </div>
    </Panel>
  );
}

function ChangeSummary({ change, cur, b, tz, now }: { change: Change; cur: SubscriptionView; b?: BillingResponse; tz: string; now: number }) {
  const when = inTz(cur.periodEnd, tz, "yyyy-MM-dd");
  const p = change.plan;
  if (change.kind === "cancel") return <p>下个周期（{when} 起）保持{cur.planName} · {CYCLE_LABEL[cur.cycle]}，不做变更。</p>;
  if (change.kind === "upgrade") {
    const start = new Date(cur.periodStart).getTime();
    const end = new Date(cur.periodEnd).getTime();
    const ratio = Math.min(1, Math.max(0, (end - now) / (end - start)));
    const diff = (Number(priceOf(p, cur.cycle)) - Number(cur.price)) * ratio;
    const card = b?.paymentMethod ? `${b.paymentMethod.brand} •••• ${b.paymentMethod.last4}` : null;
    return (
      <div className="flex flex-col gap-2">
        <p>立即改为{p.name}，本期额度改为 {num(p.draftQuota * (cur.cycle === "yearly" ? 12 : 1))} 次，店铺上限 {num(p.shopLimit)} 家。</p>
        <p className="tabular-nums">
          按本期剩余 {Math.max(0, Math.ceil((end - now) / DAY))} 天补差价约 {money(diff, "USD")}
          {card ? `，从 ${card} 扣款。` : "。还没有付款方式时无法升级。"}
        </p>
        {change.cycle !== cur.cycle && <p>付费周期从 {when} 起改为{CYCLE_LABEL[change.cycle]}。</p>}
        {change.dropsCycle && <DropsCycleNote drops={change.dropsCycle} />}
      </div>
    );
  }
  if (change.kind === "downgrade") {
    return (
      <div className="flex flex-col gap-2">
        <p className="tabular-nums">
          从 {when} 起改为{p.name} · {CYCLE_LABEL[change.cycle]}（{money(priceOf(p, change.cycle), "USD")} / {change.cycle === "yearly" ? "年" : "月"}），本期套餐与额度不变。
        </p>
        {change.dropsCycle && <DropsCycleNote drops={change.dropsCycle} />}
      </div>
    );
  }
  return (
    <p className="tabular-nums">
      从 {when} 起改为{CYCLE_LABEL[change.cycle]}，每{change.cycle === "yearly" ? "年" : "月"} {money(priceOf(p, change.cycle), "USD")}。本期不变。
    </p>
  );
}

function DropsCycleNote({ drops }: { drops: NonNullable<Change["dropsCycle"]> }) {
  return (
    <p className="font-medium text-(--semantic-color-feedback-warning)">
      之前安排的 {drops.when} 起改为{CYCLE_LABEL[drops.cycle]}将被取消。
    </p>
  );
}

// ---------- 联系销售 ?dialog=contact-sales ----------

type LeadValues = z.input<typeof salesLeadBody>;

function ContactSalesDialog({ me }: { me: Me }) {
  const { open, close } = useDialogParam("contact-sales");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>联系销售</DialogTitle>
          <DialogDescription>留下联系方式，销售会按企业版合同与你确认店铺数、出稿量和价格。</DialogDescription>
        </DialogHeader>
        <ContactSalesForm me={me} close={close} />
      </DialogContent>
    </Dialog>
  );
}

function ContactSalesForm({ me, close }: { me: Me; close: () => void }) {
  const [key, setKey] = useState(newKey);
  const form = useForm<LeadValues>({ resolver: zodResolver(salesLeadBody), mode: "onTouched", defaultValues: { contactName: me.user.name, contact: me.user.email, note: "" } });
  const send = useMutation({
    mutationFn: (v: LeadValues) => api.post("/api/v1/billing/sales-leads", v, key),
    onSuccess: () => {
      toast.success("已记录，销售会按你留下的联系方式联系你");
      close();
    },
    onError: (e) => {
      setKey(newKey());
      toast.error(errorText(e));
    },
  });
  return (
    <form noValidate onSubmit={form.handleSubmit((v) => send.mutate(v))} className="flex flex-col gap-4">
      <FieldGroup className="gap-4">
        <Controller
          name="contactName"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="lead-name">联系人</FieldLabel>
              <Input {...field} id="lead-name" aria-invalid={fieldState.invalid} />
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </Field>
          )}
        />
        <Controller
          name="contact"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="lead-contact">联系方式</FieldLabel>
              <Input {...field} id="lead-contact" placeholder="邮箱、电话或 WhatsApp" aria-invalid={fieldState.invalid} />
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </Field>
          )}
        />
        <Controller
          name="note"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="lead-note">备注（选填）</FieldLabel>
              <Textarea {...field} value={field.value ?? ""} id="lead-note" rows={3} placeholder="例如：预计接入 30 家店，每月约 5 万次出稿" aria-invalid={fieldState.invalid} />
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </Field>
          )}
        />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          取消
        </Button>
        <Button type="submit" disabled={send.isPending}>
          {send.isPending && <Spinner />}
          提交
        </Button>
      </DialogFooter>
    </form>
  );
}
