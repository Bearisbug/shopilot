"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertTriangleIcon, ArrowRightIcon, CopyIcon, ExternalLinkIcon, InfoIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import { TIKTOK_REGIONS, type AuthUrlResult, type ConnectDraft, type OAuthReason, type PlatformKey } from "@/contracts/shops";
import { useDialogParam } from "@/components/shell/global-dialogs";
import { ErrorState, LoadingRows, PageScroll, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, errorText } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AssistDialog, ConnectHeader, Disclosure, SaveDraftAction, Stepper, useDraft } from "../../connect-ui";

const REASON: Record<OAuthReason, { title: string; next: (p: PlatformKey, openAssist: () => void) => React.ReactNode }> = {
  state_invalid: {
    title: "授权链接已过期，请重新打开",
    next: () => "授权链接 5 分钟内有效，而且只能用一次。点下面的按钮重新生成链接再授权。",
  },
  secret_or_redirect_mismatch: {
    title: "Secret 错误或 Redirect URL 不一致",
    next: () => (
      <>
        回
        <Link href="/shops/connect/tiktok" className="focus-ring rounded-sm text-(--semantic-color-text-link)">
          应用凭证
        </Link>
        重新粘贴 App Secret；如果 Secret 没错，核对 Partner Center 里填的 Redirect URL 是否和
        <Link href="/shops/connect/tiktok/guide#item-3" className="focus-ring rounded-sm text-(--semantic-color-text-link)">
          准备清单第 3 项
        </Link>
        给的一致。
      </>
    ),
  },
  sub_account: {
    title: "这次没有接入任何店铺",
    next: () => "你用的是店铺子账号或单店授权。换开店时的主账号登录 Shopee，重新打开授权页，一次勾选全部店铺。",
  },
  denied: {
    title: "你在平台授权页拒绝了授权",
    next: () => "没有接入任何店铺。需要时重新打开授权页，确认授权。",
  },
  shop_limit: {
    title: "店铺数超过套餐上限，这次授权没有接入",
    next: () => (
      <>
        当前套餐能接入的店铺数已满。
        <Link href="/billing/plans" className="focus-ring rounded-sm font-medium text-(--semantic-color-text-link)">
          升级套餐
        </Link>
        后重新授权，或先在「店铺与连接」断开不用的店。
      </>
    ),
  },
  platform_error: {
    title: "平台返回错误，授权没有完成",
    next: (_p, openAssist) => (
      <>
        稍后重新打开授权页再试；连续失败可以
        <button type="button" onClick={openAssist} className="focus-ring rounded-sm text-(--semantic-color-text-link)">
          预约远程协助
        </button>
        。
      </>
    ),
  },
};

function ErrorBanner({ platform, reason, openAssist }: { platform: PlatformKey; reason: string; openAssist: () => void }) {
  const r = REASON[reason as OAuthReason] ?? REASON.platform_error;
  return (
    <div role="alert" className="mb-4 flex items-start gap-3 rounded-(--semantic-radius-lg) bg-(--semantic-color-surface-warm) p-4">
      <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-(--semantic-color-feedback-warning)" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">授权没有成功：{r.title}</p>
        <p className="mt-1 text-muted-foreground">{r.next(platform, openAssist)}</p>
      </div>
    </div>
  );
}

function useAuthUrl(platform: PlatformKey) {
  return useMutation({ mutationFn: (body: { shopRegion?: string; shopId?: string }) => api.post<AuthUrlResult>(`/api/v1/platform-apps/${platform}/auth-url`, body) });
}

export function AuthClient({ me, platform }: { me: Me; platform: PlatformKey }) {
  const draft = useDraft(platform);
  const params = useSearchParams();
  const assist = useDialogParam("assist");
  const reason = params.get("result") === "error" ? params.get("reason") : null;
  const d = draft.data;
  const sites = d?.shops.filter((s) => s.status !== "disconnected").length ?? 0;
  return (
    <PageScroll>
      <SaveDraftAction platform={platform} body={() => ({ step: "auth" })} />
      <ConnectHeader
        back="/shops/connect"
        subtitle={platform === "shopee" ? "Shopee · 第 3 步，共 4 步 · 用主账号一次授权多家店" : `TikTok Shop · 第 3 步，共 4 步${d ? ` · ${sites ? `${sites} 个站点已连接` : "还没有连接站点"}` : ""}`}
      />
      <Stepper platform={platform} current="auth" />
      {reason && <ErrorBanner platform={platform} reason={reason} openAssist={assist.openIt} />}
      {draft.isError ? (
        <ErrorState error={draft.error} onRetry={() => draft.refetch()} />
      ) : !d ? (
        <LoadingRows />
      ) : platform === "shopee" ? (
        <ShopeeAuth draft={d} retry={Boolean(reason)} />
      ) : (
        <TiktokAuth draft={d} />
      )}
      <AssistDialog me={me} platform={platform} />
    </PageScroll>
  );
}

