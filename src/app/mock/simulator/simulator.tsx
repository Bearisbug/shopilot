"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon, RefreshCwIcon, StoreIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { SimPlatform, SimShop, SimState, SimThread } from "@/mock/sim/types";
import { AiStubPanel } from "./ai-stub";
import { ChatColumn } from "./chat";
import { AUTH_LABEL, clockTime, fetchState, LANGUAGES, shortTime } from "./client";
import { OrdersPanel } from "./orders";
import { PushLog } from "./push-log";
import { ShopPanel } from "./shop-panel";
import { ActProvider, Dot, Hint, useAct } from "./ui";

const TABS = ["orders", "shop", "push", "ai"] as const;
type Tab = (typeof TABS)[number];

/** 选中项写进 URL（INT-020）：刷新、分享、后退都回到同一视图。 */
function useSelection() {
  const sp = useSearchParams();
  const set = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    window.history.pushState(null, "", `?${q}`);
  };
  const tabRaw = sp.get("tab");
  return {
    platform: ((sp.get("shop")?.split(":")[0] ?? sp.get("platform")) === "tiktok" ? "tiktok" : "shopee") as SimPlatform,
    shopKey: sp.get("shop"),
    conv: sp.get("conv"),
    tab: (TABS as readonly string[]).includes(tabRaw ?? "") ? (tabRaw as Tab) : "orders",
    set,
  };
}

export function Simulator() {
  const sel = useSelection();
  const state = useQuery({
    queryKey: ["mock-sim", sel.shopKey, sel.conv],
    queryFn: ({ signal }) => fetchState(sel.shopKey, sel.conv, signal),
    // 读数失败后停止轮询，保留已加载内容，等显式重试（DATA-006）
    refetchInterval: (q) => (q.state.status === "error" ? false : 2000),
    refetchIntervalInBackground: false,
    retry: false,
  });
  const data = state.data;
  const shop = data?.shops.find((s) => `${s.platform}:${s.shopId}` === sel.shopKey) ?? null;
  const thread = data?.threads.find((t) => t.conversationId === sel.conv) ?? null;
  const badShop = !!data && !!sel.shopKey && !shop;
  const failedPushes = data?.pushLogs.filter((l) => !l.httpStatus || l.httpStatus >= 300).length ?? 0;

  return (
    <ActProvider>
      <div className="flex min-h-dvh flex-col bg-background lg:h-dvh">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2.5">
          <h1 className="text-lg font-semibold">Shopilot 模拟器</h1>
          <Hint className="hidden min-w-0 flex-1 md:block">扮演买家与平台；每个动作按平台格式签名后推送到 Shopilot 回调地址。</Hint>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {state.isError ? (
              <>
                <Dot tone="error" />
                <span>读数失败，已暂停刷新</span>
                <Button size="xs" variant="outline" onClick={() => state.refetch()}>
                  <RefreshCwIcon />
                  重试
                </Button>
              </>
            ) : data ? (
              <>
                <Dot tone="ok" />
                <span>每 2 秒刷新 · {clockTime(data.serverTime)}</span>
              </>
            ) : (
              <>
                <Spinner className="size-3.5" />
                <span>连接模拟平台…</span>
              </>
            )}
          </div>
        </header>

        {state.isError && !data ? (
          <div role="alert" className="m-6 max-w-xl rounded-lg bg-muted p-4 text-sm">
            <p className="font-medium text-destructive">模拟器读数没有拿到</p>
            <p className="mt-1 text-muted-foreground">{(state.error as Error).message}。确认 .env 里 MOCK_PLATFORM=1、数据库已迁移并跑过种子，然后点右上角重试。</p>
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[minmax(15rem,18rem)_minmax(24rem,1fr)_minmax(20rem,26rem)]">
            <aside aria-label="平台、店铺与买家" className="flex flex-col border-b border-border lg:min-h-0 lg:border-r lg:border-b-0">
              <LeftColumn data={data} sel={sel} badShop={badShop} />
            </aside>
            <section aria-label="买家聊天" className="flex min-h-[32rem] flex-col bg-card lg:min-h-0">
              <ChatColumn shop={shop} thread={thread} data={data} hasShopSelection={!!sel.shopKey} />
            </section>
            <section aria-label="订单、店铺与推送" className="flex flex-col border-t border-border lg:min-h-0 lg:border-t-0 lg:border-l">
              <Tabs value={sel.tab} onValueChange={(v) => sel.set({ tab: v })} className="flex min-h-0 flex-1 flex-col gap-0">
                <div className="px-3 pt-3">
                  <TabsList className="w-full">
                    <TabsTrigger value="orders" className="data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground">订单售后</TabsTrigger>
                    <TabsTrigger value="shop" className="data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground">店铺</TabsTrigger>
                    <TabsTrigger value="push" className="data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground">
                      推送
                      {failedPushes > 0 && <span className="rounded-full bg-destructive px-1.5 text-xs text-white tabular-nums">{failedPushes}</span>}
                    </TabsTrigger>
                    <TabsTrigger value="ai" className="data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground">AI 替身</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="orders" className="scroll-y min-h-0 px-4 py-3">
                  <OrdersPanel shop={shop} thread={thread} data={data} />
                </TabsContent>
                <TabsContent value="shop" className="scroll-y min-h-0 px-4 py-3">
                  <ShopPanel shop={shop} data={data} />
                </TabsContent>
                <TabsContent value="push" className="scroll-y min-h-0 px-4 py-3">
                  <PushLog data={data} shops={data?.shops ?? []} />
                </TabsContent>
                <TabsContent value="ai" className="scroll-y min-h-0 px-4 py-3">
                  <AiStubPanel />
                </TabsContent>
              </Tabs>
            </section>
          </div>
        )}
      </div>
    </ActProvider>
  );
}

