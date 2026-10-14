"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CircleCheckIcon, CopyIcon, KeyRoundIcon, LaptopIcon, LogOutIcon, SmartphoneIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { PreferencesResult, RevokeResult, SessionItem, SessionList } from "@/contracts/account";
import type { Me } from "@/contracts/auth";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PasswordInput } from "@/components/forms/password-input";
import { ErrorState, LoadingRows, PageHeader, PageScroll, Panel, PanelHeader } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ApiError, api, errorText } from "@/lib/api";
import { peekFlash } from "@/lib/flash";
import { inTz, relative } from "@/lib/format";

function copy(text: string, done: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(done))
    .catch(() => toast.error("复制没有成功，请手动选中复制"));
}

function problemText(e: unknown, fallback: string) {
  return e instanceof ApiError ? (e.problem.detail ?? e.problem.title) : fallback;
}

export function AccountSecurityClient({ me }: { me: Me }) {
  // 从别的页面带过来的提示（如保存安全策略后被要求先开两步验证）
  useEffect(() => {
    const text = peekFlash();
    if (text) toast.success(text, { id: "flash" });
  }, []);
  return (
    <PageScroll>
      <PageHeader title="账号安全" facts={`${me.user.name} · ${me.user.email} · 两步验证${me.user.twoFactorEnabled ? "已开启" : "未开启"}`} />
      {me.twoFactorRequired && (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-(--semantic-radius-lg) border border-border bg-card px-5 py-4">
          <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-(--semantic-color-feedback-warning)" aria-hidden />
          <div>
            <p className="font-medium">「{me.active.merchantName}」要求开启两步验证</p>
            <p className="text-sm text-muted-foreground">开启前其他页面暂时不能使用。按下面的步骤用验证器 App 绑定后即可继续。</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <TwoFactorPanel me={me} />
          <SessionsPanel me={me} />
        </div>
        <PreferencesPanel me={me} />
      </div>
    </PageScroll>
  );
}

// ---------- 两步验证（API-AUTH-008，Better Auth 插件端点） ----------

type Setup = { totpURI: string; secret: string; backupCodes: string[] };

function TwoFactorPanel({ me }: { me: Me }) {
  const enabled = me.user.twoFactorEnabled;
  const [setup, setSetup] = useState<Setup | null>(null);
  const [disabling, setDisabling] = useState(false);
  return (
    <Panel>
      <PanelHeader title="两步验证" description="登录时除了密码，还要输入验证器 App（如 Google Authenticator、Microsoft Authenticator）生成的 6 位验证码">
        {enabled ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-(--semantic-color-feedback-success)">
            <CircleCheckIcon className="size-4" />
            已开启
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">未开启</span>
        )}
      </PanelHeader>
      {enabled ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">手机丢失时，用开启时保存的备用码登录，每个备用码只能用一次。</p>
          <Button variant="outline" onClick={() => setDisabling(true)}>
            关闭两步验证
          </Button>
          {disabling && <DisableDialog onClose={() => setDisabling(false)} />}
        </div>
      ) : setup ? (
        <SetupSteps me={me} setup={setup} onCancel={() => setSetup(null)} />
      ) : (
        <EnableForm email={me.user.email} onStarted={setSetup} />
      )}
    </Panel>
  );
}

function EnableForm({ email, onStarted }: { email: string; onStarted: (s: Setup) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const start = useMutation({
    mutationFn: () => api.post<{ totpURI: string; backupCodes: string[] }>("/api/auth/two-factor/enable", { password }),
    onSuccess: (r) => {
      const secret = new URL(r.totpURI).searchParams.get("secret") ?? "";
      onStarted({ totpURI: r.totpURI, secret, backupCodes: r.backupCodes });
    },
    onError: (e) => setError(problemText(e, "没有开启成功，请重试。")),
  });
  return (
    <form
      noValidate
      className="flex flex-wrap items-start gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!password) return setError("请输入登录密码");
        setError(null);
        start.mutate();
      }}
    >
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <Field className="max-w-sm min-w-60 flex-1" data-invalid={Boolean(error)}>
        <FieldLabel htmlFor="tf-password">登录密码</FieldLabel>
        <PasswordInput
          id="tf-password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          aria-invalid={Boolean(error)}
          aria-describedby="tf-password-desc"
        />
        {error ? <FieldError id="tf-password-desc">{error}</FieldError> : <FieldDescription id="tf-password-desc">先确认是你本人，再生成绑定用的密钥</FieldDescription>}
      </Field>
      <Button type="submit" className="mt-7" disabled={start.isPending}>
        {start.isPending ? <Spinner /> : <KeyRoundIcon />}
        开启两步验证
      </Button>
    </form>
  );
}

