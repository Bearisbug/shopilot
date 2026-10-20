"use client";

// 飞书工单卡落地（/tickets/<工单>?m=<商户>）：当前商户不是 m 时先切过去（本人须是 m 的启用成员），切好后去掉 m 再显示工单；
// 做法同会话卡片的落地（wb/card-landing.tsx）。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LockIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import { EmptyState, ErrorState, LoadingRows, PageScroll } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useMe } from "@/hooks/use-me";
import { api, errorText } from "@/lib/api";

export function MerchantLanding({ children }: { children: React.ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const m = params.get("m");
  const me = useMe();
  const matched = !!m && me.data?.active.merchantId === m;
  // 已在 m 对应的商户：去掉 m，刷新与复制链接不再带它
  useEffect(() => {
    if (!matched) return;
    const next = new URLSearchParams(params.toString());
    next.delete("m");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [matched, params, pathname, router]);

  if (!m || matched) return <>{children}</>;
  if (me.isPending) {
    return (
      <PageScroll>
        <LoadingRows rows={8} />
      </PageScroll>
    );
  }
  if (me.isError) {
    return (
      <PageScroll>
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </PageScroll>
    );
  }
  const member = me.data.memberships.find((x) => x.merchantId === m && x.status === "active");
  if (!member) return <NotMember />;
  return <SwitchMerchant merchantId={m} merchantName={member.merchantName} />;
}

function NotMember({ reason }: { reason?: string }) {
  return (
    <PageScroll>
      <EmptyState
        icon={LockIcon}
        title="看不到这张工单"
        description={reason ?? "这张工单属于你没有加入（或已被停用）的商户。需要处理时，请该商户的管理员在「团队与权限」邀请你。"}
        action={
          <Button asChild variant="outline">
            <Link href="/tickets">返回工单列表</Link>
          </Button>
        }
      />
    </PageScroll>
  );
}

/** 切到卡片所属的商户：换掉 me，其余数据（工单、导航计数）按新商户重取 */
function SwitchMerchant({ merchantId, merchantName }: { merchantId: string; merchantName: string }) {
  const qc = useQueryClient();
  const started = useRef(false);
  const switching = useMutation({
    mutationFn: () => api.post<Me>("/api/v1/me/active-merchant", { merchantId }),
    onSuccess: (next) => {
      qc.setQueryData(["me"], next);
      qc.resetQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      toast.success(`已切换到「${next.active.merchantName}」`);
    },
  });
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    switching.mutate();
  }, [switching]);
  if (switching.isError) return <NotMember reason={errorText(switching.error)} />;
  return (
    <PageScroll>
      <p role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner />
        正在切换到「{merchantName}」
      </p>
    </PageScroll>
  );
}
