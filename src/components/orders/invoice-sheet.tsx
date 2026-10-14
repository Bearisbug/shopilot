"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LoaderCircleIcon, MessageSquareIcon, SendIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { ConversationDetail } from "@/contracts/conversations";
import type { CreateInvoiceResult, ExtractResult, InvoiceSummary, OrderDetail, OrdersResponse } from "@/contracts/orders";
import { PlatformBadge } from "@/components/common/platform-badge";
import { ErrorState, LoadingRows } from "@/components/shell/page";
import type { TicketOrderOption } from "@/components/tickets/new-ticket-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, ApiError, errorText, newKey } from "@/lib/api";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Notice, useOrderDetail, useOrdersInvalidate } from "./order-ui";

/** 从会话里开票时的上下文（工作台传入）：订单只能选这个买家的；发到聊天须是本人处理中的会话 */
export type InvoiceConversation = {
  id: string;
  /** 买家近 180 天的订单（与建工单弹层的 orders 同一份） */
  buyerOrders: TicketOrderOption[];
  /** 本人正在处理这个会话 */
  canSendToChat: boolean;
  /** 他人处理中时的处理人；未认领为 null */
  claimerName: string | null;
  /** 不论谁处理都不能发到聊天的原因（如只读接入的店）；没有为 null */
  chatBlockedReason?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 预选订单；不传时先选订单 */
  orderId?: string | null;
  /** 从会话里开票时传入；订单页不传，按订单详情里的会话判断能否发到聊天 */
  conversation?: InvoiceConversation | null;
  onIssued?: (invoice: InvoiceSummary) => void;
};

/** 开 Invoice / Receipt（REQ-ORD-006、REQ-AI-006，PAGE-WB-INVOICE）：订单预填商品，生成 PDF 与图片，经聊天与邮件两路发出 */
export function InvoiceSheet({ open, onOpenChange, orderId, conversation, onIssued }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full overscroll-contain outline-none data-[side=right]:sm:max-w-lg"
        aria-describedby={undefined}
        // 订单还在加载时先把焦点放在侧栏本身（不画焦点框），表单出现后再落到第一个输入项
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
      >
        {open && <InvoiceBody initialOrderId={orderId ?? null} conv={conversation ?? null} close={() => onOpenChange(false)} onIssued={onIssued} />}
      </SheetContent>
    </Sheet>
  );
}

const formSchema = z.object({
  kind: z.enum(["invoice", "receipt"]),
  buyerName: z.string().trim().min(1, "请填写抬头").max(200, "最多 200 字"),
  taxId: z.string().trim().max(60, "最多 60 字"),
  address: z.string().trim().min(1, "请填写地址").max(500, "最多 500 字"),
  email: z.union([z.string().trim().email("邮箱格式不对"), z.literal("")]),
  notes: z.string().trim().max(500, "最多 500 字"),
  sendToChat: z.boolean(),
  sendEmail: z.boolean(),
});
type Values = z.infer<typeof formSchema>;
const EXTRACT_FIELDS = ["buyerName", "taxId", "address", "email"] as const;
type ExtractField = (typeof EXTRACT_FIELDS)[number];

function InvoiceBody({ initialOrderId, conv, close, onIssued }: { initialOrderId: string | null; conv: InvoiceConversation | null; close: () => void; onIssued?: (i: InvoiceSummary) => void }) {
  const [orderId, setOrderId] = useState<string | null>(initialOrderId);
  const order = useOrderDetail(orderId);
  return (
    <>
      <SheetHeader className="border-b border-border pr-12">
        <SheetTitle className="text-lg">开 Invoice / Receipt</SheetTitle>
        <SheetDescription>生成 PDF 存档，可发到聊天和邮箱</SheetDescription>
      </SheetHeader>
      {!orderId ? (
        <>
          <div className="scroll-y flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
            <OrderPicker buyerOrders={conv?.buyerOrders ?? null} onPick={setOrderId} />
          </div>
          <Footer close={close} />
        </>
      ) : order.isPending ? (
        <>
          <div className="flex-1 px-4">
            <LoadingRows rows={6} />
          </div>
          <Footer close={close} />
        </>
      ) : order.isError ? (
        <>
          <div className="flex-1 px-4">
            <ErrorState error={order.error} onRetry={() => order.refetch()} />
          </div>
          <Footer close={close} />
        </>
      ) : (
        <InvoiceForm key={orderId} detail={order.data} conv={conv} onChangeOrder={initialOrderId ? undefined : () => setOrderId(null)} close={close} onIssued={onIssued} />
      )}
    </>
  );
}

