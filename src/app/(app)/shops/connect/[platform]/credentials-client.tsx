"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, ArrowRightIcon, BellRingIcon, CheckCircle2Icon, CircleIcon, InfoIcon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { TIKTOK_REGIONS, type ConnectDraft, type PlatformKey, type RegionAttempt, type SaveAppResult } from "@/contracts/shops";
import { PasswordInput } from "@/components/forms/password-input";
import { ErrorState, LoadingRows, PageScroll, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, api, errorText } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ConnectHeader, CopyValue, Disclosure, SaveDraftAction, Stepper, useDraft } from "../connect-ui";

const REGION_TEXT: Record<string, string> = { cn: "中国大陆控制台（open.shopee.cn）", sg: "全球控制台（open.shopee.com）", br: "巴西控制台", sandbox: "沙箱" };
const REGION_SHORT: Record<string, string> = { cn: "中国大陆", sg: "全球", br: "巴西", sandbox: "沙箱" };
const ATTEMPT_TEXT: Record<RegionAttempt["result"], string> = { ok: "通过", invalid_partner: "没有这个 Partner ID", wrong_key: "Partner ID 对，Key 不对", error: "连接出错" };

function CheckRow({ state, title, detail }: { state: "ok" | "fail" | "idle" | "info"; title: string; detail?: React.ReactNode }) {
  const Icon = state === "ok" ? CheckCircle2Icon : state === "fail" ? XCircleIcon : state === "info" ? InfoIcon : CircleIcon;
  return (
    <li className="flex items-start gap-2 border-b border-border py-3 last:border-0">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          state === "ok" && "text-(--semantic-color-feedback-success)",
          state === "fail" && "text-destructive",
          (state === "idle" || state === "info") && "text-muted-foreground",
        )}
        aria-hidden
      />
      <span className="min-w-0 text-sm">
        <span className="sr-only">{state === "ok" ? "通过：" : state === "fail" ? "没通过：" : ""}</span>
        {title}
        {detail && <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>}
      </span>
    </li>
  );
}

export function CredentialsClient({ platform }: { platform: PlatformKey }) {
  const draft = useDraft(platform);
  return (
    <PageScroll>
      <SaveDraftAction platform={platform} body={() => ({ step: "credentials" })} />
      <ConnectHeader back="/shops/connect" subtitle={`${platform === "shopee" ? "Shopee" : "TikTok Shop"} · 第 2 步，共 4 步 · 凭证由你提供，Shopilot 加密保存`} />
      <Stepper platform={platform} current="credentials" />
      {draft.isError ? (
        <ErrorState error={draft.error} onRetry={() => draft.refetch()} />
      ) : !draft.data ? (
        <LoadingRows />
      ) : platform === "shopee" ? (
        <ShopeeCredentials draft={draft.data} />
      ) : (
        <TiktokCredentials draft={draft.data} />
      )}
    </PageScroll>
  );
}

// ---------- Shopee ----------

const shopeeForm = z.object({
  partnerId: z.string().trim().regex(/^\d{1,12}$/, "Partner ID 是一串数字，从控制台应用详情复制"),
  partnerKey: z.string().trim().min(1, "请填 Partner Key"),
  pushKey: z.string().trim().optional(),
  keyExpiresAt: z.string().optional(),
  overwriteCallback: z.boolean(),
});
type ShopeeValues = z.infer<typeof shopeeForm>;

type Failure = { kind: "credentials"; attempts: RegionAttempt[]; detail: string } | { kind: "occupied"; current: string; region?: string } | { kind: "other"; text: string };

