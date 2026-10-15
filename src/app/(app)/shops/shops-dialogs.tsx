"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CopyIcon, ExternalLinkIcon, ShieldCheckIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { Me } from "@/contracts/auth";
import type { AuthUrlResult, DisconnectResult, PlatformAppCard, ShopRow } from "@/contracts/shops";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PlatformBadge } from "@/components/common/platform-badge";
import { PasswordInput } from "@/components/forms/password-input";
import { useDialogParam } from "@/components/shell/global-dialogs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError, api, errorText, newKey } from "@/lib/api";
import { inTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Disclosure } from "./connect/connect-ui";

const PLATFORM_LABEL = { shopee: "Shopee", tiktok: "TikTok Shop" } as const;

// ---------- ?dialog=rotate-key（REQ-SHOP-008） ----------

export function RotateKeyDialog({ apps }: { apps: PlatformAppCard[] }) {
  const { open, close } = useDialogParam("rotate-key");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>更新应用密钥</DialogTitle>
          <DialogDescription>在平台重置密钥后在这里更新；先用新密钥试连一次平台，通过才替换</DialogDescription>
        </DialogHeader>
        {apps.length === 0 ? <p className="text-sm text-muted-foreground">还没有平台应用，先在接入向导里填凭证。</p> : <RotateForm apps={apps} close={close} />}
      </DialogContent>
    </Dialog>
  );
}

const rotateForm = z.object({ secret: z.string().trim().min(1, "请填新的密钥"), pushKey: z.string().trim().optional() });
type RotateValues = z.infer<typeof rotateForm>;