function Footer({ close, pending = false, ready = false }: { close: () => void; pending?: boolean; ready?: boolean }) {
  return (
    <SheetFooter className="flex-row justify-end border-t border-border">
      <Button variant="outline" onClick={close}>
        取消
      </Button>
      <Button type="submit" form="invoice-form" disabled={!ready || pending}>
        {pending ? <LoaderCircleIcon className="motion-safe:animate-spin" /> : <SendIcon />}
        生成并发送
      </Button>
    </SheetFooter>
  );
}

/**
 * 能否发到聊天：会话上下文以调用方为准；订单页按订单详情里的会话判断（只有本人处理中的会话能发），
 * 他人处理中时读会话详情取处理人姓名。
 */
function useChatTarget(detail: OrderDetail, conv: InvoiceConversation | null) {
  const own = detail.conversation;
  const id = conv?.id ?? own?.id ?? null;
  const blocked = conv?.chatBlockedReason ?? null;
  const canSend = !blocked && (conv ? conv.canSendToChat : !!own?.claimedByMe);
  const otherHandler = conv ? !conv.canSendToChat && conv.claimerName !== null : own?.handlingState === "human" && !own.claimedByMe;
  const claimer = useQuery({
    queryKey: ["conversation", own?.id],
    queryFn: () => api.get<ConversationDetail>(`/api/v1/conversations/${own!.id}`),
    enabled: !conv && !!own && otherHandler,
  });
  const name = conv ? conv.claimerName : (claimer.data?.conversation.claimedBy?.name ?? null);
  const hint = canSend
    ? undefined
    : blocked
      ? blocked
      : !id
        ? "这张订单没有关联会话"
        : otherHandler
          ? `只有会话处理人能发到聊天${name ? `，当前处理人：${name}` : ""}`
          : "认领这个会话后才能发到聊天";
  return { id, canSend, hint, link: !conv && own ? `/wb/${own.id}` : null };
}

