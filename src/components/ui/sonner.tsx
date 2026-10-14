"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      // 顶部居中时让出 72px 顶栏，不盖住搜索框与通知铃
      offset={{ top: 80 }}
      mobileOffset={{ top: 80 }}
      toastOptions={{
        classNames: {
          // 品牌不用投影（brand/DESIGN.md）；sonner 的样式不在层里，要用 important 才盖得住
          toast: "cn-toast shadow-none!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
