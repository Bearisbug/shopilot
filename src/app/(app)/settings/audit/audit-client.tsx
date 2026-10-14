"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { DownloadIcon, ScrollTextIcon } from "lucide-react";
import type { Me } from "@/contracts/auth";
import { AUDIT_MODULE_LABEL, AUDIT_MODULES, AUDIT_SOURCE_LABEL, type AuditList } from "@/contracts/settings";
import type { MembersResponse } from "@/contracts/team";
import { PageActions } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { inTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SettingsFrame, useQueryParam } from "../settings-frame";

const RANGES = [
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
  { value: "90d", label: "近 90 天" },
] as const;

export function AuditClient({ me }: { me: Me }) {
  const [actorRaw, setActor] = useQueryParam("actor", "all");
  const [moduleRaw, setModule] = useQueryParam("module", "all");
  const [rangeRaw, setRange] = useQueryParam("range", "30d");
  // URL 里的非法值回退默认（INT-020）
  const moduleId = moduleRaw === "all" || (AUDIT_MODULES as string[]).includes(moduleRaw) ? moduleRaw : "all";
  const range = RANGES.some((r) => r.value === rangeRaw) ? rangeRaw : "30d";
  const actor = actorRaw === "all" || actorRaw === "system" || actorRaw === "webhook" || /^[0-9a-f-]{36}$/i.test(actorRaw) ? actorRaw : "all";

  const members = useQuery({
    queryKey: ["members", "week", "all", "all"],
    queryFn: () => api.get<MembersResponse>("/api/v1/members?period=week&role=all&status=all"),
  });
  const qs = new URLSearchParams({ range, ...(moduleId !== "all" ? { module: moduleId } : {}), ...(actor !== "all" ? { actor } : {}) });
  const logs = useInfiniteQuery({
    queryKey: ["audit-logs", qs.toString()],
    queryFn: ({ pageParam }) => api.get<AuditList>(`/api/v1/audit-logs?${qs.toString()}&limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = logs.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = moduleId !== "all" || actor !== "all";
  const rangeLabel = RANGES.find((r) => r.value === range)?.label;

  return (
    <SettingsFrame me={me} facts={`${rangeLabel} · ${moduleId === "all" ? "全部模块" : AUDIT_MODULE_LABEL[moduleId as keyof typeof AUDIT_MODULE_LABEL]} · 审计日志不随保存期限删除`}>
      <PageActions>
        <Button asChild variant="outline">
          <a href={`/api/v1/audit-logs?${qs.toString()}&format=csv`} download>
            <DownloadIcon />
            导出 CSV
          </a>
        </Button>
      </PageActions>
      <Panel>
        <PanelHeader title="审计日志" description="配置、成员、店铺、工单、订单与售后等操作都会记录；系统任务与平台推送也会留痕">
          <Select value={actor} onValueChange={setActor}>
            <SelectTrigger size="sm" className="max-w-44" aria-label="按操作人筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部操作人</SelectItem>
              {(members.data?.members ?? []).map((m) => (
                <SelectItem key={m.membershipId} value={m.membershipId}>
                  {m.name}
                  {m.status === "disabled" ? "（已停用）" : ""}
                </SelectItem>
              ))}
              <SelectItem value="system">系统</SelectItem>
              <SelectItem value="webhook">平台</SelectItem>
            </SelectContent>
          </Select>
          <Select value={moduleId} onValueChange={setModule}>
            <SelectTrigger size="sm" aria-label="按模块筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部模块</SelectItem>
              {AUDIT_MODULES.map((m) => (
                <SelectItem key={m} value={m}>
                  {AUDIT_MODULE_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger size="sm" aria-label="时间范围">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PanelHeader>
        {logs.isError ? (
          <ErrorState error={logs.error} onRetry={() => logs.refetch()} />
        ) : logs.isPending ? (
          <LoadingRows rows={8} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ScrollTextIcon}
            title="没有符合筛选条件的记录"
            description={filtered ? "换个操作人或模块，或放宽时间范围。" : `${rangeLabel}没有操作记录。`}
            action={
              filtered ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setActor("all");
                    setModule("all");
                  }}
                >
                  清除筛选
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">时间</TableHead>
                  <TableHead className="w-32">操作人</TableHead>
                  <TableHead className="w-16">来源</TableHead>
                  <TableHead className="w-28">模块</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground tabular-nums">{inTz(r.createdAt, me.active.timezone)}</TableCell>
                    <TableCell className="max-w-32 truncate">{r.actorName ?? "—"}</TableCell>
                    <TableCell className={cn("text-xs", r.actorSource === "page" ? "text-muted-foreground" : "text-foreground")}>{AUDIT_SOURCE_LABEL[r.actorSource] ?? `未知（${r.actorSource}）`}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{AUDIT_MODULE_LABEL[r.module] ?? `未知（${r.module}）`}</TableCell>
                    <TableCell className="whitespace-normal text-pretty">{r.summary}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span className="tabular-nums">已显示 {items.length} 条</span>
              {logs.hasNextPage ? (
                <Button variant="outline" size="sm" disabled={logs.isFetchingNextPage} onClick={() => logs.fetchNextPage()}>
                  {logs.isFetchingNextPage && <Spinner />}
                  加载更多
                </Button>
              ) : (
                <span>没有更早的记录了</span>
              )}
            </div>
          </>
        )}
      </Panel>
    </SettingsFrame>
  );
}
