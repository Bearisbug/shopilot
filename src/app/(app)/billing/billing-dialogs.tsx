"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCardIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { Me } from "@/contracts/auth";
import { ALERT_THRESHOLD_OPTIONS, cardBody, invoiceInfoBody, type BillingResponse, type TopupResult } from "@/contracts/billing";
import type { MemberOption } from "@/contracts/team";
import { useDialogParam } from "@/components/shell/global-dialogs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ApiError, api, errorText, newKey } from "@/lib/api";
import { inTz, money } from "@/lib/format";
import { forecast, num, useOpenDialog } from "./billing-lib";

function useInvalidateBilling() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["billing"] });
    qc.invalidateQueries({ queryKey: ["billing-plans"] });
    qc.invalidateQueries({ queryKey: ["nav-summary"] });
  };
}

function cardText(pm: BillingResponse["paymentMethod"]) {
  return pm ? `${pm.brand} •••• ${pm.last4}` : null;
}

// ---------- 加购出稿包 ?dialog=topup ----------

export function TopupDialog({ d, me }: { d: BillingResponse; me: Me }) {
  const { open, close } = useDialogParam("topup");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>加购出稿包</DialogTitle>
          <DialogDescription>支付成功后额度立即加到本期，当期有效（至 {inTz(d.period.end, me.active.timezone, "MM-dd")}），不结转到下期。</DialogDescription>
        </DialogHeader>
        <TopupForm d={d} me={me} close={close} />
      </DialogContent>
    </Dialog>
  );
}

