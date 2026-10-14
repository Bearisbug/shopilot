"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircleIcon, TicketPercentIcon, ZapIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { BuyerOrder, ConversationDetail, CouponOption } from "@/contracts/conversations";
import type { QuickReply, QuickReplyList } from "@/contracts/reception";
import type { MemberOption } from "@/contracts/team";
import { useDialogParam } from "@/components/shell/global-dialogs";
import { EmptyState, ErrorState, LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/hooks/use-me";
import { api, errorText } from "@/lib/api";
import { money } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";
import { focusReply, STAGE_LABEL, useSend, useWbParams } from "./wb-shared";

function useAfterChange(id: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["conversation", id] });
    qc.invalidateQueries({ queryKey: ["conversations"] });
    qc.invalidateQueries({ queryKey: ["nav-summary"] });
  };
}

// ── 转交 / 改派（API-CONV-005） ──

export function TransferDialog({ detail }: { detail: ConversationDetail }) {
  const { open, close } = useDialogParam("transfer");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">{open && <TransferForm detail={detail} onDone={close} />}</DialogContent>
    </Dialog>
  );
}

function TransferForm({ detail, onDone }: { detail: ConversationDetail; onDone: () => void }) {
  const c = detail.conversation;
  const me = useMe();
  const router = useRouter();
  const { params } = useWbParams();
  const options = useQuery({ queryKey: ["member-options", c.shop.id], queryFn: () => api.get<{ items: MemberOption[] }>(`/api/v1/members/options?shopId=${c.shop.id}`) });
  const [to, setTo] = useState("");
  const [withTickets, setWithTickets] = useState(detail.openTickets.length > 0);
  const after = useAfterChange(c.id);
  // 处理人不是本人（组长、管理员改派同事的会话）时用「改派」
  const from = c.claimedBy && c.claimedBy.id !== me.data?.active.membershipId ? c.claimedBy : null;
  const verb = from ? "改派" : "转交";
  const choices = (options.data?.items ?? []).filter((m) => m.membershipId !== c.claimedBy?.id);
  const assign = useMutation({
    mutationFn: () => api.post(`/api/v1/conversations/${c.id}/assign`, { toMembershipId: to, withTickets, version: c.version }),
    onSuccess: () => {
      const toName = choices.find((m) => m.membershipId === to)?.name ?? "同事";
      toast.success(from ? `已从 ${from.name} 改派给 ${toName}` : `已交给 ${toName}`);
      // 员工看不到同事处理中的会话：交出去后回到列表；组长、管理员仍能查看，留在当前页
      if (me.data?.active.permissions.includes("wb.team")) onDone();
      else {
        const list = new URLSearchParams();
        for (const k of ["view", "platform", "shop"]) {
          const v = params.get(k);
          if (v) list.set(k, v);
        }
        router.replace(list.toString() ? `/wb?${list.toString()}` : "/wb", { scroll: false });
      }
    },
    onError: (e) => toast.error(`没有${verb}成功`, { description: errorText(e) }),
    onSettled: after,
  });
  return (
    <>
      <DialogHeader>
        <DialogTitle>{verb}会话</DialogTitle>
        <DialogDescription>
          {from ? `当前处理人：${from.name}。` : ""}把与 {c.buyerName} 的会话交给负责 {c.shop.name} 的同事，对方接手后由对方回复。
        </DialogDescription>
      </DialogHeader>
      {options.isPending ? (
        <LoadingRows rows={3} />
      ) : options.isError ? (
        <ErrorState error={options.error} onRetry={() => options.refetch()} />
      ) : choices.length === 0 ? (
        <p className="text-sm text-muted-foreground">没有其他负责这家店的启用成员。管理员可以在「团队与权限」里给同事分配店铺。</p>
      ) : (
        <form
          id="wb-transfer"
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (to) assign.mutate();
          }}
        >
          <Field>
            <FieldLabel>接手人</FieldLabel>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger aria-label="接手人" className="w-full">
                <SelectValue placeholder="选择同事" />
              </SelectTrigger>
              <SelectContent>
                {choices.map((m) => (
                  <SelectItem key={m.membershipId} value={m.membershipId}>
                    {m.name} · {ROLE_LABEL[m.role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {detail.openTickets.length > 0 && (
            <Field orientation="horizontal">
              <Checkbox id="wb-transfer-tickets" checked={withTickets} onCheckedChange={(v) => setWithTickets(v === true)} />
              <FieldLabel htmlFor="wb-transfer-tickets" className="font-normal">
                关联的 {detail.openTickets.length} 张未结工单一并{verb}（{detail.openTickets.map((t) => t.number).join("、")}）
              </FieldLabel>
            </Field>
          )}
        </form>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          取消
        </Button>
        <Button type="submit" form="wb-transfer" disabled={!to || assign.isPending}>
          {assign.isPending && <LoaderCircleIcon className="animate-spin" />}
          {verb}
        </Button>
      </DialogFooter>
    </>
  );
}

// ── 结束会话（API-CONV-006） ──

export function EndDialog({ detail }: { detail: ConversationDetail }) {
  const { open, close } = useDialogParam("end");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">{open && <EndForm detail={detail} onDone={close} />}</DialogContent>
    </Dialog>
  );
}

function EndForm({ detail, onDone }: { detail: ConversationDetail; onDone: () => void }) {
  const c = detail.conversation;
  const [reason, setReason] = useState("");
  const after = useAfterChange(c.id);
  const end = useMutation({
    mutationFn: () => api.post(`/api/v1/conversations/${c.id}/close`, { reason: reason.trim() || undefined, version: c.version }),
    onSuccess: () => {
      toast.success("会话已结束");
      onDone();
    },
    onError: (e) => toast.error("没有结束成功", { description: errorText(e) }),
    onSettled: after,
  });
  return (
    <>
      <DialogHeader>
        <DialogTitle>结束会话</DialogTitle>
        <DialogDescription>
          {c.shop.platform === "tiktok" ? "同时结束 TikTok 上的这段会话；平台没结束成功也会在 Shopilot 里结束，并在时间线记一笔。" : "Shopee 没有结束会话的接口，只在 Shopilot 里结束。"}
          买家再发消息会开新的会话段。
        </DialogDescription>
      </DialogHeader>
      {detail.openTickets.length > 0 && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          这个会话还有 {detail.openTickets.length} 张未结工单（{detail.openTickets.map((t) => t.number).join("、")}），结束会话不影响工单。
        </p>
      )}
      <form
        id="wb-end"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          end.mutate();
        }}
      >
        <Field>
          <FieldLabel htmlFor="wb-end-reason">备注（可选）</FieldLabel>
          <Input id="wb-end-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="如：已解答发货时间" />
          <FieldDescription>写进会话时间线，最多 200 字。</FieldDescription>
        </Field>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          取消
        </Button>
        <Button type="submit" form="wb-end" disabled={end.isPending}>
          {end.isPending && <LoaderCircleIcon className="animate-spin" />}
          结束会话
        </Button>
      </DialogFooter>
    </>
  );
}

// ── 卡片（TikTok：订单、物流、退货退款；商品卡置灰） ──

type CardKind = "order_card" | "logistics_card" | "return_card" | "product_card";
const CARD_LABEL: Record<CardKind, string> = { order_card: "订单卡", logistics_card: "物流卡", return_card: "退货退款卡", product_card: "商品卡" };
const RETURN_OK = new Set(["IN_TRANSIT", "DELIVERED", "COMPLETED"]);

export function CardsDialog({ detail, orders }: { detail: ConversationDetail; orders: BuyerOrder[] }) {
  const { open, close } = useDialogParam("cards");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">{open && <CardsForm detail={detail} orders={orders} onDone={close} />}</DialogContent>
    </Dialog>
  );
}

