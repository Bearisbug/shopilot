"use client";

import { RotateCwIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SimPushLog, SimShop, SimState } from "@/mock/sim/types";
import { eventLabel, shortTime } from "./client";
import { ActButton, Dot, Hint, SectionTitle } from "./ui";

export function PushLog({ data, shops }: { data: SimState | undefined; shops: SimShop[] }) {
  if (!data) return <Skeleton className="h-40" />;
  const names = new Map(shops.map((s) => [`${s.platform}:${s.shopId}`, s.name]));
  return (
    <div>
      <SectionTitle aside={<span className="text-xs text-muted-foreground">最近 {data.pushLogs.length} 条</span>}>推送日志</SectionTitle>
      {data.pushLogs.length === 0 ? (
        <Hint>还没有推送。在聊天或订单里做一个动作，已配置回调的店会把事件推到 Shopilot，结果记在这里。</Hint>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {data.pushLogs.map((l) => (
            <Row key={l.id} l={l} shopName={l.shopId ? names.get(`${l.platform}:${l.shopId}`) ?? l.shopId : "应用级"} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ l, shopName }: { l: SimPushLog; shopName: string }) {
  const ok = !!l.httpStatus && l.httpStatus < 300;
  return (
    <li className="flex flex-col gap-1 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <Dot tone={ok ? "ok" : "error"} />
          <span className="truncate">{eventLabel(l.platform, l.event)}</span>
        </span>
        <span className={ok ? "shrink-0 text-xs tabular-nums text-(--semantic-color-feedback-success)" : "shrink-0 text-xs tabular-nums text-destructive"}>
          {l.httpStatus ? `HTTP ${l.httpStatus}` : "未送达"}
          {l.durationMs !== null && <span className="text-muted-foreground"> · {l.durationMs} ms</span>}
        </span>
      </div>
      <p className="text-sm break-words">{l.summary}</p>
      {l.error && <p className="text-xs text-destructive">{l.error}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-muted-foreground" title={l.targetUrl}>
          {shopName} · {shortTime(l.createdAt)}
          {l.resendOf ? " · 重发" : ""} · {l.targetUrl}
        </span>
        <ActButton actKey={`resend:${l.id}`} action="resend_push" body={{ logId: l.id }} variant="ghost" className="shrink-0">
          <RotateCwIcon />
          重发
        </ActButton>
      </div>
    </li>
  );
}
