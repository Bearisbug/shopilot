"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRightIcon, CheckIcon, CopyIcon, ScrollTextIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { Me } from "@/contracts/auth";
import { TIMEZONES, zEmail } from "@/contracts/common";
import type { AuditList, DeletionResult, MerchantView, OwnershipTransferResult } from "@/contracts/settings";
import type { MembersResponse } from "@/contracts/team";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageActions } from "@/components/shell/app-shell";
import { ErrorState, LoadingRows, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError, api, errorText, newKey } from "@/lib/api";
import { inTz, TIMEZONE_LABEL } from "@/lib/format";
import { SettingsFrame, useMerchant } from "./settings-frame";

const schema = z.object({
  name: z.string().trim().min(1, "请填写商户名").max(80, "商户名最多 80 个字"),
  timezone: z.enum(TIMEZONES),
  billingEmail: z.string().trim().refine((v) => v === "" || zEmail.safeParse(v).success, "邮箱格式不对，例如 billing@example.com"),
});
type Values = z.infer<typeof schema>;

const toValues = (m: MerchantView): Values => ({ name: m.name, timezone: m.timezone as Values["timezone"], billingEmail: m.billingEmail ?? "" });

export function ProfileClient({ me }: { me: Me }) {
  const merchant = useMerchant();
  const m = merchant.data;
  const facts = m ? `${m.name} · 账号所有者 ${m.owner.name} · 创建于 ${inTz(m.createdAt, me.active.timezone, "yyyy-MM-dd")}` : undefined;
  if (merchant.isError) {
    return (
      <SettingsFrame me={me}>
        <Panel>
          <ErrorState error={merchant.error} onRetry={() => merchant.refetch()} />
        </Panel>
      </SettingsFrame>
    );
  }
  if (!m) {
    return (
      <SettingsFrame me={me}>
        <Panel>
          <LoadingRows rows={5} />
        </Panel>
      </SettingsFrame>
    );
  }
  return <ProfileEditor key={m.id} me={me} merchant={m} facts={facts} />;
}