function TopupForm({ d, me, close }: { d: BillingResponse; me: Me; close: () => void }) {
  const invalidate = useInvalidateBilling();
  const openDialog = useOpenDialog();
  const [now] = useState(() => Date.now());
  const [pack, setPack] = useState(d.topupPacks[0].code);
  const [key, setKey] = useState(newKey);
  const [failure, setFailure] = useState<string | null>(null);
  const f = forecast(d, now);
  const selected = d.topupPacks.find((p) => p.code === pack)!;
  const buy = useMutation({
    mutationFn: () => api.post<TopupResult>("/api/v1/billing/topups", { pack }, key),
    onSuccess: (r) => {
      toast.success(`已加购 ${num(selected.drafts)} 次，本期剩余 ${num(r.usage.remaining)} 次`);
      invalidate();
      close();
    },
    onError: (e) => {
      setKey(newKey());
      if (e instanceof ApiError && e.type === "payment-failed") setFailure(e.problem.detail ?? "支付没有成功");
      else toast.error(errorText(e));
    },
  });
  const pm = cardText(d.paymentMethod);
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setFailure(null);
        buy.mutate();
      }}
      className="flex flex-col gap-4"
    >
      <p className="rounded-md bg-(--semantic-color-surface-warm) px-3 py-2 text-sm tabular-nums">
        本期已用 {num(d.usage.used)} / {num(f.total)} 次，剩余 {num(d.usage.remaining)} 次
        {d.usage.used > 0 ? `；按日均 ${num(Math.round(f.perDay))} 次推算，到周期结束还会用约 ${num(Math.round(f.perDay * f.daysLeft))} 次` : ""}。
      </p>
      <FieldSet>
        <FieldLegend variant="label">选择出稿包</FieldLegend>
        <RadioGroup value={pack} onValueChange={(v) => setPack(v as typeof pack)} aria-label="出稿包">
          {d.topupPacks.map((p) => {
            const unit = Number(p.price) / p.drafts;
            const cheaper = unit < Number(d.overage.price);
            return (
              <Field key={p.code} orientation="horizontal">
                <RadioGroupItem value={p.code} id={`pack-${p.code}`} />
                <FieldContent>
                  <FieldLabel htmlFor={`pack-${p.code}`} className="tabular-nums">
                    {num(p.drafts)} 次 · {money(p.price, "USD")}
                  </FieldLabel>
                  <FieldDescription className="tabular-nums">
                    单价 USD {unit.toFixed(3)} / 次{cheaper ? `，比超量单价 ${money(d.overage.price, "USD")} 便宜` : ""}
                  </FieldDescription>
                </FieldContent>
              </Field>
            );
          })}
        </RadioGroup>
      </FieldSet>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
        <span className="inline-flex min-w-0 items-center gap-2">
          <CreditCardIcon className="size-4 shrink-0 text-muted-foreground" />
          {pm ? (
            `付款方式 ${pm}`
          ) : (
            <span>
              还没有付款方式
              <span className="block text-xs text-muted-foreground">{me.active.isOwner ? "先添加一张卡，再支付" : `请账号所有者 ${d.owner.name} 添加一张卡后再支付`}</span>
            </span>
          )}
        </span>
        {me.active.isOwner &&
          (pm ? (
            <Button type="button" variant="link" onClick={() => openDialog("payment")}>
              更换
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => openDialog("payment")}>
              <CreditCardIcon />
              添加卡
            </Button>
          ))}
      </div>
      {failure && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
          <span>{failure}</span>
          {me.active.isOwner && (
            <Button type="button" variant="outline" size="sm" onClick={() => openDialog("payment")}>
              {pm ? "换一张卡" : "添加卡"}
            </Button>
          )}
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          取消
        </Button>
        {/* 没有付款方式时不能支付，原因写在上方付款方式一行 */}
        <Button type="submit" disabled={buy.isPending || !pm}>
          {buy.isPending ? <Spinner /> : <CreditCardIcon />}
          支付 {money(selected.price, "USD")}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------- 超量策略 ?dialog=overage ----------

const overageForm = z
  .object({ policy: z.enum(["stop", "continue"]), budget: z.string().trim() })
  .superRefine((v, ctx) => {
    if (v.policy !== "continue") return;
    const n = Number(v.budget);
    if (!v.budget) ctx.addIssue({ code: "custom", path: ["budget"], message: "选择继续出稿时要填超量预算" });
    else if (!Number.isFinite(n) || n <= 0) ctx.addIssue({ code: "custom", path: ["budget"], message: "预算要大于 0" });
    else if (!/^\d+(\.\d{1,2})?$/.test(v.budget)) ctx.addIssue({ code: "custom", path: ["budget"], message: "预算最多两位小数" });
  });
type OverageValues = z.infer<typeof overageForm>;

export function OverageDialog({ d }: { d: BillingResponse }) {
  const { open, close } = useDialogParam("overage");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>超量策略</DialogTitle>
          <DialogDescription className="tabular-nums">本期额度 {num(d.usage.quota + d.usage.topup)} 次（含加购）用完之后怎么办</DialogDescription>
        </DialogHeader>
        <OverageForm d={d} close={close} />
      </DialogContent>
    </Dialog>
  );
}

