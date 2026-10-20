"use client";

// 开发发件箱 · 飞书卡片（PAGE-DEV-OUTBOX）：替身模式下「发出」的卡片都记在投递记录里，这里按卡片 JSON 2.0 粗略还原：
// 标题与颜色、正文、图片、按钮链接，并附原始 JSON。
import { useQuery } from "@tanstack/react-query";
import { MessageSquareIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState, ErrorState, LoadingRows } from "@/components/shell/page";
import { cn } from "@/lib/utils";

type Delivery = {
  id: string;
  kind: "unclaimed" | "overdue" | "test" | "ticket";
  status: "queued" | "sent" | "failed" | "skipped";
  targetName: string | null;
  attempts: number;
  messageId: string | null;
  stub: boolean;
  error: string | null;
  card: CardJson | null;
  createdAt: string;
  sentAt: string | null;
};
type CardJson = { header?: { template?: string; title?: { content?: string } }; body?: { elements?: Element[] } };
type Element = { tag: string; content?: string; img_key?: string; text?: { content?: string }; behaviors?: Array<{ default_url?: string }>; columns?: Array<{ elements?: Element[] }> };

const KIND_TEXT: Record<Delivery["kind"], string> = { unclaimed: "待认领卡", overdue: "待认领超时卡", test: "测试卡片", ticket: "工单转发卡" };
const STATUS_TEXT: Record<Delivery["status"], string> = { queued: "排队中", sent: "已发出", failed: "失败", skipped: "已跳过" };
const COLOR_TEXT: Record<string, string> = { orange: "橙色", red: "红色", blue: "蓝色", wathet: "浅蓝" };

export function OutboxTabs({ current }: { current: "mail" | "feishu" }) {
  const tabs = [
    { key: "mail", label: "邮件", href: "/dev/outbox" },
    { key: "feishu", label: "飞书卡片", href: "/dev/outbox?tab=feishu" },
  ] as const;
  return (
    <nav aria-label="发件箱分类" className="mt-3 flex gap-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={current === t.key ? "page" : undefined}
          className={cn("state-layer focus-ring rounded-md px-3 py-1.5 text-sm", current === t.key ? "bg-accent font-semibold text-(--semantic-color-text-link)" : "text-foreground")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

async function load(): Promise<{ items: Delivery[]; images: Record<string, string> }> {
  const res = await fetch("/api/dev/feishu", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** 卡片 markdown → 纯文字：去掉加粗与字体标签，链接写成「文字（地址）」，HTML 实体还原 */
function plain(md: string): string {
  return md
    .replace(/<font[^>]*>(.*?)<\/font>/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1（$2）")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&sim;/g, "~");
}

function CardBody({ elements, images }: { elements: Element[]; images: Record<string, string> }) {
  return (
    <>
      {elements.map((el, i) => {
        if (el.tag === "markdown") return <p key={i} className="text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{plain(el.content ?? "")}</p>;
        if (el.tag === "hr") return <hr key={i} className="border-border" />;
        if (el.tag === "img") {
          const src = el.img_key ? images[el.img_key] : undefined;
          return src ? (
            // 替身图片：key 里带着原图地址
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="卡片图片" className="aspect-square w-40 rounded-md object-cover" />
          ) : (
            <p key={i} className="text-xs text-muted-foreground">图片 {el.img_key}</p>
          );
        }
        if (el.tag === "button") {
          const url = el.behaviors?.[0]?.default_url;
          return (
            <p key={i} className="text-sm">
              按钮「{el.text?.content}」→{" "}
              <a href={url} className="break-all text-(--semantic-color-text-link) underline-offset-4 hover:underline">
                {url}
              </a>
            </p>
          );
        }
        if (el.tag === "column_set") return <CardBody key={i} elements={(el.columns ?? []).flatMap((c) => c.elements ?? [])} images={images} />;
        return null;
      })}
    </>
  );
}

export function FeishuOutbox() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selected = params.get("id");
  const list = useQuery({ queryKey: ["dev-feishu"], queryFn: load, refetchInterval: 5_000 });
  const items = list.data?.items ?? [];
  const current = items.find((m) => m.id === selected) ?? null;
  const open = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("id", id);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <main className="flex h-dvh flex-col gap-4 bg-background p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold">发件箱</h1>
        <p className="text-sm text-muted-foreground">FEISHU_MODE=stub 时飞书卡片不外发，待认领卡、超时卡、测试卡片、工单转发卡都记在这里；按钮链接可直接点开。</p>
        <OutboxTabs current="feishu" />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
        <section aria-label="卡片列表" className="scroll-y min-h-0 rounded-xl bg-card md:w-[clamp(18rem,32vw,26rem)] md:shrink-0">
          {list.isPending ? (
            <div className="p-4">
              <LoadingRows rows={6} />
            </div>
          ) : list.isError ? (
            <div className="p-4">
              <ErrorState error={list.error} onRetry={() => list.refetch()} />
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={MessageSquareIcon} title="还没有飞书卡片" description="在商户设置 → 通知里连接飞书并设默认群，会话进入待认领或点「发测试卡片」后出现在这里。" />
          ) : (
            <ul>
              {items.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => open(m.id)}
                    aria-current={m.id === selected ? "true" : undefined}
                    className={cn("state-layer focus-ring block w-full border-b border-border px-4 py-3 text-left", m.id === selected && "bg-accent")}
                  >
                    <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{m.targetName ?? "（无目标）"}</span>
                      <span className="shrink-0 tabular-nums">{new Date(m.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-medium">{m.card?.header?.title?.content ?? KIND_TEXT[m.kind]}</span>
                    <span className={cn("mt-0.5 block text-xs", m.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                      {KIND_TEXT[m.kind]} · {STATUS_TEXT[m.status]}
                      {m.stub ? "（替身）" : ""}
                      {m.error ? ` · ${m.error}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="卡片内容" className="scroll-y min-h-0 flex-1 rounded-xl bg-card p-6">
          {!current ? (
            <EmptyState icon={MessageSquareIcon} title="选一张卡片" description="左侧点开后在这里看标题、正文、按钮链接与卡片 JSON。" />
          ) : (
            <article className="flex max-w-2xl flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold">{current.card?.header?.title?.content ?? KIND_TEXT[current.kind]}</h2>
                <p className="text-sm text-muted-foreground">
                  发往 {current.targetName ?? "（无目标）"} · {KIND_TEXT[current.kind]} · 标题颜色 {COLOR_TEXT[current.card?.header?.template ?? ""] ?? current.card?.header?.template ?? "无"} · {STATUS_TEXT[current.status]}
                  {current.stub ? "（替身，未真的发到飞书）" : ""} · 尝试 {current.attempts} 次{current.messageId ? ` · ${current.messageId}` : ""}
                </p>
                {current.error && <p className="mt-1 text-sm text-destructive">{current.error}</p>}
              </div>
              {current.card ? (
                <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
                  <CardBody elements={current.card.body?.elements ?? []} images={list.data?.images ?? {}} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">还没有构卡（排队中或已跳过）。</p>
              )}
              {current.card && (
                <details>
                  <summary className="focus-ring cursor-pointer rounded-sm text-sm font-medium text-(--semantic-color-text-link)">卡片 JSON</summary>
                  <pre className="mt-2 rounded-md bg-muted p-3 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">{JSON.stringify(current.card, null, 2)}</pre>
                </details>
              )}
            </article>
          )}
        </section>
      </div>
    </main>
  );
}