function ProfileEditor({ me, merchant, facts }: { me: Me; merchant: MerchantView; facts?: string }) {
  const qc = useQueryClient();
  const form = useForm<Values>({ resolver: zodResolver(schema), mode: "onTouched", values: toValues(merchant), resetOptions: { keepDirtyValues: true } });
  const current = useWatch({ control: form.control }) as Values;
  const saved = toValues(merchant);
  const emailInvalid = !schema.shape.billingEmail.safeParse(current.billingEmail ?? "").success;
  const changes = [
    current.name?.trim() !== saved.name && { key: "name", text: `商户名称：${saved.name} → ${current.name?.trim() || "（空）"}` },
    current.timezone !== saved.timezone && { key: "timezone", text: `默认时区：${saved.timezone} → ${current.timezone}` },
    (current.billingEmail ?? "").trim() !== saved.billingEmail && {
      key: "billingEmail",
      text: emailInvalid ? "账单邮箱：格式不对，需要先改正" : `账单邮箱：${saved.billingEmail || "（空）"} → ${current.billingEmail?.trim() || "（空）"}`,
      error: emailInvalid,
    },
  ].filter(Boolean) as Array<{ key: string; text: string; error?: boolean }>;

  const save = useMutation({
    mutationFn: (v: Values) =>
      api.put<MerchantView>("/api/v1/merchant", {
        ...(v.name !== saved.name ? { name: v.name } : {}),
        ...(v.timezone !== saved.timezone ? { timezone: v.timezone } : {}),
        ...(v.billingEmail !== saved.billingEmail ? { billingEmail: v.billingEmail || null } : {}),
      }),
    onSuccess: (next, v) => {
      qc.setQueryData(["merchant"], next);
      form.reset(toValues(next));
      toast.success(v.timezone !== saved.timezone ? "已保存。看板与接待时间已按新时区计算。" : "已保存");
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (e) => {
      const fields = e instanceof ApiError ? (e.problem.extra?.fields as Record<string, string> | undefined) : undefined;
      if (fields) for (const [k, msg] of Object.entries(fields)) if (k in saved) form.setError(k as keyof Values, { message: msg });
      toast.error(errorText(e));
    },
  });

  return (
    <SettingsFrame
      me={me}
      facts={facts}
      aside={
        <>
          <Panel>
            <PanelHeader title="未保存的修改" />
            <p className="text-[1.875rem] leading-tight font-semibold tabular-nums">{changes.length} 项</p>
            {changes.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">表单与已保存的内容一致。</p>
            ) : (
              <>
                <ul className="mt-3 flex flex-col gap-2 text-sm">
                  {changes.map((c) => (
                    <li key={c.key} className="flex gap-2">
                      <span aria-hidden className={c.error ? "mt-2 size-1.5 shrink-0 rounded-full bg-destructive" : "mt-2 size-1.5 shrink-0 rounded-full bg-foreground"} />
                      <span className={c.error ? "text-destructive" : undefined}>{c.text}</span>
                    </li>
                  ))}
                </ul>
                <Button variant="outline" className="mt-4 w-full" onClick={() => form.reset(saved, { keepDirtyValues: false })}>
                  放弃修改
                </Button>
              </>
            )}
          </Panel>
          <RecentChanges me={me} />
        </>
      }
    >
      <PageActions>
        <Button type="submit" form="merchant-form" disabled={changes.length === 0 || emailInvalid || save.isPending}>
          {save.isPending ? <Spinner /> : <CheckIcon />}
          {emailInvalid && changes.length ? "账单邮箱改正后才能保存" : "保存修改"}
        </Button>
      </PageActions>

      <Panel>
        <PanelHeader title="商户资料" description="商户名称会出现在邀请邮件与账单上" />
        <form id="merchant-form" noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))} className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="merchant-name">商户名称</FieldLabel>
                <Input {...field} id="merchant-name" autoComplete="organization" aria-invalid={fieldState.invalid} aria-describedby={fieldState.error ? "merchant-name-error" : undefined} />
                {fieldState.error && <FieldError id="merchant-name-error">{fieldState.error.message}</FieldError>}
              </Field>
            )}
          />
          <Controller
            name="timezone"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="merchant-tz">默认时区</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="merchant-tz" className="w-full">
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
                <FieldDescription>看板与接待时间按这个时区切日，保存后立即生效</FieldDescription>
              </Field>
            )}
          />
          <Controller
            name="billingEmail"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="merchant-billing">账单邮箱</FieldLabel>
                <Input {...field} id="merchant-billing" type="email" inputMode="email" autoComplete="email" placeholder="billing@example.com" aria-invalid={fieldState.invalid} aria-describedby={fieldState.error ? "merchant-billing-error" : "merchant-billing-desc"} />
                {fieldState.error ? <FieldError id="merchant-billing-error">{fieldState.error.message}</FieldError> : <FieldDescription id="merchant-billing-desc">账单与扣款通知发到这里</FieldDescription>}
              </Field>
            )}
          />
          <Field>
            <FieldLabel htmlFor="merchant-lang">界面语言</FieldLabel>
            <Input id="merchant-lang" value="简体中文" readOnly aria-readonly="true" className="bg-muted" />
            <FieldDescription>本期只提供简体中文</FieldDescription>
          </Field>
        </form>
        <Separator className="my-5" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">商户 ID</p>
            <p className="truncate text-xs text-muted-foreground tabular-nums">
              {merchant.id} · 创建于 {inTz(merchant.createdAt, me.active.timezone, "yyyy-MM-dd")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigator.clipboard
                .writeText(merchant.id)
                .then(() => toast.success("商户 ID 已复制"))
                .catch(() => toast.error("复制没有成功，请手动选中复制"))
            }
          >
            <CopyIcon />
            复制
          </Button>
        </div>
      </Panel>

      <OwnerActions me={me} merchant={merchant} />
    </SettingsFrame>
  );
}

