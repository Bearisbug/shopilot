"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon, DownloadIcon, SendIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { Me } from "@/contracts/auth";
import type { InviteResult, LoginEventRow, MemberRow } from "@/contracts/team";
import { ShopPicker } from "@/components/common/shop-picker";
import { useDialogParam } from "@/components/shell/global-dialogs";
import { EmptyState, ErrorState, LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, errorText, newKey } from "@/lib/api";
import { inTz } from "@/lib/format";
import { PERMISSION_TABLE, ROLE_LABEL, type Grant } from "@/lib/permissions";
import { LogInIcon } from "lucide-react";

const ROLE_HELP = "管理员：全部店铺、接入与配置、成员与用量；组长：负责店铺内的会话、工单、看板，能改派；员工：负责店铺的待认领会话、自己的会话和指派给自己的工单。";

const EMAIL_SEP = /[\s,，;；]+/;

/** 逐行指出不合法的邮箱，如「第 1 行 abc 不是邮箱」 */
function badEmails(v: string) {
  return v.split("\n").flatMap((line, i) =>
    line
      .split(EMAIL_SEP)
      .filter(Boolean)
      .filter((e) => !z.string().email().safeParse(e).success)
      .map((e) => `第 ${i + 1} 行 ${e} 不是邮箱`),
  );
}

const inviteSchema = z.object({
  emails: z
    .string()
    .trim()
    .min(1, "至少填一个邮箱")
    .superRefine((v, ctx) => {
      const bad = badEmails(v);
      if (bad.length) ctx.addIssue({ code: "custom", message: bad.join("\n") });
    }),
  role: z.enum(["admin", "lead", "agent"]),
  shopIds: z.array(z.string()),
});
type InviteValues = z.infer<typeof inviteSchema>;

export function InviteDialog({ me }: { me: Me }) {
  const { open, close } = useDialogParam("invite");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>邀请成员</DialogTitle>
          <DialogDescription>每人一条 7 天有效的邀请链接，可复制给对方，同时发到对方邮箱。</DialogDescription>
        </DialogHeader>
        <InviteForm me={me} close={close} />
      </DialogContent>
    </Dialog>
  );
}

// 对话框关闭时内容卸载，重新打开即全新表单
function InviteForm({ me, close }: { me: Me; close: () => void }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<InviteResult | null>(null);
  const [key, setKey] = useState(newKey);
  // 首次提交后才校验，之后随输入实时更新
  const form = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), mode: "onSubmit", reValidateMode: "onChange", defaultValues: { emails: "", role: "agent", shopIds: [] } });
  const role = useWatch({ control: form.control, name: "role" });

  const send = useMutation({
    mutationFn: (v: InviteValues) =>
      api.post<InviteResult>("/api/v1/invitations", { emails: v.emails.split(EMAIL_SEP).filter(Boolean), role: v.role, shopIds: v.role === "admin" ? [] : v.shopIds }, key),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.type === "duplicate") form.setError("emails", { message: e.problem.detail });
      else toast.error(errorText(e));
      setKey(newKey());
    },
  });

  return (
    <>
        {result ? (
          <div className="flex min-w-0 flex-col gap-3">
            <p className="text-sm">已生成 {result.items.length} 条邀请：</p>
            <ul className="flex min-w-0 flex-col gap-2">
              {result.items.map((i) => (
                <li key={i.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{i.email}</span>
                    <span className="block truncate text-xs text-muted-foreground">{i.link}</span>
                    <span className="block text-xs text-muted-foreground">{inTz(i.expiresAt, me.active.timezone, "yyyy-MM-dd HH:mm")} 到期</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(i.link)
                        .then(() => toast.success(`已复制给 ${i.email} 的链接`))
                        .catch(() => toast.error("复制没有成功，请手动选中链接复制"))
                    }
                  >
                    <CopyIcon />
                    复制链接
                  </Button>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button onClick={close}>完成</Button>
            </DialogFooter>
          </div>
        ) : (
          <form id="invite-form" noValidate onSubmit={form.handleSubmit((v) => send.mutate(v))} className="flex flex-col gap-4">
            <FieldGroup>
              <Controller
                name="emails"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="invite-emails">邮箱</FieldLabel>
                    <Textarea {...field} id="invite-emails" rows={3} placeholder="一行一个，例如 dewi.p@example.com" aria-invalid={fieldState.invalid} />
                    <FieldDescription>一次最多 20 人</FieldDescription>
                    {fieldState.error && <FieldError className="whitespace-pre-line">{fieldState.error.message}</FieldError>}
                  </Field>
                )}
              />
              <Controller
                name="role"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="invite-role">角色</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="invite-role" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="agent">员工</SelectItem>
                        <SelectItem value="lead">组长</SelectItem>
                        <SelectItem value="admin">管理员</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldDescription>{ROLE_HELP}</FieldDescription>
                  </Field>
                )}
              />
              {role !== "admin" && (
                <Controller
                  name="shopIds"
                  control={form.control}
                  render={({ field }) => (
                    <Field>
                      <FieldLabel>负责店铺</FieldLabel>
                      <ShopPicker shops={me.active.shops} value={field.value} onChange={field.onChange} idPrefix="invite-shop" />
                      <FieldDescription>组长和员工只看到负责店铺的会话与工单；管理员看全部店铺，不用选。</FieldDescription>
                    </Field>
                  )}
                />
              )}
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit" disabled={send.isPending}>
                {send.isPending ? <Spinner /> : <SendIcon />}
                发送邀请
              </Button>
            </DialogFooter>
          </form>
        )}
    </>
  );
}

