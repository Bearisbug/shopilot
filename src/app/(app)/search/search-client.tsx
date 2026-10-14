"use client";

// PAGE-SEARCH：顶栏回车进入；分类 tab 写进 URL（?type=），关键词少于 2 个字时只提示不搜索（REQ-SEARCH-001）。
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon, ClipboardListIcon, MessageSquareTextIcon, PackageIcon, SearchIcon, SearchXIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { STATUS_GROUP_LABEL } from "@/contracts/orders";
import { SEARCH_LIMIT, SEARCH_MIN_CHARS, type SearchConversationHit, type SearchOrderHit, type SearchResponse, type SearchTicketHit } from "@/contracts/search";
import { OPEN_TICKET_STATUSES, TYPE_LABEL, statusText } from "@/contracts/tickets";
import { EmptyState, ErrorState, LoadingRows, PageHeader, PageScroll, Panel } from "@/components/shell/page";
import { Tabs as TabsPrimitive } from "radix-ui";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api";
import { PLATFORM_LABEL, inTz, money } from "@/lib/format";

const TABS = [
  { value: "all", label: "全部" },
  { value: "buyer", label: "买家" },
  { value: "order", label: "订单" },
  { value: "ticket", label: "工单" },
  { value: "message", label: "消息" },
] as const;
type Tab = (typeof TABS)[number]["value"];