function ShopeeCredentials({ draft }: { draft: ConnectDraft }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [result, setResult] = useState<SaveAppResult | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const form = useForm<ShopeeValues>({
    resolver: zodResolver(shopeeForm),
    mode: "onTouched",
    defaultValues: { partnerId: draft.app?.appKey ?? "", partnerKey: "", pushKey: "", keyExpiresAt: draft.app?.keyExpiresAt ?? "", overwriteCallback: false },
  });
  const overwrite = useWatch({ control: form.control, name: "overwriteCallback" });

  const save = useMutation({
    mutationFn: (v: ShopeeValues) =>
      api.put<SaveAppResult>("/api/v1/platform-apps/shopee", {
        partnerId: v.partnerId,
        partnerKey: v.partnerKey,
        pushKey: v.pushKey || undefined,
        keyExpiresAt: v.keyExpiresAt || undefined,
        overwriteCallback: v.overwriteCallback || undefined,
      }),
    onSuccess: (r) => {
      setResult(r);
      setFailure(null);
      qc.invalidateQueries({ queryKey: ["connect-draft", "shopee"] });
      if (r.sandboxOnly) toast.warning("这是沙箱凭证，请换成 Live");
      else toast.success("校验通过，推送回调已设置");
    },
    onError: (e) => {
      setResult(null);
      qc.invalidateQueries({ queryKey: ["connect-draft", "shopee"] });
      if (e instanceof ApiError && e.type === "platform-credentials") {
        setFailure({ kind: "credentials", attempts: (e.problem.extra?.attempts as RegionAttempt[]) ?? [], detail: e.problem.detail ?? "" });
        form.setError("partnerKey", { message: "Partner ID 与 Key 对不上，见右侧逐区域结果" });
      } else if (e instanceof ApiError && e.type === "callback-occupied") {
        setFailure({ kind: "occupied", current: String(e.problem.extra?.callbackCurrent ?? ""), region: e.problem.extra?.region as string | undefined });
      } else if (e instanceof ApiError && e.type === "validation") {
        const fields = (e.problem.extra?.fields ?? {}) as Record<string, string>;
        for (const [k, msg] of Object.entries(fields)) if (k in form.getValues()) form.setError(k as keyof ShopeeValues, { message: msg });
      } else {
        setFailure({ kind: "other", text: errorText(e) });
      }
    },
  });

  const app = draft.app;
  // 本次提交的结果优先；还没提交时按已保存的应用显示
  const fresh = Boolean(result || failure);
  const verified = result ? result.status === "verified" : !fresh && app?.status === "verified" && !app.sandboxOnly;
  const sandbox = result ? result.sandboxOnly : !fresh && Boolean(app?.sandboxOnly);
  const matched = verified || sandbox || failure?.kind === "occupied";
  const okAttempt = result?.attempts?.find((a) => a.result === "ok");
  const region = result?.region ?? (failure?.kind === "occupied" ? failure.region : undefined) ?? (fresh ? null : app?.region) ?? null;
  const passCount = (matched ? 1 : 0) + (verified ? 1 : 0);

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Panel>
          <PanelHeader title="应用凭证" description="粘贴后点「验证并保存」立即校验；保存后只显示「已配置」，不再显示 Key" />
          <form id="creds-form" noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-5">
            <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Controller
                name="partnerId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="partner-id">Live Partner ID</FieldLabel>
                    <Input {...field} id="partner-id" inputMode="numeric" autoComplete="off" placeholder="例如 2001001" aria-invalid={fieldState.invalid} />
                    <FieldDescription>控制台应用详情里的 Live Partner ID</FieldDescription>
                    {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                  </Field>
                )}
              />
              <Controller
                name="partnerKey"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="partner-key">Live Partner Key</FieldLabel>
                    <PasswordInput {...field} id="partner-key" autoComplete="off" placeholder={app ? "已保存，重新填写可替换" : "粘贴 Live Partner Key"} aria-invalid={fieldState.invalid} />
                    <FieldDescription>同一页面的 Live Partner Key</FieldDescription>
                    {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                  </Field>
                )}
              />
            </FieldGroup>
            <p className="text-sm text-muted-foreground">控制台在中国大陆、全球还是巴西，Shopilot 自动识别。</p>
            <Disclosure title="高级（可选）" id="creds-advanced">
              <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Controller
                  name="keyExpiresAt"
                  control={form.control}
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor="key-expires">Live Key 到期日</FieldLabel>
                      <Input {...field} id="key-expires" type="date" />
                      <FieldDescription>选填。到期前提醒你更新应用密钥</FieldDescription>
                    </Field>
                  )}
                />
                <Controller
                  name="pushKey"
                  control={form.control}
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor="push-key">Live Push Partner Key</FieldLabel>
                      <PasswordInput {...field} id="push-key" autoComplete="off" placeholder={app?.hasPushKey ? "已保存，重新填写可替换" : "选填"} />
                      <FieldDescription>选填。Shopilot 先用它验证推送，没有时用 Partner Key</FieldDescription>
                    </Field>
                  )}
                />
              </FieldGroup>
            </Disclosure>
            <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm">
              <BellRingIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              保存后自动开启推送：买家消息、订单、物流、退货、授权到期提醒。不用你去控制台勾选。
            </p>
          </form>
        </Panel>
        <Panel>
          <PanelHeader title="填回 Shopee 控制台" description="App 设置里只有授权回跳域名要你手填；推送地址由 Shopilot 自动设置" />
          <CopyValue label="Live Redirect URL Domain" value={draft.urls.redirectDomain} />
          {draft.urls.webhook && <CopyValue label="Live Call Back URL" value={draft.urls.webhook} />}
          <p className="mt-2 text-xs text-muted-foreground">
            {draft.urls.webhook
              ? "推送地址是这个应用专属的，「验证并保存」时已自动写入 Shopee，控制台里显示的应与它一致。"
              : "推送地址是这个应用专属的，「验证并保存」后生成，并自动写入 Shopee。"}
          </p>
        </Panel>
      </div>

      <Panel className="xl:sticky xl:top-0">
        <h2 className="text-lg font-semibold">凭证检查</h2>
        <p className="text-xs text-muted-foreground">{app ? `Partner ID ${app.appKey} 已配置，Key 已加密保存` : "点「验证并保存」后逐区域校验"}</p>
        {(matched || failure) && (
          <p className="mt-3 text-[1.875rem] leading-tight font-semibold tabular-nums" aria-live="polite">
            {failure?.kind === "credentials" ? 0 : passCount} / 2{" "}
            <span className="ml-1 text-xs font-normal text-muted-foreground">项通过</span>
          </p>
        )}
        <ul className="mt-2">
          <CheckRow
            state={matched ? "ok" : failure?.kind === "credentials" ? "fail" : "idle"}
            title="Partner ID 与 Key 匹配"
            detail={
              matched ? (
                `已识别为${REGION_TEXT[okAttempt?.region ?? region ?? ""] ?? region ?? ""}`
              ) : failure?.kind === "credentials" ? (
                <span className="flex flex-col gap-0.5">
                  {failure.attempts.map((a) => (
                    <span key={a.region}>
                      {REGION_SHORT[a.region] ?? a.region}：{ATTEMPT_TEXT[a.result]}
                      {a.message ? `（${a.message}）` : ""}
                    </span>
                  ))}
                </span>
              ) : (
                "依次试中国大陆、全球、巴西控制台"
              )
            }
          />
          <CheckRow
            state={verified ? "ok" : failure?.kind === "occupied" ? "fail" : "idle"}
            title={result?.authorizedShops !== undefined ? `已有 ${result.authorizedShops} 家店授权给这个应用` : "推送回调指向 Shopilot"}
            detail={verified ? (result?.callbackState === "already_ours" ? "推送回调原本就指向 Shopilot，订阅已补齐" : "推送回调已改为 Shopilot，订阅 9 类推送") : failure?.kind === "occupied" ? "推送回调指向其他系统，确认后才改" : "校验通过后自动设置"}
          />
          <CheckRow state="info" title="聊天权限、买家姓名地址" detail="授权后在第 4 步按店检查" />
        </ul>

        {sandbox && (
          <div role="alert" className="mt-3 rounded-md bg-(--semantic-color-surface-warm) p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangleIcon className="size-4 text-(--semantic-color-feedback-warning)" aria-hidden />
              这是沙箱凭证，请换成 Live
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Test Partner ID 只能连沙箱，不能授权真实店铺。换成应用上线后的 Live 值；还没上线的，回
              <Link href="/shops/connect/shopee/guide#item-3" className="focus-ring rounded-sm text-(--semantic-color-text-link)">
                准备清单第 3 项
              </Link>
              。
            </p>
          </div>
        )}
        {failure?.kind === "occupied" && (
          <div role="alert" className="mt-3 rounded-md bg-(--semantic-color-surface-warm) p-3 text-sm">
            <p className="flex items-start gap-2 font-medium">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-(--semantic-color-feedback-warning)" aria-hidden />
              这个应用的推送现在发往另一个系统
            </p>
            <p className="mt-1 text-xs [overflow-wrap:anywhere] text-muted-foreground">当前回调：{failure.current}</p>
            <p className="mt-1 text-xs text-muted-foreground">改发到 Shopilot 后，原系统收不到 Shopee 推送。</p>
            <Controller
              name="overwriteCallback"
              control={form.control}
              render={({ field }) => (
                <label className="mt-2 flex cursor-pointer items-center gap-2">
                  <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                  改发到 Shopilot
                </label>
              )}
            />
            {overwrite && <p className="mt-1 text-xs text-muted-foreground">勾选后再点「验证并保存」。</p>}
          </div>
        )}
        {failure?.kind === "other" && (
          <p role="alert" className="mt-3 rounded-md bg-muted p-3 text-sm [overflow-wrap:anywhere] text-destructive">
            {failure.text}
          </p>
        )}

        <div className="mt-3">
          <Disclosure title="没通过时怎么办" id="creds-help">
            <dl className="flex flex-col gap-2 text-xs">
              <div>
                <dt className="font-medium">Partner ID 和 Key 对不上</dt>
                <dd className="text-muted-foreground">回控制台应用详情，重新复制 Live Partner ID 和 Live Partner Key，注意别带空格。</dd>
              </div>
              <div>
                <dt className="font-medium">粘贴的是测试环境的 ID</dt>
                <dd className="text-muted-foreground">Test Partner ID 只能连沙箱，换成应用上线后的 Live 值。</dd>
              </div>
              <div>
                <dt className="font-medium">连不上 Shopee</dt>
                <dd className="text-muted-foreground">平台暂时不可用或网络中断，稍后再试；连续失败可以预约远程协助。</dd>
              </div>
            </dl>
          </Disclosure>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          {verified ? (
            <>
              <Button onClick={() => router.push("/shops/connect/shopee/auth")}>
                <ArrowRightIcon />
                下一步：授权店铺
              </Button>
              <Button type="submit" form="creds-form" variant="outline" disabled={save.isPending}>
                {save.isPending && <Spinner />}
                重新验证并保存
              </Button>
            </>
          ) : (
            <Button type="submit" form="creds-form" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : <ArrowRightIcon />}
              {save.isPending ? "正在逐区域校验" : "验证并保存"}
            </Button>
          )}
          <Button asChild variant={verified ? "ghost" : "outline"}>
            <Link href="/shops/connect/shopee/guide">上一步</Link>
          </Button>
        </div>
      </Panel>
    </div>
  );
}

