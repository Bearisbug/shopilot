"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOutIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { AcceptOwnershipResult, OwnershipPreview } from "@/contracts/settings";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, api, errorText } from "@/lib/api";
import { inTz } from "@/lib/format";

const GONE_TEXT: Record<Exclude<OwnershipPreview["state"], "ok" | "not_recipient">, string> = {
  expired: "转让链接已过期（7 天有效）。请联系账号所有者重新发起转让。",
  used: "这个转让已经确认过了。",
  revoked: "这个链接已作废：所有者之后又发起了新的转让，请打开最新邮件里的链接。",
  invalid: "链接无效，请检查邮件里的链接是否完整。",
  not_allowed: "你已不是这个商户启用中的管理员，不能接受所有权。",
};

export function OwnershipClient({ token, preview, account }: { token: string; preview: OwnershipPreview; account: { name: string; email: string } }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const accept = useMutation({
    mutationFn: () => api.post<AcceptOwnershipResult>("/api/v1/ownership-transfers/accept", { token }),
    onSuccess: (r) => {
      qc.clear();
      toast.success(`你已成为「${r.merchantName}」的账号所有者`);
      router.replace("/settings");
    },
    onError: (e) => setError(e instanceof ApiError ? (e.problem.detail ?? e.problem.title) : errorText(e)),
  });
  const signOut = useMutation({
    mutationFn: () => api.post("/api/auth/sign-out", {}),
    onSuccess: () => {
      qc.clear();
      router.replace(`/login?next=${encodeURIComponent(`/ownership/${token}`)}`);
    },
    onError: (e) => toast.error(errorText(e)),
  });

  if (preview.state === "ok") {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">接受账号所有权</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {preview.fromName} 想把「{preview.merchantName}」的账号所有权转给你。
          </p>
        </div>
        <ul className="flex flex-col gap-2 text-sm">
          <li>确认后你可以改套餐、改付款方式、转让所有权、删除商户。</li>
          <li>{preview.fromName} 保留管理员身份，你的角色仍是管理员。</li>
          <li className="text-muted-foreground tabular-nums">链接有效期至 {inTz(preview.expiresAt, preview.timezone, "yyyy-MM-dd HH:mm")}（{preview.timezone}）</li>
        </ul>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Button size="lg" disabled={accept.isPending} onClick={() => accept.mutate()}>
            {accept.isPending && <Spinner />}
            确认接受
          </Button>
          <Button asChild variant="ghost">
            <Link href="/wb">暂不处理</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (preview.state === "not_recipient") {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">登录账号不是受让人</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            这个链接是发给 {preview.toName} 的，当前登录的是 {account.name}（{account.email}）。请退出后用受让人的账号登录，再打开这个链接。
          </p>
        </div>
        <Button size="lg" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
          {signOut.isPending ? <Spinner /> : <LogOutIcon />}
          退出并换账号登录
        </Button>
        <Button asChild variant="ghost">
          <Link href="/wb">回工作台</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">链接已失效</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {preview.merchantName ? `「${preview.merchantName}」的所有权转让：` : ""}
          {GONE_TEXT[preview.state]}
        </p>
      </div>
      <Button asChild variant="outline" size="lg">
        <Link href="/wb">回工作台</Link>
      </Button>
    </div>
  );
}