function RotateForm({ apps, close }: { apps: PlatformAppCard[]; close: () => void }) {
  const qc = useQueryClient();
  const [platform, setPlatform] = useState(apps[0].platform);
  const [key, setKey] = useState(newKey);
  const app = apps.find((a) => a.platform === platform) ?? apps[0];
  const form = useForm<RotateValues>({ resolver: zodResolver(rotateForm), mode: "onTouched", defaultValues: { secret: "", pushKey: "" } });
  const rotate = useMutation({
    mutationFn: (v: RotateValues) =>
      api.post(`/api/v1/platform-apps/${app.platform}/rotate`, app.platform === "shopee" ? { partnerKey: v.secret, pushKey: v.pushKey || undefined } : { appSecret: v.secret }, key),
    onSuccess: () => {
      toast.success(`${PLATFORM_LABEL[app.platform]} 应用密钥已替换，旧密钥作废`);
      qc.invalidateQueries({ queryKey: ["shops"] });
      close();
    },
    onError: (e) => {
      setKey(newKey());
      if (e instanceof ApiError && (e.type === "platform-credentials" || e.type === "validation")) form.setError("secret", { message: e.problem.detail ?? "新密钥没有通过校验" });
      else toast.error(errorText(e));
    },
  });
  const label = app.platform === "shopee" ? "新的 Partner Key" : "新的 App Secret";
  return (
    <form noValidate onSubmit={form.handleSubmit((v) => rotate.mutate(v))} className="flex flex-col gap-4">
      {apps.length > 1 && (
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={platform}
          onValueChange={(v) => {
            if (!v) return;
            setPlatform(v as typeof platform);
            form.reset();
          }}
          aria-label="选择应用"
        >
          {apps.map((a) => (
            <ToggleGroupItem key={a.id} value={a.platform}>
              {PLATFORM_LABEL[a.platform]} · {a.appKey}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      <FieldGroup>
        <Controller
          name="secret"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="rotate-secret">{label}</FieldLabel>
              <PasswordInput {...field} id="rotate-secret" autoComplete="off" aria-invalid={fieldState.invalid} />
              <FieldDescription>{app.platform === "shopee" ? "在 Shopee 控制台应用详情里重置后复制" : "Partner Center → App & Service → 应用详情"}</FieldDescription>
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </Field>
          )}
        />
        {app.platform === "shopee" && (
          <Disclosure title="高级（可选）" id="rotate-advanced">
            <Controller
              name="pushKey"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="rotate-push">新的 Push Partner Key</FieldLabel>
                  <PasswordInput {...field} id="rotate-push" autoComplete="off" />
                  <FieldDescription>只换了 Partner Key 时留空</FieldDescription>
                </Field>
              )}
            />
          </Disclosure>
        )}
      </FieldGroup>
      <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        保存前先用新密钥试连一次平台，通过才替换；没通过就保留旧密钥，店铺不断线。
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          取消
        </Button>
        <Button type="submit" disabled={rotate.isPending}>
          {rotate.isPending && <Spinner />}
          验证并替换
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------- ?dialog=reauth（REQ-SHOP-009） ----------

export function ReauthDialog({ me, shops }: { me: Me; shops: ShopRow[] }) {
  const { open, close } = useDialogParam("reauth");
  const params = useSearchParams();
  const focus = params.get("shop");
  const live = shops.filter((s) => s.status !== "disconnected");
  const shopee = live.filter((s) => s.platform === "shopee");
  const tiktok = live.filter((s) => s.platform === "tiktok");
  const auth = useMutation({ mutationFn: (v: { platform: "shopee" | "tiktok"; shopId: string }) => api.post<AuthUrlResult>(`/api/v1/platform-apps/${v.platform}/auth-url`, { shopId: v.shopId }) });
  const [busy, setBusy] = useState<string | null>(null);
  const shopeeTarget = shopee.find((s) => s.id === focus) ?? shopee[0];
  const earliest = shopee.map((s) => s.authExpiresAt).filter(Boolean).sort()[0];
  // 授权页一律在新标签打开，当前页不跳走：先同步开空白标签再填地址，避免异步后被浏览器拦截弹窗
  const go = (platform: "shopee" | "tiktok", shopId: string, mode: "open" | "copy") => {
    const tab = mode === "open" ? window.open("", "_blank") : null;
    setBusy(`${shopId}:${mode}`);
    auth.mutate(
      { platform, shopId },
      {
        onSuccess: (r) => {
          setBusy(null);
          if (mode === "open") {
            if (!tab) return void window.open(r.url, "_blank", "noopener");
            tab.opener = null;
            tab.location.href = r.url;
            return;
          }
          navigator.clipboard
            .writeText(r.url)
            .then(() => toast.success("授权链接已复制，5 分钟内有效"))
            .catch(() => toast.error("复制没有成功，请改用「在新标签打开」"));
        },
        onError: (e) => {
          tab?.close();
          setBusy(null);
          toast.error(errorText(e));
        },
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>续期授权</DialogTitle>
          <DialogDescription>授权快到期、授权失效或补了权限后，用店主账号重新确认一次</DialogDescription>
        </DialogHeader>
        {live.length === 0 && <p className="text-sm text-muted-foreground">没有可续期的店铺。已断开的店请到接入向导重新接入。</p>}
        {shopeeTarget && (
          <section aria-labelledby="reauth-shopee">
            <h3 id="reauth-shopee" className="text-sm font-semibold">
              Shopee · 主账号授权
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              一次确认覆盖主账号下 {shopee.length} 家已接入的店{earliest ? `，当前最早 ${inTz(earliest, me.active.timezone, "yyyy-MM-dd")} 到期` : ""}；确认后重新算满 1 年。
              {shopee.some((s) => s.status === "auth_expired") && " 授权失效的店续期后恢复收发。"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={busy !== null} onClick={() => go("shopee", shopeeTarget.id, "open")}>
                {busy === `${shopeeTarget.id}:open` ? <Spinner /> : <ExternalLinkIcon />}
                在新标签打开授权页
              </Button>
              <Button variant="outline" disabled={busy !== null} onClick={() => go("shopee", shopeeTarget.id, "copy")}>
                {busy === `${shopeeTarget.id}:copy` ? <Spinner /> : <CopyIcon />}
                复制授权链接
              </Button>
            </div>
          </section>
        )}
        {tiktok.length > 0 && (
          <section aria-labelledby="reauth-tiktok" className={cn("min-w-0", shopeeTarget && "border-t border-border pt-4")}>
            <h3 id="reauth-tiktok" className="text-sm font-semibold">
              TikTok Shop · 按站点
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">跨境店每个站点单独确认一次。复制的链接 5 分钟内有效，在已登录该店卖家账号的浏览器里打开。</p>
            <ul className="mt-2">
              {tiktok.map((s) => (
                <li key={s.id} className={cn("flex items-center gap-3 border-b border-border py-2.5 last:border-0", s.id === focus && "bg-accent")}>
                  <span className="w-8 text-sm font-medium">{s.market}</span>
                  {/* 到期日放在店名下面：窄屏时一行放得下「复制链接」和新标签按钮 */}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{s.name}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">{s.status === "auth_expired" ? "授权失效" : `至 ${inTz(s.authExpiresAt, me.active.timezone, "yyyy-MM-dd")}`}</span>
                  </span>
                  <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => go("tiktok", s.id, "copy")}>
                    {busy === `${s.id}:copy` ? <Spinner /> : <CopyIcon />}
                    复制链接
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`在新标签打开 ${s.market} 授权页`} disabled={busy !== null} onClick={() => go("tiktok", s.id, "open")}>
                        {busy === `${s.id}:open` ? <Spinner /> : <ExternalLinkIcon />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>在新标签打开授权页</TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </section>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- ?dialog=disconnect&shop=（REQ-SHOP-010） ----------

export function DisconnectDialog({ shops }: { shops: ShopRow[] }) {
  const { open, close } = useDialogParam("disconnect");
  const params = useSearchParams();
  const shop = shops.find((s) => s.id === params.get("shop"));
  if (!open) return null;
  if (!shop) {
    return (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>断开店铺</DialogTitle>
            <DialogDescription>没有找到要断开的店铺，可能已被删除。从店铺列表打开店铺详情后再点「断开」。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  return <DisconnectBody key={shop.id} shop={shop} close={close} />;
}

function DisconnectBody({ shop, close }: { shop: ShopRow; close: () => void }) {
  const qc = useQueryClient();
  const [deleteHistory, setDeleteHistory] = useState(false);
  const [key] = useState(newKey);
  const cancelUrl = useMutation({ mutationFn: () => api.post<AuthUrlResult>(`/api/v1/shops/${shop.id}/cancel-auth-url`) });
  const disconnect = useMutation({
    mutationFn: () => api.post<DisconnectResult>(`/api/v1/shops/${shop.id}/disconnect`, { keepHistory: !deleteHistory }, key),
    onSuccess: (r) => {
      toast.success(
        `已断开「${shop.name}」${r.closedConversations ? `，${r.closedConversations} 个进行中的会话已结束` : ""}${deleteHistory ? `，删除 ${r.deletedConversations} 个会话、${r.deletedOrders} 张订单` : ""}`,
      );
      r.warnings.forEach((w) => toast.warning(w));
      qc.invalidateQueries({ queryKey: ["shops"] });
      qc.invalidateQueries({ queryKey: ["shop", shop.id] });
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["nav-summary"] });
      close();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  // 撤销授权页在新标签打开：先开空白标签再填地址，避免异步后被浏览器拦截弹窗
  const openCancel = () => {
    const tab = window.open("", "_blank");
    cancelUrl.mutate(undefined, {
      onSuccess: (r) => {
        if (tab) tab.location.href = r.url;
        else window.location.assign(r.url);
      },
      onError: (e) => {
        tab?.close();
        toast.error(errorText(e));
      },
    });
  };
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && close()}
      title="断开店铺"
      destructive
      confirmText="断开"
      pending={disconnect.isPending}
      onConfirm={() => disconnect.mutate()}
      desc={
        <div className="flex flex-col gap-2 text-sm">
          <p className="flex flex-wrap items-center gap-1.5 text-foreground">
            断开「{shop.name}」
            <PlatformBadge platform={shop.platform} market={shop.market} />
            后：
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>Shopilot 删除这家店的授权，停止收消息、出草稿、同步订单。</li>
            <li>工作台里正在进行的会话转为已结束{deleteHistory ? "，并随历史一起删除" : "，可以在已结束里查到"}。</li>
            {shop.platform === "tiktok" && <li>先在 TikTok 关闭这家店的坐席接单。</li>}
            <li>可以随时在接入向导里重新接入，沿用这家店原来的记录。</li>
          </ul>
        </div>
      }
    >
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <Checkbox checked={deleteHistory} onCheckedChange={(v) => setDeleteHistory(v === true)} className="mt-0.5" />
        <span>
          同时删除这家店的历史会话与订单镜像
          <span className="block text-xs text-muted-foreground">删除后不可恢复；不勾时历史保留</span>
        </span>
      </label>
      {shop.platform === "shopee" ? (
        <div className="rounded-md bg-muted p-3 text-sm">
          <p className="font-medium">Shopee 侧的授权不会自动撤销</p>
          <p className="mt-0.5 text-xs text-muted-foreground">要在 Shopee 侧也撤销，用主账号打开撤销授权页确认；撤销作用于主账号授权给这个应用的全部店铺。</p>
          <Button variant="outline" size="sm" className="mt-2" disabled={cancelUrl.isPending} onClick={openCancel}>
            {cancelUrl.isPending ? <Spinner /> : <ExternalLinkIcon />}
            打开撤销授权页
          </Button>
        </div>
      ) : (
        <div className="rounded-md bg-muted p-3 text-sm">
          <p className="font-medium">TikTok 没有撤销授权的开放接口</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Shopilot 只能删除本地保存的授权。要在 TikTok 侧撤销，请卖家到 Seller Center 的授权管理里操作。</p>
        </div>
      )}
    </ConfirmDialog>
  );
}
