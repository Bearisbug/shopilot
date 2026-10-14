"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, DownloadIcon, FileArchiveIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import type { DataPolicyView, ErasureResult, ExportItem } from "@/contracts/settings";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageActions } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, api, errorText, newKey } from "@/lib/api";
import { inTz, PLATFORM_LABEL, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SettingsFrame } from "../settings-frame";

const RETENTION = [
  { value: 180, label: "180 天" },
  { value: 365, label: "1 年" },
  { value: 730, label: "2 年" },
] as const;

const EXPORT_STATUS: Record<ExportItem["status"], { label: string; tone?: "success" | "error" | "muted" }> = {
  queued: { label: "排队中" },
  running: { label: "打包中" },
  done: { label: "已完成", tone: "success" },
  failed: { label: "失败", tone: "error" },
  expired: { label: "已过期", tone: "muted" },
};

export function DataClient({ me }: { me: Me }) {
  const policy = useQuery({
    queryKey: ["data-policy"],
    queryFn: () => api.get<DataPolicyView>("/api/v1/data-policy"),
    // 有排队或打包中的导出时每 5 秒刷新一次
    refetchInterval: (q) => (q.state.data?.exports.some((x) => x.status === "queued" || x.status === "running") ? 5_000 : false),
  });
  const d = policy.data;
  const facts = d ? `会话保存 ${RETENTION.find((r) => r.value === d.retentionDays)?.label ?? `${d.retentionDays} 天`} · ${d.lastPurgeAt ? `上次清理 ${inTz(d.lastPurgeAt, me.active.timezone)}` : "还没有清理过"}` : undefined;
  return (
    <SettingsFrame me={me} facts={facts}>
      {policy.isError ? (
        <Panel>
          <ErrorState error={policy.error} onRetry={() => policy.refetch()} />
        </Panel>
      ) : !d ? (
        <Panel>
          <LoadingRows rows={4} />
        </Panel>
      ) : (
        <>
          <RetentionEditor key={d.retentionDays} me={me} saved={d} />
          <Erasure />
          <Exports me={me} items={d.exports} />
        </>
      )}
    </SettingsFrame>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <div className="shrink-0 text-sm">{children}</div>
    </div>
  );
}

