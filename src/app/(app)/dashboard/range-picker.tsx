"use client";

// 看板统计范围：左侧预设（点了立即生效），右侧双月日历选自定义起止日（点「应用」生效）。范围由 URL 承载（INT-020）。
import { TZDate } from "@date-fns/tz";
import { addMonths, differenceInCalendarDays, format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import type { DateRange } from "react-day-picker";
import { DASH_PRESETS, MAX_RANGE_DAYS, PRESET_LABEL, type DashRangeSpec } from "@/contracts/dashboard";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

/** 商户时区的今天，作为浏览器本地日期（日历按本地日期渲染） */
function todayIn(tz: string): Date {
  const t = new TZDate(Date.now(), tz);
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

const WIDE = "(min-width: 768px)";
/** 宽屏并排两个月，窄屏只显示一个月 */
function useWide(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(WIDE);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

function rangeLabel(spec: DashRangeSpec): string {
  return "from" in spec ? `${spec.from.slice(5)} 至 ${spec.to.slice(5)}` : PRESET_LABEL[spec.preset];
}

export function DashRangePicker({ value, onChange, tz, resolved }: { value: DashRangeSpec; onChange: (v: DashRangeSpec) => void; tz: string; resolved?: { from: string; to: string } }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  // 打开时预选的是当前范围；第一次点日期要重新开始选，否则日历只会挪动这个范围的一端
  const [fresh, setFresh] = useState(false);
  const today = todayIn(tz);
  const wide = useWide();

  const openWith = (o: boolean) => {
    if (o) {
      const from = "from" in value ? value.from : resolved?.from;
      const to = "from" in value ? value.to : resolved?.to;
      setDraft(from && to ? { from: parseISO(from), to: parseISO(to) } : undefined);
      setFresh(true);
    }
    setOpen(o);
  };
  const days = draft?.from && draft.to ? differenceInCalendarDays(draft.to, draft.from) + 1 : 0;
  const tooLong = days > MAX_RANGE_DAYS;
  const pick = (v: DashRangeSpec) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={openWith}>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label={`统计范围：${rangeLabel(value)}`} className="min-w-36 justify-start tabular-nums">
          <CalendarIcon />
          {rangeLabel(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12} aria-label="选择统计范围" className="w-auto max-w-[calc(100vw-1.5rem)] p-0">
        <div className="flex flex-col sm:flex-row">
          <ul aria-label="预设范围" className="flex flex-wrap gap-1 border-b border-border p-2 sm:w-28 sm:flex-col sm:flex-nowrap sm:border-r sm:border-b-0">
            {DASH_PRESETS.map((p) => {
              const active = "preset" in value && value.preset === p;
              return (
                <li key={p}>
                  <Button variant="ghost" size="sm" aria-pressed={active} onClick={() => pick({ preset: p })} className={cn("w-full justify-start", active && "bg-accent text-accent-foreground")}>
                    {PRESET_LABEL[p]}
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-2 p-3">
            <Calendar
              mode="range"
              selected={draft}
              onSelect={(r, day) => {
                if (fresh) {
                  setFresh(false);
                  setDraft({ from: day, to: undefined });
                } else setDraft(r);
              }}
              numberOfMonths={wide ? 2 : 1}
              defaultMonth={addMonths(draft?.to ?? today, wide ? -1 : 0)}
              endMonth={today}
              disabled={{ after: today }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <p className={cn("text-xs tabular-nums", tooLong ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
                {!draft?.from ? "选择开始日期" : !draft.to ? "选择结束日期" : tooLong ? `最多 ${MAX_RANGE_DAYS} 天，当前 ${days} 天` : `${ymd(draft.from)} 至 ${ymd(draft.to)} · ${days} 天`}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                  取消
                </Button>
                <Button size="sm" disabled={!draft?.from || !draft.to || tooLong} onClick={() => draft?.from && draft.to && pick({ from: ymd(draft.from), to: ymd(draft.to) })}>
                  应用
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