function InvoiceForm({
  detail,
  conv,
  onChangeOrder,
  close,
  onIssued,
}: {
  detail: OrderDetail;
  conv: InvoiceConversation | null;
  onChangeOrder?: () => void;
  close: () => void;
  onIssued?: (i: InvoiceSummary) => void;
}) {
  const o = detail.order;
  const chat = useChatTarget(detail, conv);
  const invalidate = useOrdersInvalidate();
  const [key, setKey] = useState(newKey);
  const [failure, setFailure] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<Partial<Record<ExtractField, string>>>({});
  const form = useForm<Values>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: { kind: "invoice", buyerName: "", taxId: "", address: "", email: "", notes: "", sendToChat: chat.canSend, sendEmail: true },
  });

  // 表单出现时焦点落到第一个输入项（侧栏打开时订单可能还在加载）
  useEffect(() => form.setFocus("buyerName"), [form]);

  const extract = useMutation({
    mutationFn: () => api.post<ExtractResult>("/api/v1/invoices/extract", { conversationId: chat.id, orderId: o.id }),
    onSuccess: (r) => {
      // 只填空字段；已填且不同的放到输入框下方，由人决定是否替换
      let filled = 0;
      const differ: Partial<Record<ExtractField, string>> = {};
      for (const k of EXTRACT_FIELDS) {
        const v = r.fields[k];
        if (!v) continue;
        const cur = form.getValues(k).trim();
        if (!cur) {
          form.setValue(k, v, { shouldValidate: true, shouldDirty: true });
          filled++;
        } else if (cur !== v) differ[k] = v;
      }
      setSuggest(differ);
      const n = Object.keys(differ).length;
      if (filled) toast.success(`已填入 ${filled} 项，发出前请核对`, { description: n ? `另有 ${n} 项与已填内容不同，在输入框下方选择是否替换` : undefined });
      else if (n) toast.info(`提取到 ${n} 项与已填内容不同`, { description: "在输入框下方选择是否替换" });
      else toast.info("提取到的内容与已填的一致");
    },
    onError: (e) => toast.error("没有提取出来", { description: errorText(e) }),
  });

  const issue = useMutation({
    mutationFn: (v: Values) =>
      api.post<CreateInvoiceResult>(
        "/api/v1/invoices",
        {
          kind: v.kind,
          orderId: o.id,
          ...(chat.canSend && chat.id ? { conversationId: chat.id } : {}),
          fields: {
            buyerName: v.buyerName,
            address: v.address,
            email: v.email,
            ...(v.taxId ? { taxId: v.taxId } : {}),
            items: o.items.map((i) => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice })),
            currency: o.currency,
            ...(v.notes ? { notes: v.notes } : {}),
          },
          sendToChat: chat.canSend && v.sendToChat,
          sendEmail: v.sendEmail,
        },
        key,
      ),
    onSuccess: ({ invoice: inv }) => {
      const problems = [inv.chatStatus === "failed" ? `聊天发送失败：${inv.chatError ?? "平台返回错误"}` : null, inv.emailStatus === "failed" ? `邮件没有写入发件箱：${inv.emailError ?? ""}` : null].filter(Boolean);
      if (problems.length) toast.warning(`已生成 ${inv.number}，${problems.join("；")}`, { description: "发票已存档，可在发票记录里下载或重发邮件。" });
      else toast.success(`已生成 ${inv.number}`, { description: [inv.chatStatus === "sent" ? "图片已发到聊天" : null, inv.emailStatus === "sent" ? `邮件已发到 ${inv.emailTo}` : null].filter(Boolean).join("，") || "没有选择发送渠道" });
      onIssued?.(inv);
      close();
    },
    onError: (e) => {
      setFailure(errorText(e));
      if (e instanceof ApiError && e.status < 500) setKey(newKey());
    },
    onSettled: invalidate,
  });

  const replace = (k: ExtractField) => {
    const v = suggest[k];
    if (v === undefined) return;
    form.setValue(k, v, { shouldValidate: true, shouldDirty: true });
    setSuggest((prev) => {
      const next = { ...prev };
      delete next[k];
      return next;
    });
  };

  return (
    <>
      <form
        id="invoice-form"
        noValidate
        className="scroll-y flex min-h-0 flex-1 flex-col gap-5 px-4 pb-4"
        onSubmit={form.handleSubmit((v) => {
          setFailure(null);
          issue.mutate(v);
        })}
      >
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0">
            订单 <span className="font-medium tabular-nums">{o.externalOrderId}</span> · {o.shop.name}
          </span>
          {onChangeOrder && (
            <Button type="button" variant="link" size="sm" onClick={onChangeOrder}>
              换订单
            </Button>
          )}
        </div>
        <Controller
          name="kind"
          control={form.control}
          render={({ field }) => (
            <Field orientation="horizontal" className="justify-between">
              <FieldLabel>类型</FieldLabel>
              <ToggleGroup type="single" variant="outline" size="sm" spacing={0} className="overflow-hidden rounded-md" value={field.value} onValueChange={(v) => v && field.onChange(v)} aria-label="发票类型">
                <ToggleGroupItem value="invoice" className="px-3">
                  Invoice
                </ToggleGroupItem>
                <ToggleGroupItem value="receipt" className="px-3">
                  Receipt
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
          )}
        />
        {chat.id && (
          <div className="flex items-center justify-between gap-3 rounded-md bg-(--semantic-color-surface-warm) px-3 py-2.5">
            <p className="text-sm text-muted-foreground">从对话里提取买家给的公司名、税号、地址、邮箱，只填空着的项</p>
            <Button type="button" variant="outline" size="sm" disabled={extract.isPending} onClick={() => extract.mutate()}>
              {extract.isPending ? <LoaderCircleIcon className="motion-safe:animate-spin" /> : <SparklesIcon />}
              从对话提取
            </Button>
          </div>
        )}
        <FieldGroup className="gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField form={form} name="buyerName" label="抬头 / 公司名" placeholder="公司或个人名称" suggestion={suggest.buyerName} onReplace={replace} />
            <TextField form={form} name="taxId" label="税号（选填）" placeholder="TIN / Tax ID" suggestion={suggest.taxId} onReplace={replace} />
          </div>
          <TextField form={form} name="address" label="地址" placeholder="开票地址" suggestion={suggest.address} onReplace={replace} />
          <TextField form={form} name="email" label="接收邮箱" placeholder="邮箱" type="email" description="留空时不发邮件，发票照常生成" suggestion={suggest.email} onReplace={replace} />
        </FieldGroup>
        <section aria-labelledby="inv-items">
          <h3 id="inv-items" className="mb-2 text-sm font-medium">
            商品
          </h3>
          <ul className="flex flex-col gap-1">
            {o.items.map((i, idx) => (
              <li key={idx} className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {i.name} ×{i.qty}
                </span>
                <span className="shrink-0 tabular-nums">{money(Number(i.unitPrice) * i.qty, o.currency)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted-foreground">商品名与单价取自订单；税额按 0 计，合计 {money(o.items.reduce((s, i) => s + Number(i.unitPrice) * i.qty, 0), o.currency)}。</p>
        </section>
        <Controller
          name="notes"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="inv-notes">备注（选填）</FieldLabel>
              <Textarea {...field} id="inv-notes" rows={2} maxLength={500} aria-invalid={fieldState.invalid} />
              {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
            </Field>
          )}
        />
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">发送方式</legend>
          <div className="flex flex-col gap-1">
            <CheckField form={form} name="sendToChat" label="发送到聊天（转成图片发给买家）" hint={chat.hint} disabled={!chat.canSend} />
            {chat.link && (
              <Link href={chat.link} className="focus-ring inline-flex items-center gap-1 self-start rounded-sm pl-6 text-sm font-semibold text-(--semantic-color-text-link) underline-offset-4 hover:underline">
                <MessageSquareIcon className="size-4" aria-hidden="true" />
                打开会话
              </Link>
            )}
          </div>
          <CheckField form={form} name="sendEmail" label="发送邮件（PDF 附件发到接收邮箱）" />
        </fieldset>
      </form>
      {failure && (
        <div className="px-4">
          <Notice tone="error">{failure}</Notice>
        </div>
      )}
      <Footer close={close} pending={issue.isPending} ready />
    </>
  );
}

type FormApi = ReturnType<typeof useForm<Values>>;

function TextField({
  form,
  name,
  label,
  placeholder,
  type = "text",
  description,
  suggestion,
  onReplace,
}: {
  form: FormApi;
  name: ExtractField;
  label: string;
  placeholder: string;
  type?: string;
  description?: string;
  suggestion?: string;
  onReplace: (name: ExtractField) => void;
}) {
  return (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`inv-${name}`}>{label}</FieldLabel>
          <Input {...field} id={`inv-${name}`} type={type} placeholder={placeholder} aria-invalid={fieldState.invalid} autoComplete="off" />
          {suggestion !== undefined && (
            <FieldDescription className="[overflow-wrap:anywhere]">
              提取到：{suggestion} ·{" "}
              <Button type="button" variant="link" size="sm" className="h-auto p-0 align-baseline font-semibold" onClick={() => onReplace(name)} aria-label={`用提取到的「${suggestion}」替换${label}`}>
                替换
              </Button>
            </FieldDescription>
          )}
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
        </Field>
      )}
    />
  );
}

