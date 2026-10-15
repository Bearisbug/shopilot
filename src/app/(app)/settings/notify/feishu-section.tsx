"use client";

// 商户设置 → 通知 → 飞书：选接法（飞书应用 / 群自定义机器人）、设默认群与店铺群、两个推送开关、发测试卡片、断开。
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCwIcon, SendIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import type { FeishuChatList, FeishuMethod, FeishuTargetView, FeishuTestResult, FeishuView } from "@/contracts/feishu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PlatformBadge } from "@/components/common/platform-badge";
import { PasswordInput } from "@/components/forms/password-input";
import { ErrorState, LoadingRows, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ApiError, api, errorText } from "@/lib/api";
import { inTz } from "@/lib/format";
import { Disclosure } from "../../shops/connect/connect-ui";

const KEY = ["feishu"] as const;
const FOLLOW = "__follow__";

const METHODS: Array<{ value: FeishuMethod; label: string; desc: string }> = [
  { value: "app", label: "飞书应用（推荐）", desc: "填一次 App ID 与 App Secret，从机器人所在的群里选；卡片里能直接显示买家图片" },
  { value: "webhook", label: "群自定义机器人", desc: "每个群各加一个自定义机器人，填 Webhook 地址与签名密钥；买家图片显示为链接" },
];

function fieldErrors(e: unknown): Record<string, string> {
  return e instanceof ApiError ? ((e.problem.extra?.fields ?? {}) as Record<string, string>) : {};
}

/** 校验没过时把焦点交给第一个出错的字段（order：字段名 → 输入框 id，按页面顺序） */
function focusFirstError(errors: Record<string, string>, order: Array<[string, string]>) {
  const hit = order.find(([k]) => errors[k]);
  if (hit) requestAnimationFrame(() => document.getElementById(hit[1])?.focus());
}

const CONNECT_FIELDS: Array<[string, string]> = [
  ["appId", "feishu-app-id"],
  ["appSecret", "feishu-app-secret"],
];
const HOOK_FIELDS: Array<[string, string]> = [
  ["name", "feishu-hook-name"],
  ["webhookUrl", "feishu-hook-url"],
  ["secret", "feishu-hook-secret"],
];

export function FeishuSection({ tz }: { tz: string }) {
  const view = useQuery({ queryKey: KEY, queryFn: () => api.get<FeishuView>("/api/v1/feishu") });
  const [editing, setEditing] = useState(false);
  if (view.isError) {
    return (
      <Panel>
        <ErrorState error={view.error} onRetry={() => view.refetch()} />
      </Panel>
    );
  }
  if (!view.data) {
    return (
      <Panel>
        <LoadingRows rows={4} />
      </Panel>
    );
  }
  const v = view.data;
  return (
    <Panel>
      <PanelHeader title="飞书群推送" description="会话进入待认领、待认领超时时往飞书群发一张卡片，点卡片上的「认领」直接在 Shopilot 认领。只发卡片，不在飞书里回复买家。本节改动即时保存。" />
      {v.mode === "stub" && (
        <p className="mb-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          本机替身模式：卡片不会发到飞书，在
          <Link href="/dev/outbox?tab=feishu" className="focus-ring mx-1 rounded-sm font-medium text-(--semantic-color-text-link)">
            开发发件箱
          </Link>
          查看。App Secret 含 bad 时校验失败，Webhook 地址末段含 bad 时签名失败。
        </p>
      )}
      {!v.connection || editing ? (
        <ConnectForm view={v} onDone={() => setEditing(false)} onCancel={v.connection ? () => setEditing(false) : undefined} />
      ) : (
        <Connected view={v} tz={tz} onEdit={() => setEditing(true)} />
      )}
    </Panel>
  );
}

// ---------- 选接法与凭证 ----------