function RecentChanges({ me }: { me: Me }) {
  const recent = useQuery({ queryKey: ["audit-logs", "settings-recent"], queryFn: () => api.get<AuditList>("/api/v1/audit-logs?module=settings&range=90d&limit=5") });
  return (
    <Panel>
      <PanelHeader title="最近修改">
        <Button asChild variant="outline" size="sm">
          <Link href="/settings/audit?module=settings">
            <ScrollTextIcon />
            审计日志
          </Link>
        </Button>
      </PanelHeader>
      {recent.isPending ? (
        <LoadingRows rows={3} />
      ) : recent.isError ? (
        <ErrorState error={recent.error} onRetry={() => recent.refetch()} />
      ) : recent.data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">近 90 天没有修改商户设置。</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {recent.data.items.map((item) => (
            <li key={item.id} className="text-sm">
              <p className="text-pretty">{item.summary}</p>
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {item.actorName ?? "系统"} · {inTz(item.createdAt, me.active.timezone)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** 只给所有者的操作：非所有者看到置灰与原因（TC-SET-016） */
function OwnerGate({ me, owner, children }: { me: Me; owner: string; children: React.ReactNode }) {
  if (me.active.isOwner) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="focus-ring inline-flex cursor-not-allowed rounded-lg" aria-label={`只有账号所有者 ${owner} 能操作`}>
          <span className="pointer-events-none inline-flex items-center gap-2" aria-hidden>
            {children}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>只有账号所有者 {owner} 能操作</TooltipContent>
    </Tooltip>
  );
}

function OwnerActions({ me, merchant }: { me: Me; merchant: MerchantView }) {
  const qc = useQueryClient();
  const members = useQuery({
    queryKey: ["members", "week", "all", "all"],
    queryFn: () => api.get<MembersResponse>("/api/v1/members?period=week&role=all&status=all"),
  });
  const candidates = (members.data?.members ?? []).filter((x) => x.role === "admin" && x.status === "active" && !x.isOwner);
  const [toId, setToId] = useState("");
  const target = candidates.find((c) => c.membershipId === toId) ?? null;
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const [transferKey, setTransferKey] = useState(newKey);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const pending = merchant.status === "pending_deletion";
  const shopCount = me.active.shops.length;

  const transfer = useMutation({
    mutationFn: () => api.post<OwnershipTransferResult>("/api/v1/merchant/ownership-transfers", { toMembershipId: toId }, transferKey),
    onSuccess: (r) => {
      toast.success(`已向 ${r.toName} 发出确认邮件，对方 7 天内确认后生效`);
      setConfirmTransfer(false);
      setTransferKey(newKey());
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (e) => {
      toast.error(errorText(e));
      setConfirmTransfer(false);
      setTransferKey(newKey());
    },
  });
  const remove = useMutation({
    mutationFn: () => api.post<DeletionResult>("/api/v1/merchant/deletion", { confirmName }),
    onSuccess: (r) => {
      toast.success(`已申请删除，${inTz(r.purgeAt, me.active.timezone, "yyyy-MM-dd HH:mm")} 清除数据；之前可以撤销`);
      setDeleting(false);
      setConfirmName("");
      qc.invalidateQueries({ queryKey: ["merchant"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 422) setNameError(e.problem.detail ?? "名称不一致");
      else toast.error(errorText(e));
    },
  });

  return (
    <Panel>
      <PanelHeader title="所有者操作" description={`只有账号所有者（${merchant.owner.name}）能做；所有者不能被停用或降级，要先转让`} />
      <div className="flex flex-wrap items-center justify-between gap-3 py-1">
        <div className="min-w-0">
          <p className="text-sm font-medium">转让所有权</p>
          <p className="text-xs text-muted-foreground">转给已开两步验证的启用管理员，对方确认后生效</p>
        </div>
        <OwnerGate me={me} owner={merchant.owner.name}>
          {candidates.length === 0 && me.active.isOwner && !members.isPending ? (
            <p className="text-sm text-muted-foreground">
              没有其他启用的管理员，先在
              <Link href="/team" className="focus-ring rounded-sm text-(--semantic-color-text-link)">
                团队与权限
              </Link>
              邀请或提升一位
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <Select value={toId} onValueChange={setToId} disabled={!me.active.isOwner || members.isPending}>
                <SelectTrigger className="max-w-full min-w-44" aria-label="转让给">
                  <SelectValue placeholder={members.isPending ? "正在加载管理员…" : "选择管理员"} />
                </SelectTrigger>
                {/* 弹出位置跟随触发器：候选人全部不可选、又没有选中值时，按选项对齐的定位会把列表放到屏幕外 */}
                <SelectContent position="popper">
                  {/* 未开两步验证的管理员不能接收所有权：置灰并写明原因 */}
                  {candidates.map((c) => (
                    <SelectItem key={c.membershipId} value={c.membershipId} disabled={!c.twoFactorEnabled}>
                      {c.twoFactorEnabled ? c.name : `${c.name}（未开两步验证，开启后才能接收）`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" disabled={!me.active.isOwner || !target || transfer.isPending} onClick={() => setConfirmTransfer(true)}>
                <ArrowLeftRightIcon />
                转让
              </Button>
            </div>
          )}
        </OwnerGate>
      </div>
      <Separator className="my-4" />
      <div className="flex flex-wrap items-center justify-between gap-3 py-1">
        <div className="min-w-0">
          <p className="text-sm font-medium">删除商户</p>
          <p className="text-xs text-muted-foreground">{pending ? "已申请删除，见页面顶部的清除日期" : `解绑全部 ${shopCount} 家店并停用其他成员，30 天后清除数据`}</p>
        </div>
        {!pending && !deleting && (
          <OwnerGate me={me} owner={merchant.owner.name}>
            <Button variant="destructive" disabled={!me.active.isOwner} onClick={() => setDeleting(true)}>
              <Trash2Icon />
              删除商户
            </Button>
          </OwnerGate>
        )}
      </div>
      {deleting && !pending && (
        <form
          noValidate
          className="mt-3 flex flex-col gap-3 rounded-(--semantic-radius-md) bg-muted p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setNameError(null);
            remove.mutate();
          }}
        >
          <Field data-invalid={Boolean(nameError)}>
            <FieldLabel htmlFor="confirm-name">输入商户名称 {merchant.name} 确认删除</FieldLabel>
            <Input
              id="confirm-name"
              value={confirmName}
              autoComplete="off"
              onChange={(e) => {
                setConfirmName(e.target.value);
                setNameError(null);
              }}
              aria-invalid={Boolean(nameError)}
              aria-describedby="confirm-name-desc"
              className="bg-card"
              autoFocus
            />
            {nameError ? (
              <FieldError id="confirm-name-desc">{nameError}</FieldError>
            ) : (
              <FieldDescription id="confirm-name-desc">
                先在
                <Link href="/settings/data" className="focus-ring rounded-sm text-(--semantic-color-text-link) no-underline">
                  数据与隐私
                </Link>
                导出数据。30 天内可以撤销，之后全部清除，不能恢复。
              </FieldDescription>
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleting(false);
                setConfirmName("");
                setNameError(null);
              }}
            >
              取消
            </Button>
            <Button type="submit" variant="destructive" disabled={!confirmName.trim() || remove.isPending}>
              {remove.isPending && <Spinner />}
              确认删除
            </Button>
          </div>
        </form>
      )}
      <ConfirmDialog
        open={confirmTransfer}
        onOpenChange={setConfirmTransfer}
        title={`把账号所有权转给 ${target?.name ?? ""}？`}
        desc={`系统会给 ${target?.email ?? "对方"} 发确认邮件，链接 7 天有效；对方确认前你仍是所有者，确认后你保留管理员身份。再次发起转让会让之前的链接作废。`}
        confirmText="发送确认邮件"
        pending={transfer.isPending}
        onConfirm={() => transfer.mutate()}
      />
    </Panel>
  );
}
