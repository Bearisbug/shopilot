"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import type { NotificationRuleRow, NotificationRules } from "@/contracts/settings";
import { PageActions } from "@/components/shell/app-shell";
import { ErrorState, LoadingRows, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorText } from "@/lib/api";
import { SettingsFrame } from "../settings-frame";
import { FeishuSection } from "./feishu-section";

const EVENT_TEXT: Record<NotificationRuleRow["event"], { label: string; desc: string }> = {
  unclaimed_timeout: { label: "待认领超过提醒时长", desc: "提醒负责该店的组长；时长在接待设置的工作时间页改" },
  handoff: { label: "买家要求人工 / AI 转人工", desc: "附会话链接与转人工原因" },
  auth_expiring: { label: "店铺授权即将到期", desc: "到期前 30 天、7 天各提醒一次" },
  shop_disconnected: { label: "店铺被取消授权或断开", desc: "店主在平台上取消授权，或授权刷新失败" },
  platform_metric_low: { label: "平台客服指标不达标", desc: "按平台口径的店铺客服指标低于平台要求时" },
  ticket_due_soon: { label: "工单即将到期", desc: "到达工单类型设定的提醒阈值时通知负责人" },
  ticket_overdue: { label: "工单已超时", desc: "通知负责人与该店组长" },
  ticket_assigned: { label: "工单指派或改派给我", desc: "通知新的负责人" },
  usage_threshold: { label: "出稿用量跨过提醒阈值", desc: "阈值与接收人在用量与套餐里设置" },
  agent_autoapply_paused: { label: "Agent 自动改卡暂停", desc: "AI 质量周指标连续两周回落时，Agent 改卡改为先审；管理员在知识库「经验卡」页签恢复" },
};

export function NotifyClient({ me }: { me: Me }) {
  const rules = useQuery({ queryKey: ["notification-rules"], queryFn: () => api.get<NotificationRules>("/api/v1/notification-rules") });
  const facts = rules.data
    ? `通知规则 ${rules.data.rules.length} 条 · 站内开 ${rules.data.rules.filter((r) => r.inApp).length} 条 · 邮件开 ${rules.data.rules.filter((r) => r.email).length} 条`
    : undefined;
  return (
    <SettingsFrame me={me} facts={facts}>
      {rules.isError ? (
        <Panel>
          <ErrorState error={rules.error} onRetry={() => rules.refetch()} />
        </Panel>
      ) : !rules.data ? (
        <Panel>
          <LoadingRows rows={9} />
        </Panel>
      ) : (
        <RulesEditor key={JSON.stringify(rules.data.rules)} saved={rules.data.rules} />
      )}
      <FeishuSection tz={me.active.timezone} />
      <Panel>
        <PanelHeader title="我的通知" description="浏览器桌面通知与提示音只对你自己生效，在账号安全页设置" />
        <Button asChild variant="outline" size="sm">
          <Link href="/account/security">
            <ShieldCheckIcon />
            去账号安全
          </Link>
        </Button>
      </Panel>
    </SettingsFrame>
  );
}

// 数据刷新后按新的已保存值重建（key），编辑中的状态只在这里
function RulesEditor({ saved }: { saved: NotificationRuleRow[] }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState(saved);
  const dirty = rows.some((r, i) => r.inApp !== saved[i].inApp || r.email !== saved[i].email);
  const save = useMutation({
    mutationFn: () => api.put<NotificationRules>("/api/v1/notification-rules", { rules: rows }),
    onSuccess: (next) => {
      qc.setQueryData(["notification-rules"], next);
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
      toast.success("通知规则已保存，之后发生的事件按新规则投递");
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const set = (event: string, key: "inApp" | "email", value: boolean) => setRows((prev) => prev.map((r) => (r.event === event ? { ...r, [key]: value } : r)));

  return (
    <Panel>
      <PageActions>
        <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Spinner /> : <CheckIcon />}
          保存
        </Button>
      </PageActions>
      <PanelHeader title="通知规则" description="站内通知进右上角铃铛；邮件写入发件箱。同一事件 10 分钟内不重复提醒同一个人。" />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>事件</TableHead>
            <TableHead className="w-20 text-center">站内</TableHead>
            <TableHead className="w-20 text-center">邮件</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const text = EVENT_TEXT[r.event] ?? { label: `未知（${r.event}）`, desc: "" };
            return (
              <TableRow key={r.event}>
                <TableCell className="py-3 whitespace-normal">
                  <p className="font-medium">{text.label}</p>
                  <p className="text-xs text-muted-foreground">{text.desc}</p>
                </TableCell>
                <TableCell className="text-center">
                  <Switch checked={r.inApp} onCheckedChange={(v) => set(r.event, "inApp", v)} aria-label={`${text.label} · 站内`} />
                </TableCell>
                <TableCell className="text-center">
                  <Switch checked={r.email} onCheckedChange={(v) => set(r.event, "email", v)} aria-label={`${text.label} · 邮件`} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}