function RetentionEditor({ me, saved }: { me: Me; saved: DataPolicyView }) {
  const qc = useQueryClient();
  const [days, setDays] = useState(saved.retentionDays);
  const save = useMutation({
    mutationFn: () => api.put<DataPolicyView>("/api/v1/data-policy", { retentionDays: days }),
    onSuccess: (r) => {
      qc.setQueryData(["data-policy"], r);
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
      toast.success("保存期限已更新，下次每日清理按新期限执行");
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const label = RETENTION.find((r) => r.value === days)?.label ?? `${days} 天`;
  return (
    <Panel>
      <PageActions>
        <Button disabled={days === saved.retentionDays || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Spinner /> : <CheckIcon />}
          保存
        </Button>
      </PageActions>
      <PanelHeader title="数据保存期限" description="每天商户当地时间 03:00 清理超过期限的数据，删除后不能恢复" />
      <Row title="会话与消息" desc="已结束超过期限的会话段，连同消息、AI 草稿与聊天图片">
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-28" aria-label="会话与消息保存期限">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RETENTION.map((r) => (
              <SelectItem key={r.value} value={String(r.value)}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Separator />
      <Row title="订单镜像" desc="平台订单在 Shopilot 的本地副本，按最后更新时间计">
        <span className="tabular-nums">{label}</span>
      </Row>
      <Separator />
      <Row title="审计日志与登录记录" desc="用于安全追溯，不随保存期限删除">
        <span className="text-muted-foreground">不删除</span>
      </Row>
      <Separator />
      <Row title="上次清理">
        <span className="text-muted-foreground tabular-nums">{saved.lastPurgeAt ? inTz(saved.lastPurgeAt, me.active.timezone, "yyyy-MM-dd HH:mm") : "还没有清理过"}</span>
      </Row>
    </Panel>
  );
}

function Erasure() {
  const qc = useQueryClient();
  const [platform, setPlatform] = useState<"shopee" | "tiktok">("shopee");
  const [buyerId, setBuyerId] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<(ErasureResult & { label: string }) | null>(null);
  const erase = useMutation({
    mutationFn: () => api.post<ErasureResult>("/api/v1/data/erasures", { platform, buyerExternalId: buyerId.trim(), confirm: true }),
    onSuccess: (r) => {
      const label = `${PLATFORM_LABEL[platform]} 买家 ${buyerId.trim()}`;
      setResult({ ...r, label });
      setConfirm(false);
      setBuyerId("");
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
      // 各项计数全为 0 说明没有这位买家的数据，不报「已删除」
      if (r.conversations + r.messages + r.drafts + r.invoices + r.orders === 0) toast.info(`没有找到 ${label} 的数据`);
      else toast.success(`已删除 ${label} 的数据`);
    },
    onError: (e) => {
      setConfirm(false);
      if (e instanceof ApiError && e.status === 422) setFieldError(e.problem.detail ?? "买家 ID 不对");
      else toast.error(errorText(e));
    },
  });
  return (
    <Panel>
      <PanelHeader title="删除某位买家的数据" description="删除 Shopilot 里这位买家的会话、消息、草稿与相关发票，订单镜像去掉买家信息，不能恢复；平台上的数据不受影响" />
      <form
        noValidate
        className="flex flex-wrap items-start gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!buyerId.trim()) {
            setFieldError("请填写买家 ID");
            return;
          }
          setResult(null);
          setConfirm(true);
        }}
      >
        <Field className="w-36">
          <FieldLabel htmlFor="erase-platform">平台</FieldLabel>
          <Select value={platform} onValueChange={(v) => setPlatform(v as "shopee" | "tiktok")}>
            <SelectTrigger id="erase-platform" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shopee">Shopee</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field className="min-w-60 flex-1" data-invalid={Boolean(fieldError)}>
          <FieldLabel htmlFor="erase-buyer">买家 ID</FieldLabel>
          <Input
            id="erase-buyer"
            value={buyerId}
            autoComplete="off"
            onChange={(e) => {
              setBuyerId(e.target.value);
              setFieldError(null);
            }}
            placeholder="平台的买家 ID，例如 Shopee 的 user_id"
            aria-invalid={Boolean(fieldError)}
            aria-describedby="erase-buyer-desc"
          />
          {fieldError ? <FieldError id="erase-buyer-desc">{fieldError}</FieldError> : <FieldDescription id="erase-buyer-desc">在会话右栏的买家信息里可以复制</FieldDescription>}
        </Field>
        <Button type="submit" variant="destructive" className="mt-7" disabled={erase.isPending}>
          <SearchIcon />
          查找并删除
        </Button>
      </form>
      {result && (
        <p role="status" className="mt-4 rounded-(--semantic-radius-md) bg-muted px-4 py-3 text-sm tabular-nums">
          {result.conversations + result.messages + result.drafts + result.invoices + result.orders === 0
            ? `没有找到 ${result.label} 的数据，删除计数全为 0。`
            : `已删除 ${result.label}：会话 ${result.conversations}、消息 ${result.messages}、草稿 ${result.drafts}、发票 ${result.invoices}；${result.orders} 张订单已去掉买家信息。`}
        </p>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="删除这位买家的数据？"
        desc={`将删除 ${PLATFORM_LABEL[platform]} 买家 ${buyerId.trim()} 在 Shopilot 里的全部会话、消息、草稿与相关发票，并去掉订单镜像里的买家名、收件信息与买家 ID，删除后不能恢复。平台上的聊天与订单不受影响。`}
        confirmText="确认删除"
        destructive
        pending={erase.isPending}
        onConfirm={() => erase.mutate()}
      />
    </Panel>
  );
}

function Exports({ me, items }: { me: Me; items: ExportItem[] }) {
  const qc = useQueryClient();
  const [key, setKey] = useState(newKey);
  const busy = items.some((x) => x.status === "queued" || x.status === "running");
  const start = useMutation({
    mutationFn: () => api.post<{ exportJobId: string }>("/api/v1/data/exports", {}, key),
    onSuccess: () => {
      toast.success("已开始打包，完成后发邮件给你，下载链接 24 小时有效");
      setKey(newKey());
      qc.invalidateQueries({ queryKey: ["data-policy"] });
    },
    onError: (e) => {
      setKey(newKey());
      toast.error(errorText(e));
      qc.invalidateQueries({ queryKey: ["data-policy"] });
    },
  });
  return (
    <Panel>
      <PanelHeader title="导出数据" description="把会话、消息、订单、工单、发票打包成 CSV 的 ZIP；完成后发邮件，下载链接 24 小时有效">
        <Button variant="outline" disabled={start.isPending} onClick={() => start.mutate()}>
          {start.isPending || busy ? <Spinner /> : <DownloadIcon />}
          导出
        </Button>
      </PanelHeader>
      {items.length === 0 ? (
        <EmptyState icon={FileArchiveIcon} title="还没有导出过" description="点「导出」开始打包全量数据。" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>发起时间</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>下载有效期至</TableHead>
              <TableHead className="text-right">下载</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((x) => {
              const s = EXPORT_STATUS[x.status] ?? { label: `未知（${x.status}）` };
              return (
                <TableRow key={x.id}>
                  <TableCell className="tabular-nums">{inTz(x.createdAt, me.active.timezone, "yyyy-MM-dd HH:mm")}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        s.tone === "success" && "text-(--semantic-color-feedback-success)",
                        s.tone === "error" && "text-destructive",
                        s.tone === "muted" && "text-muted-foreground",
                      )}
                    >
                      {s.label}
                    </span>
                    {x.error && <span className="ml-2 text-xs text-muted-foreground">{x.error}</span>}
                  </TableCell>
                  <TableCell className="tabular-nums">{x.status === "done" && x.expiresAt ? `${inTz(x.expiresAt, me.active.timezone, "MM-dd HH:mm")}（${relative(x.expiresAt)}）` : "—"}</TableCell>
                  <TableCell className="text-right">
                    {x.downloadUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={x.downloadUrl} download>
                          <DownloadIcon />
                          下载 ZIP
                        </a>
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