function CheckField({ form, name, label, hint, disabled }: { form: FormApi; name: "sendToChat" | "sendEmail"; label: string; hint?: string; disabled?: boolean }) {
  return (
    <Controller
      name={name}
      control={form.control}
      render={({ field }) => (
        <Field orientation="horizontal">
          <Checkbox
            id={`inv-${name}`}
            checked={field.value}
            disabled={disabled}
            onCheckedChange={(v) => field.onChange(v === true)}
            aria-describedby={hint ? `inv-${name}-hint` : undefined}
            className={cn(disabled && "state-layer is-disabled")}
          />
          <div className="flex flex-col gap-0.5">
            <FieldLabel htmlFor={`inv-${name}`} className={cn("font-normal", disabled && "text-muted-foreground")}>
              {label}
            </FieldLabel>
            {hint && <FieldDescription id={`inv-${name}-hint`}>{hint}</FieldDescription>}
          </div>
        </Field>
      )}
    />
  );
}

type PickRow = { id: string; externalOrderId: string; sub: React.ReactNode; total?: string; currency?: string };

/**
 * 没有预选订单时先选订单。会话上下文里只列这个买家的订单；
 * 订单页（「新建发票」）按订单号或买家搜索可见范围内的订单。
 */
function OrderPicker({ buyerOrders, onPick }: { buyerOrders: TicketOrderOption[] | null; onPick: (id: string) => void }) {
  const [text, setText] = useState("");
  const q = useDeferredValue(text.trim());
  const list = useQuery({
    queryKey: ["orders", "picker", q],
    queryFn: () => api.get<OrdersResponse>(`/api/v1/orders?limit=20${q ? `&q=${encodeURIComponent(q)}` : ""}`),
    enabled: buyerOrders === null,
  });

  if (buyerOrders && buyerOrders.length === 0) {
    return <p className="rounded-md bg-muted px-3 py-6 text-center text-sm text-muted-foreground">这个买家近 180 天没有订单，没有可开票的订单。</p>;
  }

  const needle = q.toLowerCase();
  const rows: PickRow[] | null = buyerOrders
    ? buyerOrders
        .filter((o) => !needle || o.externalOrderId.toLowerCase().includes(needle) || (o.items ?? []).some((i) => i.name.toLowerCase().includes(needle)))
        .map((o) => ({ id: o.id, externalOrderId: o.externalOrderId, sub: [(o.items ?? []).map((i) => `${i.name} ×${i.qty}`).join("、"), o.status].filter(Boolean).join(" · "), total: o.total, currency: o.currency }))
    : (list.data?.items.map((o) => ({
        id: o.id,
        externalOrderId: o.externalOrderId,
        sub: (
          <>
            <PlatformBadge platform={o.shop.platform} market={o.shop.market} />
            {o.shop.name} · {o.buyerName ?? "—"}
          </>
        ),
        total: o.total,
        currency: o.currency,
      })) ?? null);

  return (
    <>
      <p className="text-sm text-muted-foreground">{buyerOrders ? "选这个买家要开票的订单，商品行从订单预填。" : "先选要开票的订单，商品行从订单预填。"}</p>
      <Command shouldFilter={false} className="rounded-md border border-border">
        <CommandInput value={text} onValueChange={setText} placeholder={buyerOrders ? "搜索订单号或商品" : "搜索订单号或买家"} aria-label="搜索订单" autoFocus />
        <CommandList className="max-h-none" label="订单候选">
          {rows === null ? (
            list.isError ? (
              <ErrorState error={list.error} onRetry={() => list.refetch()} />
            ) : (
              <div className="p-3">
                <LoadingRows rows={4} />
              </div>
            )
          ) : (
            <>
              <CommandEmpty>没有找到订单。</CommandEmpty>
              {rows.map((o) => (
                <CommandItem key={o.id} value={o.id} onSelect={() => onPick(o.id)} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-medium tabular-nums">{o.externalOrderId}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{o.sub}</span>
                  </span>
                  {o.total && o.currency && <span className="shrink-0 text-sm tabular-nums">{money(o.total, o.currency)}</span>}
                </CommandItem>
              ))}
            </>
          )}
        </CommandList>
      </Command>
    </>
  );
}
