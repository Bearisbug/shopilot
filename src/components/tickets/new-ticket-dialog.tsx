"use client";

// 建工单弹层（PAGE-WB-TICKET、/tickets「新建工单」；REQ-TKT-002、API-TKT-003）。打开状态写在 URL `?dialog=<dialog>`。
// 工作台挂载时传 shopId、conversationId、buyerName、orders（买家订单，含售后单）；工单页不传，弹层里选店铺。
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardPlusIcon, InfoIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { MemberOption } from "@/contracts/team";
import { TICKET_TYPES, TYPE_LABEL, type TicketItem, type TicketType } from "@/contracts/tickets";
import { useDialogParam } from "@/components/shell/global-dialogs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/hooks/use-me";
import { ApiError, api, errorText, newKey } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/permissions";
import { fromLocalInput } from "./ticket-ui";

/** 与 `contracts/conversations.ts` 的 BuyerOrder 兼容的子集 */
export type TicketOrderOption = {
  id: string;
  externalOrderId: string;
  status?: string;
  total?: string;
  currency?: string;
  items?: Array<{ name: string; qty: number }>;
  afterSales?: Array<{ id: string; kind: "return" | "cancel"; externalId: string; platformStatus: string; open?: boolean }>;
};

export type NewTicketDialogProps = {
  /** URL 参数 dialog 的取值，默认 ticket */
  dialog?: string;
  shopId?: string;
  conversationId?: string;
  buyerName?: string;
  orders?: TicketOrderOption[];
  orderId?: string;
  afterSaleId?: string;
  defaultType?: TicketType;
  onCreated?: (ticket: TicketItem) => void;
};

const KIND_OF: Partial<Record<TicketType, "return" | "cancel">> = { return_refund: "return", cancel_request: "cancel" };
const NONE = "none";
const DEFAULT_ASSIGNEE = "default";

