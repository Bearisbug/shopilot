"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, LockIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  ASSIGNEES,
  ASSIGNEE_LABEL,
  AUTO_CLOSE_DAYS,
  DUE_OPTIONS,
  MANUAL_ONLY_TYPES,
  REMIND_KIND,
  REMIND_OPTIONS,
  TICKET_TYPE_LABEL,
  dueKey,
  dueLabel,
  remindLabel,
  type Assignee,
  type MerchantDue,
  type Remind,
  type TicketTypeKey,
  type TicketTypeRow,
  type TicketTypesResponse,
} from "@/contracts/reception";
import { PageActions } from "@/components/shell/app-shell";
import { ErrorState, LoadingRows, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, errorText } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ReceptionFrame } from "../reception-frame";

const DUE_NOTE: Partial<Record<TicketTypeKey, string>> = {
  cancel_request: "仅 Shopee，且不晚于最晚发货",
  logistics: "平台没有截止时间时",
  stock: "没有关联订单时",
  handover: "下个工作时段开始后",
};
const PLATFORM_DUE_REASON = "平台给了截止时间，以平台为准；只能改提醒阈值";

export function TicketsConfigClient() {
  const data = useQuery({ queryKey: ["ticket-types"], queryFn: () => api.get<TicketTypesResponse>("/api/v1/reception/ticket-types") });
  if (data.isError)
    return (
      <ReceptionFrame>
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      </ReceptionFrame>
    );
  if (!data.data)
    return (
      <ReceptionFrame>
        <LoadingRows />
      </ReceptionFrame>
    );
  return <TicketTypesEditor config={data.data} />;
}

type RowDraft = Partial<Pick<TicketTypeRow, "autoCreate" | "merchantDue" | "defaultAssignee" | "remind">>;

