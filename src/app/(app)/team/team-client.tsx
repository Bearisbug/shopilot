"use client";

import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { HeadsetIcon, LogInIcon, MoreHorizontalIcon, ShieldIcon, StoreIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import type { MemberRow, MembersResponse } from "@/contracts/team";
import { BrandChart, stripes, useBrandColors } from "@/components/charts/chart";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageActions } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows, PageHeader, PageScroll, Panel, PanelHeader } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, errorText } from "@/lib/api";
import { duration, inTz, relative } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/permissions";
import { AssignDialog, InviteDialog, LoginsDialog, PermissionsDialog } from "./team-dialogs";

const PERIODS = [
  { value: "week", label: "本周" },
  { value: "last_week", label: "上周" },
  { value: "30d", label: "近 30 天" },
] as const;

function useQueryParam(name: string, fallback: string) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(name) ?? fallback;
  const set = (v: string, mode: "push" | "replace" = "replace") => {
    const next = new URLSearchParams(params.toString());
    if (v === fallback) next.delete(name);
    else next.set(name, v);
    const url = next.toString() ? `${pathname}?${next.toString()}` : pathname;
    if (mode === "push") router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  };
  return [value, set] as const;
}

export function useOpenDialog() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  return (dialog: string, extra: Record<string, string> = {}) => {
    const next = new URLSearchParams(params.toString());
    next.set("dialog", dialog);
    for (const [k, v] of Object.entries(extra)) next.set(k, v);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
}

function shopsText(m: MemberRow, me: Me) {
  if (m.role === "admin") return "全部店铺";
  if (m.shopIds.length === 0) return "未分配";
  const names = me.active.shops.filter((s) => m.shopIds.includes(s.id)).map((s) => s.name);
  return names.length <= 2 ? names.join("、") : `${names.length} 家`;
}

/** 图表横轴放不下全名时截断（CJK 按 12px、其余按 7px 估宽），tooltip 里仍是全名 */
function fitLabel(name: string, room: number) {
  const w = (c: string) => (/[\u2e80-\uffff]/.test(c) ? 12 : 7);
  if ([...name].reduce((n, c) => n + w(c), 0) <= room) return name;
  let out = "";
  let used = 12;
  for (const c of name) {
    if (used + w(c) > room) break;
    out += c;
    used += w(c);
  }
  return `${out.trimEnd()}…`;
}

function statusText(m: MemberRow) {
  if (m.status === "disabled") return <span className="text-muted-foreground">已停用</span>;
  if (m.online)
    return (
      <span className="inline-flex items-center gap-1.5 text-(--semantic-color-feedback-success)">
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
        在线
      </span>
    );
  return <span className="text-muted-foreground">{m.lastSeenAt ? relative(m.lastSeenAt) : "未登录过"}</span>;
}

