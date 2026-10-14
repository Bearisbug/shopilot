"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, CheckCircle2Icon, CheckIcon, InfoIcon, RefreshCwIcon, StoreIcon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import type { BackfillState, CompleteResult, PlatformKey, ProbeResponse, ProbeShop } from "@/contracts/shops";
import { PlatformBadge } from "@/components/common/platform-badge";
import { EmptyState, ErrorState, PageScroll, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, errorText, newKey } from "@/lib/api";
import { inTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConnectHeader, SaveDraftAction, Stepper, useDraft, useSaveDraft } from "../../connect-ui";

function Status({ ok, okText, failText }: { ok: boolean; okText: string; failText: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1.5 text-sm text-(--semantic-color-feedback-success)">
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {okText}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-sm text-destructive">
      <XCircleIcon className="size-3.5" aria-hidden />
      {failText}
    </span>
  );
}

function Pii({ masked }: { masked: boolean | null }) {
  if (masked === null) return <span className="text-sm text-muted-foreground">近期没有订单，判断不了</span>;
  return masked ? (
    <span className="inline-flex items-center gap-1.5 text-sm text-(--semantic-color-feedback-warning)">
      <AlertTriangleIcon className="size-3.5" aria-hidden />
      被平台隐藏
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-sm text-(--semantic-color-feedback-success)">
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      可见
    </span>
  );
}

function backfillText(b: BackfillState): string {
  if (b.state === "pending") return "完成接入后开始";
  if (b.state === "running") return `进行中 · 会话 ${b.conversations} · 订单 ${b.orders}`;
  if (b.state === "done") return `会话 ${b.conversations} · 订单 ${b.orders} · 完成`;
  return `没有完成：${b.error ?? "平台接口出错"}`;
}

/** 原因文字里的「准备清单第 N 项」做成跳到该项的链接（检查结果里平台给的原因是纯文字） */
function linkGuide(text: string, p: PlatformKey) {
  return text.split(/(准备清单第 \d+ 项)/).map((part, i) => {
    const m = /^准备清单第 (\d+) 项$/.exec(part);
    return m ? <span key={i}>{guideLink(p, Number(m[1]), part)}</span> : part;
  });
}

const guideLink = (p: PlatformKey, item: number, text: string) => (
  <Link href={`/shops/connect/${p}/guide#item-${item}`} className="focus-ring rounded-sm font-medium text-(--semantic-color-text-link)">
    {text}
  </Link>
);

