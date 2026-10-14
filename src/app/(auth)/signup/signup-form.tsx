"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { signupBody, type SignupBody } from "@/contracts/auth";
import { TIMEZONES } from "@/contracts/common";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, api } from "@/lib/api";
import { TIMEZONE_LABEL } from "@/lib/format";

export function SignupForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignupBody>({
    resolver: zodResolver(signupBody),
    mode: "onTouched",
    defaultValues: { email: "", password: "", name: "", merchantName: "", timezone: "Asia/Kuala_Lumpur" },
  });

  async function onSubmit(values: SignupBody) {
    setFormError(null);
    try {
      await api.post("/api/v1/signup", values);
      router.replace("/shops/connect");
    } catch (e) {
      if (e instanceof ApiError && e.type === "duplicate") form.setError("email", { type: "duplicate", message: "这个邮箱已经注册过，请直接登录。" }, { shouldFocus: true });
      else setFormError(e instanceof ApiError ? (e.problem.detail ?? e.problem.title) : "注册没有成功，请重试。");
    }
  }

  const text = (name: "email" | "name" | "merchantName", label: string, opts: { type?: string; autoComplete: string; placeholder?: string }) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Input {...field} id={name} type={opts.type ?? "text"} autoComplete={opts.autoComplete} placeholder={opts.placeholder} aria-invalid={fieldState.invalid} />
          {fieldState.error && (
            <FieldError>
              {fieldState.error.message}
              {fieldState.error.type === "duplicate" && (
                <Link href={`/login?email=${encodeURIComponent(field.value)}`} className="focus-ring ml-1 rounded-sm font-medium text-(--semantic-color-text-link)">
                  去登录
                </Link>
              )}
            </FieldError>
          )}
        </Field>
      )}
    />
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">注册商户</h1>
        <p className="mt-1 text-sm text-muted-foreground">注册人成为商户的管理员和账号所有者，下一步接入店铺。</p>
      </div>
      <FieldGroup>
        {text("email", "工作邮箱", { type: "email", autoComplete: "email" })}
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="password">密码</FieldLabel>
              <PasswordInput {...field} id="password" autoComplete="new-password" aria-invalid={fieldState.invalid} aria-describedby={fieldState.error ? "password-error" : "password-hint"} />
              {fieldState.error ? <FieldError id="password-error">{fieldState.error.message}</FieldError> : <FieldDescription id="password-hint">至少 10 位</FieldDescription>}
            </Field>
          )}
        />
        {text("name", "你的姓名", { autoComplete: "name" })}
        {text("merchantName", "商户名", { autoComplete: "organization", placeholder: "公司或店铺品牌名" })}
        <Controller
          name="timezone"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="timezone">商户时区</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="timezone" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {TIMEZONE_LABEL[tz]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>用于看板切日与接待时间，之后可在商户设置里改。</FieldDescription>
            </Field>
          )}
        />
      </FieldGroup>
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Spinner />}创建商户
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        已有账号？
        <Link href="/login" className="focus-ring rounded-sm font-medium text-(--semantic-color-text-link)">
          登录
        </Link>
      </p>
    </form>
  );
}
