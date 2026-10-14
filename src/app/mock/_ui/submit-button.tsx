"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** 表单提交按钮：提交中禁用并显示转圈；name/value 随提交一起带上，用来区分同一表单里的多个动作。 */
export function SubmitButton({ children, variant, name, value }: { children: React.ReactNode; variant?: "default" | "outline" | "ghost" | "destructive"; name?: string; value?: string }) {
  const { pending, data } = useFormStatus();
  const mine = pending && (!name || data?.get(name) === value);
  return (
    <Button type="submit" variant={variant} name={name} value={value} disabled={pending}>
      {mine && <Spinner />}
      {children}
    </Button>
  );
}