/** otpauth 二维码：自己按模块画 SVG，颜色跟随 text-foreground / bg-card，不写颜色字面量；四周留 4 个模块的静区 */
function TotpQr({ uri }: { uri: string }) {
  const { size, path } = useMemo(() => {
    const qr = QRCode.create(uri, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.data[y * n + x]) d += `M${x + 4} ${y + 4}h1v1h-1z`;
    return { size: n + 8, path: d };
  }, [uri]);
  return (
    <svg role="img" aria-label="两步验证二维码，用验证器 App 扫描" viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className="mt-2 size-44 rounded-md border border-border bg-card text-foreground">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

function SetupSteps({ me, setup, onCancel }: { me: Me; setup: Setup; onCancel: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const verify = useMutation({
    mutationFn: () => api.post("/api/auth/two-factor/verify-totp", { code }),
    onSuccess: async () => {
      toast.success("两步验证已开启，下次登录除了密码还要输入验证码");
      await qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      onCancel();
    },
    onError: (e) => setError(problemText(e, "验证码不正确。")),
  });
  const grouped = setup.secret.replace(/(.{4})/g, "$1 ").trim();
  return (
    <ol className="flex flex-col gap-5">
      <li>
        <p className="text-sm font-medium">1. 在验证器 App 里添加账号</p>
        <p className="mt-1 text-xs text-muted-foreground">用验证器 App（如 Google Authenticator、Microsoft Authenticator）扫描下面的二维码。</p>
        <TotpQr uri={setup.totpURI} />
        <p className="mt-3 text-xs text-muted-foreground">扫不了时选「输入设置密钥」，账号名填 {me.user.email}，密钥填下面这串（类型选「基于时间」）。</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-muted px-3 py-2 font-mono text-sm tracking-wider break-all">{grouped}</code>
          <Button variant="outline" size="sm" onClick={() => copy(setup.secret, "密钥已复制")}>
            <CopyIcon />
            复制密钥
          </Button>
          <Button variant="ghost" size="sm" onClick={() => copy(setup.totpURI, "otpauth 链接已复制")}>
            <CopyIcon />
            复制 otpauth 链接
          </Button>
        </div>
      </li>
      <li>
        <p className="text-sm font-medium">2. 保存备用码</p>
        <p className="mt-1 text-xs text-muted-foreground">手机丢失时用备用码登录，每个只能用一次。关掉这个页面后不再显示。</p>
        <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-muted px-4 py-3 font-mono text-sm sm:grid-cols-5">
          {setup.backupCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => copy(setup.backupCodes.join("\n"), "备用码已复制")}>
          <CopyIcon />
          复制全部备用码
        </Button>
      </li>
      <li>
        <form
          noValidate
          className="flex flex-wrap items-start gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length !== 6) return setError("请输入 6 位验证码");
            setError(null);
            verify.mutate();
          }}
        >
          <Field className="w-56" data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="tf-code">3. 输入 App 显示的验证码</FieldLabel>
            <Input
              id="tf-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ""));
                setError(null);
              }}
              className="font-mono tracking-widest"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "tf-code-error" : undefined}
            />
            {error && <FieldError id="tf-code-error">{error}</FieldError>}
          </Field>
          <div className="mt-7 flex gap-2">
            <Button type="submit" disabled={verify.isPending}>
              {verify.isPending ? <Spinner /> : <CheckIcon />}
              验证并开启
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              取消
            </Button>
          </div>
        </form>
      </li>
    </ol>
  );
}

function DisableDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const disable = useMutation({
    mutationFn: () => api.post("/api/auth/two-factor/disable", { password }),
    onSuccess: async () => {
      toast.success("两步验证已关闭");
      onClose();
      await qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e) => setError(problemText(e, "没有关闭成功，请重试。")),
  });
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="关闭两步验证？"
      desc="关闭后登录只需要密码。商户要求两步验证时，关闭后要重新开启才能继续使用。"
      confirmText="关闭两步验证"
      destructive
      pending={disable.isPending}
      confirmDisabled={!password}
      onConfirm={() => disable.mutate()}
    >
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor="tf-disable-password">登录密码</FieldLabel>
        <PasswordInput
          id="tf-disable-password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "tf-disable-error" : undefined}
          autoFocus
        />
        {error && <FieldError id="tf-disable-error">{error}</FieldError>}
      </Field>
    </ConfirmDialog>
  );
}

// ---------- 登录设备（API-AUTH-009、API-AUTH-010） ----------

function describeDevice(ua: string | null) {
  if (!ua) return { label: "未知设备", mobile: false };
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /^curl\//.test(ua) ? "curl" : null;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : null;
  const label = [browser, os].filter(Boolean).join(" · ") || ua.slice(0, 40);
  return { label, mobile: os === "iPhone" || os === "Android" };
}