function OverageForm({ d, close }: { d: BillingResponse; close: () => void }) {
  const invalidate = useInvalidateBilling();
  const form = useForm<OverageValues>({ resolver: zodResolver(overageForm), mode: "onTouched", defaultValues: { policy: d.overage.policy, budget: d.overage.budget ? String(Number(d.overage.budget)) : "" } });
  const policy = useWatch({ control: form.control, name: "policy" });
  const budget = useWatch({ control: form.control, name: "budget" });
  const price = Number(d.overage.price);
  const extra = Number(budget) > 0 && price > 0 ? Math.floor(Number(budget) / price) : null;
  const save = useMutation({
    mutationFn: (v: OverageValues) => api.put("/api/v1/billing/overage", { policy: v.policy, budget: v.policy === "continue" ? Number(v.budget) : null }),
    onSuccess: (_r, v) => {
      toast.success(v.policy === "stop" ? "已改为用尽后停止 AI 出稿" : `已改为用尽后继续出稿，超量预算 USD ${Number(v.budget).toFixed(2)}`);
      invalidate();
      close();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.type === "validation" && e.problem.extra?.fields) {
        const fields = e.problem.extra.fields as Record<string, string>;
        if (fields.budget) return form.setError("budget", { message: fields.budget });
      }
      toast.error(errorText(e));
    },
  });
  return (
    <form noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-4">
      <Controller
        name="policy"
        control={form.control}
        render={({ field }) => (
          <RadioGroup value={field.value} onValueChange={field.onChange} aria-label="超量策略">
            <Field orientation="horizontal">
              <RadioGroupItem value="continue" id="overage-continue" />
              <FieldContent>
                <FieldLabel htmlFor="overage-continue" className="tabular-nums">
                  继续出稿，按 {money(d.overage.price, "USD")} / 次计费
                </FieldLabel>
                <FieldDescription>不停机；超量费在本期结束时结算，用完超量预算后停止 AI 出稿</FieldDescription>
              </FieldContent>
            </Field>
            <Field orientation="horizontal">
              <RadioGroupItem value="stop" id="overage-stop" />
              <FieldContent>
                <FieldLabel htmlFor="overage-stop">到上限后停止 AI 出稿</FieldLabel>
                <FieldDescription>新会话直接进入待认领，不再生成草稿；下个周期自动恢复</FieldDescription>
              </FieldContent>
            </Field>
          </RadioGroup>
        )}
      />
      {policy === "continue" && (
        <Controller
          name="budget"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="overage-budget">超量预算（USD）</FieldLabel>
              <Input {...field} id="overage-budget" inputMode="decimal" placeholder="例如 50" aria-invalid={fieldState.invalid} className="tabular-nums" />
              <FieldDescription className="tabular-nums">
                {extra !== null ? `超量费用到这个金额后停止 AI 出稿；约可多出稿 ${num(extra)} 次` : "超量费用到这个金额后停止 AI 出稿"}
              </FieldDescription>
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </Field>
          )}
        />
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          取消
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Spinner />}
          保存
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------- 用量提醒 ?dialog=alerts ----------

export function AlertsDialog({ d }: { d: BillingResponse }) {
  const { open, close } = useDialogParam("alerts");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>用量提醒</DialogTitle>
          <DialogDescription>本期出稿用到所选比例时提醒；每个比例每个计费周期只提醒一次。</DialogDescription>
        </DialogHeader>
        <AlertsForm d={d} close={close} />
      </DialogContent>
    </Dialog>
  );
}

