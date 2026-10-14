"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, LogInIcon, PlusIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import type { SecurityPolicyView } from "@/contracts/settings";
import type { MembersResponse } from "@/contracts/team";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageActions } from "@/components/shell/app-shell";
import { ErrorState, LoadingRows, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, errorText } from "@/lib/api";
import { setFlash } from "@/lib/flash";
import { ROLE_LABEL } from "@/lib/permissions";
import { SettingsFrame } from "../settings-frame";

const HOURS = [
  { value: 8, label: "8 小时" },
  { value: 12, label: "12 小时" },
  { value: 24, label: "24 小时" },
  { value: 168, label: "7 天" },
] as const;

function factsOf(p: SecurityPolicyView) {
  const twoFa = p.requireTwoFactorAll ? "全员必须两步验证" : p.requireTwoFactorAdmins ? "管理员必须两步验证" : "两步验证不强制";
  return `${twoFa} · 登录有效期 ${HOURS.find((h) => h.value === p.sessionMaxHours)?.label ?? `${p.sessionMaxHours} 小时`} · IP 限制${p.ipRestrictionOn ? `开（${p.ipAllowlist.length} 条）` : "关"}`;
}

export function SecurityClient({ me }: { me: Me }) {
  const policy = useQuery({ queryKey: ["security-policy"], queryFn: () => api.get<SecurityPolicyView>("/api/v1/security-policy") });
  return (
    <SettingsFrame me={me} facts={policy.data ? factsOf(policy.data) : undefined}>
      <TwoFactorOverview />
      {policy.isError ? (
        <Panel>
          <ErrorState error={policy.error} onRetry={() => policy.refetch()} />
        </Panel>
      ) : !policy.data ? (
        <Panel>
          <LoadingRows rows={5} />
        </Panel>
      ) : (
        <PolicyEditor key={JSON.stringify(policy.data)} me={me} saved={policy.data} />
      )}
    </SettingsFrame>
  );
}

function useMembers() {
  return useQuery({
    queryKey: ["members", "week", "all", "all"],
    queryFn: () => api.get<MembersResponse>("/api/v1/members?period=week&role=all&status=all"),
  });
}