export function ProbeClient({ me, platform }: { me: Me; platform: PlatformKey }) {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const draft = useDraft(platform);
  const saveDraft = useSaveDraft(platform);
  const probe = useQuery({ queryKey: ["connect-probe", platform], queryFn: () => api.get<ProbeResponse>(`/api/v1/connect/${platform}/probe`) });
  const [mode, setMode] = useState<"shadow" | "off" | null>(null);
  const [key] = useState(newKey);
  const initialMode = mode ?? draft.data?.initialMode ?? "shadow";
  const renewed = Number(params.get("renewed") ?? 0);

  const complete = useMutation({
    mutationFn: () => api.post<CompleteResult>(`/api/v1/connect/${platform}/complete`, { initialMode }, key),
    onSuccess: (r) => {
      toast.success(`接入完成：${r.shops.length} 家店开始接收买家消息，历史记录在后台拉取`);
      r.warnings.forEach((w) => toast.warning(w));
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["shops"] });
      qc.invalidateQueries({ queryKey: ["nav-summary"] });
      qc.invalidateQueries({ queryKey: ["connect-draft", platform] });
      router.push("/shops");
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const shops = probe.data?.shops ?? [];
  const usable = shops.filter((s) => s.chat.ok && s.orders.ok).length;
  const masked = shops.some((s) => s.pii.masked === true);
  const chatFail = shops.some((s) => !s.chat.ok);
  // 行内已经写了原因与处理方法的，不再在表格下方重复一遍
  const chatFootnote = shops.some((s) => !s.chat.ok && !s.chat.reason);
  const noProduct = platform === "tiktok" && shops.some((s) => !s.productScope);
  const callbackOk = draft.data?.app?.callbackState === "set" || draft.data?.app?.callbackState === "already_ours";

  return (
    <PageScroll>
      <SaveDraftAction platform={platform} body={() => ({ step: "probe", initialMode })} />
      <ConnectHeader back="/shops/connect" subtitle={`${platform === "shopee" ? "Shopee" : "TikTok Shop"} · 第 4 步，共 4 步${probe.data ? ` · ${shops.length} 家店` : ""}`} />
      <Stepper platform={platform} current="probe" />
      {renewed > 0 && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-(--semantic-radius-lg) bg-card px-4 py-3 text-sm">
          <CheckCircle2Icon className="size-4 text-(--semantic-color-feedback-success)" aria-hidden />
          已为 {renewed} 家已接入的店续期授权，它们不需要再完成接入。
          <Link href="/shops" className="focus-ring rounded-sm font-medium text-(--semantic-color-text-link)">
            去店铺与连接查看
          </Link>
        </p>
      )}
      {probe.isError ? (
        <ErrorState error={probe.error} onRetry={() => probe.refetch()} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel>
              <PanelHeader
                title="每家店能用什么"
                description={`授权后逐店实测：会话列表、订单列表、取一单看收件人${probe.data ? ` · 检查于 ${inTz(probe.data.checkedAt, me.active.timezone, "HH:mm:ss")}` : ""}`}
              >
                {/* 检查中用 aria-disabled：原生 disabled 会让键盘焦点掉回 body */}
                <Button variant="ghost" size="sm" aria-disabled={probe.isFetching || undefined} onClick={() => !probe.isFetching && probe.refetch()}>
                  {probe.isFetching ? <Spinner /> : <RefreshCwIcon />}
                  {probe.isFetching ? "正在检查" : "重新检查"}
                </Button>
              </PanelHeader>
              {!probe.data ? (
                <div className="flex flex-col gap-3" aria-busy="true" aria-label="正在逐店检查">
                  <p className="text-sm text-muted-foreground">正在逐店调平台接口检查，几秒钟……</p>
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 w-full bg-muted motion-safe:animate-pulse" />
                  ))}
                </div>
              ) : shops.length === 0 ? (
                <EmptyState
                  icon={StoreIcon}
                  title="还没有授权店铺"
                  description="回到「授权店铺」一步，在平台授权页确认后会自动回到这里。"
                  action={
                    <Button asChild variant="outline">
                      <Link href={`/shops/connect/${platform}/auth`}>去授权店铺</Link>
                    </Button>
                  }
                />
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>店铺</TableHead>
                        <TableHead>聊天</TableHead>
                        <TableHead>订单</TableHead>
                        <TableHead>买家姓名地址</TableHead>
                        {platform === "tiktok" && <TableHead>商品权限</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shops.map((s) => (
                        <ProbeRow key={s.shopId} s={s} platform={platform} />
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
                    {masked &&
                      (platform === "shopee" ? (
                        <p>买家姓名地址被隐藏：Shopee 要开 IP 白名单才返回，开票时带不出收件信息。不影响接客服，可以以后再开（{guideLink(platform, 5, "准备清单第 5 项")}）。</p>
                      ) : (
                        <p>买家姓名地址被隐藏：TikTok 按平台规则给收件人打码，不影响接客服。</p>
                      ))}
                    {chatFootnote && (
                      <p>
                        某家店显示「不能收发」时：
                        {platform === "shopee" ? "先确认应用类型是 Seller In-house System，再按 Shopee 聊天白名单说明申请" : "在 Partner Center 申请客服接口，批下来后在店铺与连接里续期授权"}（{guideLink(platform, 4, "准备清单第 4 项")}）。
                      </p>
                    )}
                    {noProduct && <p>商品权限没开：商品卡选不了商品，不影响接客服。在 Partner Center 勾选商品权限后让店铺重新授权即可补上。</p>}
                  </div>
                </>
              )}
            </Panel>

            {shops.length > 0 && (
              <Panel>
                <PanelHeader title="历史记录" description="完成接入后在后台按店拉取；不用等它跑完" />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-md bg-muted px-4 py-3">
                    <p className="text-sm font-semibold">聊天记录</p>
                    <p className="text-xs text-muted-foreground">约 90 天：{platform === "shopee" ? "Shopee 最早只给到 90 天前" : "按会话最近活跃时间倒序拉取"}</p>
                  </div>
                  <div className="rounded-md bg-muted px-4 py-3">
                    <p className="text-sm font-semibold">订单</p>
                    <p className="text-xs text-muted-foreground">180 天，之后随推送实时更新</p>
                  </div>
                </div>
                <ul className="mt-3">
                  {shops.map((s) => (
                    <li key={s.shopId} className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm">{s.name}</span>
                        <PlatformBadge platform={platform} market={s.market} />
                      </span>
                      <span className={cn("text-sm tabular-nums", s.backfill.state === "failed" ? "text-destructive" : "text-muted-foreground")}>{backfillText(s.backfill)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">拉回来的历史会话标为「历史」：不触发 AI、不发通知、不计入看板。</p>
              </Panel>
            )}

            {shops.length > 0 && (
              <Panel>
                <PanelHeader title="AI 初始方式" description={`对这次接入的 ${shops.length} 家店统一生效`} />
                <RadioGroup
                  value={initialMode}
                  onValueChange={(v) => {
                    const m = v as "shadow" | "off";
                    setMode(m);
                    saveDraft.mutate({ initialMode: m });
                  }}
                  aria-label="AI 初始方式"
                  className="flex flex-col gap-3"
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="shadow" id="mode-shadow" className="mt-0.5" />
                    <Label htmlFor="mode-shadow" className="flex flex-col items-start gap-0.5 font-normal">
                      <span className="text-sm font-medium">AI 只起草、不发送（推荐）</span>
                      <span className="text-xs text-muted-foreground">AI 为每段会话生成草稿，不发给买家；每次生成计 1 次出稿</span>
                    </Label>
                  </div>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="off" id="mode-off" className="mt-0.5" />
                    <Label htmlFor="mode-off" className="flex flex-col items-start gap-0.5 font-normal">
                      <span className="text-sm font-medium">暂不启用 AI</span>
                      <span className="text-xs text-muted-foreground">只收消息和订单，不生成草稿{platform === "tiktok" ? "；TikTok 坐席接单同步关闭" : ""}</span>
                    </Label>
                  </div>
                </RadioGroup>
                <p className="mt-3 text-xs text-muted-foreground">
                  想让某家店不一样，完成后到
                  <Link href="/reception" className="focus-ring rounded-sm font-medium text-(--semantic-color-text-link)">
                    接待设置
                  </Link>
                  逐店调整。
                </p>
              </Panel>
            )}
          </div>

          <Panel className="xl:sticky xl:top-0">
            <h2 className="text-lg font-semibold">检查结果</h2>
            {!probe.data ? (
              <Skeleton className="mt-3 h-24 w-full bg-muted motion-safe:animate-pulse" />
            ) : (
              <>
                <p className="mt-3 text-[1.875rem] leading-tight font-semibold tabular-nums">
                  {usable} / {shops.length}
                </p>
                <p className="text-xs text-muted-foreground">家店能收发聊天、能查订单</p>
                <ul className="mt-2">
                  {platform === "shopee" ? (
                    <SummaryRow ok={callbackOk} title={callbackOk ? "推送已自动开启" : "推送回调没有设置"} detail={callbackOk ? "买家消息、订单、物流、退货、授权到期提醒" : "回「应用凭证」重新验证并保存"} />
                  ) : (
                    <SummaryRow ok title="消息与订单通知已按店登记" detail="新消息、新会话、订单、取消、退货、取消授权、授权到期；坐席接单已打开" />
                  )}
                  {masked && <SummaryRow warn title="买家姓名地址被隐藏" detail="不影响接客服" />}
                  {noProduct && <SummaryRow warn title="商品权限没开" detail="不影响接客服，可以以后再补" />}
                  {chatFail && <SummaryRow ok={false} title={`${shops.filter((s) => !s.chat.ok).length} 家店不能收发聊天`} detail="完成接入后这家店只收订单，聊天权限批下来后续期授权即可" />}
                  {shops
                    .filter((s) => s.zeroInbound7d)
                    .map((s) => (
                      <SummaryRow key={s.shopId} warn title={`${s.name} 近 7 天没有买家消息`} detail="授权正常，接入后观察" />
                    ))}
                  <SummaryRow info title="完成后会话进入工作台" detail="按店铺负责人分配可见范围" />
                </ul>
              </>
            )}
            <div className="mt-5 flex flex-col gap-2">
              {shops.length === 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button aria-disabled="true" onClick={(e) => e.preventDefault()}>
                      <CheckIcon />
                      完成接入
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>还没有授权店铺，先完成「授权店铺」</TooltipContent>
                </Tooltip>
              ) : (
                <Button disabled={complete.isPending} onClick={() => complete.mutate()}>
                  {complete.isPending ? <Spinner /> : <CheckIcon />}
                  完成接入
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href={`/shops/connect/${platform}/auth`}>上一步</Link>
              </Button>
            </div>
          </Panel>
        </div>
      )}
    </PageScroll>
  );
}

function ProbeRow({ s, platform }: { s: ProbeShop; platform: PlatformKey }) {
  const reasons = [s.chat.ok ? null : `聊天：${s.chat.reason ?? "平台没有返回原因"}`, s.orders.ok ? null : `订单：${s.orders.reason ?? "平台没有返回原因"}`].filter(Boolean);
  return (
    <>
      <TableRow className={cn("h-14", reasons.length > 0 && "border-b-0")}>
        <TableCell>
          <span className="block text-sm font-medium">{s.name}</span>
          <PlatformBadge platform={platform} market={s.market} className="mt-1" />
        </TableCell>
        <TableCell>
          <Status ok={s.chat.ok} okText="能收发" failText="不能收发" />
        </TableCell>
        <TableCell>
          <Status ok={s.orders.ok} okText="能查" failText="查不了" />
        </TableCell>
        <TableCell>
          <Pii masked={s.pii.masked} />
        </TableCell>
        {platform === "tiktok" && (
          <TableCell>
            {s.productScope ? (
              <Status ok okText="已授权" failText="" />
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-(--semantic-color-feedback-warning)">
                <AlertTriangleIcon className="size-3.5" aria-hidden />
                未授权
              </span>
            )}
          </TableCell>
        )}
      </TableRow>
      {reasons.length > 0 && (
        <TableRow>
          <TableCell colSpan={platform === "tiktok" ? 5 : 4} className="pt-0 pb-3 text-xs whitespace-normal text-destructive">
            {linkGuide(reasons.join(" "), platform)}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function SummaryRow({ ok, warn, info, title, detail }: { ok?: boolean; warn?: boolean; info?: boolean; title: string; detail?: string }) {
  const Icon = info ? InfoIcon : warn ? AlertTriangleIcon : ok ? CheckCircle2Icon : XCircleIcon;
  return (
    <li className="flex items-start gap-2 border-b border-border py-3 last:border-0">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          info ? "text-muted-foreground" : warn ? "text-(--semantic-color-feedback-warning)" : ok ? "text-(--semantic-color-feedback-success)" : "text-destructive",
        )}
        aria-hidden
      />
      <span className="text-sm">
        {title}
        {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
      </span>
    </li>
  );
}
