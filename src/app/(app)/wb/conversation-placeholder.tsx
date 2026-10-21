"use client";

// 打开会话、详情还没到时的占位：会话头用列表里这一行的数据（买家、店铺、状态），时间线与输入框画骨架。
// 结构与 ConversationPane、BuyerColumn 的外框同宽同位，换成真实内容时不跳动（INT-021）
import { ChevronLeftIcon, TimerIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import type { ConversationListItem } from "@/contracts/conversations";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Avatar, PlatformTag, setPendingOpen, STATE_LABEL, useWbParams, waitText } from "./wb-shared";

const bar = "animate-none bg-muted motion-safe:animate-pulse";
// 一买家、一本方交替，宽度错开，像一段对话
const BUBBLES = ["self-start w-3/5 h-12", "self-end w-1/2 h-10", "self-start w-2/5 h-8", "self-end w-3/5 h-14", "self-start w-1/2 h-10"];

export function ConversationPlaceholder({ item, withBuyer = false }: { item?: ConversationListItem | null; withBuyer?: boolean }) {
  const { params } = useWbParams();
  const listParams = new URLSearchParams(params.toString());
  listParams.delete("dialog");
  listParams.delete("panel");
  const listHref = `/wb${listParams.toString() ? `?${listParams.toString()}` : ""}`;
  return (
    <>
      <section aria-busy="true" aria-label={item ? `正在打开与 ${item.buyerName} 的会话` : "正在打开会话"} className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl bg-card">
        <div className="shrink-0 border-b border-border px-4 pt-3 pb-3">
          <div className="flex items-start gap-3">
            <Button asChild variant="ghost" size="icon-sm" className="md:hidden">
              {/* 窄屏点下会话后立刻返回：地址还停在列表上，要手动撤掉占位 */}
              <Link href={listHref} aria-label="返回会话列表" onClick={() => setPendingOpen(null)}>
                <ChevronLeftIcon />
              </Link>
            </Button>
            {item ? <Avatar name={item.buyerName} src={item.buyerAvatarUrl} /> : <Skeleton className={cn(bar, "size-8 shrink-0 rounded-full")} />}
            <div className="min-w-0 flex-1">
              {item ? (
                <>
                  <p className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate font-semibold">{item.buyerName}</span>
                    <PlatformTag platform={item.shop.platform} market={item.shop.market} className="hidden shrink-0 sm:inline-flex" />
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.shop.name} · {STATE_LABEL[item.handlingState]}
                  </p>
                </>
              ) : (
                <div aria-hidden>
                  <Skeleton className={cn(bar, "h-6 w-32")} />
                  <Skeleton className={cn(bar, "mt-0.5 h-4 w-48 max-w-full")} />
                </div>
              )}
            </div>
          </div>
          {/* 买家在等时真实会话头多一条等待条：同样的字、同样会折行，接待时限要等详情，先画骨架 */}
          {item && item.waitingSinceSec !== null && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
              <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", item.overdue && "text-(--semantic-color-feedback-warning)")}>
                {item.overdue ? <TriangleAlertIcon className="size-3.5" aria-hidden="true" /> : <TimerIcon className="size-3.5" aria-hidden="true" />}
                {item.waitingSinceSec < 60 ? "买家等待不到 1 分钟" : `买家已等 ${waitText(item.waitingSinceSec)}`}
                {item.overdue ? "，超过接待时限" : ""}
              </span>
              <span aria-hidden className="inline-flex h-4 items-center">
                <Skeleton className={cn(bar, "h-3 w-40 bg-border")} />
              </span>
            </div>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden px-4 py-4" aria-hidden>
          {BUBBLES.map((c) => (
            <Skeleton key={c} className={cn(bar, "max-w-full rounded-lg", c)} />
          ))}
        </div>
        {/* 输入盒子按真实输入框的行高搭：文字区一行、工具栏一行，盒子窄于 24rem 时工具栏同样折成两行 */}
        <div className="shrink-0 px-4 pt-2 pb-4" aria-hidden>
          <div className="@container/composer rounded-lg border border-border">
            <div className="mt-3 mb-2 flex h-11 items-start px-3">
              <Skeleton className={cn(bar, "mt-1 h-4 w-1/2")} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2">
              <Skeleton className={cn(bar, "h-8 w-24")} />
              <div className="flex min-w-0 flex-auto items-center gap-2 @max-sm/composer:basis-full">
                <Skeleton className={cn(bar, "h-8 w-20")} />
                <Skeleton className={cn(bar, "ml-auto size-8")} />
              </div>
            </div>
          </div>
        </div>
      </section>
      {withBuyer && (
        <aside aria-hidden className="hidden min-h-0 w-[clamp(17rem,24vw,21rem)] shrink-0 flex-col gap-4 rounded-xl bg-card p-4 @min-[68rem]/wb:flex">
          <Skeleton className={cn(bar, "h-6 w-40")} />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className={cn(bar, "h-12 w-full rounded-md")} />
          ))}
        </aside>
      )}
    </>
  );
}