export function AssignDialog({ me, members }: { me: Me; members: MemberRow[] }) {
  const { open, close } = useDialogParam("assign");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>分配店铺</DialogTitle>
          <DialogDescription>组长和员工按负责店铺看会话、工单与看板；管理员隐含全部店铺。</DialogDescription>
        </DialogHeader>
        <AssignForm me={me} members={members} close={close} />
      </DialogContent>
    </Dialog>
  );
}

function AssignForm({ me, members, close }: { me: Me; members: MemberRow[]; close: () => void }) {
  const params = useSearchParams();
  const qc = useQueryClient();
  const candidates = members.filter((m) => m.role !== "admin" && m.status === "active");
  // 只有从某一行「分配店铺」进来（带 member 参数）才预选成员
  const initial = candidates.find((c) => c.membershipId === params.get("member"));
  const [memberId, setMemberId] = useState<string>(initial?.membershipId ?? "");
  const [shopIds, setShopIds] = useState<string[]>(initial?.shopIds ?? []);
  const save = useMutation({
    mutationFn: () => api.patch(`/api/v1/members/${memberId}`, { shopIds }),
    onSuccess: () => {
      toast.success("负责店铺已更新，待认领队列、工单与看板的可见范围随之变化");
      qc.invalidateQueries({ queryKey: ["members"] });
      close();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有组长或员工。先邀请成员。</p>
        ) : (
          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="assign-member">成员</FieldLabel>
              <Select
                value={memberId}
                onValueChange={(v) => {
                  setMemberId(v);
                  setShopIds(candidates.find((c) => c.membershipId === v)?.shopIds ?? []);
                }}
              >
                <SelectTrigger id="assign-member" className="w-full">
                  <SelectValue placeholder="选择组长或员工" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.membershipId} value={c.membershipId}>
                      {c.name} · {ROLE_LABEL[c.role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>负责店铺</FieldLabel>
              <ShopPicker shops={me.active.shops} value={shopIds} onChange={setShopIds} idPrefix="assign-shop" />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                取消
              </Button>
              <Button disabled={!memberId || save.isPending} onClick={() => save.mutate()}>
                {save.isPending && <Spinner />}保存
              </Button>
            </DialogFooter>
          </div>
        )}
    </>
  );
}

const GRANT_TEXT: Record<Grant, string> = { yes: "✓", scope: "负责店铺内", owner: "仅所有者", no: "—" };

export function PermissionsDialog() {
  const { open, close } = useDialogParam("permissions");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>权限表</DialogTitle>
          <DialogDescription>服务端按这张表校验每个请求；「负责店铺内」指只对自己负责的店生效。</DialogDescription>
        </DialogHeader>
        <div className="scroll-y max-h-[65dvh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>模块</TableHead>
                <TableHead>操作</TableHead>
                <TableHead>管理员</TableHead>
                <TableHead>组长</TableHead>
                <TableHead>员工</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSION_TABLE.map((r) => (
                <TableRow key={r.perm}>
                  <TableCell>{r.module}</TableCell>
                  <TableCell className="whitespace-normal">{r.action}</TableCell>
                  <TableCell>{GRANT_TEXT[r.admin]}</TableCell>
                  <TableCell>{GRANT_TEXT[r.lead]}</TableCell>
                  <TableCell>{GRANT_TEXT[r.agent]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const REASON: Record<string, string> = { bad_password: "密码错误", unknown_email: "账号不存在", locked: "已锁定", ip_blocked: "IP 不允许", disabled: "账号已停用", two_factor_failed: "验证码错误" };

export function LoginsDialog({ me }: { me: Me }) {
  const { open, close } = useDialogParam("logins");
  const [result, setResult] = useState("all");
  const [range, setRange] = useState("7d");
  const list = useQuery({ queryKey: ["login-events", result, range], queryFn: () => api.get<{ items: LoginEventRow[] }>(`/api/v1/login-events?result=${result}&range=${range}`), enabled: open });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>登录记录</DialogTitle>
          <DialogDescription>成员的登录成功与失败，含失败原因与来源 IP。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={result} onValueChange={setResult}>
            <SelectTrigger size="sm" aria-label="按结果筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部结果</SelectItem>
              <SelectItem value="success">成功</SelectItem>
              <SelectItem value="failure">失败</SelectItem>
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger size="sm" aria-label="时间范围">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">近 7 天</SelectItem>
              <SelectItem value="30d">近 30 天</SelectItem>
              <SelectItem value="this_month">本月</SelectItem>
              <SelectItem value="last_month">上月</SelectItem>
            </SelectContent>
          </Select>
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <a href={`/api/v1/login-events?result=${result}&range=${range}&format=csv`} download>
              <DownloadIcon />
              导出 CSV
            </a>
          </Button>
        </div>
        <div className="scroll-y max-h-[55dvh]">
          {list.isPending ? (
            <LoadingRows rows={4} />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : list.data.items.length === 0 ? (
            <EmptyState icon={LogInIcon} title="这段时间没有登录记录" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>成员</TableHead>
                  <TableHead>结果</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>设备</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="tabular-nums">{inTz(e.createdAt, me.active.timezone)}</TableCell>
                    <TableCell>
                      <span className="block">{e.name ?? e.email}</span>
                      {e.name && <span className="block text-xs text-muted-foreground">{e.email}</span>}
                    </TableCell>
                    <TableCell className={e.result === "failure" ? "text-destructive" : undefined}>{e.result === "success" ? "成功" : `失败 · ${REASON[e.reason ?? ""] ?? "未知原因"}`}</TableCell>
                    <TableCell className="tabular-nums">{e.ip ?? "—"}</TableCell>
                    <TableCell className="max-w-48 truncate text-xs text-muted-foreground" title={e.userAgent ?? undefined}>
                      {e.userAgent ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