export function TeamClient({ me }: { me: Me }) {
  const [period, setPeriod] = useQueryParam("period", "week");
  const [role, setRole] = useQueryParam("role", "all");
  const [status, setStatus] = useQueryParam("status", "all");
  const openDialog = useOpenDialog();
  const qc = useQueryClient();
  const colors = useBrandColors();
  const [confirm, setConfirm] = useState<null | { kind: "disable" | "reset" | "revoke"; id: string; name: string }>(null);

  // 只按周期取全量；角色、状态筛选只作用于成员表，页头、角色卡、图表始终是全局值
  const data = useQuery({
    queryKey: ["members", period],
    queryFn: () => api.get<MembersResponse>(`/api/v1/members?period=${period}`),
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["members"] });
    qc.invalidateQueries({ queryKey: ["me"] });
  };
  // 乐观写入新角色，只禁用正在保存的那一行；失败回滚
  const changeRole = useMutation({
    mutationKey: ["member-role"],
    mutationFn: (v: { id: string; name: string; role: Role }) => api.patch(`/api/v1/members/${v.id}`, { role: v.role }),
    onMutate: async (v) => {
      const key = ["members", period];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<MembersResponse>(key);
      if (prev) qc.setQueryData<MembersResponse>(key, { ...prev, members: prev.members.map((m) => (m.membershipId === v.id ? { ...m, role: v.role } : m)) });
      return { key, prev };
    },
    onSuccess: (_r, v) => {
      toast.success(`已把 ${v.name} 改为${ROLE_LABEL[v.role]}，立即生效`);
      invalidate();
    },
    onError: (e, _v, c) => {
      if (c?.prev) qc.setQueryData(c.key, c.prev);
      toast.error(errorText(e));
    },
  });
  const savingRoles = useMutationState({ filters: { mutationKey: ["member-role"], status: "pending" }, select: (m) => (m.state.variables as { id: string }).id });
  const act = useMutation({
    mutationFn: async (v: { kind: "disable" | "enable" | "reset" | "resend" | "revoke"; id: string }) => {
      if (v.kind === "disable") return api.post<{ releasedConversations: number; returnedTickets: number }>(`/api/v1/members/${v.id}/disable`);
      if (v.kind === "enable") return api.post(`/api/v1/members/${v.id}/enable`);
      if (v.kind === "reset") return api.post(`/api/v1/members/${v.id}/reset-password`);
      if (v.kind === "resend") return api.post<{ link: string }>(`/api/v1/invitations/${v.id}/resend`);
      return api.post(`/api/v1/invitations/${v.id}/revoke`);
    },
    onSuccess: (res, v) => {
      const r = res as { releasedConversations?: number; returnedTickets?: number; link?: string };
      if (v.kind === "disable") toast.success(`已停用：${r.releasedConversations ?? 0} 个会话退回待认领，${r.returnedTickets ?? 0} 张工单退回该店组长，没有组长时给账号所有者`);
      if (v.kind === "enable") toast.success("已重新启用，负责店铺保持不变");
      if (v.kind === "reset") toast.success("重置密码链接已发到对方邮箱，30 分钟内有效");
      if (v.kind === "resend") {
        void navigator.clipboard?.writeText(r.link ?? "").catch(() => undefined);
        toast.success("已重发邀请，新链接已复制；旧链接作废");
      }
      if (v.kind === "revoke") toast.success("邀请已撤销");
      setConfirm(null);
      invalidate();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const d = data.data;
  const people = (d?.members ?? []).filter((m) => m.status === "active" && m.role !== "admin" ? true : m.handled.segments > 0).slice(0, 10);
  const roleCounts = { admin: 0, lead: 0, agent: 0 };
  d?.members.forEach((m) => m.status === "active" && (roleCounts[m.role] += 1));
  const pendingInvites = d?.invitations.filter((i) => i.status === "pending").length ?? 0;
  const total = d?.members.reduce((acc, m) => acc + m.handled.segments, 0) ?? 0;
  const shownMembers = (d?.members ?? []).filter((m) => (role === "all" || m.role === role) && (status === "all" || m.status === status));
  const shownInvites = status === "all" || status === "invited" ? (d?.invitations ?? []).filter((i) => role === "all" || i.role === role) : [];
  const periodLabel = PERIODS.find((p) => p.value === period)?.label;

  return (
    <PageScroll>
      <PageActions>
        <Button onClick={() => openDialog("invite")}>
          <UserPlusIcon />
          邀请成员
        </Button>
      </PageActions>
      <PageHeader title="团队与权限" facts={d ? `${d.stats.activeCount} 名成员 · ${pendingInvites} 个邀请待接受 · 席位 ${d.seats.used} / ${d.seats.limit}` : " "} />
      {data.isError ? (
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      ) : !d ? (
        <LoadingRows />
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[1440px]:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_200px]">
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[1.875rem] leading-tight font-semibold tabular-nums">{total}</p>
                    <p className="text-sm text-muted-foreground">{periodLabel}人工处理会话段 · {inTz(d.stats.periodStart, me.active.timezone, "MM-dd")} 起</p>
                  </div>
                  <Select value={period} onValueChange={(v) => setPeriod(v)}>
                    <SelectTrigger size="sm" aria-label="统计周期">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIODS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {people.length === 0 ? (
                  <EmptyState icon={HeadsetIcon} title="这个周期还没有人工处理的会话" description="成员认领并回复会话后，这里按人显示处理量。" />
                ) : (
                  colors && (
                    <div className="mt-4">
                      <BrandChart
                        type="bar"
                        label={`按人统计的人工处理会话段：${people.map((p) => `${p.name} ${p.handled.segments}`).join("，")}`}
                        height={220}
                        data={{
                          labels: people.map((p) => p.name),
                          datasets: [
                            { label: "认领后处理完", data: people.map((p) => Math.max(0, p.handled.segments - p.handled.transferred)), backgroundColor: stripes(colors.link, colors.surface), borderRadius: 6, stack: "s" },
                            { label: "转交他人", data: people.map((p) => p.handled.transferred), backgroundColor: colors.decorative, borderRadius: 6, stack: "s" },
                          ],
                        }}
                        options={{
                          plugins: { legend: { display: true, position: "top", align: "end" } },
                          scales: {
                            x: {
                              stacked: true,
                              grid: { display: false },
                              border: { display: false },
                              ticks: {
                                color: colors.muted,
                                font: { size: 12 },
                                autoSkip: false,
                                maxRotation: 0,
                                callback(_v, i) {
                                  return fitLabel(people[i]?.name ?? "", (this.chart.chartArea?.width ?? this.chart.width) / people.length - 8);
                                },
                              },
                            },
                            y: { stacked: true, beginAtZero: true, grid: { color: colors.border }, border: { display: false }, ticks: { color: colors.muted, font: { size: 12 }, precision: 0 } },
                          },
                        }}
                      />
                    </div>
                  )
                )}
              </div>
              <dl className="flex flex-col gap-5">
                <div>
                  <dt className="text-sm text-muted-foreground">在线</dt>
                  <dd className="text-2xl font-semibold tabular-nums">
                    {d.stats.onlineCount} / {d.stats.activeCount} 人
                  </dd>
                  <dd className="text-xs text-muted-foreground">
                    已启用 {d.stats.activeCount} 人{d.stats.disabledCount ? ` · ${d.stats.disabledCount} 人停用` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">人工首响中位</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{duration(d.stats.firstReplyMedianSec)}</dd>
                  <dd className="text-xs text-muted-foreground">买家等人工到首次人工回复，含平台后台回复，只累计工作时段</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">最长待认领</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{d.stats.longestWaitingSec === null ? "—" : duration(d.stats.longestWaitingSec)}</dd>
                  <dd className="text-xs text-muted-foreground">当前排队最久的会话</dd>
                </div>
              </dl>
            </Panel>

            <Panel>
              <PanelHeader title="成员" description="负责店铺决定组长和员工能看到哪些会话与工单">
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger size="sm" aria-label="按角色筛选">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部角色</SelectItem>
                    <SelectItem value="admin">管理员</SelectItem>
                    <SelectItem value="lead">组长</SelectItem>
                    <SelectItem value="agent">员工</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger size="sm" aria-label="按状态筛选">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="active">已启用</SelectItem>
                    <SelectItem value="invited">待接受</SelectItem>
                    <SelectItem value="disabled">已停用</SelectItem>
                  </SelectContent>
                </Select>
              </PanelHeader>
              {shownMembers.length + shownInvites.length === 0 ? (
                <EmptyState icon={UsersIcon} title="没有符合筛选的成员" action={<Button variant="outline" onClick={() => { setRole("all"); setStatus("all"); }}>清除筛选</Button>} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>成员</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead>负责店铺</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="sticky right-0 w-10 bg-card">
                        <span className="sr-only">操作</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shownMembers.map((m) => (
                      <TableRow key={m.membershipId} className="h-12">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                              {m.name.slice(0, 1)}
                            </span>
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 font-medium">
                                {m.name}
                                {m.isOwner && <Badge className="bg-accent text-(--semantic-color-text-link)">账号所有者</Badge>}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                              <p className="text-xs text-muted-foreground tabular-nums">
                                {periodLabel}处理 {m.handled.segments || "—"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {m.isOwner || m.status === "disabled" ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span tabIndex={0} className="focus-ring rounded-sm">
                                  {ROLE_LABEL[m.role]}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{m.isOwner ? "账号所有者不能改角色、不能停用；要先在商户设置里转让所有权" : "已停用的成员先重新启用再改角色"}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Select value={m.role} onValueChange={(v) => changeRole.mutate({ id: m.membershipId, name: m.name, role: v as Role })} disabled={savingRoles.includes(m.membershipId)}>
                              <SelectTrigger size="sm" aria-label={`${m.name} 的角色`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">管理员</SelectItem>
                                <SelectItem value="lead">组长</SelectItem>
                                <SelectItem value="agent">员工</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        {/* 1024 宽时收窄店铺列，表格不横滚，固定的操作列就不会压住状态列 */}
                        <TableCell className="max-w-36 truncate xl:max-w-56">{shopsText(m, me)}</TableCell>
                        <TableCell className="whitespace-nowrap">{statusText(m)}</TableCell>
                        <TableCell className="sticky right-0 bg-card">
                          {m.isOwner ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-disabled="true" aria-label={`${m.name} 更多操作（不可用：账号所有者不能改角色、不能停用）`}>
                                  <MoreHorizontalIcon />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>账号所有者不能改角色、不能停用；要先在商户设置里转让所有权</TooltipContent>
                            </Tooltip>
                          ) : (
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label={`${m.name} 更多操作`}>
                                  <MoreHorizontalIcon />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {m.role !== "admin" && m.status === "active" && <DropdownMenuItem onSelect={() => openDialog("assign", { member: m.membershipId })}>分配店铺</DropdownMenuItem>}
                                <DropdownMenuItem onSelect={() => setConfirm({ kind: "reset", id: m.membershipId, name: m.name })}>重置密码</DropdownMenuItem>
                                {m.status === "active" ? (
                                  m.membershipId !== me.active.membershipId && (
                                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: "disable", id: m.membershipId, name: m.name })}>
                                      停用
                                    </DropdownMenuItem>
                                  )
                                ) : (
                                  <DropdownMenuItem onSelect={() => act.mutate({ kind: "enable", id: m.membershipId })}>重新启用</DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {shownInvites.map((inv) => (
                      <TableRow key={inv.id} className="h-12">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-input text-xs text-muted-foreground">
                              {inv.email.slice(0, 1)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{inv.email}</p>
                              <p className="text-xs text-muted-foreground">{inv.invitedByName ? `${inv.invitedByName} 邀请` : "邀请"} · {relative(inv.createdAt)}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{ROLE_LABEL[inv.role]}</TableCell>
                        <TableCell>{inv.role === "admin" ? "全部店铺" : inv.shopIds.length ? `${inv.shopIds.length} 家` : "未分配"}</TableCell>
                        <TableCell className="text-muted-foreground">{inv.status === "expired" || new Date(inv.expiresAt) < new Date() ? "邀请已过期" : `待接受 · ${inTz(inv.expiresAt, me.active.timezone, "MM-dd")} 到期`}</TableCell>
                        <TableCell className="sticky right-0 bg-card">
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`${inv.email} 邀请操作`}>
                                <MoreHorizontalIcon />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => act.mutate({ kind: "resend", id: inv.id })}>重发邀请</DropdownMenuItem>
                              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: "revoke", id: inv.id, name: inv.email })}>
                                撤销邀请
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <Panel>
              <PanelHeader title="角色" description={`${d.stats.activeCount} 人 + ${pendingInvites} 个邀请 · 改角色立即生效并留痕`}>
                <Button variant="outline" size="sm" onClick={() => openDialog("permissions")}>
                  权限表
                </Button>
              </PanelHeader>
              <ul className="flex flex-col">
                {(
                  [
                    { role: "admin", icon: ShieldIcon, desc: "全部店铺与配置 · 含账号所有者" },
                    { role: "lead", icon: UsersIcon, desc: "负责店铺的会话、工单、看板" },
                    { role: "agent", icon: HeadsetIcon, desc: "负责店铺的会话与指派的工单" },
                  ] as const
                ).map((r) => (
                  <li key={r.role} className="flex items-center gap-3 border-b border-border py-3 last:border-0">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                      <r.icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{ROLE_LABEL[r.role]}</span>
                      <span className="block text-xs text-muted-foreground">{r.desc}</span>
                    </span>
                    <span className="text-sm tabular-nums">{roleCounts[r.role]} 人</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { label: "邀请", icon: UserPlusIcon, on: () => openDialog("invite") },
                  { label: "分配店铺", icon: StoreIcon, on: () => openDialog("assign") },
                  { label: "登录记录", icon: LogInIcon, on: () => openDialog("logins") },
                ].map((a) => (
                  <button key={a.label} type="button" onClick={a.on} className="state-layer focus-ring flex flex-col items-center gap-1.5 rounded-md py-2 text-xs">
                    <span className="flex size-11 items-center justify-center rounded-md border border-border">
                      <a.icon className="size-5" />
                    </span>
                    {a.label}
                  </button>
                ))}
              </div>
            </Panel>
            <Panel>
              <PanelHeader title="最近操作" description="团队与权限相关的审计记录">
                <Button asChild variant="link" size="sm">
                  <Link href="/settings/audit?module=team">全部</Link>
                </Button>
              </PanelHeader>
              {d.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">还没有团队操作。</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {d.recent.map((r) => (
                    <li key={r.id} className="text-sm">
                      <p>{r.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.actorName ?? "系统"} · {inTz(r.createdAt, me.active.timezone)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
      <InviteDialog me={me} />
      <AssignDialog me={me} members={d?.members ?? []} />
      <PermissionsDialog />
      <LoginsDialog me={me} />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === "disable" ? `停用 ${confirm.name}？` : confirm?.kind === "reset" ? `给 ${confirm?.name} 发重置密码链接？` : `撤销给 ${confirm?.name} 的邀请？`}
        desc={
          confirm?.kind === "disable"
            ? "立即退出 TA 在本商户的全部设备；TA 处理中的会话退回待认领，名下未结工单退回该店组长，没有组长时给账号所有者；不再占用席位。之后可以重新启用。"
            : confirm?.kind === "reset"
              ? "发送一封 30 分钟有效的重置链接到对方邮箱，已登录的会话保持。"
              : "邀请链接立即失效。需要时可以重新邀请。"
        }
        confirmText={confirm?.kind === "disable" ? "停用" : confirm?.kind === "reset" ? "发送链接" : "撤销邀请"}
        destructive={confirm?.kind !== "reset"}
        pending={act.isPending}
        onConfirm={() => confirm && act.mutate({ kind: confirm.kind, id: confirm.id })}
      />
    </PageScroll>
  );
}
