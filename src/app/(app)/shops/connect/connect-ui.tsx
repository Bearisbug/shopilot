"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, CheckIcon, ChevronDownIcon, ClipboardListIcon, CopyIcon, SaveIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import { ASSIST_STEPS, assistBody, type AssistBody, type ConnectDraft, type DraftBody, type PlatformKey } from "@/contracts/shops";
import { PageActions } from "@/components/shell/app-shell";
import { useDialogParam } from "@/components/shell/global-dialogs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, errorText, newKey } from "@/lib/api";
import { inTz } from "@/lib/format";
import { cn } from "@/lib/utils";

export const PLATFORM_LABEL: Record<PlatformKey, string> = { shopee: "Shopee", tiktok: "TikTok Shop" };

/** 路由参数里的平台；不是两个平台之一时返回 null（页面显示找不到） */
export function usePlatformParam(): PlatformKey | null {
  const p = useParams<{ platform: string }>().platform;
  return p === "shopee" || p === "tiktok" ? p : null;
}

export function useDraft(platform: PlatformKey) {
  return useQuery({ queryKey: ["connect-draft", platform], queryFn: () => api.get<ConnectDraft>(`/api/v1/connect/drafts/${platform}`) });
}

export function useSaveDraft(platform: PlatformKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DraftBody) => api.put<ConnectDraft>(`/api/v1/connect/drafts/${platform}`, body),
    onSuccess: (d) => qc.setQueryData(["connect-draft", platform], d),
  });
}

/** 顶栏「保存草稿」：只存步骤与勾选，不存任何凭证 */
export function SaveDraftAction({ platform, body }: { platform: PlatformKey; body: () => DraftBody }) {
  const save = useSaveDraft(platform);
  return (
    <PageActions>
      <Button
        variant="outline"
        disabled={save.isPending}
        onClick={() =>
          save.mutate(body(), {
            onSuccess: () => toast.success("草稿已保存，下次从这里继续"),
            onError: (e) => toast.error(errorText(e)),
          })
        }
      >
        {save.isPending ? <Spinner /> : <SaveIcon />}
        保存草稿
      </Button>
    </PageActions>
  );
}

