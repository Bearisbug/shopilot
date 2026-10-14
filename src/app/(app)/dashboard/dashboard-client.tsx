"use client";

// PAGE-DASHBOARD（/dashboard）：会话段去向、草稿处置、平台口径、转人工原因、按人统计、工单（REQ-DASH-001、API-DASH-001）。
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Me } from "@/contracts/auth";
import { DASH_RANGES, RANGE_LABEL, type DashboardResponse, type DashRange } from "@/contracts/dashboard";
import { PageActions } from "@/components/shell/app-shell";
import { ErrorState, PageHeader, PageScroll, Panel } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { inTz } from "@/lib/format";
import { DraftsPanel, HandoffReasonsPanel, PeoplePanel, PlatformPanel, TicketStats, TicketTypesPanel, TrendPanel } from "./dashboard-panels";

/** 范围写进 URL（INT-020）；非法值回默认「本月」 */
function useRange(): [DashRange, (v: DashRange) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("range");
  const value = (DASH_RANGES as readonly string[]).includes(raw ?? "") ? (raw as DashRange) : "this_month";
  const set = (v: DashRange) => {
    const next = new URLSearchParams(params.toString());
    if (v === "this_month") next.delete("range");
    else next.set("range", v);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return [value, set];
}

function Section({ title, description }: { title: string; description?: string }) {
  return (
    <div className="pt-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

export function DashboardClient({ me }: { me: Me }) {
  const [range, setRange] = useRange();
  const data = useQuery({ queryKey: ["dashboard", range], queryFn: () => api.get<DashboardResponse>(`/api/v1/dashboard?range=${range}`), placeholderData: keepPreviousData });
  const d = data.data;
  const tz = me.active.timezone;
  const scope = me.active.shopIds === null ? "全部" : "负责的";
  const facts = d
    ? `${inTz(d.period.start, tz, "MM-dd")} 至 ${inTz(new Date(new Date(d.period.end).getTime() - 1), tz, "MM-dd")} · ${scope} ${d.shopCount} 家店 · 平台口径与 Shopilot 口径分开显示`
    : " ";

  return (
    <PageScroll>
      <PageActions>
        <Button asChild variant="outline">
          <a href={`/api/v1/dashboard?range=${range}&format=csv`} download>
            <DownloadIcon />
            导出报表
          </a>
        </Button>
      </PageActions>
      <PageHeader title="看板" facts={facts}>
        <Select value={range} onValueChange={(v) => setRange(v as DashRange)}>
          <SelectTrigger aria-label="统计范围" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DASH_RANGES.map((r) => (
              <SelectItem key={r} value={r}>
                {RANGE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>
      {data.isError && !d ? (
        <Panel>
          <ErrorState error={data.error} onRetry={() => data.refetch()} />
        </Panel>
      ) : !d ? (
        <DashboardSkeleton />
      ) : (
        <div className={`flex flex-col gap-4 ${data.isFetching ? "opacity-70" : ""}`} aria-busy={data.isFetching}>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <TrendPanel d={d} canConnect={me.active.permissions.includes("shops.manage")} />
            <DraftsPanel d={d} />
          </div>
          <Section title="平台口径" description={`两个平台的算法不同，不合并成一个数。${d.platformPeriod !== d.range ? "平台只提供到近 30 天，「近 90 天」下平台口径按近 30 天显示。" : ""}`} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PlatformPanel d={d} platform="shopee" tz={tz} />
            <PlatformPanel d={d} platform="tiktok" tz={tz} />
          </div>
          <Section title="处理质量" description="只统计经 Shopilot 处理的会话段；回补的历史会话与达人会话不计。" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <HandoffReasonsPanel d={d} />
            <PeoplePanel d={d} canSeeTeam={me.active.permissions.includes("team.manage")} />
          </div>
          <Section title="工单" description="时限来源分平台截止与商户时限，超时是标记、不是状态。" />
          <TicketStats d={d} />
          <TicketTypesPanel d={d} />
        </div>
      )}
    </PageScroll>
  );
}

/** 加载态按真实版面占位（IA-006） */
function DashboardSkeleton() {
  const block = "rounded-md bg-muted motion-safe:animate-pulse";
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="看板加载中">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel className="flex flex-col gap-4">
          <Skeleton className={`h-6 w-40 ${block}`} />
          <Skeleton className={`h-9 w-24 ${block}`} />
          <Skeleton className={`h-56 w-full ${block}`} />
        </Panel>
        <Panel className="flex flex-col gap-4">
          <Skeleton className={`h-6 w-32 ${block}`} />
          <Skeleton className={`mx-auto size-40 rounded-full bg-muted motion-safe:animate-pulse`} />
          <Skeleton className={`h-24 w-full ${block}`} />
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Panel key={i} className="flex flex-col gap-3">
            <Skeleton className={`h-6 w-36 ${block}`} />
            {[0, 1, 2].map((j) => (
              <Skeleton key={j} className={`h-10 w-full ${block}`} />
            ))}
          </Panel>
        ))}
      </div>
    </div>
  );
}
