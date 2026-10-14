"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zPassword } from "@/contracts/common";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, api } from "@/lib/api";

const schema = z
  .object({ password: zPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "两次输入的密码不一致", path: ["confirm"] });
type Values = z.infer<typeof schema>;

// PAGE-RESET：令牌 30 分钟、一次性；成功后其他会话全部退出（API-AUTH-005）
export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<"form" | "used" | "expired">(token ? "form" : "expired");
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: { password: "", confirm: "" } });

  async function onSubmit(v: Values) {
    setFormError(null);
    try {
      await api.post("/api/v1/password/reset", { token, newPassword: v.password });
      router.replace("/login?reset=done");
    } catch (e) {
      if (e instanceof ApiError && e.status === 410) setState(e.problem.code === "used" ? "used" : "expired");
      // 令牌格式不对（被截断、手改）也是链接坏了，按失效处理；页面上没有令牌字段可标红
      else if (e instanceof ApiError && e.status === 422 && (e.problem.extra?.fields as Record<string, string> | undefined)?.token) setState("expired");
      else setFormError(e instanceof ApiError ? (e.problem.detail ?? e.problem.title) : "没有设置成功，请重试。");
    }
  }

  if (state === "expired") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">链接已失效</h1>
        <p className="text-sm text-muted-foreground">重置密码的链接 30 分钟内有效、只能用一次。请回到登录页点「忘记密码」重新申请。</p>
        <Button asChild variant="outline">
          <Link href="/login">回到登录</Link>
        </Button>
      </div>
    );
  }
  if (state === "used") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">链接已使用</h1>
        <p className="text-sm text-muted-foreground">这个重置链接已经用来设置过新密码。如需再次修改，请回到登录页点「忘记密码」重新申请。</p>
        <Button asChild variant="outline">
          <Link href="/login">回到登录</Link>
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">设置新密码</h1>
        <p className="mt-1 text-sm text-muted-foreground">设置后，其他设备上的登录会全部退出。</p>
      </div>
      <FieldGroup>
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="password">新密码</FieldLabel>
              <PasswordInput {...field} id="password" autoComplete="new-password" aria-invalid={fieldState.invalid} aria-describedby={fieldState.error ? "password-error" : "password-hint"} />
              {fieldState.error ? <FieldError id="password-error">{fieldState.error.message}</FieldError> : <FieldDescription id="password-hint">至少 10 位</FieldDescription>}
            </Field>
          )}
        />
        <Controller
          name="confirm"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="confirm">再输一次</FieldLabel>
              <PasswordInput {...field} id="confirm" autoComplete="new-password" aria-invalid={fieldState.invalid} />
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </Field>
          )}
        />
      </FieldGroup>
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Spinner />}
        保存新密码
      </Button>
    </form>
  );
}