/** 分类写进 URL（INT-020）；非法值回「全部」 */
function useTab(): [Tab, (v: Tab) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("type");
  const value = TABS.find((t) => t.value === raw)?.value ?? "all";
  const set = (v: Tab) => {
    const next = new URLSearchParams(params.toString());
    if (v === "all") next.delete("type");
    else next.set("type", v);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return [value, set];
}

/** 关键词第一次出现处加底色 */
function Hit({ text, q }: { text: string; q: string }) {
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0 || !q) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-accent text-foreground">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

function Row({ href, icon: Icon, title, meta }: { href: string; icon: React.ComponentType<{ className?: string }>; title: React.ReactNode; meta: React.ReactNode }) {
  return (
    <li className="border-b border-border last:border-0">
      <Link href={href} className="state-layer focus-ring -mx-2 flex items-center gap-3 rounded-md px-2 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted" aria-hidden="true">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{title}</span>
          <span className="block truncate text-xs text-muted-foreground tabular-nums">{meta}</span>
        </span>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

function BuyerRow({ h, q }: { h: SearchConversationHit; q: string }) {
  const byId = !h.buyerName.toLowerCase().includes(q.toLowerCase());
  return (
    <Row
      href={`/wb/${h.conversationId}`}
      icon={UserRoundIcon}
      title={<Hit text={h.buyerName} q={q} />}
      meta={
        <>
          {PLATFORM_LABEL[h.platform]} · {h.market} · {h.shopName}
          {h.orderCount !== null && ` · ${h.orderCount} 单`}
          {byId && (
            <>
              {" · 买家 ID "}
              <Hit text={h.buyerExternalId} q={q} />
            </>
          )}
        </>
      }
    />
  );
}

function MessageRow({ h, q, tz }: { h: SearchConversationHit; q: string; tz: string }) {
  return (
    <Row
      href={`/wb/${h.conversationId}`}
      icon={MessageSquareTextIcon}
      title={
        <>
          「<Hit text={h.message?.snippet ?? ""} q={q} />」
        </>
      }
      meta={`${h.buyerName} · ${h.message?.fromBuyer ? "买家发" : "本方发"} · ${inTz(h.message?.sentAt, tz)}`}
    />
  );
}

function OrderRow({ h, q }: { h: SearchOrderHit; q: string }) {
  return (
    <Row
      href={`/orders?order=${h.id}`}
      icon={PackageIcon}
      title={
        <>
          <Hit text={h.externalOrderId} q={q} />
          {h.itemsText && ` · ${h.itemsText}`}
        </>
      }
      meta={
        <>
          {PLATFORM_LABEL[h.platform]} · {h.shopName} · {STATUS_GROUP_LABEL[h.statusGroup] ?? `未知（${h.statusGroup}）`} · {money(h.total, h.currency)}
          {h.buyerName && (
            <>
              {" · "}
              <Hit text={h.buyerName} q={q} />
            </>
          )}
        </>
      }
    />
  );
}

function TicketRow({ h, q, tz }: { h: SearchTicketHit; q: string; tz: string }) {
  const open = OPEN_TICKET_STATUSES.includes(h.status);
  return (
    <Row
      href={`/tickets/${h.id}`}
      icon={ClipboardListIcon}
      title={
        <>
          <Hit text={h.number} q={q} /> · {TYPE_LABEL[h.type] ?? `未知（${h.type}）`}
          {h.buyerName && (
            <>
              {" · "}
              <Hit text={h.buyerName} q={q} />
            </>
          )}
        </>
      }
      meta={
        <>
          {PLATFORM_LABEL[h.platform]} · {h.market} · {h.shopName} · {statusText(h)}
          {open && h.dueAt && ` · 截止 ${inTz(h.dueAt, tz)}`}
          {h.externalOrderId && (
            <>
              {" · 订单 "}
              <Hit text={h.externalOrderId} q={q} />
            </>
          )}
        </>
      }
    />
  );
}

export function SearchClient() {
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const [tab, setTab] = useTab();
  const me = useMe();
  const tz = me.data?.active.timezone ?? "Asia/Kuala_Lumpur";
  const ok = Array.from(q).length >= SEARCH_MIN_CHARS;
  const res = useQuery({ queryKey: ["search", q], queryFn: () => api.get<SearchResponse>(`/api/v1/search?q=${encodeURIComponent(q)}`), enabled: ok });
  const d = res.data;

  const active = me.data?.active;
  const scope = !active ? "" : active.shopIds === null ? `全部 ${active.shops.length} 家店` : `负责的 ${active.shops.length} 家店${active.role === "agent" ? "，工单只含指派给你的" : ""}`;
  const facts = !ok ? (
    " "
  ) : (
    <span className="[overflow-wrap:anywhere]">
      关键词「{q}」{d && ` · 买家 ${d.counts.buyers} · 订单 ${d.counts.orders} · 工单 ${d.counts.tickets} · 消息 ${d.counts.messages}`}
      {scope && ` · 范围：${scope}`}
    </span>
  );

  return (
    <PageScroll>
      <PageHeader title="搜索结果" facts={facts} />
      {!ok ? (
        <Panel>
          <EmptyState icon={SearchIcon} title={q ? `至少输入 ${SEARCH_MIN_CHARS} 个字` : "输入关键词搜索"} description={`在顶栏搜索框输入至少 ${SEARCH_MIN_CHARS} 个字的买家名、订单号、工单号或消息里的词，按回车查看结果。`} />
        </Panel>
      ) : res.isError ? (
        <Panel>
          <ErrorState error={res.error} onRetry={() => res.refetch()} />
        </Panel>
      ) : !d ? (
        <Panel>
          <LoadingRows rows={5} />
        </Panel>
      ) : d.counts.all === 0 ? (
        <Panel>
          <EmptyState
            icon={SearchXIcon}
            title={`没有找到「${q}」`}
            description="搜索范围是你能看到的会话、订单与工单：买家名、买家 ID、订单号、工单号与消息正文。换个关键词，或确认对象在你负责的店铺内。"
          />
        </Panel>
      ) : (
        <Panel>
          <Results d={d} q={q} tz={tz} tab={tab} setTab={setTab} />
          <p className="mt-3 text-xs text-muted-foreground">搜 Shopilot 已存的会话消息、订单镜像、工单与买家；每类最多显示最近 {SEARCH_LIMIT} 条。</p>
        </Panel>
      )}
    </PageScroll>
  );
}

function Results({ d, q, tz, tab, setTab }: { d: SearchResponse; q: string; tz: string; tab: Tab; setTab: (v: Tab) => void }) {
  const buyers = d.conversations.filter((h) => h.match === "buyer");
  const messages = d.conversations.filter((h) => h.match === "message");
  const count: Record<Tab, number> = { all: d.counts.all, buyer: d.counts.buyers, order: d.counts.orders, ticket: d.counts.tickets, message: d.counts.messages };
  const shown: Record<Tab, number> = { all: d.conversations.length + d.orders.length + d.tickets.length, buyer: buyers.length, order: d.orders.length, ticket: d.tickets.length, message: messages.length };
  const rows = (t: Tab) => (
    <>
      {(t === "all" || t === "buyer") && buyers.map((h) => <BuyerRow key={`b${h.conversationId}`} h={h} q={q} />)}
      {(t === "all" || t === "order") && d.orders.map((h) => <OrderRow key={h.id} h={h} q={q} />)}
      {(t === "all" || t === "ticket") && d.tickets.map((h) => <TicketRow key={h.id} h={h} q={q} tz={tz} />)}
      {(t === "all" || t === "message") && messages.map((h) => <MessageRow key={`m${h.message?.id}`} h={h} q={q} tz={tz} />)}
    </>
  );
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
      {/* 共享 TabsTrigger 的 line 变体用 ::after 画指示线，会与 state-layer 的 ::after 冲突，所以这里直接用 Radix 触发器画底边线 */}
      <TabsList variant="line" aria-label="结果分类" className="scroll-nav w-full justify-start gap-4 overflow-x-auto rounded-none border-b border-border p-0 group-data-[orientation=horizontal]/tabs:h-auto">
        {TABS.map((t) => (
          <TabsPrimitive.Trigger
            key={t.value}
            value={t.value}
            className="state-layer focus-ring -mb-px h-9 rounded-t-sm border-b-2 border-transparent px-1 text-xs whitespace-nowrap text-muted-foreground data-[state=active]:border-(--semantic-color-text-link) data-[state=active]:font-semibold data-[state=active]:text-(--semantic-color-text-link)"
          >
            {t.label} <span className="tabular-nums">{count[t.value]}</span>
          </TabsPrimitive.Trigger>
        ))}
      </TabsList>
      {TABS.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-1">
          {shown[t.value] === 0 ? (
            <EmptyState icon={SearchXIcon} title={`「${t.label}」里没有匹配的结果`} />
          ) : (
            <>
              <ul>{rows(t.value)}</ul>
              {count[t.value] > shown[t.value] && (
                <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                  共 {count[t.value]} 条，只显示了 {shown[t.value]} 条；加长关键词可以缩小范围。
                </p>
              )}
            </>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