function AlertsForm({ d, close }: { d: BillingResponse; close: () => void }) {
  const invalidate = useInvalidateBilling();
  const options = [...new Set([...ALERT_THRESHOLD_OPTIONS, ...d.alerts.thresholds])].sort((a, b) => a - b);
  const [thresholds, setThresholds] = useState<number[]>(d.alerts.thresholds);
  const [recipients, setRecipients] = useState(d.alerts.recipients);
  const [inApp, setInApp] = useState(d.alerts.inApp);
  const [email, setEmail] = useState(d.alerts.email);
  const [errors, setErrors] = useState<{ thresholds?: string; recipients?: string }>({});
  const admins = useQuery({ queryKey: ["member-options"], queryFn: () => api.get<{ items: MemberOption[] }>("/api/v1/members/options") });
  const candidates = (admins.data?.items ?? []).filter((m) => m.role === "admin" && !recipients.some((r) => r.membershipId === m.membershipId));
  const save = useMutation({
    mutationFn: () => api.put("/api/v1/billing/alerts", { thresholds, recipients: recipients.map((r) => r.membershipId), email, inApp }),
    onSuccess: () => {
      toast.success("用量提醒已保存");
      invalidate();
      close();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.type === "validation" && e.problem.extra?.fields) {
        const fields = e.problem.extra.fields as Record<string, string>;
        setErrors({ thresholds: Object.entries(fields).find(([k]) => k.startsWith("thresholds"))?.[1], recipients: fields.recipients });
        return;
      }
      toast.error(errorText(e));
    },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = { thresholds: thresholds.length ? undefined : "至少选一个提醒时机", recipients: recipients.length ? undefined : "至少选一位接收人" };
    setErrors(next);
    if (next.thresholds || next.recipients) return;
    save.mutate();
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <FieldSet data-invalid={Boolean(errors.thresholds)}>
        <FieldLegend variant="label">提醒时机</FieldLegend>
        <div className="grid grid-cols-2 gap-3">
          {options.map((t) => (
            <Field key={t} orientation="horizontal">
              <Checkbox
                id={`alert-${t}`}
                checked={thresholds.includes(t)}
                onCheckedChange={(c) => setThresholds((cur) => (c ? [...cur, t].sort((a, b) => a - b) : cur.filter((x) => x !== t)))}
              />
              <FieldLabel htmlFor={`alert-${t}`} className="font-normal tabular-nums">
                用到 {t}%
              </FieldLabel>
            </Field>
          ))}
        </div>
        {errors.thresholds && <FieldError>{errors.thresholds}</FieldError>}
      </FieldSet>
      <FieldSet>
        <FieldLegend variant="label">接收人</FieldLegend>
        <FieldDescription>只能选管理员，用量页只对管理员开放。</FieldDescription>
        <ul className="flex flex-wrap gap-2">
          {recipients.map((r) => (
            <li key={r.membershipId} className="inline-flex h-8 items-center gap-2 rounded-full border border-border pr-1 pl-1">
              <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-xs font-semibold" aria-hidden>
                {r.name.slice(0, 1)}
              </span>
              <span className="text-sm">{r.name}</span>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={`移除 ${r.name}`} onClick={() => setRecipients((cur) => cur.filter((x) => x.membershipId !== r.membershipId))}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
        <Select
          value=""
          onValueChange={(id) => {
            const m = admins.data?.items.find((x) => x.membershipId === id);
            if (m) setRecipients((cur) => [...cur, { membershipId: m.membershipId, name: m.name }]);
          }}
          disabled={candidates.length === 0}
        >
          <SelectTrigger className="w-60" aria-label="添加接收人">
            <SelectValue placeholder={admins.isPending ? "加载管理员…" : candidates.length ? "添加管理员" : "管理员都已添加"} />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((m) => (
              <SelectItem key={m.membershipId} value={m.membershipId}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.recipients && <FieldError>{errors.recipients}</FieldError>}
      </FieldSet>
      <FieldSet>
        <FieldLegend variant="label">渠道</FieldLegend>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="alert-inapp">站内通知</FieldLabel>
            <FieldDescription>顶栏铃铛里的「用量」分类</FieldDescription>
          </FieldContent>
          <Switch id="alert-inapp" checked={inApp} onCheckedChange={setInApp} />
        </Field>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="alert-email">邮件提醒</FieldLabel>
            <FieldDescription>发到接收人的登录邮箱</FieldDescription>
          </FieldContent>
          <Switch id="alert-email" checked={email} onCheckedChange={setEmail} />
        </Field>
        {!inApp && !email && <FieldDescription className="text-(--semantic-color-feedback-warning)">两个渠道都关闭时不会发出任何提醒。</FieldDescription>}
      </FieldSet>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          取消
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Spinner />}
          保存
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------- 付款方式与续费 ?dialog=payment ----------

export function PaymentDialog({ d, me }: { d: BillingResponse; me: Me }) {
  const { open, close } = useDialogParam("payment");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>付款方式与续费</DialogTitle>
          <DialogDescription>只有账号所有者（{d.owner.name}）能改付款方式和续费。</DialogDescription>
        </DialogHeader>
        <PaymentBody d={d} me={me} />
      </DialogContent>
    </Dialog>
  );
}

type CardValues = z.infer<typeof cardBody>;

function PaymentBody({ d, me }: { d: BillingResponse; me: Me }) {
  const invalidate = useInvalidateBilling();
  const owner = me.active.isOwner;
  const [editing, setEditing] = useState(false);
  const s = d.subscription;
  const tz = me.active.timezone;
  const form = useForm<CardValues>({ resolver: zodResolver(cardBody), mode: "onTouched", defaultValues: { number: "", expiry: "" } });
  const saveCard = useMutation({
    mutationFn: (v: CardValues) => api.put<{ paymentMethod: BillingResponse["paymentMethod"] }>("/api/v1/billing/payment", { card: v }),
    onSuccess: (r) => {
      toast.success(`付款方式已改为 ${cardText(r.paymentMethod)}`);
      setEditing(false);
      form.reset();
      invalidate();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.type === "validation" && e.problem.extra?.fields) {
        const fields = e.problem.extra.fields as Record<string, string>;
        if (fields["card.number"]) form.setError("number", { message: fields["card.number"] });
        if (fields["card.expiry"]) form.setError("expiry", { message: fields["card.expiry"] });
        if (fields["card.number"] || fields["card.expiry"]) return;
      }
      toast.error(errorText(e));
    },
  });
  const renew = useMutation({
    mutationFn: (autoRenew: boolean) => api.put("/api/v1/billing/payment", { autoRenew }),
    onSuccess: (_r, autoRenew) => {
      toast.success(autoRenew ? "已打开自动续费" : "已关闭自动续费，本期结束后不再扣款");
      invalidate();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const price = money(s.price, "USD");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-md border border-border px-3 py-3">
        <span className="flex h-7 w-11 shrink-0 items-center justify-center rounded-sm bg-(--semantic-color-surface-inverse) text-[0.6875rem] font-semibold text-(--semantic-color-text-on-inverse)">
          {d.paymentMethod ? d.paymentMethod.brand.toUpperCase().slice(0, 4) : <CreditCardIcon className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm tabular-nums">{cardText(d.paymentMethod) ?? "还没有付款方式"}</p>
          <p className="text-xs text-muted-foreground tabular-nums">{d.paymentMethod ? `${d.paymentMethod.expiry} 到期` : "续费与加购都从这张卡扣款"}</p>
        </div>
        {owner && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            {d.paymentMethod ? "更换" : "添加卡"}
          </Button>
        )}
      </div>
      {owner && editing && (
        <form noValidate onSubmit={form.handleSubmit((v) => saveCard.mutate(v))} className="flex flex-col gap-3 rounded-md bg-muted p-3">
          <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
            <Controller
              name="number"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="card-number">卡号</FieldLabel>
                  <Input {...field} id="card-number" inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" aria-invalid={fieldState.invalid} className="bg-card tabular-nums" />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
            <Controller
              name="expiry"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="card-expiry">有效期</FieldLabel>
                  <Input {...field} id="card-expiry" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" aria-invalid={fieldState.invalid} className="bg-card tabular-nums" />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
          </FieldGroup>
          <FieldDescription>模拟支付：4242 4242 4242 4242 扣款成功，4000 0000 0000 0002 扣款失败。只保存品牌、后 4 位与有效期。</FieldDescription>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(false); form.reset(); }}>
              取消
            </Button>
            <Button type="submit" variant="outline" size="sm" disabled={saveCard.isPending}>
              {saveCard.isPending && <Spinner />}
              保存这张卡
            </Button>
          </div>
        </form>
      )}
      <Field orientation="horizontal" className="border-t border-border pt-4">
        <FieldContent>
          <FieldLabel htmlFor="auto-renew">自动续费</FieldLabel>
          <FieldDescription className="tabular-nums">
            {s.autoRenew
              ? `${inTz(s.periodEnd, tz, "MM-dd")} 自动扣下一期${s.cycle === "yearly" ? "年费" : "月费"} ${price} 与本期超量费`
              : "本期结束后不再扣款，订阅转为只读"}
          </FieldDescription>
        </FieldContent>
        <Switch id="auto-renew" checked={s.autoRenew} disabled={!owner || renew.isPending} onCheckedChange={(v) => renew.mutate(v)} />
      </Field>
      <div className="border-t border-border pt-4 text-sm">
        <p className="font-medium">扣款失败时</p>
        <p className="mt-1 text-xs text-muted-foreground">加购不生效、额度不变；续费扣款失败时订阅转为只读，账单记录里显示「扣款失败」。</p>
        {s.cycle === "monthly" && !s.pendingCycle && (
          <Link href="/billing/plans?cycle=yearly" className="focus-ring mt-2 inline-flex rounded-sm text-sm font-medium text-(--semantic-color-text-link)">
            改为年付（{money(d.plan.yearlyPrice, "USD")} / 年）
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------- 开票资料 ?dialog=invoice-info ----------

type InvoiceValues = z.input<typeof invoiceInfoBody>;

export function InvoiceInfoDialog({ d, me }: { d: BillingResponse; me: Me }) {
  const { open, close } = useDialogParam("invoice-info");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>开票资料</DialogTitle>
          <DialogDescription>Shopilot 开给你的账单发票用这份资料。保存后新生成的账单使用新资料，已生成的账单不变。</DialogDescription>
        </DialogHeader>
        <InvoiceForm d={d} me={me} close={close} />
      </DialogContent>
    </Dialog>
  );
}

function InvoiceForm({ d, me, close }: { d: BillingResponse; me: Me; close: () => void }) {
  const invalidate = useInvalidateBilling();
  const info = d.invoiceInfo;
  const form = useForm<InvoiceValues>({
    resolver: zodResolver(invoiceInfoBody),
    mode: "onTouched",
    defaultValues: { companyName: info?.companyName ?? me.active.merchantName, taxId: info?.taxId ?? "", address: info?.address ?? "", email: info?.email ?? "" },
  });
  const save = useMutation({
    mutationFn: (v: InvoiceValues) => api.put("/api/v1/billing/invoice-info", v),
    onSuccess: () => {
      toast.success("开票资料已保存，之后的账单使用新资料");
      invalidate();
      close();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.type === "validation" && e.problem.extra?.fields) {
        const fields = e.problem.extra.fields as Partial<Record<keyof InvoiceValues, string>>;
        let hit = false;
        for (const k of ["companyName", "taxId", "address", "email"] as const) {
          if (fields[k]) {
            form.setError(k, { message: fields[k] });
            hit = true;
          }
        }
        if (hit) return;
      }
      toast.error(errorText(e));
    },
  });
  const fields = [
    { name: "companyName", label: "发票抬头", placeholder: "公司全称", desc: info ? undefined : "默认取商户名称" },
    { name: "taxId", label: "税号（选填）", placeholder: "例如 C12345678901", desc: undefined },
    { name: "address", label: "地址", placeholder: "注册地址", desc: undefined },
    { name: "email", label: "收票邮箱", placeholder: "finance@example.com", desc: undefined },
  ] as const;
  return (
    <form noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-4">
      <FieldGroup className="gap-4">
        {fields.map((f) => (
          <Controller
            key={f.name}
            name={f.name}
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`inv-${f.name}`}>{f.label}</FieldLabel>
                <Input {...field} value={field.value ?? ""} id={`inv-${f.name}`} type={f.name === "email" ? "email" : "text"} placeholder={f.placeholder} aria-invalid={fieldState.invalid} />
                {f.desc && <FieldDescription>{f.desc}</FieldDescription>}
                {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
              </Field>
            )}
          />
        ))}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          取消
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Spinner />}
          保存
        </Button>
      </DialogFooter>
    </form>
  );
}
