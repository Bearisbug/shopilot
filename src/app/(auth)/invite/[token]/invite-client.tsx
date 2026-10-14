"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zPassword } from "@/contracts/common";
import type { InvitationPreview } from "@/contracts/team";
import { PasswordInput } from "@/components/forms/password-input";
import { LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, api } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/permissions";

const EXPIRED_TEXT: Record<string, string> = {
  expired: "邀请已过期（7 天有效）。请联系邀请你的管理员重新发送。",
  revoked: "邀请已撤销，请联系管理员重发。",
  used: "这条邀请已经接受过了，直接登录即可。",
  invalid: "邀请链接不完整或不存在，请检查邮件里的链接。",
};

const newAccount = z.object({ name: z.string().trim().min(1, "请填姓名").max(60), password: zPassword });
type NewAccount = z.infer<typeof newAccount>;

// PAGE-INVITE：账号不存在时设姓名与密码；已存在时须先以邀请邮箱登录（API-TEAM-005、API-TEAM-006）
export function InviteClient({ token }: { token: string }) {
  const router = useRouter();
  const preview = useQuery({ queryKey: ["invitation", token], queryFn: () => api.get<InvitationPreview>(`/api/v1/invitations/by-token/${encodeURIComponent(token)}`), retry: false });
  // 邀请不可用时按登录状态给出口；走 /api/auth，未登录不会被拦到登录页
  const session = useQuery({
    queryKey: ["invite-session"],
    queryFn: () => api.get<{ user: { email: string } } | null>("/api/auth/get-session"),
    enabled: preview.isError,
    retry: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<NewAccount>({ resolver: zodResolver(newAccount), mode: "onTouched", defaultValues: { name: "", password: "" } });

  async function accept(body: Partial<NewAccount>) {
    setError(null);
    setBusy(true);
    try {
      await api.post("/api/v1/invitations/accept", { token, ...body });
      router.replace("/wb");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.problem.title) : "没有接受成功，请重试。");
      setBusy(false);
    }
  }

  /** 用邀请邮箱登录：当前登录的是别的账号时先退出，登录页预填邀请邮箱，登录后回到这里 */
  async function loginAs(email: string, signOutFirst: boolean) {
    setError(null);
    setBusy(true);
    try {
      if (signOutFirst) await api.post("/api/auth/sign-out", {});
      router.push(`/login?next=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(email)}`);
    } catch (e) {
      setError(e instanceof ApiError ? (e.problem.detail ?? e.problem.title) : "没有退出成功，请重试。");
      setBusy(false);
    }
  }

  if (preview.isPending) return <LoadingRows rows={3} />;
  if (preview.isError) {
    const code = preview.error instanceof ApiError ? (preview.error.problem.code ?? "invalid") : "invalid";
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">邀请不可用</h1>
        <p className="text-sm text-muted-foreground">{EXPIRED_TEXT[code] ?? EXPIRED_TEXT.invalid}</p>
        {session.isPending ? null : (
          <Button asChild variant="outline">
            {session.data ? <Link href="/wb">进入工作台</Link> : <Link href="/login">去登录</Link>}
          </Button>
        )}
      </div>
    );
  }
  const p = preview.data;
  const facts = (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">加入「{p.merchantName}」</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {p.inviterName ? `${p.inviterName} 邀请你` : "你被邀请"}以{ROLE_LABEL[p.role]}身份加入
        {p.shopNames.length ? `，负责 ${p.shopNames.join("、")}` : ""}。邀请邮箱 {p.email}。
      </p>
    </div>
  );

  if (p.accountExists) {
    const sameUser = p.loggedInEmail?.toLowerCase() === p.email.toLowerCase();
    return (
      <div className="flex flex-col gap-5">
        {facts}
        {sameUser ? (
          <Button disabled={busy} onClick={() => accept({})}>
            {busy && <Spinner />}
            接受邀请
          </Button>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {p.loggedInEmail ? `当前登录的是 ${p.loggedInEmail}，与邀请邮箱不一致。需要先退出，再用 ${p.email} 登录，登录后会回到这里。` : `这个邮箱已有 Shopilot 账号，请先用 ${p.email} 登录，登录后会回到这里。`}
            </p>
            <Button disabled={busy} onClick={() => loginAs(p.email, Boolean(p.loggedInEmail))}>
              {busy && <Spinner />}
              {p.loggedInEmail ? `退出并用 ${p.email} 登录` : `用 ${p.email} 登录`}
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit((v) => accept(v))} noValidate className="flex flex-col gap-5">
      {facts}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">邮箱</FieldLabel>
          <Input id="email" value={p.email} readOnly autoComplete="email" className="bg-muted text-muted-foreground" />
          <FieldDescription>账号邮箱就是邀请邮箱，不能修改。</FieldDescription>
        </Field>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="name">你的姓名</FieldLabel>
              <Input {...field} id="name" autoComplete="name" aria-invalid={fieldState.invalid} />
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="password">设置密码</FieldLabel>
              <PasswordInput {...field} id="password" autoComplete="new-password" aria-invalid={fieldState.invalid} aria-describedby={fieldState.error ? "password-error" : "password-hint"} />
              {fieldState.error ? <FieldError id="password-error">{fieldState.error.message}</FieldError> : <FieldDescription id="password-hint">至少 10 位</FieldDescription>}
            </Field>
          )}
        />
      </FieldGroup>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy && <Spinner />}
        创建账号并加入
      </Button>
    </form>
  );
}