function SessionsPanel({ me }: { me: Me }) {
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api.get<SessionList>("/api/v1/me/sessions") });
  const revoke = useMutation({
    mutationFn: (body: { sessionId: string } | { others: true }) => api.post<RevokeResult>("/api/v1/me/sessions/revoke", body),
    onSuccess: (r, body) => {
      toast.success("others" in body ? `已退出其他 ${r.revoked} 台设备` : "已退出该设备");
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const items = sessions.data?.items ?? [];
  const others = items.filter((s) => !s.current).length;
  const revokingId = revoke.isPending && revoke.variables && "sessionId" in revoke.variables ? revoke.variables.sessionId : null;
  return (
    <Panel>
      <PanelHeader title="我的登录设备" description="退出某台设备后，它的下一次请求需要重新登录">
        <Button variant="outline" size="sm" disabled={others === 0 || revoke.isPending} onClick={() => revoke.mutate({ others: true })}>
          <LogOutIcon />
          退出其他设备
        </Button>
      </PanelHeader>
      {sessions.isPending ? (
        <LoadingRows rows={2} />
      ) : sessions.isError ? (
        <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />
      ) : (
        <ul className="flex flex-col">
          {items.map((s) => (
            <SessionRow key={s.id} s={s} tz={me.active.timezone} pending={revokingId === s.id} onRevoke={() => revoke.mutate({ sessionId: s.id })} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function SessionRow({ s, tz, pending, onRevoke }: { s: SessionItem; tz: string; pending: boolean; onRevoke: () => void }) {
  const d = describeDevice(s.userAgent);
  const Icon = d.mobile ? SmartphoneIcon : LaptopIcon;
  return (
    <li className="flex items-center gap-3 border-b border-border py-3 last:border-0">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          {d.label}
          {s.current && <Badge className="bg-accent text-(--semantic-color-text-link)">当前设备</Badge>}
        </p>
        {/* 窄屏拆成两行，不截断登录时间与最近活动 */}
        <p className="text-xs text-muted-foreground tabular-nums">
          <span>
            {s.ipAddress ?? "IP 未知"} · 登录于 {inTz(s.createdAt, tz, "yyyy-MM-dd HH:mm")}
          </span>
          <span className="block sm:inline">
            <span className="hidden sm:inline"> · </span>最近活动 {relative(s.lastActiveAt)}
          </span>
        </p>
      </div>
      {!s.current && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={onRevoke} aria-label={`退出 ${d.label}（${s.ipAddress ?? "IP 未知"}）`}>
          {pending && <Spinner />}
          退出
        </Button>
      )}
    </li>
  );
}

// ---------- 个人偏好（API-AUTH-011） ----------

function PreferencesPanel({ me }: { me: Me }) {
  const qc = useQueryClient();
  const prefs = me.preferences;
  const save = useMutation({
    mutationFn: (next: Me["preferences"]) => api.put<PreferencesResult>("/api/v1/me/preferences", next),
    onMutate: (next) => {
      const prev = qc.getQueryData<Me>(["me"]);
      if (prev) qc.setQueryData<Me>(["me"], { ...prev, preferences: next });
      return { prev };
    },
    onSuccess: () => toast.success("已保存"),
    onError: (e, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(["me"], ctx.prev);
      toast.error(errorText(e));
    },
  });

  async function toggleDesktop(on: boolean) {
    if (on) {
      if (typeof Notification === "undefined") return toast.error("这个浏览器不支持桌面通知");
      const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (perm !== "granted") return toast.error("浏览器没有允许通知。先在浏览器的网站设置里允许 Shopilot 发通知，再打开这个开关。");
    }
    save.mutate({ ...prefs, desktopNotify: on });
  }

  return (
    <Panel>
      <PanelHeader title="个人偏好" description={`只对你在「${me.active.merchantName}」生效`} />
      <div className="flex items-center justify-between gap-4 py-2">
        <div>
          <p className="text-sm font-medium">浏览器桌面通知</p>
          <p className="text-xs text-muted-foreground">新的待认领、转给我的会话弹出桌面通知</p>
        </div>
        <Switch checked={prefs.desktopNotify} disabled={save.isPending} onCheckedChange={toggleDesktop} aria-label="浏览器桌面通知" />
      </div>
      <Separator className="my-2" />
      <div className="flex items-center justify-between gap-4 py-2">
        <div>
          <p className="text-sm font-medium">提示音</p>
          <p className="text-xs text-muted-foreground">工作台有新消息时播放提示音</p>
        </div>
        <Switch checked={prefs.sound} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ ...prefs, sound: v })} aria-label="提示音" />
      </div>
      {me.active.permissions.includes("settings.manage") && (
        <p className="mt-4 text-xs text-muted-foreground">
          商户级的通知规则在
          <Link href="/settings/notify" className="focus-ring rounded-sm text-(--semantic-color-text-link)">
            商户设置 · 通知
          </Link>
        </p>
      )}
    </Panel>
  );
}
