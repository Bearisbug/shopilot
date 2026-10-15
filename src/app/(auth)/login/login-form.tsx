"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { Me } from "@/contracts/auth";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, api } from "@/lib/api";

const schema = z.object({
  email: z.string().trim().email("请输入正确的邮箱"),
  password: z.string().min(1, "请输入密码"),
  rememberMe: z.boolean(),
});
type Values = z.infer<typeof schema>;

function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/wb";
}

function lockFor(email: string, seconds: number) {
  const at = Date.now();
  return { email: email.trim().toLowerCase(), at, until: at + seconds * 1000 };
}

function mmss(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function LoginForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState<"password" | "totp">("password");
  // 两步验证：验证器的 6 位码，或开启时保存的备用码（每个只能用一次）
  const [method, setMethod] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  // 连续输错被锁定（423）：按服务端给的剩余秒数倒计时，只锁这一个邮箱
  const [lock, setLock] = useState<{ email: string; until: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: params.get("email") ?? "", password: "", rememberMe: true } });
  const email = useWatch({ control: form.control, name: "email" });
  const lockLeft = lock && lock.email === email.trim().toLowerCase() ? (lock.until - now) / 1000 : 0;
  const locked = lockLeft > 0;

  useEffect(() => {
    if (!lock) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= lock.until) setLock(null);
    }, 1000);
    return () => clearInterval(t);
  }, [lock]);

  async function afterLogin() {
    // 身份变了：清掉登录前缓存的数据（如邀请页「请先登录」的预览），回跳后的页面重新取数
    qc.clear();
    const me = await api.get<Me>("/api/v1/me");
    const next = safeNext(params.get("next"));
    // 商户要求先开两步验证：带上原目标，开好后回到那里（如飞书卡片的认领链接）
    router.replace(me.twoFactorRequired ? `/account/security?next=${encodeURIComponent(next)}` : next);
  }

  async function onSubmit(values: Values) {
    setFormError(null);
    setBusy(true);
    try {
      const res = await api.post<{ twoFactorRedirect?: boolean }>("/api/auth/sign-in/email", values);
      if (res.twoFactorRedirect) {
        setCode("");
        setMethod("totp");
        setStep("totp");
        return;
      }
      await afterLogin();
    } catch (e) {
      const retryAfter = e instanceof ApiError && e.type === "locked" ? Number(e.problem.extra?.retryAfter) : 0;
      if (retryAfter > 0) {
        const l = lockFor(values.email, retryAfter);
        setNow(l.at);
        setLock({ email: l.email, until: l.until });
        setFormError("连续输错密码次数过多，这个账号暂时不能登录。忘了密码可以先点「忘记密码」重置。");
      } else {
        setFormError(e instanceof ApiError ? (e.problem.detail ?? e.problem.title) : "登录没有成功，请重试。");
      }
    } finally {
      setBusy(false);
    }
  }

  async function verifySecondFactor(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      if (method === "backup") await api.post("/api/auth/two-factor/verify-backup-code", { code: code.trim(), trustDevice: false });
      else await api.post("/api/auth/two-factor/verify-totp", { code, trustDevice: false });
      await afterLogin();
    } catch (err) {
      const fallback = method === "backup" ? "备用码不正确或已经用过。" : "验证码不正确。";
      // 认证服务对备用码错误只回英文原文（invalid_backup_code），这里换成中文说明
      const badBackup = err instanceof ApiError && method === "backup" && err.problem.code === "invalid_backup_code";
      setFormError(err instanceof ApiError ? (badBackup ? fallback : (err.problem.detail ?? fallback)) : "验证没有成功，请重试。");
    } finally {
      setBusy(false);
    }
  }

  function switchMethod() {
    setMethod((m) => (m === "totp" ? "backup" : "totp"));
    setCode("");
    setFormError(null);
  }

  function backToPassword() {
    setStep("password");
    setCode("");
    setFormError(null);
    form.setValue("password", "");
  }

  async function forgot() {
    const ok = await form.trigger("email");
    if (!ok) return;
    const email = form.getValues("email");
    try {
      await api.post("/api/v1/password/forgot", { email });
      toast.success(`如果 ${email} 已注册，重置链接已发到这个邮箱，30 分钟内有效。`);
    } catch (e) {
      toast.error(e instanceof ApiError ? (e.problem.detail ?? e.problem.title) : "发送没有成功，请重试。");
    }
  }

  if (step === "totp") {
    const backup = method === "backup";
    return (
      <form onSubmit={verifySecondFactor} noValidate className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">两步验证</h1>
          <p className="mt-1 text-sm text-muted-foreground">{backup ? "输入开启两步验证时保存的备用码，每个备用码只能用一次。" : "打开验证器 App，输入 6 位验证码。"}</p>
        </div>
        <Field>
          <FieldLabel htmlFor="totp">{backup ? "备用码" : "验证码"}</FieldLabel>
          {backup ? (
            <Input key="backup" id="totp" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="例如 Ab1cD-2eF3g" value={code} onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))} autoFocus />
          ) : (
            <Input key="totp" id="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
          )}
        </Field>
        {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
        <Button type="submit" size="lg" disabled={busy || (backup ? code.length === 0 : code.length !== 6)}>
          {busy && <Spinner />}验证并登录
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <Button type="button" variant="link" onClick={backToPassword}>
            返回重新输入密码
          </Button>
          <Button type="button" variant="link" onClick={switchMethod}>
            {backup ? "改用验证器验证码" : "手机不在身边？改用备用码"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">登录 Shopilot</h1>
        <p className="mt-1 text-sm text-muted-foreground">多商户聚合客服</p>
      </div>
      {params.get("reset") === "done" ? (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
          密码已重置，其他设备上的登录已全部退出。请用新密码登录。
        </p>
      ) : params.get("reason") === "expired" ? (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
          登录已失效或已在其他设备退出，请重新登录。
        </p>
      ) : null}
      <FieldGroup>
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="email">邮箱</FieldLabel>
              <Input {...field} id="email" type="email" autoComplete="email" placeholder="工作邮箱" aria-invalid={fieldState.invalid} />
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="password">密码</FieldLabel>
              <PasswordInput {...field} id="password" autoComplete="current-password" aria-invalid={fieldState.invalid} />
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </Field>
          )}
        />
        <div className="flex items-center justify-between">
          <Controller
            name="rememberMe"
            control={form.control}
            render={({ field }) => (
              <label className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />7 天内保持登录
              </label>
            )}
          />
          <Button type="button" variant="link" onClick={forgot}>
            忘记密码
          </Button>
        </div>
      </FieldGroup>
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      <Button type="submit" size="lg" disabled={busy || locked}>
        {busy && <Spinner />}
        {locked ? `登录（${mmss(lockLeft)} 后可再试）` : "登录"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        还没有商户？
        <Link href="/signup" className="focus-ring rounded-sm font-medium text-(--semantic-color-text-link)">
          注册商户
        </Link>
      </p>
    </form>
  );
}
