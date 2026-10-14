import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

// 交互态只经 brand/state-layer.css（THEME-006）：state-layer 承载 hover/pressed/disabled，focus-ring 承载键盘焦点环。
// 设计系统 v5：主按钮芒果填充 + 可可字，每屏至多一个；次按钮白底 + 控件边框；破坏性操作用次级样式。
const buttonVariants = cva(
  "state-layer focus-ring group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent text-sm font-medium whitespace-nowrap select-none transition-transform duration-(--semantic-motion-duration-fast) active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        outline: "border-input bg-card text-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        ghost: "text-foreground",
        destructive: "border-input bg-card text-destructive",
        link: "h-auto! px-0! text-(--semantic-color-text-link) underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-1.5 px-4",
        sm: "h-8 gap-1 px-3",
        xs: "h-7 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-5",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
