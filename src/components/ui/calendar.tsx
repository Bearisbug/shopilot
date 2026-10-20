"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { DayPicker, getDefaultClassNames, type DayButton } from "react-day-picker"
import { zhCN } from "react-day-picker/locale"
import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

// shadcn/ui Calendar（react-day-picker v9）；默认中文、周一开头。区间两端用主色填充，中间用选中底色（设计系统 v5：芒果只做填充）。
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const d = getDefaultClassNames()
  return (
    <DayPicker
      locale={zhCN}
      weekStartsOn={1}
      showOutsideDays={showOutsideDays}
      className={cn("group/calendar p-1 [--cell-size:--spacing(9)]", className)}
      classNames={{
        root: cn("w-fit", d.root),
        months: cn("relative flex flex-col gap-4 md:flex-row md:gap-6", d.months),
        month: cn("flex w-full flex-col gap-3", d.month),
        nav: cn("absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1", d.nav),
        button_previous: cn(buttonVariants({ variant: "ghost" }), "size-(--cell-size) p-0 select-none aria-disabled:opacity-40", d.button_previous),
        button_next: cn(buttonVariants({ variant: "ghost" }), "size-(--cell-size) p-0 select-none aria-disabled:opacity-40", d.button_next),
        month_caption: cn("flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)", d.month_caption),
        caption_label: cn("text-sm font-medium select-none", d.caption_label),
        month_grid: "w-full border-collapse",
        weekdays: cn("flex", d.weekdays),
        weekday: cn("flex-1 text-xs font-normal text-muted-foreground select-none", d.weekday),
        week: cn("mt-1 flex w-full", d.week),
        day: cn("group/day relative aspect-square h-full w-full p-0 text-center select-none", d.day),
        range_start: cn("rounded-l-md bg-accent", d.range_start),
        range_middle: cn("rounded-none", d.range_middle),
        range_end: cn("rounded-r-md bg-accent", d.range_end),
        today: cn("font-semibold text-(--semantic-color-text-link)", d.today),
        outside: cn("text-muted-foreground opacity-60", d.outside),
        disabled: cn("text-muted-foreground opacity-40", d.disabled),
        hidden: cn("invisible", d.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ className, orientation, ...rest }) =>
          orientation === "left" ? <ChevronLeftIcon className={cn("size-4", className)} {...rest} /> : <ChevronRightIcon className={cn("size-4", className)} {...rest} />,
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString("sv-SE")}
      data-selected-single={modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "flex aspect-square size-auto w-full min-w-(--cell-size) rounded-md text-sm font-normal tabular-nums",
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground",
        "data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground",
        "data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground",
        className,
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