function ConnectForm({ view, onDone, onCancel }: { view: FeishuView; onDone: () => void; onCancel?: () => void }) {
  const qc = useQueryClient();
  const current = view.connection;
  const [method, setMethod] = useState<FeishuMethod>(current?.method ?? "app");
  const [appId, setAppId] = useState(current?.appId ?? "");
  const [appSecret, setAppSecret] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const hasTargets = Boolean(view.defaultTarget || view.shops.some((s) => s.target));
  const save = useMutation({
    mutationFn: () => api.put<FeishuView>("/api/v1/feishu", method === "app" ? { method, appId: appId.trim(), appSecret: appSecret.trim() || undefined } : { method }),
    onSuccess: (next) => {
      qc.setQueryData(KEY, next);
      qc.removeQueries({ queryKey: ["feishu-chats"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
      toast.success(method === "app" ? "校验通过，飞书应用已连接；下一步选默认群" : "已改用群自定义机器人；下一步设置默认群");
      onDone();
    },
    onError: (e) => {
      const fields = fieldErrors(e);
      if (e instanceof ApiError && e.type === "platform-credentials") fields.appSecret = "飞书没有通过这组 App ID 与 App Secret";
      setErrors(fields);
      focusFirstError(fields, CONNECT_FIELDS);
      setFormError(errorText(e));
    },
  });
  const switching = current && current.method !== method;
  const changingApp = current?.method === "app" && method === "app" && appId.trim() !== current.appId;
  const sameApp = current?.method === "app" && method === "app" && appId.trim() === current.appId;
  const [confirm, setConfirm] = useState(false);
  const submit = () => {
    setErrors({});
    setFormError(null);
    if (method === "app") {
      const fe: Record<string, string> = {};
      if (!/^cli_[A-Za-z0-9]{6,40}$/.test(appId.trim())) fe.appId = "App ID 以 cli_ 开头，在飞书开放平台应用的「凭证与基础信息」页复制";
      if (!appSecret.trim() && !sameApp) fe.appSecret = "请填 App Secret";
      if (Object.keys(fe).length) {
        setErrors(fe);
        return focusFirstError(fe, CONNECT_FIELDS);
      }
    }
    if ((switching || changingApp) && hasTargets) return setConfirm(true);
    save.mutate();
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <RadioGroup value={method} onValueChange={(x) => setMethod(x as FeishuMethod)} aria-label="接法" className="flex flex-col gap-3">
        {METHODS.map((o) => (
          <div key={o.value} className="flex items-start gap-3">
            <RadioGroupItem value={o.value} id={`feishu-method-${o.value}`} className="mt-0.5" />
            <Label htmlFor={`feishu-method-${o.value}`} className="flex flex-col items-start gap-0.5 font-normal">
              <span className="text-sm font-medium">{o.label}</span>
              <span className="text-xs text-muted-foreground">{o.desc}</span>
            </Label>
          </div>
        ))}
      </RadioGroup>

      {method === "app" ? (
        <>
          <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field data-invalid={Boolean(errors.appId)}>
              <FieldLabel htmlFor="feishu-app-id">App ID</FieldLabel>
              <Input id="feishu-app-id" value={appId} onChange={(e) => setAppId(e.target.value)} autoComplete="off" spellCheck={false} placeholder="cli_ 开头" aria-invalid={Boolean(errors.appId)} aria-describedby="feishu-app-id-msg" />
              {errors.appId ? <FieldError id="feishu-app-id-msg">{errors.appId}</FieldError> : <FieldDescription id="feishu-app-id-msg">飞书开放平台 → 应用 → 凭证与基础信息</FieldDescription>}
            </Field>
            <Field data-invalid={Boolean(errors.appSecret)}>
              <FieldLabel htmlFor="feishu-app-secret">App Secret</FieldLabel>
              <PasswordInput id="feishu-app-secret" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} autoComplete="off" placeholder={sameApp ? "已保存，重新填写可替换" : "粘贴 App Secret"} aria-invalid={Boolean(errors.appSecret)} aria-describedby="feishu-app-secret-msg" />
              {errors.appSecret ? <FieldError id="feishu-app-secret-msg">{errors.appSecret}</FieldError> : <FieldDescription id="feishu-app-secret-msg">加密保存，保存后不再显示</FieldDescription>}
            </Field>
          </FieldGroup>
          <Disclosure title="应用要开哪些权限" id="feishu-app-help">
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
              <li>在飞书开放平台创建企业自建应用，添加「机器人」能力。</li>
              <li>权限管理里开通：以应用的身份发消息（im:message:send_as_bot）、获取群组信息（im:chat:readonly）、获取与上传图片或文件资源（im:resource）。</li>
              <li>创建版本并发布，等企业管理员审核通过。</li>
              <li>在要接收卡片的飞书群里：设置 → 群机器人 → 添加机器人，选这个应用。</li>
            </ol>
          </Disclosure>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">保存后在下方逐个设置群：每个群在飞书里「设置 → 群机器人 → 添加机器人 → 自定义机器人」，安全设置勾选「签名校验」，把 Webhook 地址和签名密钥填进来。</p>
      )}

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Spinner />}
          {method === "app" ? "校验并保存" : "使用群自定义机器人"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={save.isPending}>
            取消
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={switching ? "换接法会清除已设置的群" : "换应用会清除已设置的群"}
        desc="原来的默认群与店铺群只对原来的接法或应用有效，保存后需要重新设置。还没发出的卡片随之跳过。"
        confirmText="清除并保存"
        destructive
        pending={save.isPending}
        onConfirm={() => save.mutate(undefined, { onSettled: () => setConfirm(false) })}
      />
    </form>
  );
}

// ---------- 已连接 ----------

function Connected({ view, tz, onEdit }: { view: FeishuView; tz: string; onEdit: () => void }) {
  const qc = useQueryClient();
  const c = view.connection!;
  const [disconnecting, setDisconnecting] = useState(false);
  const disconnect = useMutation({
    mutationFn: () => api.delete<FeishuView>("/api/v1/feishu"),
    onSuccess: (next) => {
      qc.setQueryData(KEY, next);
      qc.removeQueries({ queryKey: ["feishu-chats"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
      toast.success("已断开飞书，之后不再推送卡片");
      setDisconnecting(false);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const toggle = useMutation({
    mutationFn: (patch: { notifyUnclaimed?: boolean; notifyOverdue?: boolean }) => api.patch<FeishuView>("/api/v1/feishu", patch),
    onSuccess: (next, patch) => {
      qc.setQueryData(KEY, next);
      const [label, on] = patch.notifyUnclaimed !== undefined ? ["待认领时推送", patch.notifyUnclaimed] : ["待认领超时推送", patch.notifyOverdue];
      toast.success(`${label}已${on ? "打开" : "关闭"}`);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const invalid = c.status === "invalid";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{c.method === "app" ? `飞书应用 ${c.appId}` : "群自定义机器人"}</p>
          {invalid ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
              <TriangleAlertIcon className="size-3.5" aria-hidden />
              凭证已失效，卡片发不出去；点「更换」重新填写 App Secret
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">{c.method === "app" ? (c.verifiedAt ? `校验通过 · ${inTz(c.verifiedAt, tz, "yyyy-MM-dd HH:mm")}` : "已连接") : "每个群各自填写机器人地址与签名密钥"}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            更换
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDisconnecting(true)}>
            断开
          </Button>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-border border-y border-border">
        <ToggleRow
          id="feishu-unclaimed"
          label="待认领时推送"
          desc="AI 转人工、店铺未开 AI 或影子模式的新会话、处理人被停用，会话进入待认领时推一张橙色卡"
          checked={view.notifyUnclaimed}
          disabled={toggle.isPending}
          onChange={(x) => toggle.mutate({ notifyUnclaimed: x })}
        />
        <ToggleRow
          id="feishu-overdue"
          label="待认领超时推送"
          desc="待认领超过接待设置里的提醒时长，再推一张红色卡"
          checked={view.notifyOverdue}
          disabled={toggle.isPending}
          onChange={(x) => toggle.mutate({ notifyOverdue: x })}
        />
      </ul>

      <Targets view={view} />

      {view.lastFailure && (
        <p role="status" className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-(--semantic-color-feedback-warning)" aria-hidden />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            最近一次推送失败（{inTz(view.lastFailure.at, tz, "MM-dd HH:mm")}
            {view.lastFailure.targetName ? ` · ${view.lastFailure.targetName}` : ""}）：{view.lastFailure.error}
          </span>
        </p>
      )}

      <ConfirmDialog
        open={disconnecting}
        onOpenChange={setDisconnecting}
        title="断开飞书？"
        desc="删除飞书凭证与全部群设置，之后不再推送卡片；还没发出的卡片随之跳过。需要时可以重新连接。"
        confirmText="断开"
        destructive
        pending={disconnect.isPending}
        onConfirm={() => disconnect.mutate()}
      />
    </div>
  );
}

function ToggleRow({ id, label, desc, checked, disabled, onChange }: { id: string; label: string; desc: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <Label htmlFor={id} className="flex min-w-0 flex-col items-start gap-0.5 font-normal">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{desc}</span>
      </Label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </li>
  );
}

// ---------- 群设置 ----------

type Row = { key: string; shopId: string | null; title: React.ReactNode; target: FeishuTargetView | null };

function Targets({ view }: { view: FeishuView }) {
  const app = view.connection?.method === "app";
  const chats = useQuery({ queryKey: ["feishu-chats"], queryFn: () => api.get<FeishuChatList>("/api/v1/feishu/chats"), enabled: app, staleTime: 60_000 });
  const rows: Row[] = [
    { key: "default", shopId: null, title: <span className="text-sm font-medium">默认群</span>, target: view.defaultTarget },
    ...view.shops.map((s) => ({
      key: s.id,
      shopId: s.id,
      title: (
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{s.name}</span>
          <PlatformBadge platform={s.platform} market={s.market} />
        </span>
      ),
      target: s.target,
    })),
  ];
  return (
    <section aria-labelledby="feishu-targets-title" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id="feishu-targets-title" className="text-sm font-semibold">
            推送到哪个群
          </h3>
          <p className="text-xs text-muted-foreground">没有单独指定群的店铺推到默认群；没有默认群也没有指定群的店不推。</p>
        </div>
        {app && (
          <Button variant="ghost" size="sm" disabled={chats.isFetching} onClick={() => chats.refetch()}>
            {chats.isFetching ? <Spinner /> : <RefreshCwIcon />}
            刷新群列表
          </Button>
        )}
      </div>
      {app && chats.isError && (
        <p role="alert" className="text-xs text-destructive">
          取不到机器人所在的群：{errorText(chats.error)}
        </p>
      )}
      {app && chats.data?.chats.length === 0 && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">机器人还不在任何群里：在飞书群「设置 → 群机器人 → 添加机器人」选这个应用，再点「刷新群列表」。</p>
      )}
      <ul className="flex flex-col divide-y divide-border sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-x-4">
        {rows.map((r) => (
          <TargetRow key={r.key} row={r} app={app} chats={chats.data?.chats} chatsLoading={chats.isPending && app} defaultTarget={view.defaultTarget} />
        ))}
      </ul>
    </section>
  );
}

function useTargetMutations() {
  const qc = useQueryClient();
  const done = (next: FeishuView) => {
    qc.setQueryData(KEY, next);
    qc.invalidateQueries({ queryKey: ["audit-logs"] });
  };
  const save = useMutation({
    mutationFn: (body: { shopId: string | null; chatId?: string; name?: string; webhookUrl?: string; secret?: string }) => api.post<FeishuView>("/api/v1/feishu/targets", body),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete<FeishuView>(`/api/v1/feishu/targets/${id}`), onSuccess: done });
  const test = useMutation({
    mutationFn: (id: string) => api.post<FeishuTestResult>(`/api/v1/feishu/targets/${id}/test`, {}, undefined, 40_000),
    onSuccess: (r) => {
      const where = r.stub ? "（替身，已记进开发发件箱）" : "";
      if (r.imageUpload === "failed") toast.warning(`测试卡片已发出${where}，但图片上传没有成功`, { description: r.imageError ?? undefined });
      else toast.success(`测试卡片已发出${where}，去飞书群里看看`);
    },
    onError: (e) => {
      toast.error("测试卡片没有发出", { description: errorText(e) });
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
  return { save, remove, test };
}

function TargetRow({ row, app, chats, chatsLoading, defaultTarget }: { row: Row; app: boolean; chats?: FeishuChatList["chats"]; chatsLoading: boolean; defaultTarget: FeishuTargetView | null }) {
  const { save, remove, test } = useTargetMutations();
  const [editing, setEditing] = useState(false);
  const t = row.target;
  // 群名写在行内：应用接法只给跟随默认群与未设置的行写（下拉框里已显示所选的群），自定义机器人每行都写
  const status = t
    ? app
      ? null
      : `${t.name}${t.webhookHint ? ` · …${t.webhookHint}` : ""}`
    : row.shopId
      ? defaultTarget
        ? `推到默认群「${defaultTarget.name}」`
        : "不推送（还没设默认群）"
      : "未设置：没有单独指定群的店不推";

  const pick = (value: string) => {
    if (value === FOLLOW) {
      if (t) remove.mutate(t.id, { onSuccess: () => toast.success("已改为跟随默认群"), onError: (e) => toast.error(errorText(e)) });
      return;
    }
    save.mutate({ shopId: row.shopId, chatId: value }, { onSuccess: () => toast.success("已保存"), onError: (e) => toast.error(errorText(e)) });
  };
  const options = [...(chats ?? [])];
  // 已保存的群不在列表里：列表还没读到时照常显示群名，读到了仍没有才是机器人已被移出群
  if (t?.chatId && !options.some((c) => c.chatId === t.chatId)) options.unshift({ chatId: t.chatId, name: chats ? `${t.name}（机器人已不在群里）` : t.name });
  const busy = save.isPending || remove.isPending;

  return (
    <li className="flex flex-col gap-2 py-3 sm:col-span-3 sm:grid sm:grid-cols-subgrid sm:items-center">
      <div className="min-w-0">
        {row.title}
        {status && <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{status}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {app ? (
          <Select value={t?.chatId ?? (row.shopId ? FOLLOW : "")} onValueChange={pick} disabled={busy || chatsLoading}>
            <SelectTrigger className="w-full sm:w-64" aria-label={row.shopId ? "这家店推到哪个群" : "默认群"}>
              <SelectValue placeholder={chatsLoading ? "正在读取群列表" : "选择群"} />
            </SelectTrigger>
            <SelectContent>
              {row.shopId && <SelectItem value={FOLLOW}>跟随默认群</SelectItem>}
              {options.map((c) => (
                <SelectItem key={c.chatId} value={c.chatId}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              {t ? "修改" : "设置"}
            </Button>
            {t && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => remove.mutate(t.id, { onSuccess: () => toast.success(row.shopId ? "已改为跟随默认群" : "已清除默认群"), onError: (e) => toast.error(errorText(e)) })}>
                {row.shopId ? "跟随默认群" : "清除"}
              </Button>
            )}
          </>
        )}
      </div>
      {/* 第三列是各行共用的列宽：没有自己群的行留空，下拉框与按钮仍与其他行对齐 */}
      <div className="empty:hidden sm:empty:block">
        {t && (
          <Button variant="ghost" size="sm" aria-disabled={test.isPending} onClick={() => !test.isPending && test.mutate(t.id)} aria-label={`往「${t.name}」发测试卡片`}>
            {test.isPending ? <Spinner /> : <SendIcon />}
            发测试卡片
          </Button>
        )}
      </div>
      {editing && <WebhookDialog shopId={row.shopId} target={t} onClose={() => setEditing(false)} />}
    </li>
  );
}

function WebhookDialog({ shopId, target, onClose }: { shopId: string | null; target: FeishuTargetView | null; onClose: () => void }) {
  const { save } = useTargetMutations();
  const [name, setName] = useState(target?.name ?? "");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = () => {
    const fe: Record<string, string> = {};
    if (!name.trim()) fe.name = "请填群名";
    if (!target && !webhookUrl.trim()) fe.webhookUrl = "请填 Webhook 地址";
    if (!target && !secret.trim()) fe.secret = "请填签名密钥";
    setErrors(fe);
    if (Object.keys(fe).length) return focusFirstError(fe, HOOK_FIELDS);
    save.mutate(
      { shopId, name: name.trim(), webhookUrl: webhookUrl.trim() || undefined, secret: secret.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("已保存，可以发一张测试卡片确认");
          onClose();
        },
        onError: (e) => {
          const fields = fieldErrors(e);
          setErrors(fields);
          focusFirstError(fields, HOOK_FIELDS);
          if (!Object.keys(fields).length) toast.error(errorText(e));
        },
      },
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{shopId ? "这家店的群机器人" : "默认群的机器人"}</DialogTitle>
          <DialogDescription>在飞书群「设置 → 群机器人 → 添加机器人 → 自定义机器人」创建，安全设置勾选「签名校验」。</DialogDescription>
        </DialogHeader>
        <form
          id="feishu-webhook-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FieldGroup>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="feishu-hook-name">群名</FieldLabel>
              <Input id="feishu-hook-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 售后处理群" aria-invalid={Boolean(errors.name)} aria-describedby="feishu-hook-name-msg" />
              {errors.name ? <FieldError id="feishu-hook-name-msg">{errors.name}</FieldError> : <FieldDescription id="feishu-hook-name-msg">只在 Shopilot 里显示，方便区分</FieldDescription>}
            </Field>
            <Field data-invalid={Boolean(errors.webhookUrl)}>
              <FieldLabel htmlFor="feishu-hook-url">Webhook 地址</FieldLabel>
              <PasswordInput id="feishu-hook-url" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} autoComplete="off" placeholder={target ? `已保存（…${target.webhookHint ?? ""}），重新填写可替换` : "https://open.feishu.cn/open-apis/bot/v2/hook/…"} aria-invalid={Boolean(errors.webhookUrl)} aria-describedby="feishu-hook-url-msg" />
              {errors.webhookUrl ? <FieldError id="feishu-hook-url-msg">{errors.webhookUrl}</FieldError> : <FieldDescription id="feishu-hook-url-msg">拿到这个地址就能往群里发消息，Shopilot 加密保存</FieldDescription>}
            </Field>
            <Field data-invalid={Boolean(errors.secret)}>
              <FieldLabel htmlFor="feishu-hook-secret">签名密钥</FieldLabel>
              <PasswordInput id="feishu-hook-secret" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" placeholder={target ? "已保存，重新填写可替换" : "勾选签名校验后显示"} aria-invalid={Boolean(errors.secret)} aria-describedby={errors.secret ? "feishu-hook-secret-msg" : undefined} />
              {errors.secret && <FieldError id="feishu-hook-secret-msg">{errors.secret}</FieldError>}
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            取消
          </Button>
          <Button type="submit" form="feishu-webhook-form" disabled={save.isPending}>
            {save.isPending && <Spinner />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
