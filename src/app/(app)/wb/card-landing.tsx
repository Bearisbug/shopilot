"use client";

// 飞书卡片落地（/wb/<会话>?claim=1&m=<商户>，或只带 m 的「打开会话」）：当前商户不是 m 时先切过去（本人须是 m 的启用成员），
// 再按会话状态处理认领；处理完用 replace 去掉 claim 与 m，刷新不会重复认领。
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import { ErrorState, LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useMe } from "@/hooks/use-me";
import { api, ApiError, errorText } from "@/lib/api";
import { focusReply, rememberClaimLost, useConversation, useWbParams } from "./wb-shared";

export function CardLanding({ id, children }: { id: string; children: React.ReactNode }) {
  const { params } = useWbParams();
  const m = params.get("m");
  const me = useMe();
  // 落地参数在首次渲染时记下：处理完会从地址里去掉，认领请求仍要跑完
  const [arrival] = useState(() => (m ? { claim: params.get("claim") === "1" } : null));
  if (!m || me.data?.active.merchantId === m) {
    return (
      <>
        {children}
        {arrival && <ArrivalClaim id={id} claim={arrival.claim} />}
      </>
    );
  }
  if (me.isPending) return <PaneShell><LoadingRows rows={6} /></PaneShell>;
  if (me.isError) return <PaneShell><ErrorState error={me.error} onRetry={() => me.refetch()} /></PaneShell>;
  const member = me.data.memberships.find((x) => x.merchantId === m && x.status === "active");
  if (!member) return <NotMember />;
  return <SwitchMerchant merchantId={m} merchantName={member.merchantName} />;
}

function PaneShell({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return <section className={center ? "flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center rounded-xl bg-card p-6" : "flex min-h-0 min-w-0 flex-1 flex-col rounded-xl bg-card p-4"}>{children}</section>;
}

function BackToList() {
  return (
    <Button asChild variant="outline" size="sm" className="mt-2">
      <Link href="/wb">回到会话列表</Link>
    </Button>
  );
}

function NotMember({ reason }: { reason?: string }) {
  return (
    <PaneShell center>
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium">看不到这个会话</p>
        <p className="text-sm text-muted-foreground">{reason ?? "这个会话属于你没有加入（或已被停用）的商户。需要处理时，请该商户的管理员在「团队与权限」邀请你。"}</p>
        <BackToList />
      </div>
    </PaneShell>
  );
}

/** 切到卡片所属的商户：换掉 me，其余数据（会话列表、导航计数）按新商户重取 */
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
    <PaneShell center>
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        正在切换到「{merchantName}」
      </p>
    </PaneShell>
  );
}

/** 会话读到后按状态处理一次：待认领就带版本认领；本人已认领直接打开；别人已认领、已结束只提示 */
function ArrivalClaim({ id, claim }: { id: string; claim: boolean }) {
  const q = useConversation(id);
  const me = useMe();
  const qc = useQueryClient();
  const { set } = useWbParams();
  const done = useRef(false);
  const doClaim = useMutation({
    mutationFn: (version: number | undefined) => api.post(`/api/v1/conversations/${id}/claim`, version ? { version } : {}),
    onSuccess: () => {
      toast.success("已认领");
      focusReply();
    },
    onError: (e) => {
      rememberClaimLost(qc, id, e);
      const by = e instanceof ApiError && e.status === 409 ? (e.problem.extra?.claimedBy as { name?: string } | undefined)?.name : undefined;
      if (by) toast.info(`已由 ${by} 认领`);
      // 看不到的会话：对话栏已经说明，不再弹提示
      else if (!(e instanceof ApiError && e.status === 404)) toast.error("没有认领成功", { description: errorText(e) });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["conversation", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["nav-summary"] });
    },
  });

  useEffect(() => {
    if (done.current || q.isPending || !me.data) return;
    done.current = true;
    set({ claim: null, m: null });
    if (!claim) return;
    const d = q.data;
    if (d) {
      const c = d.conversation;
      const mine = c.handlingState === "human" && c.claimedBy?.id === me.data.active.membershipId;
      if (c.handlingState === "awaiting_human" && d.permissions.canClaim) doClaim.mutate(c.version);
      else if (c.handlingState === "human" && !mine) toast.info(c.claimedBy ? `已由 ${c.claimedBy.name} 认领` : "平台后台已有人在处理这个会话");
      else if (c.handlingState === "closed") toast.info("会话已经结束");
    } else if (q.error instanceof ApiError && q.error.status === 404) {
      // 员工看不到同事处理中的会话：认领接口在负责店铺内会回 409 并带上处理人
      doClaim.mutate(undefined);
    }
  }, [q.isPending, q.data, q.error, me.data, claim, set, doClaim]);
  return null;
}