type Sel = ReturnType<typeof useSelection>;

function LeftColumn({ data, sel, badShop }: { data: SimState | undefined; sel: Sel; badShop: boolean }) {
  const shops = data?.shops.filter((s) => s.platform === sel.platform) ?? [];
  const pickPlatform = (p: string) => {
    if (!p || p === sel.platform) return;
    sel.set({ platform: p, shop: null, conv: null });
  };
  return (
    <div className="flex flex-col gap-4 p-3 lg:min-h-0 lg:flex-1">
      <ToggleGroup type="single" variant="outline" spacing={0} value={sel.platform} onValueChange={pickPlatform} className="w-full" aria-label="平台">
        <ToggleGroupItem value="shopee" className="flex-1 data-[state=on]:bg-accent data-[state=on]:font-semibold data-[state=on]:text-(--semantic-color-text-link)">
          Shopee
        </ToggleGroupItem>
        <ToggleGroupItem value="tiktok" className="flex-1 data-[state=on]:bg-accent data-[state=on]:font-semibold data-[state=on]:text-(--semantic-color-text-link)">
          TikTok Shop
        </ToggleGroupItem>
      </ToggleGroup>

      <div>
        <h2 className="flex items-center gap-1.5 pb-1.5 text-sm font-semibold">
          <StoreIcon className="size-4 text-muted-foreground" />
          店铺
        </h2>
        {badShop && <Hint className="pb-1.5 text-destructive">链接里的店铺不存在，请重新选择。</Hint>}
        {!data ? (
          <div className="flex flex-col gap-1.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : shops.length === 0 ? (
          <Hint>没有店铺。先跑种子脚本（seedMock）写入模拟数据。</Hint>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {shops.map((s) => (
              <li key={s.shopId}>
                <ShopRow shop={s} active={sel.shopKey === `${s.platform}:${s.shopId}`} onPick={() => sel.set({ shop: `${s.platform}:${s.shopId}`, conv: null, platform: null })} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col lg:min-h-0 lg:flex-1">
        <h2 className="flex items-center gap-1.5 pb-1.5 text-sm font-semibold">
          <UsersIcon className="size-4 text-muted-foreground" />
          买家
        </h2>
        {!sel.shopKey || badShop ? (
          <Hint>选一家店后显示它的买家会话。</Hint>
        ) : !data ? (
          <Skeleton className="h-14" />
        ) : (
          <>
            <div className="scroll-y -mr-3 pr-3 lg:min-h-0 lg:flex-1">
              {data.threads.length === 0 ? (
                <Hint>这家店还没有买家，用下面的表单新建一个。</Hint>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {data.threads.map((t) => (
                    <li key={t.conversationId}>
                      <ThreadRow t={t} active={sel.conv === t.conversationId} onPick={() => sel.set({ conv: t.conversationId })} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <NewBuyer shopKey={sel.shopKey} onCreated={(id) => sel.set({ conv: id })} />
          </>
        )}
      </div>
    </div>
  );
}

function ShopRow({ shop, active, onPick }: { shop: SimShop; active: boolean; onPick: () => void }) {
  const expired = shop.authExpired;
  const authText = expired ? "授权已过期" : AUTH_LABEL[shop.authStatus];
  const hooked = !!shop.callbackUrl && shop.subscribed.length > 0;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={active ? "true" : undefined}
      className={cn("state-layer focus-ring relative flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left", active && "bg-accent before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-(--semantic-color-text-link)")}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className={cn("truncate text-sm", active ? "font-semibold text-(--semantic-color-text-link)" : "font-medium")}>{shop.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{shop.region}</span>
      </span>
      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Dot tone={shop.authStatus === "authorized" && !expired ? "ok" : shop.authStatus === "unauthorized" ? "off" : "warn"} />
          {authText}
        </span>
        <span className="inline-flex items-center gap-1">
          <Dot tone={hooked ? "ok" : "off"} />
          {hooked ? "回调已配" : "无回调"}
        </span>
        {shop.canAcceptChat !== null && (
          <span className="inline-flex items-center gap-1">
            <Dot tone={shop.canAcceptChat ? "ok" : "warn"} />
            {shop.canAcceptChat ? "坐席接单" : "暂停接单"}
          </span>
        )}
      </span>
    </button>
  );
}

function ThreadRow({ t, active, onPick }: { t: SimThread; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={active ? "true" : undefined}
      className={cn("state-layer focus-ring relative flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left", active && "bg-accent before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-(--semantic-color-text-link)")}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className={cn("truncate text-sm", active ? "font-semibold text-(--semantic-color-text-link)" : "font-medium")}>{t.buyerName}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t.started ? shortTime(t.lastMessageAt) : "未开口"}</span>
      </span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{t.preview || "还没有消息"}</span>
        {t.platform === "tiktok" && t.started && !t.sessionOpen && <span className="shrink-0">会话段已结束</span>}
        {t.unread > 0 && (
          <span className="shrink-0 rounded-full bg-(--semantic-color-surface-inverse) px-1.5 text-(--semantic-color-text-on-inverse) tabular-nums" aria-label={`卖家未读 ${t.unread} 条`}>
            {t.unread}
          </span>
        )}
      </span>
    </button>
  );
}

function NewBuyer({ shopKey, onCreated }: { shopKey: string; onCreated: (conversationId: string) => void }) {
  const { act, pendingKey } = useAct();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");
  const [platform, shopId] = shopKey.split(":");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const r = (await act("create_buyer", "create_buyer", { platform, shopId, name: name.trim(), language })) as { ok: boolean; conversationId?: string } | undefined;
    if (r?.ok && r.conversationId) {
      setName("");
      onCreated(r.conversationId);
    }
  };
  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
      <label htmlFor="new-buyer-name" className="text-xs font-medium">
        新建买家
      </label>
      <div className="flex gap-1.5">
        <Input id="new-buyer-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="买家名字，如 Aisyah" maxLength={60} className="h-8 min-w-0 flex-1" />
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger size="sm" aria-label="买家语言" className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={!name.trim() || pendingKey !== null}>
        {pendingKey === "create_buyer" ? <Spinner className="size-3.5" /> : <PlusIcon />}
        新建并打开会话
      </Button>
      <Hint>生成新的买家 ID 与会话；买家发出第一条消息后，平台接口才列出这个会话。</Hint>
    </form>
  );
}