/** 各类卡片能选的订单：物流卡要有运单号，退货退款卡要已发货 */
function eligibleFor(kind: CardKind, orders: BuyerOrder[]): BuyerOrder[] {
  if (kind === "return_card") return orders.filter((o) => RETURN_OK.has(o.status));
  if (kind === "logistics_card") return orders.filter((o) => o.tracking?.trackingNo);
  return orders;
}

function CardsForm({ detail, orders, onDone }: { detail: ConversationDetail; orders: BuyerOrder[]; onDone: () => void }) {
  const [kind, setKind] = useState<CardKind>("order_card");
  const [orderId, setOrderId] = useState(orders[0]?.externalOrderId ?? "");
  const [skuId, setSkuId] = useState("");
  const send = useSend(detail);
  const productReason = detail.capabilities.productCard.reason;
  const eligible = eligibleFor(kind, orders);
  const order = eligible.find((o) => o.externalOrderId === orderId) ?? null;
  // 买家最近一张订单卡指向的订单；换卡片类型时，当前选择不可用就改选它（也不可用则不预选）
  const lastCardOrder = detail.messages.findLast((m) => m.type === "order_card" && typeof m.payload.orderId === "string")?.payload.orderId as string | undefined;
  const changeKind = (k: CardKind) => {
    setKind(k);
    const next = eligibleFor(k, orders);
    if (!next.some((o) => o.externalOrderId === orderId)) {
      setOrderId(next.some((o) => o.externalOrderId === lastCardOrder) ? (lastCardOrder ?? "") : "");
      setSkuId("");
    }
  };
  const ready = kind !== "product_card" && !!order && (kind !== "return_card" || !!skuId);
  return (
    <>
      <DialogHeader>
        <DialogTitle>发卡片</DialogTitle>
        <DialogDescription>卡片按 TikTok 的格式发给买家，买家点开可看订单、物流或发起退货退款。</DialogDescription>
      </DialogHeader>
      <Tabs value={kind} onValueChange={(v) => changeKind(v as CardKind)}>
        <TabsList>
          {(Object.keys(CARD_LABEL) as CardKind[]).map((k) => (
            <TabsTrigger key={k} value={k} disabled={k === "product_card"} title={k === "product_card" ? productReason : undefined}>
              {CARD_LABEL[k]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="text-xs text-muted-foreground">商品卡不可用：{productReason}</p>
      {orders.length === 0 ? (
        <EmptyState icon={TicketPercentIcon} title="这位买家近 180 天没有订单" description="订单、物流、退货退款卡都要关联买家的订单。" />
      ) : (
        <form
          id="wb-cards"
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready || !order) return;
            send.mutate(
              { type: kind as "order_card" | "logistics_card" | "return_card", orderId: order.externalOrderId, ...(kind === "logistics_card" && order.tracking?.packageId ? { packageId: order.tracking.packageId } : {}), ...(kind === "return_card" ? { skuId } : {}) },
              { onSuccess: onDone },
            );
          }}
        >
          <Field>
            <FieldLabel>订单</FieldLabel>
            {eligible.length === 0 ? (
              <FieldDescription>
                {kind === "logistics_card" ? "物流卡只能发给已有运单号的订单，这位买家没有这样的订单。" : "退货退款卡只能发给运输中、已送达或已完成的订单，这位买家没有这样的订单。"}
              </FieldDescription>
            ) : (
              <RadioGroup value={orderId} onValueChange={(v) => { setOrderId(v); setSkuId(""); }} aria-label="订单">
                {eligible.map((o) => (
                  <label key={o.id} className="state-layer flex cursor-pointer items-start gap-2 rounded-md border border-border p-2">
                    <RadioGroupItem value={o.externalOrderId} className="mt-0.5" />
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium tabular-nums">{o.externalOrderId}</span>
                      <span className="block text-xs text-muted-foreground">
                        {o.items.map((i) => `${i.name} ×${i.qty}`).join("、")} · {money(o.total, o.currency)} · {o.status}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            )}
          </Field>
          {kind === "return_card" && order && (
            <Field>
              <FieldLabel>商品</FieldLabel>
              <Select value={skuId} onValueChange={setSkuId}>
                <SelectTrigger aria-label="商品" className="w-full">
                  <SelectValue placeholder="选择要退的商品" />
                </SelectTrigger>
                <SelectContent>
                  {order.items.filter((i) => i.skuId).map((i) => (
                    <SelectItem key={i.skuId} value={i.skuId!}>
                      {i.name}
                      {i.sku ? ` · ${i.sku}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </form>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          取消
        </Button>
        <Button type="submit" form="wb-cards" disabled={!ready || send.isPending}>
          {send.isPending && <LoaderCircleIcon className="animate-spin" />}
          发送{CARD_LABEL[kind]}
        </Button>
      </DialogFooter>
    </>
  );
}

// ── 优惠券（API-CONV-013） ──

export function CouponsDialog({ detail }: { detail: ConversationDetail }) {
  const { open, close } = useDialogParam("coupons");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">{open && <CouponsForm detail={detail} onDone={close} />}</DialogContent>
    </Dialog>
  );
}

function CouponsForm({ detail, onDone }: { detail: ConversationDetail; onDone: () => void }) {
  const coupons = useQuery({ queryKey: ["coupons", detail.conversation.shop.id], queryFn: () => api.get<{ items: CouponOption[] }>(`/api/v1/shops/${detail.conversation.shop.id}/coupons`) });
  const [pick, setPick] = useState("");
  const send = useSend(detail);
  return (
    <>
      <DialogHeader>
        <DialogTitle>发优惠券</DialogTitle>
        <DialogDescription>只列出进行中、可在聊天发送的券（在 TikTok 卖家中心创建、展示渠道为聊天或常规）。</DialogDescription>
      </DialogHeader>
      {coupons.isPending ? (
        <LoadingRows rows={3} />
      ) : coupons.isError ? (
        <ErrorState error={coupons.error} onRetry={() => coupons.refetch()} />
      ) : coupons.data.items.length === 0 ? (
        <EmptyState icon={TicketPercentIcon} title="没有可发送的优惠券" description="在 TikTok 卖家中心创建展示渠道为聊天的券后，这里会出现。" />
      ) : (
        <RadioGroup value={pick} onValueChange={setPick} aria-label="优惠券">
          {coupons.data.items.map((cp) => (
            <label key={cp.couponId} className="state-layer flex cursor-pointer items-start gap-2 rounded-md border border-border p-2">
              <RadioGroupItem value={cp.couponId} className="mt-0.5" />
              <span className="text-sm">
                <span className="block font-medium">{cp.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {cp.discount}
                  {cp.endsAt ? ` · ${new Date(cp.endsAt).toLocaleDateString("zh-CN")} 截止领取` : ""}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          取消
        </Button>
        <Button disabled={!pick || send.isPending} onClick={() => send.mutate({ type: "coupon_card", couponId: pick, couponTitle: coupons.data?.items.find((x) => x.couponId === pick)?.title }, { onSuccess: onDone })}>
          {send.isPending && <LoaderCircleIcon className="animate-spin" />}
          发送优惠券
        </Button>
      </DialogFooter>
    </>
  );
}

// ── 快捷回复（API-CONV-014）：点选插入输入框 ──

const REPLY_TABS = ["all", "presale", "insale", "aftersale", "any"] as const;
const REPLY_TAB_LABEL: Record<(typeof REPLY_TABS)[number], string> = { all: "全部", presale: "售前", insale: "售中", aftersale: "售后", any: "通用" };

export function RepliesDialog({ stage, onPick, canManage }: { stage: string; onPick: (text: string) => void; canManage: boolean }) {
  const { open, close } = useDialogParam("replies");
  // 点选了一条：关闭后焦点交给输入框（光标在末尾）；直接关掉时按 Radix 默认归还焦点
  const picked = useRef(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="sm:max-w-lg"
        onCloseAutoFocus={(e) => {
          if (!picked.current) return;
          picked.current = false;
          e.preventDefault();
          focusReply();
        }}
      >
        {open && (
          <RepliesList
            stage={stage}
            canManage={canManage}
            onPick={(t) => {
              picked.current = true;
              onPick(t);
              close();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RepliesList({ stage, onPick, canManage }: { stage: string; onPick: (text: string) => void; canManage: boolean }) {
  const initial = (REPLY_TABS as readonly string[]).includes(stage) ? (stage as (typeof REPLY_TABS)[number]) : "all";
  const [tab, setTab] = useState<(typeof REPLY_TABS)[number]>(initial);
  const replies = useQuery({ queryKey: ["quick-replies"], queryFn: () => api.get<QuickReplyList>("/api/v1/quick-replies") });
  const items = (replies.data?.items ?? []).filter((r: QuickReply) => tab === "all" || r.stage === tab || (tab !== "any" && r.stage === "any"));
  return (
    <>
      <DialogHeader>
        <DialogTitle>快捷回复</DialogTitle>
        <DialogDescription>点一条插入输入框，可以改完再发。当前会话段：{STAGE_LABEL[stage as keyof typeof STAGE_LABEL] ?? "未确认"}。</DialogDescription>
      </DialogHeader>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          {REPLY_TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {REPLY_TAB_LABEL[t]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="scroll-y -mx-2 max-h-[50dvh] px-2">
        {replies.isPending ? (
          <LoadingRows rows={4} />
        ) : replies.isError ? (
          <ErrorState error={replies.error} onRetry={() => replies.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ZapIcon}
            title="没有快捷回复"
            description={canManage ? "快捷回复在「接待设置 · 语气与提示词」里添加。" : "请管理员在「接待设置」里添加。"}
            action={
              canManage ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/reception/prompts">去添加快捷回复</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onPick(r.text)} className="state-layer focus-ring w-full rounded-md px-3 py-2 text-left">
                  <span className="block text-sm font-medium">{r.title}</span>
                  <span className="line-clamp-2 block text-xs text-muted-foreground">{r.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
