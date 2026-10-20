"use client";

// PAGE-DASHBOARD（/dashboard）：会话段去向、草稿处置、平台口径、转人工原因、按人统计、工单（REQ-DASH-001、API-DASH-001）。
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Me } from "@/contracts/auth";
import { DASH_PRESETS, DEFAULT_PRESET, rangeSearch, type DashboardResponse, type DashPreset, type DashRangeSpec } from "@/contracts/dashboard";
import { PageActions } from "@/components/shell/app-shell";
import { ErrorState, PageHeader, PageScroll, Panel } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { inTz } from "@/lib/format";
import { DashRangePicker } from "./range-picker";
import { DraftsPanel, PeoplePanel, PlatformPanel, TicketStats, TicketTypesPanel, TrendPanel } from "./dashboard-panels";
import { IssuesPanel } from "./issues-panel";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_LABEL = { "7d": "近 7 天", "30d": "近 30 天", this_month: "本月", last_month: "上月" } as const;

/** 范围写进 URL（INT-020）：预设写 ?range=，自定义写 ?from=&to=；非法值回默认「本月」 */
function useRange(): [DashRangeSpec, (v: DashRangeSpec) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("range");
  const from = params.get("from");
  const to = params.get("to");
  const value: DashRangeSpec =
    from && to && DAY.test(from) && DAY.test(to) && from <= to ? { from, to } : { preset: (DASH_PRESETS as readonly string[]).includes(raw ?? "") ? (raw as DashPreset) : DEFAULT_PRESET };
  const set = (v: DashRangeSpec) => {
    const next = new URLSearchParams(params.toString());
    for (const k of ["range", "from", "to"]) next.delete(k);
    for (const [k, val] of new URLSearchParams(rangeSearch(v))) next.set(k, val);
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
  const qs = rangeSearch(range);
  const data = useQuery({ queryKey: ["dashboard", qs], queryFn: () => api.get<DashboardResponse>(`/api/v1/dashboard${qs ? `?${qs}` : ""}`), placeholderData: keepPreviousData });
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
          <a href={`/api/v1/dashboard?${qs ? `${qs}&` : ""}format=csv`} download>
            <DownloadIcon />
            导出报表
          </a>
        </Button>
      </PageActions>
      <PageHeader title="看板" facts={facts}>
        <DashRangePicker value={range} onChange={setRange} tz={tz} resolved={d?.range} />
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
          <Section
            title="平台口径"
            description={`两个平台的算法不同，不合并成一个数。${d.range.preset === d.platformPeriod ? "" : `平台只提供近 7 天、近 30 天、本月、上月四个窗口，当前范围下平台口径按${PERIOD_LABEL[d.platformPeriod]}显示。`}`}
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PlatformPanel d={d} platform="shopee" tz={tz} />
            <PlatformPanel d={d} platform="tiktok" tz={tz} />
          </div>
          <Section title="处理质量" description="只统计经 Shopilot 处理的会话段；回补的历史会话与达人会话不计。" />
          <IssuesPanel d={d} tz={tz} rangeQs={qs} canManage={me.active.permissions.includes("reception.manage")} />
          <PeoplePanel d={d} canSeeTeam={me.active.permissions.includes("team.manage")} />
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