function TicketTypesEditor({ config }: { config: TicketTypesResponse }) {
  const qc = useQueryClient();
  // 只记改动；保存成功后清空，显示回落到服务端数据
  const [draft, setDraft] = useState<Partial<Record<TicketTypeKey, RowDraft>>>({});
  const [autoClose, setAutoClose] = useState<number | null | undefined>(undefined);
  const row = (r: TicketTypeRow): TicketTypeRow => ({ ...r, ...draft[r.type] });
  const changedTypes = config.types.filter((r) => {
    const d = draft[r.type];
    return d && (Object.keys(d) as Array<keyof RowDraft>).some((k) => JSON.stringify(d[k]) !== JSON.stringify(r[k]));
  });
  const autoCloseValue = autoClose === undefined ? config.autoCloseDays : autoClose;
  const dirty = changedTypes.length > 0 || autoCloseValue !== config.autoCloseDays;

  const patch = (type: TicketTypeKey, p: RowDraft) => setDraft((d) => ({ ...d, [type]: { ...d[type], ...p } }));

  const save = useMutation({
    mutationFn: () => {
      const body = { types: changedTypes.map((r) => ({ type: r.type, ...draft[r.type] })), autoCloseDays: autoCloseValue };
      return api.put("/api/v1/reception/ticket-types", body);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ticket-types"] });
      setDraft({});
      setAutoClose(undefined);
      toast.success("已保存，只影响之后新建的工单");
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const autoCount = config.types.filter((r) => r.autoCreate && !MANUAL_ONLY_TYPES.includes(r.type)).length;

  return (
    <ReceptionFrame facts={`${config.types.length} 类工单 · ${autoCount} 类自动建单 · 平台给了截止时间的以平台为准`} dirty={dirty}>
      <PageActions>
        <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending ? <Spinner /> : <CheckIcon />}
          保存
        </Button>
      </PageActions>

      <Panel>
        <PanelHeader title="工单类型" description="平台给了截止时间的以平台为准，只能改提醒；没有平台时限的类型用商户时限" />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>类型 · 触发 · 时限来源</TableHead>
              <TableHead className="w-40">商户时限</TableHead>
              <TableHead className="w-40">默认负责人</TableHead>
              <TableHead className="w-36">提醒</TableHead>
              <TableHead className="w-20">自动建单</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {config.types.map((saved) => {
              const r = row(saved);
              const label = TICKET_TYPE_LABEL[r.type];
              const dueOptions = DUE_OPTIONS[r.type];
              const kind = REMIND_KIND[r.type];
              const changed = changedTypes.includes(saved);
              return (
                <TableRow key={r.type} className="align-top">
                  <TableCell className="max-w-0 py-3 whitespace-normal">
                    <p className="font-medium">
                      {label}
                      <span className={cn("ml-2 text-xs font-normal text-(--semantic-color-text-link)", !changed && "invisible")}>未保存</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="text-foreground">触发</span> {r.trigger}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="text-foreground">时限来源</span> {r.dueSourceLabel}
                    </p>
                  </TableCell>
                  <TableCell className="py-3">
                    {dueOptions === null ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0} className="focus-ring inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground">
                            <LockIcon className="size-3.5" />
                            以平台为准
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{PLATFORM_DUE_REASON}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <>
                        <Select value={r.merchantDue ? dueKey(r.merchantDue) : undefined} onValueChange={(v) => patch(r.type, { merchantDue: dueOptions.find((o) => dueKey(o) === v) as MerchantDue })}>
                          <SelectTrigger size="sm" aria-label={`${label}的商户时限`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {dueOptions.map((o) => (
                              <SelectItem key={dueKey(o)} value={dueKey(o)}>
                                {dueLabel(o)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {DUE_NOTE[r.type] && <p className="mt-1 text-xs text-muted-foreground">{DUE_NOTE[r.type]}</p>}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="py-3">
                    <Select value={r.defaultAssignee} onValueChange={(v) => patch(r.type, { defaultAssignee: v as Assignee })}>
                      <SelectTrigger size="sm" aria-label={`${label}的默认负责人`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNEES.map((a) => (
                          <SelectItem key={a} value={a}>
                            {ASSIGNEE_LABEL[a]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {r.defaultAssignee === "claimer" && <p className="mt-1 text-xs text-muted-foreground">没有会话时为店铺组长</p>}
                  </TableCell>
                  <TableCell className="py-3">
                    <Select value={String(r.remind[kind] ?? "")} onValueChange={(v) => patch(r.type, { remind: { [kind]: Number(v) } as Remind })}>
                      <SelectTrigger size="sm" aria-label={`${label}的提醒阈值`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REMIND_OPTIONS[kind].map((v) => (
                          <SelectItem key={v} value={String(v)}>
                            {remindLabel({ [kind]: v })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="py-3">
                    {MANUAL_ONLY_TYPES.includes(r.type) ? (
                      <span className="text-sm text-muted-foreground">仅手动</span>
                    ) : (
                      <Switch checked={r.autoCreate} onCheckedChange={(on) => patch(r.type, { autoCreate: on })} aria-label={`${label} 自动建单`} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>

      <Panel>
        <PanelHeader title="全局设置" description="对所有工单类型生效" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="rcp-autoclose">已解决后自动关闭</FieldLabel>
            <Select value={autoCloseValue === null ? "never" : String(autoCloseValue)} onValueChange={(v) => setAutoClose(v === "never" ? null : Number(v))}>
              <SelectTrigger id="rcp-autoclose" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTO_CLOSE_DAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} 天后
                  </SelectItem>
                ))}
                <SelectItem value="never">不自动关闭</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>已解决的工单过了这个天数自动变为已关闭</FieldDescription>
          </Field>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">编号前缀</p>
            <p className="text-sm tabular-nums">{config.numberPrefix}</p>
            <p className="text-sm text-muted-foreground">例如 {config.numberPrefix}1024，商户内连续编号</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">保存只影响之后新建的工单，已建工单的截止时间不回改；改动写入审计日志。</p>
      </Panel>
    </ReceptionFrame>
  );
}