export function ConnectHeader({ subtitle, back = "/shops" }: { subtitle: React.ReactNode; back?: string }) {
  return (
    <div className="flex items-start gap-3 pt-2 pb-5">
      <Button asChild variant="ghost" size="icon-sm" className="mt-0.5">
        <Link href={back} aria-label="返回">
          <ArrowLeftIcon className="size-5" />
        </Link>
      </Button>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">接入平台应用</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

type StepKey = "platform" | "guide" | "credentials" | "auth" | "probe";
const STEP_SUB: Record<PlatformKey | "none", Record<Exclude<StepKey, "platform">, string>> = {
  none: { guide: "在平台上建应用", credentials: "粘贴后自动校验", auth: "店主账号确认", probe: "能力 · 历史记录 · AI" },
  shopee: { guide: "在开放平台建应用", credentials: "Partner ID · Key", auth: "主账号一次授权", probe: "能力 · 历史记录 · AI" },
  tiktok: { guide: "在 Partner Center 建应用", credentials: "App Key · Secret", auth: "按站点连接", probe: "能力 · 历史记录 · AI" },
};

/** 四步进度（准备应用不计入四步，只在准备清单页显示） */
export function Stepper({ platform, current }: { platform: PlatformKey | null; current: StepKey }) {
  const sub = STEP_SUB[platform ?? "none"];
  const steps: Array<{ key: StepKey; title: string; sub: string; n: number | null }> = [
    { key: "platform", title: "选择平台", sub: platform ? PLATFORM_LABEL[platform] : "两个平台选一", n: 1 },
    ...(current === "guide" ? [{ key: "guide" as const, title: "准备应用", sub: sub.guide, n: null }] : []),
    { key: "credentials", title: "应用凭证", sub: sub.credentials, n: 2 },
    { key: "auth", title: "授权店铺", sub: sub.auth, n: 3 },
    { key: "probe", title: "检查并完成", sub: sub.probe, n: 4 },
  ];
  const order: StepKey[] = ["platform", "guide", "credentials", "auth", "probe"];
  const at = order.indexOf(current);
  return (
    <ol className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-(--semantic-radius-lg) bg-card p-5 md:flex md:justify-between" aria-label="接入步骤">
      {steps.map((s) => {
        const idx = order.indexOf(s.key);
        const state = idx < at ? "done" : idx === at ? "current" : "todo";
        return (
          <li key={s.key} aria-current={state === "current" ? "step" : undefined} className="flex min-w-0 items-center gap-3 md:flex-1">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-sm tabular-nums",
                state === "done" && "bg-(--semantic-color-surface-inverse) text-(--semantic-color-text-on-inverse)",
                state === "current" && "bg-primary font-semibold text-primary-foreground",
                state === "todo" && "border border-border text-muted-foreground",
              )}
            >
              {state === "done" ? <CheckIcon className="size-4" aria-hidden /> : s.n === null ? <ClipboardListIcon className="size-4" aria-hidden /> : s.n}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-sm", state === "current" ? "font-semibold" : state === "todo" && "text-muted-foreground")}>
                {s.title}
                <span className="sr-only">{state === "done" ? "（已完成）" : state === "current" ? "（当前）" : ""}</span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">{s.sub}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** 可展开的说明块（「高级（可选）」「没通过时怎么办」等） */
export function Disclosure({ title, children, defaultOpen = false, id }: { title: string; children: React.ReactNode; defaultOpen?: boolean; id: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="state-layer focus-ring -mx-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm font-medium text-(--semantic-color-text-link)"
      >
        <ChevronDownIcon className={cn("size-4 transition-transform duration-(--semantic-motion-duration-fast)", !open && "-rotate-90")} aria-hidden />
        {title}
      </button>
      {open && (
        <div id={id} className="mt-2">
          {children}
        </div>
      )}
    </div>
  );
}

/** 按容器宽度排版：放进窄卡片（如店铺页侧栏）时标签单独一行，容器 ≥ 28rem 才与地址并排 */
export function CopyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="@container border-b border-border py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="w-full shrink-0 text-sm text-muted-foreground @md:w-40">{label}</span>
        <code className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{value}</code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-(--semantic-color-text-link)"
          onClick={() =>
            navigator.clipboard
              .writeText(value)
              .then(() => toast.success(`已复制：${value}`))
              .catch(() => toast.error("复制没有成功，请手动选中复制"))
          }
        >
          <CopyIcon />
          复制
        </Button>
      </div>
    </div>
  );
}

/** 页面级状态：读草稿失败或平台参数非法 */
export function NotAPlatform() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <p className="text-lg font-semibold">没有这个平台</p>
      <p className="text-sm text-muted-foreground">目前只支持 Shopee 与 TikTok Shop。</p>
      <Button asChild variant="outline">
        <Link href="/shops/connect">回到选择平台</Link>
      </Button>
    </div>
  );
}

// ---------- 预约远程协助（REQ-SHOP-011，?dialog=assist） ----------

/** 时段：按商户时区推出今天起三天的四个常用时段；今天已经结束的时段不给选 */
const DEFAULT_SLOT = "明天 10:00–12:00";
function slotOptions(timezone: string): string[] {
  const now = inTz(new Date(), timezone, "HH:mm");
  return [{ day: "今天", from: "16:00", to: "18:00" }, { day: "明天", from: "10:00", to: "12:00" }, { day: "明天", from: "14:00", to: "18:00" }, { day: "后天", from: "10:00", to: "12:00" }]
    .filter((s) => s.day !== "今天" || now < s.to)
    .map((s) => `${s.day} ${s.from}–${s.to}`);
}

// 表单直接用接口的 assistBody 校验：电话、邮箱格式错误落在字段下，不再走到提交
type AssistValues = AssistBody;

export function AssistDialog({ me, platform }: { me: Me; platform?: PlatformKey }) {
  const { open, close } = useDialogParam("assist");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>预约远程协助</DialogTitle>
          <DialogDescription>Shopilot 支持人员视频指导你在平台后台操作</DialogDescription>
        </DialogHeader>
        <AssistForm me={me} platform={platform} close={close} />
      </DialogContent>
    </Dialog>
  );
}

function AssistForm({ me, platform, close }: { me: Me; platform?: PlatformKey; close: () => void }) {
  const [key] = useState(newKey);
  const shopeeDraft = useDraft("shopee");
  const tiktokDraft = useDraft("tiktok");
  const initialPlatform = platform ?? "shopee";
  const presetStep = (p: PlatformKey) => {
    const d = (p === "shopee" ? shopeeDraft : tiktokDraft).data;
    if (!d) return `${p}-1`;
    if (d.step === "credentials") return `${p}-creds`;
    if (d.step === "auth" || d.step === "probe") return `${p}-auth`;
    const firstOpen = (["1", "2", "3", "4", "5"] as const).find((k) => !d.checklist[k]);
    return `${p}-${firstOpen ?? "1"}`;
  };
  const slots = slotOptions(me.active.timezone);
  const form = useForm<AssistValues>({
    resolver: zodResolver(assistBody),
    mode: "onTouched",
    defaultValues: { platform: initialPlatform, stuckStep: presetStep(initialPlatform), slot: DEFAULT_SLOT, contactChannel: "email", contact: me.user.email, note: "" },
  });
  const p = useWatch({ control: form.control, name: "platform" });
  const channel = useWatch({ control: form.control, name: "contactChannel" });
  const submit = useMutation({
    mutationFn: (v: AssistValues) => api.post("/api/v1/assist-requests", { ...v, note: v.note || undefined }, key),
    onSuccess: () => {
      toast.success("已提交协助预约，支持人员会按你选的时段联系你");
      close();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <form noValidate onSubmit={form.handleSubmit((v) => submit.mutate(v))} className="flex flex-col gap-4">
      <FieldGroup>
        <Controller
          name="platform"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel>平台</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={field.value}
                onValueChange={(v) => {
                  if (!v) return;
                  field.onChange(v);
                  form.setValue("stuckStep", presetStep(v as PlatformKey));
                }}
                aria-label="平台"
              >
                <ToggleGroupItem value="shopee">
                  Shopee
                </ToggleGroupItem>
                <ToggleGroupItem value="tiktok">
                  TikTok Shop
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
          )}
        />
        <Controller
          name="stuckStep"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="assist-step">卡在哪一步</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="assist-step" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIST_STEPS.filter((s) => s.platform === p).map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>按你的接入草稿预填</FieldDescription>
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </Field>
          )}
        />
        <Controller
          name="slot"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="assist-slot">方便的时段（{me.active.timezone}）</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="assist-slot" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {slots.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
        <Controller
          name="contactChannel"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel>联系方式</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={field.value}
                onValueChange={(v) => {
                  if (!v) return;
                  field.onChange(v);
                  form.setValue("contact", v === "email" ? me.user.email : "");
                }}
                aria-label="联系方式"
              >
                <ToggleGroupItem value="email">
                  邮箱
                </ToggleGroupItem>
                <ToggleGroupItem value="phone">
                  电话
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
          )}
        />
        <Controller
          name="contact"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="assist-contact">{channel === "email" ? "邮箱" : "电话"}</FieldLabel>
              <Input
                {...field}
                id="assist-contact"
                type={channel === "email" ? "email" : "tel"}
                inputMode={channel === "email" ? "email" : "tel"}
                autoComplete={channel === "email" ? "email" : "tel"}
                placeholder={channel === "email" ? "name@example.com" : "+60 12 345 6789"}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </Field>
          )}
        />
      </FieldGroup>
      <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        协助时由你本人操作平台后台，Shopilot 不需要你的平台账号和密码。
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          取消
        </Button>
        <Button type="submit" disabled={submit.isPending}>
          {submit.isPending && <Spinner />}
          提交
        </Button>
      </DialogFooter>
    </form>
  );
}
