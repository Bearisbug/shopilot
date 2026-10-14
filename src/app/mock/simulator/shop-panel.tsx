"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { SimFault, SimShop, SimState } from "@/mock/sim/types";
import { AUTH_LABEL, FAULT_LABEL, putFault, shortTime } from "./client";
import { ActButton, Dot, Facts, Hint, SectionTitle, useAct } from "./ui";

export function ShopPanel({ shop, data }: { shop: SimShop | null; data: SimState | undefined }) {
  if (!data) return <Skeleton className="h-40" />;
  if (!shop) return <Hint>先在左栏选一家店，这里显示它的授权、回调、坐席接单状态与故障注入。</Hint>;
  return (
    <div className="flex flex-col gap-6">
      <ShopFacts shop={shop} />
      <AuthActions shop={shop} />
      <Faults shop={shop} faults={data.faults.filter((f) => f.platform === shop.platform && f.shopId === shop.shopId)} />
    </div>
  );
}

function ShopFacts({ shop }: { shop: SimShop }) {
  const auth = shop.authExpired ? "授权已过期" : AUTH_LABEL[shop.authStatus];
  return (
    <div>
      <SectionTitle>{shop.name}</SectionTitle>
      <Facts
        rows={[
          ["店铺 ID", `${shop.shopId} · ${shop.region} · ${shop.currency}`],
          ["应用", `${shop.appName}（${shop.appKey}）`],
          [
            "授权",
            <span key="a" className="inline-flex items-center gap-1.5">
              <Dot tone={shop.authStatus === "authorized" && !shop.authExpired ? "ok" : shop.authStatus === "unauthorized" ? "off" : "warn"} />
              {auth}
              {shop.authExpiresAt && <span className="text-muted-foreground">· 到期 {shortTime(shop.authExpiresAt)}</span>}
            </span>,
          ],
          ["access_token 到期", shortTime(shop.accessExpiresAt)],
          [shop.platform === "shopee" ? "推送回调" : "webhook 地址", shop.callbackUrl ?? "未配置"],
          [shop.platform === "shopee" ? "已订阅 code" : "已登记事件", shop.subscribed.length ? shop.subscribed.join("、") : "无"],
          ...(shop.platform === "tiktok"
            ? ([
                [
                  "坐席接单",
                  <span key="c" className="inline-flex items-center gap-1.5">
                    <Dot tone={shop.canAcceptChat ? "ok" : "warn"} />
                    {shop.canAcceptChat ? "接单中（can_accept_chat = true）" : "暂停接单（can_accept_chat = false）"}
                  </span>,
                ],
              ] as Array<[string, React.ReactNode]>)
            : []),
          ["聊天权限", shop.chat ? "有" : "无（sellerchat 接口返回 error_permission）"],
        ]}
      />
    </div>
  );
}

function AuthActions({ shop }: { shop: SimShop }) {
  const { act, pendingKey } = useAct();
  const [confirm, setConfirm] = useState(false);
  const authorized = shop.authStatus === "authorized";
  const key = `${shop.platform}:${shop.shopId}`;
  return (
    <div>
      <SectionTitle>授权动作</SectionTitle>
      {!authorized ? (
        <Hint>店铺当前{AUTH_LABEL[shop.authStatus]}。在 Shopilot 接入向导里打开授权链接完成授权后，这里的动作才可用。</Hint>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <ActButton actKey={`soon:${key}`} action="expire_auth" body={{ platform: shop.platform, shopId: shop.shopId, mode: "soon" }}>
              授权即将到期（推 {shop.platform === "shopee" ? "code 12" : "type 7"}）
            </ActButton>
            <ActButton actKey={`now:${key}`} action="expire_auth" body={{ platform: shop.platform, shopId: shop.shopId, mode: "now" }}>
              授权已过期
            </ActButton>
            <Button type="button" size="xs" variant="destructive" disabled={pendingKey !== null} onClick={() => setConfirm(true)}>
              卖家取消授权
            </Button>
          </div>
          <Hint className="mt-1.5">「授权已过期」让 token 立即失效、刷新也失败，平台不推送；「卖家取消授权」同时推送 {shop.platform === "shopee" ? "code 2" : "type 6"}。</Hint>
        </>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`让卖家取消 ${shop.name} 的授权？`}
        desc="店铺 token 立即失效，并向 Shopilot 推送取消授权事件。恢复要在 Shopilot 里重新授权。"
        confirmText="取消授权"
        destructive
        pending={pendingKey === `deauth:${key}`}
        onConfirm={async () => {
          await act(`deauth:${key}`, "deauthorize", { platform: shop.platform, shopId: shop.shopId });
          setConfirm(false);
        }}
      />
    </div>
  );
}

const CATEGORIES: Array<SimFault["category"]> = ["send_message", "order_read", "after_sale_write"];
const CATEGORY_HINT: Record<SimFault["category"], { shopee: string; tiktok: string }> = {
  send_message: { shopee: "sellerchat/send_message", tiktok: "Send Message" },
  order_read: { shopee: "get_order_list、get_order_detail", tiktok: "orders/search、Get Order Detail" },
  after_sale_write: { shopee: "cancel_order、handle_buyer_cancellation、returns/confirm、dispute", tiktok: "取消订单、同意/拒绝取消、同意/拒绝退货" },
};

function Faults({ shop, faults }: { shop: SimShop; faults: SimFault[] }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: putFault,
    onSuccess: (_, v) => toast.success(v.mode === "off" ? `已关闭「${FAULT_LABEL[v.category]}」故障` : `已设置「${FAULT_LABEL[v.category]}」${v.mode === "once" ? "下一次" : "持续"}${v.kind === "timeout" ? "超时 12 秒" : "失败"}`),
    onError: (e) => toast.error("故障注入没有保存", { description: (e as Error).message }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["mock-sim"] }),
  });
  return (
    <div>
      <SectionTitle>故障注入</SectionTitle>
      <Hint className="pb-2">
        让本店的接口调用失败（{shop.platform === "shopee" ? "error = error_server，HTTP 500" : "code 36009003，HTTP 500"}）或延迟 12 秒后照常响应。「下一次」命中一次后自动清除。
      </Hint>
      <ul className="flex flex-col divide-y divide-border">
        {CATEGORIES.map((c) => {
          const f = faults.find((x) => x.category === c);
          const mode = f?.mode ?? "off";
          const kind = f?.kind ?? "error";
          const save = (next: { mode?: string; kind?: string }) => m.mutate({ platform: shop.platform, shopId: shop.shopId, category: c, mode: next.mode ?? mode, kind: next.kind ?? kind });
          return (
            <li key={c} className="flex flex-col gap-1.5 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{FAULT_LABEL[c]}</span>
                {f && <span className="text-xs text-muted-foreground tabular-nums">已命中 {f.hits} 次</span>}
              </div>
              <Hint>{CATEGORY_HINT[c][shop.platform]}</Hint>
              <div className="flex gap-1.5">
                <Select value={mode} onValueChange={(v) => save({ mode: v })} disabled={m.isPending}>
                  <SelectTrigger size="sm" className="flex-1" aria-label={`${FAULT_LABEL[c]}：触发方式`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">关闭</SelectItem>
                    <SelectItem value="once">下一次</SelectItem>
                    <SelectItem value="sticky">持续</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={kind} onValueChange={(v) => (mode === "off" ? undefined : save({ kind: v }))} disabled={m.isPending || mode === "off"}>
                  <SelectTrigger size="sm" className="flex-1" aria-label={`${FAULT_LABEL[c]}：故障类型`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="error">返回平台错误</SelectItem>
                    <SelectItem value="timeout">超时（12 秒）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
