"use client";

import { useState } from "react";
import { PackagePlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SimAfterSale, SimOrder, SimShop, SimState, SimThread } from "@/mock/sim/types";
import { shortTime } from "./client";
import { ActButton, Code, Hint, SectionTitle, useAct } from "./ui";

export function OrdersPanel({ shop, thread, data }: { shop: SimShop | null; thread: SimThread | null; data: SimState | undefined }) {
  if (!data) return <Skeleton className="h-40" />;
  if (!shop || !thread) return <Hint>选中一个买家后，在这里替他下单、推进订单、申请取消或退货。</Hint>;
  return (
    <div className="flex flex-col gap-5">
      <CreateOrder key={thread.conversationId} shop={shop} thread={thread} data={data} />
      <div>
        <SectionTitle>{thread.buyerName} 的订单（{data.orders.length}）</SectionTitle>
        {data.orders.length === 0 ? (
          <Hint>这个买家在本店还没有订单。用上面的表单下一单，平台会推送订单状态。</Hint>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {data.orders.map((o) => (
              <OrderRow key={o.orderId} o={o} platform={shop.platform} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CreateOrder({ shop, thread, data }: { shop: SimShop; thread: SimThread; data: SimState }) {
  const { act, pendingKey } = useAct();
  const [itemId, setItemId] = useState(data.products[0]?.itemId ?? "");
  const [qty, setQty] = useState("1");
  const [paid, setPaid] = useState(true);
  const qtyNum = Number(qty);
  const qtyOk = Number.isInteger(qtyNum) && qtyNum >= 1 && qtyNum <= 20;
  const product = data.products.find((p) => p.itemId === itemId);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qtyOk || !itemId) return;
    void act("create_order", "create_order", { conversationId: thread.conversationId, items: [{ itemId, qty: qtyNum }], paid });
  };
  if (data.products.length === 0) return <Hint>本店没有商品目录，不能下单。</Hint>;
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-(--semantic-radius-md) bg-muted p-3" noValidate>
      <SectionTitle>替买家下单</SectionTitle>
      <div className="flex gap-2">
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger size="sm" className="min-w-0 flex-1 bg-card" aria-label="商品">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.products.map((p) => (
              <SelectItem key={p.itemId} value={p.itemId}>
                {p.name} · {p.skuName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="sr-only" htmlFor="order-qty">
          数量
        </label>
        <Input id="order-qty" type="number" inputMode="numeric" min={1} max={20} value={qty} onChange={(e) => setQty(e.target.value)} aria-invalid={!qtyOk} className="h-8 w-16 bg-card tabular-nums" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <ToggleGroup type="single" size="sm" variant="outline" spacing={0} value={paid ? "paid" : "unpaid"} onValueChange={(v) => v && setPaid(v === "paid")} aria-label="付款状态">
          <ToggleGroupItem value="paid" className="bg-card data-[state=on]:bg-accent data-[state=on]:font-semibold">
            已付款
          </ToggleGroupItem>
          <ToggleGroupItem value="unpaid" className="bg-card data-[state=on]:bg-accent data-[state=on]:font-semibold">
            未付款
          </ToggleGroupItem>
        </ToggleGroup>
        <span className="text-xs text-muted-foreground tabular-nums">{product && qtyOk ? `${shop.currency} ${(Number(product.price) * qtyNum).toFixed(shop.currency === "VND" ? 0 : 2)}` : "数量 1–20"}</span>
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={!qtyOk || pendingKey !== null}>
        {pendingKey === "create_order" ? <Spinner className="size-3.5" /> : <PackagePlusIcon />}
        下单（{paid ? (shop.platform === "shopee" ? "READY_TO_SHIP" : "AWAITING_SHIPMENT") : "UNPAID"}）
      </Button>
    </form>
  );
}

const ORDER_ACTION_LABEL: Record<SimOrder["actions"][number], string> = {
  advance: "推进",
  retry_ship: "揽收失败重试（RETRY_SHIP）",
  logistics_exception: "物流异常",
  request_cancel: "买家申请取消",
  request_return: "买家申请退货退款",
  request_refund: "买家申请仅退款",
};

function OrderRow({ o, platform }: { o: SimOrder; platform: "shopee" | "tiktok" }) {
  const body = (action: SimOrder["actions"][number]) => {
    switch (action) {
      case "advance":
        return { action: "advance_order", body: { orderId: o.orderId } };
      case "retry_ship":
        return { action: "advance_order", body: { orderId: o.orderId, to: "RETRY_SHIP" } };
      case "logistics_exception":
        return { action: "advance_order", body: { orderId: o.orderId, logisticsException: true } };
      case "request_cancel":
        return { action: "request_cancel", body: { orderId: o.orderId } };
      case "request_return":
        return { action: "request_return", body: { orderId: o.orderId, type: "RETURN_AND_REFUND" } };
      case "request_refund":
        return { action: "request_return", body: { orderId: o.orderId, type: "REFUND" } };
    }
  };
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-mono text-xs break-all">{o.orderId}</span>
        <Code>{o.status}</Code>
      </div>
      <ul className="text-sm">
        {o.items.map((i, n) => (
          <li key={n} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">
              {i.name} <span className="text-muted-foreground">· {i.skuName}</span>
            </span>
            <span className="shrink-0 text-muted-foreground tabular-nums">×{i.qty}</span>
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
        <span>
          {o.currency} {o.total}
        </span>
        <span>下单 {shortTime(o.createdAt)}</span>
        {o.shipByAt && <span>最晚发货 {shortTime(o.shipByAt)}</span>}
        {o.trackingNumber && (
          <span>
            {o.carrier} {o.trackingNumber}
          </span>
        )}
      </p>
      {o.actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {o.actions.map((a) => {
            const b = body(a);
            return (
              <ActButton key={a} actKey={`${a}:${o.orderId}`} action={b.action} body={b.body}>
                {a === "advance" ? `推进到 ${o.next}` : ORDER_ACTION_LABEL[a]}
              </ActButton>
            );
          })}
        </div>
      )}
      {o.afterSales.length > 0 && (
        <ul className="flex flex-col gap-2 border-l-2 border-border pl-3">
          {o.afterSales.map((r) => (
            <AfterSaleRow key={r.id} r={r} platform={platform} />
          ))}
        </ul>
      )}
    </li>
  );
}

const SALE_ACTION_LABEL: Record<SimAfterSale["actions"][number], string> = {
  buyer_ship_return: "买家寄回",
  approve_return: "平台同意退货",
  buyer_wins: "平台判买家胜",
  seller_wins: "平台判卖家胜",
};

function AfterSaleRow({ r, platform }: { r: SimAfterSale; platform: "shopee" | "tiktok" }) {
  const kind = r.kind === "cancel" ? "取消申请" : platform === "shopee" ? (r.subtype === "1" ? "仅退款" : "退货退款") : r.subtype === "REFUND" ? "仅退款" : "退货退款";
  return (
    <li className="flex flex-col gap-1.5 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span>
          {kind} <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
        </span>
        <Code>{r.status}</Code>
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
        <span>{r.reasonText}</span>
        {r.dueAt && (
          <span>
            {r.dueField} {shortTime(r.dueAt)}
          </span>
        )}
        {r.arbitrationStatus && <span>仲裁 {r.arbitrationStatus}</span>}
        {r.returnTrackingNumber && <span>寄回单号 {r.returnTrackingNumber}</span>}
      </p>
      {r.actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.actions.map((a) => (
            <ActButton
              key={a}
              actKey={`${a}:${r.id}`}
              action={a === "buyer_ship_return" ? "buyer_ship_return" : "platform_arbitrate"}
              body={a === "buyer_ship_return" ? { afterSaleId: r.id } : { afterSaleId: r.id, decision: a }}
            >
              {SALE_ACTION_LABEL[a]}
            </ActButton>
          ))}
        </div>
      )}
    </li>
  );
}
