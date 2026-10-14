"use client";

import { createContext, useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { SimActionResult } from "@/mock/sim/types";
import { pushSummary, simAction, simImage } from "./client";

type ActVars = { key: string; action: string; body: unknown; file?: File | null };

type ActCtx = { act: (key: string, action: string, body: unknown, file?: File | null) => Promise<SimActionResult | undefined>; pendingKey: string | null };

const Ctx = createContext<ActCtx>({ act: async () => undefined, pendingKey: null });

/** 模拟器动作：一次只跑一个动作（其余按钮禁用），结果用 toast 报告推送情况，完成后刷新读数。 */
export function ActProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (v: ActVars) => (v.action === "buyer_image" ? simImage(String((v.body as { conversationId: string }).conversationId), v.file ?? null) : simAction(v.action, v.body)),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error("动作没有执行", { description: r.error });
        return;
      }
      const failed = r.pushes.some((p) => !p.httpStatus || p.httpStatus >= 300);
      (failed ? toast.warning : toast.success)(r.message, { description: pushSummary(r) });
    },
    onError: (e) => toast.error("请求没有发出去", { description: `${(e as Error).message}。检查 dev server 是否在运行后重试。` }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["mock-sim"] }),
  });
  const value: ActCtx = {
    act: (key, action, body, file) => m.mutateAsync({ key, action, body, file }).catch(() => undefined),
    pendingKey: m.isPending ? m.variables?.key ?? null : null,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAct() {
  return useContext(Ctx);
}

/** 触发一个模拟器动作的按钮：本动作进行中显示转圈，任何动作进行中都禁用。 */
export function ActButton({
  actKey,
  action,
  body,
  children,
  variant = "outline",
  size = "xs",
  disabled,
  className,
}: {
  actKey: string;
  action: string;
  body: unknown;
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "xs" | "sm" | "default";
  disabled?: boolean;
  className?: string;
}) {
  const { act, pendingKey } = useAct();
  return (
    <Button type="button" variant={variant} size={size} className={className} disabled={disabled || pendingKey !== null} onClick={() => act(actKey, action, body)}>
      {pendingKey === actKey && <Spinner className="size-3.5" />}
      {children}
    </Button>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 pb-2">
      <h2 className="text-sm font-semibold">{children}</h2>
      {aside}
    </div>
  );
}

export function Hint({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-xs text-muted-foreground", className)}>{children}</p>;
}

/** 平台原始状态值，等宽小字 */
export function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return <code className={cn("rounded-sm bg-muted px-1 py-0.5 font-mono text-xs break-all", className)}>{children}</code>;
}

export function Dot({ tone }: { tone: "ok" | "warn" | "off" | "error" }) {
  const cls = {
    ok: "bg-(--semantic-color-feedback-success)",
    warn: "bg-(--semantic-color-feedback-warning)",
    error: "bg-destructive",
    off: "bg-(--semantic-color-border-control)",
  }[tone];
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", cls)} />;
}

export function Facts({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