// ---------- TikTok ----------

function TiktokCredentials({ draft }: { draft: ConnectDraft }) {
  const app = draft.app;
  const schema = z
    .object({
      appKey: z.string().trim().regex(/^[A-Za-z0-9]{4,40}$/, "App Key 由字母和数字组成，从应用详情页复制"),
      appSecret: z.string().trim(),
      serviceId: z.string().trim().regex(/^\d{6,30}$/, "Service ID 是一串数字，从 Partner Center 应用详情页复制"),
      shopRegion: z.enum(TIKTOK_REGIONS),
    })
    .superRefine((v, ctx) => {
      if (!v.appSecret && (!app || app.appKey !== v.appKey)) ctx.addIssue({ code: "custom", path: ["appSecret"], message: "请填 App Secret" });
    });
  type Values = z.infer<typeof schema>;
  const connected = new Set(draft.shops.filter((s) => s.status !== "disconnected").map((s) => s.market));
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { appKey: app?.appKey ?? "", appSecret: "", serviceId: app?.serviceId ?? "", shopRegion: TIKTOK_REGIONS.find((r) => !connected.has(r)) ?? "MY" },
  });
  const appKey = useWatch({ control: form.control, name: "appKey" });
  const keyOk = /^[A-Za-z0-9]{4,40}$/.test(appKey.trim());

  const go = useMutation({
    mutationFn: async (v: Values) => {
      // 新填了 Secret，或 Service ID 与已保存的不同，才需要先保存应用
      if (v.appSecret || v.serviceId !== app?.serviceId) {
        await api.put<SaveAppResult>("/api/v1/platform-apps/tiktok", { appKey: v.appKey, serviceId: v.serviceId, ...(v.appSecret ? { appSecret: v.appSecret } : {}) });
      }
      return api.post<{ url: string }>("/api/v1/platform-apps/tiktok/auth-url", { shopRegion: v.shopRegion });
    },
    onSuccess: (r) => window.location.assign(r.url),
    onError: (e) => {
      if (e instanceof ApiError && e.type === "validation") {
        const fields = (e.problem.extra?.fields ?? {}) as Record<string, string>;
        for (const [k, msg] of Object.entries(fields)) if (k in form.getValues()) form.setError(k as keyof Values, { message: msg });
      } else toast.error(errorText(e));
    },
  });

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Panel>
          <PanelHeader title="应用凭证" description="Partner Center → App & Service → 你的 Custom app" />
          <form id="creds-form" noValidate onSubmit={form.handleSubmit((v) => go.mutate(v))}>
            <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Controller
                name="appKey"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="app-key">App Key</FieldLabel>
                    <Input {...field} id="app-key" autoComplete="off" placeholder="例如 mockttwiz01" aria-invalid={fieldState.invalid} />
                    <FieldDescription>应用详情页里的 App Key</FieldDescription>
                    {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                  </Field>
                )}
              />
              <Controller
                name="appSecret"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="app-secret">App Secret</FieldLabel>
                    <PasswordInput {...field} id="app-secret" autoComplete="off" placeholder={app ? "已保存，重新填写可替换" : "粘贴 App Secret"} aria-invalid={fieldState.invalid} />
                    <FieldDescription>同一页面的 App Secret</FieldDescription>
                    {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                  </Field>
                )}
              />
              <Controller
                name="serviceId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="service-id">Service ID</FieldLabel>
                    <Input {...field} id="service-id" autoComplete="off" inputMode="numeric" placeholder="例如 7000000000000000003" aria-invalid={fieldState.invalid} />
                    <FieldDescription>在 Partner Center 应用详情（App &amp; Service）页可以看到</FieldDescription>
                    {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                  </Field>
                )}
              />
              <Controller
                name="shopRegion"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="shop-region">先授权哪个站点</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="shop-region" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIKTOK_REGIONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                            {connected.has(r) ? "（已连接）" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>跨境店每个站点授权一次，其他站点在下一步继续连接</FieldDescription>
                  </Field>
                )}
              />
            </FieldGroup>
          </form>
        </Panel>
        <Panel>
          <PanelHeader title="填回 Partner Center" description="在应用的 Enable API 里粘贴，只有这一项要你手填" />
          <CopyValue label="Redirect URL" value={draft.urls.redirect} />
          {draft.urls.webhook && <CopyValue label="Webhook URL" value={draft.urls.webhook} />}
          <p className="mt-2 text-xs text-muted-foreground">
            {draft.urls.webhook
              ? "Webhook URL 是这个应用专属的，授权后 Shopilot 按店自动设置，Partner Center 里可以留空。"
              : "Webhook URL 是这个应用专属的，保存凭证后生成，授权后 Shopilot 按店自动设置，Partner Center 里可以留空。"}
          </p>
        </Panel>
      </div>
      <Panel className="xl:sticky xl:top-0">
        <h2 className="text-lg font-semibold">凭证检查</h2>
        <ul className="mt-2">
          <CheckRow state={keyOk ? "ok" : "idle"} title={keyOk ? "App Key 格式正确" : "App Key 格式"} detail={appKey.trim() ? `${appKey.trim().length} 位` : "字母和数字组成"} />
          <CheckRow state="info" title="App Secret 要到授权时才能校验" detail="平台不提供单独校验 Secret 的方法；授权失败时会告诉你是不是 Secret 填错了" />
          {app?.status === "invalid" && <CheckRow state="fail" title="上次授权时 Secret 没通过" detail="重新粘贴 App Secret 再授权" />}
        </ul>
        <div className="mt-5 flex flex-col gap-2">
          <Button type="submit" form="creds-form" disabled={go.isPending}>
            {go.isPending ? <Spinner /> : <ArrowRightIcon />}
            保存并去授权
          </Button>
          <Button asChild variant="outline">
            <Link href="/shops/connect/tiktok/guide">上一步</Link>
          </Button>
        </div>
      </Panel>
    </div>
  );
}
