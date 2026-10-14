"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon, CheckCircle2Icon, MessageSquareIcon, RefreshCwIcon, SlidersHorizontalIcon, StethoscopeIcon, UnplugIcon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import type { ShopDetail } from "@/contracts/shops";
import { PlatformBadge } from "@/components/common/platform-badge";
import { ErrorState, LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { api, errorText } from "@/lib/api";
import { inTz, relative } from "@/lib/format";
import { DiagnoseList, metricText, rateSub, rateText, StatusText, useDiagnose, useOpenDialog } from "./shop-ui";

const CARD_LABEL: Record<string, string> = { order_card: "订单卡", logistics_card: "物流卡", return_card: "退货退款卡", product_card: "商品卡" };
const EVENT_LABEL: Record<string, string> = {
  connected: "接入",
  authorized: "授权接入",
  reauthorized: "续期授权",
  completed: "完成接入",
  disconnected: "断开",
  refresh_failed: "刷新授权失败",
  deauthorized: "取消授权",
  auth_expiring: "授权快到期",
  setup_failed: "设置失败",
  penalty: "平台处罚通知",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** stated：文案本身已写明状态（如「买家姓名地址被平台隐藏」），读屏不再追加「可用 / 不可用」 */
function Cap({ ok, children, reason, stated }: { ok: boolean; children: React.ReactNode; reason?: string; stated?: boolean }) {
  return (
    <li className="flex items-start gap-2 py-1 text-sm">
      {ok ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-(--semantic-color-feedback-success)" aria-hidden /> : <XCircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
      <span className="min-w-0">
        {children}
        {!stated && <span className="sr-only">{ok ? "：可用" : "：不可用"}</span>}
        {reason && <span className="block text-xs text-muted-foreground">{reason}</span>}
      </span>
    </li>
  );
}

function backfillText(b: ShopDetail["backfill"]) {
  if (b.state === "pending") return "排队中";
  if (b.state === "running") return `进行中 · 会话 ${b.conversations} · 订单 ${b.orders}`;
  if (b.state === "done") return `已完成 · 会话 ${b.conversations} · 订单 ${b.orders}`;
  return `失败：${b.error ?? "平台接口出错"}`;
}

export function ShopDrawer({ me, shopId, period, onClose }: { me: Me; shopId: string | null; period: string; onClose: () => void }) {
  return (
    <Sheet open={Boolean(shopId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overscroll-contain data-[side=right]:sm:max-w-xl" aria-describedby={undefined}>
        {shopId && <DrawerBody key={shopId} me={me} shopId={shopId} period={period} />}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ me, shopId, period }: { me: Me; shopId: string; period: string }) {
  const tz = me.active.timezone;
  const openDialog = useOpenDialog();
  const diagnose = useDiagnose();
  const q = useQuery({ queryKey: ["shop", shopId, period], queryFn: () => api.get<ShopDetail>(`/api/v1/shops/${shopId}?period=${period}`) });
  const s = q.data;
  if (q.isError)
    return (
      <>
        <SheetHeader>
          <SheetTitle>店铺详情</SheetTitle>
        </SheetHeader>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </>
    );
  if (!s)
    return (
      <>
        <SheetHeader>
          <SheetTitle>店铺详情</SheetTitle>
        </SheetHeader>
        <div className="px-4">
          <LoadingRows rows={5} />
        </div>
      </>
    );
  const m = s.metrics;
  const c = s.capabilities;
  // 已断开的店：回复率、接待模式、授权到期都不再有意义
  const gone = s.status === "disconnected";
  return (
    <>
      <SheetHeader className="border-b border-border pr-12">
        <SheetTitle className="text-lg">{s.name}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-2">
          <PlatformBadge platform={s.platform} market={s.market} />
          <span className="tabular-nums">店铺 ID {s.externalShopId}</span>
        </SheetDescription>
      </SheetHeader>
      <div className="scroll-y flex min-h-0 flex-1 flex-col gap-5 px-4 pb-4">
        {s.issues.length > 0 && (
          <div role="status" className="flex flex-col gap-1 rounded-md bg-(--semantic-color-surface-warm) px-3 py-2.5">
            {s.issues.map((i) => (
              <p key={i.key} className="flex items-start gap-2 text-sm">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-(--semantic-color-feedback-warning)" aria-hidden />
                {i.text}
              </p>
            ))}
          </div>
        )}
        <section aria-labelledby="sd-conn">
          <h3 id="sd-conn" className="mb-1 text-sm font-semibold">
            连接
          </h3>
          <dl>
            <Row label="状态">
              <StatusText row={s} />
            </Row>
            <Row label="授权到期">
              {gone ? "—" : inTz(s.authExpiresAt, tz, "yyyy-MM-dd")}
              {!gone && s.platform === "shopee" && s.mainAccountId ? `（主账号 ${s.mainAccountId} 授权）` : ""}
            </Row>
            <Row label="最近入站">{s.lastInboundAt ? `${relative(s.lastInboundAt)} · ${inTz(s.lastInboundAt, tz)}` : "从未"}</Row>
            <Row label="历史回补">{backfillText(s.backfill)}</Row>
            <Row label="应用">{`${s.platform === "shopee" ? "Partner ID" : "App Key"} ${s.appKey}`}</Row>
            {s.readOnly && <Row label="接入方式">只读接入：凭证借用自其他系统，消息每 30 秒拉取一次，不能从 Shopilot 发送或操作平台</Row>}
            {s.connectedAt && <Row label="接入于">{inTz(s.connectedAt, tz, "yyyy-MM-dd HH:mm")}</Row>}
            {s.disconnectedAt && s.status === "disconnected" && <Row label="断开于">{inTz(s.disconnectedAt, tz, "yyyy-MM-dd HH:mm")}</Row>}
          </dl>
        </section>
        <section aria-labelledby="sd-metric">
          <h3 id="sd-metric" className="mb-1 text-sm font-semibold">
            平台指标
          </h3>
          <dl>
            <Row label="回复率">
              <span className="tabular-nums">{gone ? "—" : rateText(m)}</span>
              {!gone && <span className="ml-2 text-xs text-muted-foreground">{rateSub(m)}</span>}
            </Row>
            <Row label="口径">{m ? `${m.platformLabel}：${m.basis}` : "等待首次同步（每小时一次）"}</Row>
            <Row label="其他">{metricText(m)}</Row>
            {s.metricsAt && <Row label="同步于">{inTz(s.metricsAt, tz)}</Row>}
          </dl>
        </section>
        <section aria-labelledby="sd-caps">
          <h3 id="sd-caps" className="mb-1 text-sm font-semibold">
            能力
          </h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-4">
            <Cap ok={c.chat} reason={c.chat ? undefined : c.chatReason}>
              收发聊天
            </Cap>
            <Cap ok={c.orders} reason={c.orders ? undefined : c.ordersReason}>
              查订单
            </Cap>
            <Cap ok={!c.piiMasked} stated>
              {c.piiMasked ? "买家姓名地址被平台隐藏" : "买家姓名地址可见"}
            </Cap>
            <Cap ok={c.productScope}>商品权限</Cap>
            <Cap ok={c.cards.length > 0}>{c.cards.length ? `卡片：${c.cards.map((x) => CARD_LABEL[x] ?? x).join("、")}` : "卡片：不支持"}</Cap>
            <Cap ok={c.coupons}>优惠券</Cap>
            <Cap ok={c.endSession}>结束会话同步到平台</Cap>
            <Cap ok>文字上限 {c.maxTextLength} 字</Cap>
          </ul>
        </section>
        <section aria-labelledby="sd-modes">
          <h3 id="sd-modes" className="mb-1 text-sm font-semibold">
            接待模式
          </h3>
          <dl>
            <Row label="工作时间内">{gone ? "—" : s.modes.inHours}</Row>
            <Row label="工作时间外">{gone ? "—" : s.modes.offHours}</Row>
          </dl>
        </section>
        {s.status !== "disconnected" && (
          <section aria-labelledby="sd-diag">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 id="sd-diag" className="text-sm font-semibold">
                检查连接
              </h3>
              <Button
                variant="outline"
                size="sm"
                aria-disabled={diagnose.isPending || undefined}
                onClick={() => !diagnose.isPending && diagnose.mutate([s.id], { onError: (e) => toast.error(errorText(e)) })}
              >
                {diagnose.isPending ? <Spinner /> : <StethoscopeIcon />}
                检查连接
              </Button>
            </div>
            {diagnose.data ? <DiagnoseList result={diagnose.data} compact /> : <p className="text-xs text-muted-foreground">按店调店铺信息、会话列表、订单列表，并核对推送配置。</p>}
          </section>
        )}
        <section aria-labelledby="sd-events">
          <h3 id="sd-events" className="mb-1 text-sm font-semibold">
            连接事件
          </h3>
          {s.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">没有事件。</p>
          ) : (
            <ol className="flex flex-col">
              {s.events.map((e) => (
                <li key={e.id} className="flex gap-3 border-b border-border py-2 text-sm last:border-0">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">{inTz(e.createdAt, tz)}</span>
                  <span className="min-w-0">
                    <span className="font-medium">{EVENT_LABEL[e.kind] ?? "其他事件"}</span>
                    <span className="block text-xs text-muted-foreground">{e.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      <SheetFooter className="flex-row flex-wrap justify-between gap-2 border-t border-border">
        {s.status === "disconnected" ? (
          <Button asChild variant="outline" className="ml-auto">
            <Link href={`/shops/connect/${s.platform}/auth`}>
              <RefreshCwIcon />
              重新接入
            </Link>
          </Button>
        ) : (
          <>
            <Button variant="destructive" onClick={() => openDialog("disconnect", { shop: s.id })}>
              <UnplugIcon />
              断开
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/wb">
                  <MessageSquareIcon />
                  打开工作台
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/reception">
                  <SlidersHorizontalIcon />
                  接待设置
                </Link>
              </Button>
              <Button variant="outline" onClick={() => openDialog("reauth", { shop: s.id })}>
                <RefreshCwIcon />
                续期授权
              </Button>
            </div>
          </>
        )}
      </SheetFooter>
    </>
  );
}