function NextPanel({ draft, children }: { draft: ConnectDraft; children: React.ReactNode }) {
  const router = useRouter();
  const pending = draft.pendingShops;
  return (
    <Panel className="xl:sticky xl:top-0">
      {children}
      <div className="mt-5 flex flex-col gap-2">
        {pending > 0 ? (
          <Button onClick={() => router.push(`/shops/connect/${draft.platform}/probe`)}>
            <ArrowRightIcon />
            下一步：检查并完成（{pending} 家店）
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" aria-disabled="true" onClick={(e) => e.preventDefault()}>
                <ArrowRightIcon />
                下一步：检查并完成
              </Button>
            </TooltipTrigger>
            <TooltipContent>还没有授权店铺；授权完成后会自动进入检查</TooltipContent>
          </Tooltip>
        )}
        <Button asChild variant="outline">
          <Link href={`/shops/connect/${draft.platform}`}>上一步</Link>
        </Button>
      </div>
    </Panel>
  );
}

function ShopeeAuth({ draft, retry }: { draft: ConnectDraft; retry: boolean }) {
  const open = useAuthUrl("shopee");
  const copy = useAuthUrl("shopee");
  const app = draft.app;
  const blocked = !app ? "还没有保存应用凭证，先完成上一步" : app.sandboxOnly ? "这是沙箱凭证，不能授权真实店铺；回上一步换成 Live Partner ID 与 Key" : app.status !== "verified" ? "应用凭证还没有校验通过，回上一步点「验证并保存」" : null;
  const primaryOpen = draft.pendingShops === 0;
  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Panel>
        <PanelHeader title="授权店铺" description="用开店时的主账号登录 Shopee，勾选要交给 Shopilot 的店铺" />
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm marker:text-muted-foreground">
          <li>
            点「打开授权页」，用 Shopee <strong className="font-semibold">主账号</strong> 登录卖家中心。
          </li>
          <li>勾选要交给 Shopilot 的店铺，确认授权。</li>
          <li>授权完成后自动回到这里，进入最后一步检查。</li>
        </ol>
        {blocked && (
          <p role="status" className="mt-4 flex items-start gap-2 rounded-md bg-(--semantic-color-surface-warm) px-3 py-2 text-sm">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-(--semantic-color-feedback-warning)" aria-hidden />
            {blocked}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {blocked ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={primaryOpen ? "default" : "outline"} aria-disabled="true" onClick={(e) => e.preventDefault()}>
                  <ExternalLinkIcon />
                  打开授权页
                </Button>
              </TooltipTrigger>
              <TooltipContent>{blocked}</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant={primaryOpen ? "default" : "outline"}
              disabled={open.isPending}
              onClick={() => open.mutate({}, { onSuccess: (r) => window.location.assign(r.url), onError: (e) => toast.error(errorText(e)) })}
            >
              {open.isPending ? <Spinner /> : <ExternalLinkIcon />}
              {retry ? "重新打开授权页" : "打开授权页"}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={Boolean(blocked) || copy.isPending}
            onClick={() =>
              copy.mutate(
                {},
                {
                  onSuccess: (r) =>
                    navigator.clipboard
                      .writeText(r.url)
                      .then(() => toast.success("授权链接已复制，5 分钟内有效"))
                      .catch(() => toast.error("复制没有成功，请改用「打开授权页」")),
                  onError: (e) => toast.error(errorText(e)),
                },
              )
            }
          >
            {copy.isPending ? <Spinner /> : <CopyIcon />}
            复制授权链接，发给店主
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">授权链接 5 分钟内有效；你没有主账号时，把链接发给店主授权。</p>
        <div className="mt-4">
          <Disclosure title="授权页报错？" id="auth-help">
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="font-medium">授权页显示 The domain of redirect_uri is not consistent with the Redirect URL Domain declared in console</dt>
                <dd className="text-muted-foreground">
                  应用的 Redirect URL Domain 没填或填错。回
                  <Link href="/shops/connect/shopee/guide#item-3" className="focus-ring rounded-sm text-(--semantic-color-text-link)">
                    准备清单第 3 项
                  </Link>
                  ，把 Shopilot 给的域名填进控制台，再重新打开授权页。
                </dd>
              </div>
              <div>
                <dt className="font-medium">授权后只连上了一家店</dt>
                <dd className="text-muted-foreground">你用的可能是店铺子账号，或者做的是单店授权。换主账号重新授权，就能一次勾选全部店铺。</dd>
              </div>
            </dl>
          </Disclosure>
        </div>
      </Panel>
      <NextPanel draft={draft}>
        <h2 className="text-lg font-semibold">授权后</h2>
        <ul className="mt-2">
          <li className="flex items-start gap-2 border-b border-border py-3 text-sm">
            <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              授权有效 1 年
              <span className="block text-xs text-muted-foreground">到期前 30 天、7 天各提醒一次，也可以在店铺与连接里随时续期</span>
            </span>
          </li>
          <li className="flex items-start gap-2 py-3 text-sm">
            <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              接下来检查并完成
              <span className="block text-xs text-muted-foreground">逐店检查聊天与订单；完成接入后开始接收买家消息，后台拉取历史会话与订单</span>
            </span>
          </li>
        </ul>
        {draft.pendingShops > 0 && <p className="text-sm font-medium">已授权 {draft.pendingShops} 家店，待检查并完成。</p>}
      </NextPanel>
    </div>
  );
}

const STATUS_TEXT = { connected: "已连接", auth_expired: "授权失效", disconnected: "已断开" } as const;

function TiktokAuth({ draft }: { draft: ConnectDraft }) {
  const auth = useAuthUrl("tiktok");
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(draft.shops.length === 0);
  const used = new Set(draft.shops.map((s) => s.market));
  const [region, setRegion] = useState<string>(TIKTOK_REGIONS.find((r) => !used.has(r)) ?? "MY");
  const connectedCount = draft.shops.filter((s) => s.status === "connected").length;
  const go = (key: string, body: { shopRegion: string }) => {
    setBusy(key);
    auth.mutate(body, {
      onSuccess: (r) => window.location.assign(r.url),
      onError: (e) => {
        setBusy(null);
        toast.error(errorText(e));
      },
    });
  };
  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Panel>
        <PanelHeader title="授权店铺" description="跨境店每个站点连接一次，用店铺账号确认" />
        {!draft.app && (
          <p role="status" className="mb-3 flex items-start gap-2 rounded-md bg-(--semantic-color-surface-warm) px-3 py-2 text-sm">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-(--semantic-color-feedback-warning)" aria-hidden />
            还没有保存应用凭证，先回上一步填 App Key 与 App Secret。
          </p>
        )}
        {draft.shops.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>站点</TableHead>
                <TableHead>店铺</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">操作</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.shops.map((s) => (
                <TableRow key={s.id} className="h-12">
                  <TableCell className="font-medium">{s.market}</TableCell>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-sm",
                        s.status === "connected" ? "text-(--semantic-color-feedback-success)" : s.status === "auth_expired" ? "text-(--semantic-color-feedback-warning)" : "text-muted-foreground",
                      )}
                    >
                      {s.status === "auth_expired" ? <AlertTriangleIcon className="size-3.5" aria-hidden /> : <span className="size-1.5 rounded-full bg-current" aria-hidden />}
                      {STATUS_TEXT[s.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" disabled={!draft.app || busy !== null} onClick={() => go(s.id, { shopRegion: s.market })}>
                      {busy === s.id ? <Spinner /> : <RefreshCwIcon />}
                      重新连接
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {adding ? (
          <div className="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-border p-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">要连接的站点</span>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger className="w-40" aria-label="要连接的站点">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIKTOK_REGIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                      {used.has(r) ? "（已有店铺）" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button variant={draft.pendingShops === 0 ? "default" : "outline"} disabled={!draft.app || busy !== null} onClick={() => go("new", { shopRegion: region })}>
              {busy === "new" ? <Spinner /> : <ExternalLinkIcon />}
              去 TikTok 授权
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setAdding(true)}>
            <PlusIcon />
            连接新站点
          </Button>
        )}
        <div className="mt-4">
          <Disclosure title="连接失败？" id="auth-help">
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="font-medium">提示 App Secret 不对</dt>
                <dd className="text-muted-foreground">
                  回
                  <Link href="/shops/connect/tiktok" className="focus-ring rounded-sm text-(--semantic-color-text-link)">
                    上一步
                  </Link>
                  重新粘贴 App Secret，再连接一次。
                </dd>
              </div>
              <div>
                <dt className="font-medium">提示回调地址不一致</dt>
                <dd className="text-muted-foreground">
                  应用里填的 Redirect URL 和 Shopilot 给的不一样。回
                  <Link href="/shops/connect/tiktok/guide#item-3" className="focus-ring rounded-sm text-(--semantic-color-text-link)">
                    准备清单第 3 项
                  </Link>
                  重新复制。
                </dd>
              </div>
            </dl>
          </Disclosure>
        </div>
      </Panel>
      <NextPanel draft={draft}>
        <h2 className="text-lg font-semibold">授权结果</h2>
        {draft.shops.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">还没有连接站点</p>
        ) : (
          <>
            <p className="mt-3 text-[1.875rem] leading-tight font-semibold tabular-nums">
              {connectedCount} / {draft.shops.length}
            </p>
            <p className="text-xs text-muted-foreground">个站点已连接</p>
          </>
        )}
        <p className="mt-4 flex items-start gap-2 text-sm">
          <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            授权后自动完成
            <span className="block text-xs text-muted-foreground">打开坐席接单，按店登记消息与订单通知；完成接入后拉取历史会话</span>
          </span>
        </p>
      </NextPanel>
    </div>
  );
}