const schema = z.object({
  shopId: z.string().min(1, "请选择店铺"),
  type: z.enum(TICKET_TYPES, { message: "请选择工单类型" }),
  orderId: z.string(),
  afterSaleId: z.string(),
  assigneeId: z.string(),
  dueLocal: z.string(),
  note: z.string().trim().max(2000, "说明最多 2000 字"),
  linkConversation: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function NewTicketDialog(props: NewTicketDialogProps) {
  const { open, close } = useDialogParam(props.dialog ?? "ticket");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>建工单</DialogTitle>
          <DialogDescription>退货退款、取消申请、物流异常由平台事件自动建单；这里补建或建其他类型。</DialogDescription>
        </DialogHeader>
        <NewTicketForm {...props} close={close} />
      </DialogContent>
    </Dialog>
  );
}

// 对话框关闭即卸载，重新打开是全新表单
function NewTicketForm({ shopId: fixedShop, conversationId, buyerName, orders = [], orderId, afterSaleId, defaultType, onCreated, close }: NewTicketDialogProps & { close: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const router = useRouter();
  const [dup, setDup] = useState<{ id: string; number: string } | null>(null);
  const [key, setKey] = useState(newKey);
  const shops = me.data?.active.shops ?? [];
  const tz = me.data?.active.timezone ?? "Asia/Kuala_Lumpur";
  const isAgent = me.data?.active.role === "agent";

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      shopId: fixedShop ?? (shops.length === 1 ? shops[0].id : ""),
      type: defaultType ?? ("" as TicketType),
      orderId: orderId ?? (orders.length === 1 ? orders[0].id : NONE),
      afterSaleId: afterSaleId ?? NONE,
      assigneeId: DEFAULT_ASSIGNEE,
      dueLocal: "",
      note: "",
      linkConversation: !!conversationId,
    },
  });
  const [shopId, type, selOrder, selAfterSale] = useWatch({ control: form.control, name: ["shopId", "type", "orderId", "afterSaleId"] });
  const shop = shops.find((s) => s.id === shopId);
  const order = orders.find((o) => o.id === selOrder);
  const kind = type ? KIND_OF[type] : undefined;
  const afterSales = kind && order ? (order.afterSales ?? []).filter((a) => a.kind === kind) : [];
  const platformDue = !!kind && (selAfterSale !== NONE ? afterSales.some((a) => a.id === selAfterSale) : afterSales.length > 0);

  const options = useQuery({
    queryKey: ["member-options", shopId],
    queryFn: () => api.get<{ items: MemberOption[] }>(`/api/v1/members/options?shopId=${shopId}`),
    enabled: !!shopId && !isAgent,
  });

  const create = useMutation({
    mutationFn: (v: Values) => {
      const dueAt = v.dueLocal && !platformDue ? fromLocalInput(v.dueLocal, tz) : null;
      return api.post<TicketItem>(
        "/api/v1/tickets",
        {
          type: v.type,
          shopId: v.shopId,
          orderId: v.orderId !== NONE ? v.orderId : undefined,
          afterSaleId: kind && v.afterSaleId !== NONE ? v.afterSaleId : undefined,
          conversationId: conversationId && v.linkConversation ? conversationId : undefined,
          assigneeId: !isAgent && v.assigneeId !== DEFAULT_ASSIGNEE ? v.assigneeId : undefined,
          dueAt: dueAt ?? undefined,
          note: v.note || undefined,
        },
        key,
      );
    },
    onSuccess: (t) => {
      toast.success(`已建工单 ${t.number}`, {
        description: `${TYPE_LABEL[t.type]} · 负责人 ${t.assignee?.name ?? "未指派"}`,
        action: { label: `打开 ${t.number}`, onClick: () => router.push(`/tickets/${t.id}`) },
      });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["nav-summary"] });
      if (conversationId) qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      onCreated?.(t);
      close();
    },
    onError: (e) => {
      setKey(newKey());
      if (e instanceof ApiError && e.type === "duplicate") {
        const x = e.problem.extra as { existingTicketId?: string; number?: string } | undefined;
        if (x?.existingTicketId) setDup({ id: x.existingTicketId, number: x.number ?? "已有工单" });
        return;
      }
      if (e instanceof ApiError && e.type === "validation" && e.problem.extra?.fields) {
        const fields = e.problem.extra.fields as Record<string, string>;
        const map: Record<string, keyof Values> = { assigneeId: "assigneeId", dueAt: "dueLocal", orderId: "orderId", afterSaleId: "afterSaleId", note: "note", type: "type", shopId: "shopId" };
        let placed = false;
        for (const [k, msg] of Object.entries(fields)) {
          if (map[k]) {
            form.setError(map[k], { message: msg });
            placed = true;
          }
        }
        if (placed) return;
      }
      toast.error("没有建成", { description: errorText(e) });
    },
  });

  // 时限是否晚于现在由服务端判断，422 的字段错误回填到「时限」
  const submit = form.handleSubmit((v) => {
    if (v.dueLocal && !platformDue && !fromLocalInput(v.dueLocal, tz)) {
      form.setError("dueLocal", { message: "时间格式不对" });
      return;
    }
    setDup(null);
    create.mutate(v);
  });

  return (
    <form id="new-ticket-form" noValidate onSubmit={submit} className="flex min-h-0 flex-col gap-4">
      <div className="scroll-y -mr-2 flex max-h-[min(70dvh,40rem)] flex-col gap-5 pr-2">
        {buyerName && (
          <p className="text-sm">
            <span className="text-muted-foreground">买家 </span>
            {buyerName}
            {shop && <span className="text-muted-foreground"> · {shop.name}</span>}
          </p>
        )}
        <FieldGroup>
          {!fixedShop && (
            <Controller
              name="shopId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="nt-shop">店铺</FieldLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      form.setValue("assigneeId", DEFAULT_ASSIGNEE);
                    }}
                  >
                    <SelectTrigger id="nt-shop" className="w-full" aria-invalid={fieldState.invalid}>
                      <SelectValue placeholder={shops.length ? "选择店铺" : "你还没有负责的店铺"} />
                    </SelectTrigger>
                    <SelectContent>
                      {shops.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                          <span className="text-muted-foreground"> · {s.platform === "shopee" ? "Shopee" : "TikTok"} {s.market}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
          )}

          <Controller
            name="type"
            control={form.control}
            render={({ field, fieldState }) => (
              <FieldSet data-invalid={fieldState.invalid}>
                <FieldLegend variant="label">类型</FieldLegend>
                <RadioGroup
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    setDup(null);
                    form.setValue("afterSaleId", NONE);
                  }}
                  className="grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2"
                  aria-label="工单类型"
                  aria-invalid={fieldState.invalid}
                >
                  {TICKET_TYPES.map((t) => (
                    <Field key={t} orientation="horizontal">
                      <RadioGroupItem value={t} id={`nt-type-${t}`} />
                      <FieldLabel htmlFor={`nt-type-${t}`} className="font-normal">
                        {TYPE_LABEL[t]}
                      </FieldLabel>
                    </Field>
                  ))}
                </RadioGroup>
                {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
              </FieldSet>
            )}
          />

          {dup && (
            <div role="alert" className="flex items-start gap-2 rounded-md bg-(--semantic-color-surface-warm) px-3 py-2.5 text-sm">
              <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p className="min-w-0 flex-1">
                已有同一张未结工单 {dup.number}，不能重复建。{" "}
                <Link href={`/tickets/${dup.id}`} className="focus-ring rounded-sm font-medium text-(--semantic-color-text-link) underline-offset-4 hover:underline">
                  打开 {dup.number}
                </Link>
              </p>
            </div>
          )}

          {orders.length > 0 && (
            <Controller
              name="orderId"
              control={form.control}
              render={({ field }) => (
                <FieldSet>
                  <FieldLegend variant="label">关联订单</FieldLegend>
                  <RadioGroup
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      setDup(null);
                      form.setValue("afterSaleId", NONE);
                    }}
                    aria-label="关联订单"
                  >
                    {orders.map((o) => (
                      <Field key={o.id} orientation="horizontal">
                        <RadioGroupItem value={o.id} id={`nt-order-${o.id}`} />
                        <FieldContent>
                          <FieldLabel htmlFor={`nt-order-${o.id}`} className="font-normal tabular-nums">
                            {o.externalOrderId}
                          </FieldLabel>
                          <FieldDescription className="tabular-nums">
                            {[o.items?.map((i) => `${i.name} ×${i.qty}`).join("、"), o.total && o.currency ? `${o.currency} ${o.total}` : null, o.status].filter(Boolean).join(" · ")}
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                    ))}
                    <Field orientation="horizontal">
                      <RadioGroupItem value={NONE} id="nt-order-none" />
                      <FieldLabel htmlFor="nt-order-none" className="font-normal">
                        不关联订单
                      </FieldLabel>
                    </Field>
                  </RadioGroup>
                </FieldSet>
              )}
            />
          )}

          {afterSales.length > 1 && (
            <Controller
              name="afterSaleId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="nt-aftersale">{kind === "return" ? "退货单" : "取消申请"}</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="nt-aftersale" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>最近一张</SelectItem>
                      {afterSales.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.externalId} · {a.platformStatus}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {isAgent ? (
              <Field>
                <FieldLabel>负责人</FieldLabel>
                <p className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm">{me.data?.user.name}（本人）</p>
                <FieldDescription>员工建的工单只能由自己负责</FieldDescription>
              </Field>
            ) : (
              <Controller
                name="assigneeId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="nt-assignee">负责人</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={!shopId}>
                      <SelectTrigger id="nt-assignee" className="w-full" aria-invalid={fieldState.invalid}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DEFAULT_ASSIGNEE}>按类型默认</SelectItem>
                        {(options.data?.items ?? []).map((m) => (
                          <SelectItem key={m.membershipId} value={m.membershipId}>
                            {m.name}
                            <span className="text-muted-foreground"> · {ROLE_LABEL[m.role]}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : <FieldDescription>{shopId ? "只列负责这家店的成员" : "先选店铺"}</FieldDescription>}
                  </Field>
                )}
              />
            )}

            {platformDue ? (
              <Field>
                <FieldLabel>时限</FieldLabel>
                <p className="flex h-9 items-center text-sm">平台截止</p>
                <FieldDescription>建单时读取平台的截止字段，不可改</FieldDescription>
              </Field>
            ) : (
              <Controller
                name="dueLocal"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="nt-due">时限</FieldLabel>
                    <Input {...field} id="nt-due" type="datetime-local" aria-invalid={fieldState.invalid} />
                    {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : <FieldDescription>留空按接待设置里该类型的商户时限</FieldDescription>}
                  </Field>
                )}
              />
            )}
          </div>

          <Controller
            name="note"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="nt-note">说明</FieldLabel>
                <Textarea {...field} id="nt-note" rows={3} placeholder="例如：买家开票邮箱退信，等买家给新邮箱后重发" aria-invalid={fieldState.invalid} />
                {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
              </Field>
            )}
          />

          {conversationId && (
            <Controller
              name="linkConversation"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox id="nt-link-conv" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                  <FieldLabel htmlFor="nt-link-conv" className="font-normal">
                    关联当前会话{buyerName ? `（${buyerName}）` : ""}
                  </FieldLabel>
                </Field>
              )}
            />
          )}
        </FieldGroup>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          取消
        </Button>
        <Button type="submit" disabled={create.isPending || !me.data}>
          {create.isPending ? <Spinner /> : <ClipboardPlusIcon />}
          建工单
        </Button>
      </DialogFooter>
    </form>
  );
}
