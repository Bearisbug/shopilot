"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailIcon, PaperclipIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingRows } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FeishuOutbox, OutboxTabs } from "./feishu-cards";

type Mail = {
  id: string;
  to: string;
  template: string;
  subject: string;
  body: string;
  links: Array<{ label: string; url: string }>;
  attachments: Array<{ fileId: string; name: string; url: string }>;
  status: "queued" | "delivered" | "bounced";
  refType: string | null;
  createdAt: string;
};

async function load(to: string): Promise<Mail[]> {
  const res = await fetch(`/api/dev/outbox${to ? `?to=${encodeURIComponent(to)}` : ""}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { items: Mail[] }).items;
}

export function OutboxClient() {
  const params = useSearchParams();
  return params.get("tab") === "feishu" ? <FeishuOutbox /> : <MailOutbox />;
}

function MailOutbox() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const to = params.get("to") ?? "";
  const selected = params.get("id");
  const [filter, setFilter] = useState(to);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["dev-outbox", to], queryFn: () => load(to), refetchInterval: 5_000 });
  const bounce = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/dev/outbox/${id}/bounce`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => {
      toast.success("已标记退信");
      qc.invalidateQueries({ queryKey: ["dev-outbox"] });
    },
    onError: (e) => toast.error(`没有标记成功：${(e as Error).message}`),
  });
  const setParam = (patch: Record<string, string | null>, mode: "push" | "replace" = "replace") => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const url = next.toString() ? `${pathname}?${next.toString()}` : pathname;
    if (mode === "push") router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  };
  const mails = list.data ?? [];
  const current = mails.find((m) => m.id === selected) ?? null;

  return (
    <main className="flex h-dvh flex-col gap-4 bg-background p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">发件箱</h1>
          <p className="text-sm text-muted-foreground">本期邮件不外发，邀请、重置密码、提醒、发票邮件都写在这里。链接可直接点开。</p>
          <OutboxTabs current="mail" />
        </div>
        <form
          role="search"
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setParam({ to: filter.trim() || null, id: null });
          }}
        >
          <label htmlFor="to" className="sr-only">
            按收件人筛选
          </label>
          <Input id="to" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="收件人邮箱" className="w-60" autoComplete="off" />
          <Button type="submit" variant="outline">
            筛选
          </Button>
        </form>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
        <section aria-label="邮件列表" className="scroll-y min-h-0 rounded-xl bg-card md:w-[clamp(18rem,32vw,26rem)] md:shrink-0">
          {list.isPending ? (
            <div className="p-4">
              <LoadingRows rows={6} />
            </div>
          ) : list.isError ? (
            <div className="p-4">
              <ErrorState error={list.error} onRetry={() => list.refetch()} />
            </div>
          ) : mails.length === 0 ? (
            <EmptyState icon={MailIcon} title="发件箱是空的" description={to ? `没有发给 ${to} 的邮件。` : "触发邀请、找回密码等操作后，邮件会出现在这里。"} />
          ) : (
            <ul>
              {mails.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setParam({ id: m.id }, "push")}
                    aria-current={m.id === selected ? "true" : undefined}
                    className={cn("state-layer focus-ring block w-full border-b border-border px-4 py-3 text-left", m.id === selected && "bg-accent")}
                  >
                    <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{m.to}</span>
                      <span className="shrink-0 tabular-nums">{new Date(m.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-medium">{m.subject}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {m.template}
                      {m.status === "bounced" ? " · 已退信" : ""}
                      {m.attachments.length ? ` · ${m.attachments.length} 个附件` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="邮件正文" className="scroll-y min-h-0 flex-1 rounded-xl bg-card p-6">
          {!current ? (
            <EmptyState icon={MailIcon} title="选一封邮件" description="左侧点开后在这里看正文、链接与附件。" />
          ) : (
            <article className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold">{current.subject}</h2>
                <p className="text-sm text-muted-foreground">
                  发给 {current.to} · {current.template} · {current.status === "bounced" ? "已退信" : "已送达"}
                </p>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{current.body}</p>
              {current.links.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {current.links.map((l) => (
                    <li key={l.url}>
                      <a href={l.url} className="text-sm break-all text-(--semantic-color-text-link) underline-offset-4 hover:underline">
                        {l.label}：{l.url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {current.attachments.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {current.attachments.map((a) => (
                    <li key={a.fileId}>
                      <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-(--semantic-color-text-link) underline-offset-4 hover:underline">
                        <PaperclipIcon className="size-4" aria-hidden="true" />
                        {a.name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <Button variant="outline" disabled={current.status === "bounced" || bounce.isPending} onClick={() => bounce.mutate(current.id)}>
                  {current.status === "bounced" ? "已标记退信" : "标记退信"}
                </Button>
              </div>
            </article>
          )}
        </section>
      </div>
    </main>
  );
}