function TwoFactorOverview() {
  const members = useMembers();
  const active = (members.data?.members ?? []).filter((m) => m.status === "active");
  const missing = active.filter((m) => !m.twoFactorEnabled);
  return (
    <Panel className="grid grid-cols-1 gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h2 className="text-lg font-semibold">两步验证</h2>
        {members.isPending ? (
          <LoadingRows rows={1} />
        ) : members.isError ? (
          <p className="mt-2 text-sm text-muted-foreground">成员情况没有加载出来。</p>
        ) : (
          <>
            <p className="mt-2 text-[1.875rem] leading-tight font-semibold tabular-nums">
              {active.length - missing.length} / {active.length}
            </p>
            <p className="text-sm text-muted-foreground">名启用成员已开启</p>
          </>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/team?dialog=logins">
              <LogInIcon />
              登录记录
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/account/security">
              <ShieldCheckIcon />
              我的两步验证与设备
            </Link>
          </Button>
        </div>
      </div>
      <div className="min-w-0">
        <p className="mb-2 text-sm text-muted-foreground">未开启的启用成员</p>
        {members.data && missing.length === 0 ? (
          <p className="text-sm">全部启用成员都已开启。</p>
        ) : (
          <ul className="flex flex-col">
            {missing.map((m) => (
              <li key={m.membershipId} className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{m.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {ROLE_LABEL[m.role]}
                  {m.isOwner ? " · 账号所有者" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function SettingRow({ title, desc, children }: { title: string; desc: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-pretty text-muted-foreground">{desc}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function PolicyEditor({ me, saved }: { me: Me; saved: SecurityPolicyView }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [p, setP] = useState(saved);
  const [listText, setListText] = useState(saved.ipAllowlist.join("\n"));
  const [ipError, setIpError] = useState<{ text: string; currentIp?: string } | null>(null);
  const list = listText.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean);
  const next: SecurityPolicyView = { ...p, ipAllowlist: list };
  const dirty = JSON.stringify(next) !== JSON.stringify(saved);
  const selfAffected = !me.user.twoFactorEnabled && ((next.requireTwoFactorAdmins && !saved.requireTwoFactorAdmins) || (next.requireTwoFactorAll && !saved.requireTwoFactorAll));
  // 收紧两步验证要求时先确认：列出保存后会被拦到账号安全页的人
  const members = useMembers();
  const tightenAll = next.requireTwoFactorAll && !saved.requireTwoFactorAll;
  const tightening = tightenAll || (next.requireTwoFactorAdmins && !saved.requireTwoFactorAdmins);
  const affected = (members.data?.members ?? []).filter((m) => m.status === "active" && !m.twoFactorEnabled && (tightenAll || m.role === "admin"));
  const [confirming, setConfirming] = useState(false);

  const save = useMutation({
    mutationFn: () => api.put<SecurityPolicyView>("/api/v1/security-policy", next),
    onSuccess: (r) => {
      setConfirming(false);
      qc.setQueryData(["security-policy"], r);
      if (selfAffected) {
        // 自己也被要求开启两步验证：马上会被带到账号安全页（可能是整页跳转），提示交给那一页显示
        setFlash("安全策略已保存。你自己也需要先开启两步验证，开启前其他页面暂时不能使用。");
        router.replace("/account/security");
        qc.invalidateQueries({ queryKey: ["me"] });
        return;
      }
      toast.success("安全策略已保存，成员下一次请求起按新策略检查");
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => {
      setConfirming(false);
      if (e instanceof ApiError && e.status === 422) {
        const fields = e.problem.extra?.fields as Record<string, string> | undefined;
        const currentIp = e.problem.extra?.currentIp as string | undefined;
        setIpError({ text: e.problem.detail ?? fields?.ipAllowlist ?? "白名单有误", currentIp });
        return;
      }
      toast.error(errorText(e));
    },
  });

  return (
    <>
      <PageActions>
        <Button disabled={!dirty || save.isPending} onClick={() => (tightening ? setConfirming(true) : save.mutate())}>
          {save.isPending ? <Spinner /> : <CheckIcon />}
          保存
        </Button>
      </PageActions>
      <Panel>
        <PanelHeader title="登录策略" description="对整个商户生效" />
        <SettingRow
          title="管理员必须开启两步验证"
          desc={
            <>
              含账号所有者；未开启的管理员登录后只能先去开启
              {selfAffected && next.requireTwoFactorAdmins ? "。你自己还没开启，保存后会先被带到账号安全页" : ""}
            </>
          }
        >
          <Switch checked={p.requireTwoFactorAdmins} onCheckedChange={(v) => setP({ ...p, requireTwoFactorAdmins: v })} aria-label="管理员必须开启两步验证" />
        </SettingRow>
        <Separator />
        <SettingRow title="全员必须开启两步验证" desc="组长、员工也要开启；未开启的成员登录后只能先去开启">
          <Switch checked={p.requireTwoFactorAll} onCheckedChange={(v) => setP({ ...p, requireTwoFactorAll: v })} aria-label="全员必须开启两步验证" />
        </SettingRow>
        <Separator />
        <SettingRow title="登录有效期" desc="从登录起算，超过后需要重新登录">
          <Select value={String(p.sessionMaxHours)} onValueChange={(v) => setP({ ...p, sessionMaxHours: Number(v) as SecurityPolicyView["sessionMaxHours"] })}>
            <SelectTrigger className="w-32" aria-label="登录有效期">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h.value} value={String(h.value)}>
                  {h.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <Separator />
        <SettingRow title="连续输错密码锁定" desc="同一邮箱 15 分钟内输错 10 次，锁定 15 分钟">
          <span className="text-sm text-muted-foreground">固定</span>
        </SettingRow>
      </Panel>
      <Panel>
        <PanelHeader title="IP 限制" description="只允许白名单里的 IP 使用 Shopilot；与平台开放平台的 IP 白名单无关">
          <Switch
            checked={p.ipRestrictionOn}
            onCheckedChange={(v) => {
              setP({ ...p, ipRestrictionOn: v });
              setIpError(null);
            }}
            aria-label="开启 IP 限制"
          />
        </PanelHeader>
        <label htmlFor="ip-allowlist" className="text-sm font-medium">
          白名单
        </label>
        <Textarea
          id="ip-allowlist"
          className="mt-2 font-mono text-sm"
          rows={4}
          value={listText}
          onChange={(e) => {
            setListText(e.target.value);
            setIpError(null);
          }}
          placeholder={"每行一个 IP 或网段，例如\n203.0.113.0/24"}
          aria-invalid={Boolean(ipError)}
          aria-describedby="ip-allowlist-desc"
        />
        <div id="ip-allowlist-desc" className="mt-2 min-h-5">
          {ipError ? (
            <div className="flex flex-wrap items-center gap-2">
              <FieldError>{ipError.text}</FieldError>
              {ipError.currentIp && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setListText((t) => (t.trim() ? `${t.trim()}\n${ipError.currentIp}` : ipError.currentIp!));
                    setIpError(null);
                  }}
                >
                  <PlusIcon />
                  加入当前 IP {ipError.currentIp}
                </Button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">开启前先把你当前的 IP 加进去，否则保存会被拒绝。最多 50 条，支持 IPv4 地址与 CIDR 网段。{list.length ? `当前 ${list.length} 条。` : ""}</p>
          )}
        </div>
      </Panel>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(o) => !save.isPending && setConfirming(o)}
        title={tightenAll ? "要求全员开启两步验证？" : "要求管理员开启两步验证？"}
        desc={
          <div className="flex flex-col gap-2">
            <p>保存后从下一次请求起，没开两步验证的{tightenAll ? "成员" : "管理员"}只能先去「账号安全」开启，开启前打不开其他页面。</p>
            {members.isPending ? (
              <p>正在核对哪些成员会受影响……</p>
            ) : affected.length === 0 ? (
              <p>目前所有{tightenAll ? "启用成员" : "启用管理员"}都已开启，没有人会受影响。</p>
            ) : (
              <p>
                会受影响的 {affected.length} 人：
                {affected.map((m) => (m.userId === me.user.id ? `${m.name}（你）` : m.name)).join("、")}
              </p>
            )}
          </div>
        }
        confirmText="保存"
        pending={save.isPending}
        onConfirm={() => save.mutate()}
      />
    </>
  );
}
