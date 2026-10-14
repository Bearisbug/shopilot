"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon, CheckIcon, HeadsetIcon, ListChecksIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Me } from "@/contracts/auth";
import type { ConnectDraft, PlatformKey, ShopsResponse } from "@/contracts/shops";
import { PageScroll, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { AssistDialog, ConnectHeader, PLATFORM_LABEL, Stepper, useDraft, useSaveDraft } from "./connect-ui";
import { useDialogParam } from "@/components/shell/global-dialogs";

const PLATFORMS: Array<{ key: PlatformKey; desc: string; needs: string[] }> = [
  { key: "shopee", desc: "在 Shopee 开放平台建一个 Seller In-house System 应用", needs: ["中国营业执照", "店铺主账号", "近 30 天至少 30 单", "客户经理邮箱"] },
  { key: "tiktok", desc: "在 TikTok Shop Partner Center 用店铺账号建一个自研应用", needs: ["已通过平台资质审核（KYB）的店铺账号", "已绑定的客户经理"] },
];

const STEP_TEXT: Record<ConnectDraft["step"], string> = { platform: "选择平台", guide: "准备应用", credentials: "应用凭证", auth: "授权店铺", probe: "检查并完成", done: "已完成" };
const STEP_PATH: Record<ConnectDraft["step"], string> = { platform: "", guide: "/guide", credentials: "", auth: "/auth", probe: "/probe", done: "" };

function PlatformCard({ p }: { p: (typeof PLATFORMS)[number] }) {
  const router = useRouter();
  const draft = useDraft(p.key);
  const save = useSaveDraft(p.key);
  const go = (step: "guide" | "credentials", href: string) => {
    save.mutate({ step });
    router.push(href);
  };
  const d = draft.data;
  const resumable = d && d.step !== "platform" && d.step !== "done";
  return (
    <div className="flex min-w-0 flex-col rounded-(--semantic-radius-lg) border border-border p-5">
      <h3 className="text-lg font-semibold">{PLATFORM_LABEL[p.key]}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
      <h4 className="mt-4 text-sm font-semibold">需要准备</h4>
      <ul className="mt-2 flex flex-col gap-1.5">
        {p.needs.map((n) => (
          <li key={n} className="flex items-center gap-2 text-sm">
            <CheckIcon className="size-4 text-muted-foreground" aria-hidden />
            {n}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">缺了哪项先问你的客户经理；不缺也能先看步骤。</p>
      {resumable && (
        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
          上次进行到「{STEP_TEXT[d.step]}」
          {d.pendingShops > 0 ? `，已授权 ${d.pendingShops} 家店待完成` : ""}。
          <Link href={`/shops/connect/${p.key}${STEP_PATH[d.step]}`} className="focus-ring ml-1 rounded-sm font-medium text-(--semantic-color-text-link)">
            继续
          </Link>
        </p>
      )}
      <div className="mt-auto flex flex-col gap-2 pt-5">
        <Button variant="outline" onClick={() => go("credentials", `/shops/connect/${p.key}`)}>
          <ArrowRightIcon />
          已有应用，直接填
        </Button>
        <Button variant="outline" onClick={() => go("guide", `/shops/connect/${p.key}/guide`)}>
          <ListChecksIcon />
          还没有应用，跟着建
        </Button>
      </div>
    </div>
  );
}

export function ConnectClient({ me }: { me: Me }) {
  const shops = useQuery({ queryKey: ["shops", "connect-summary"], queryFn: () => api.get<ShopsResponse>("/api/v1/shops") });
  const assist = useDialogParam("assist");
  const s = shops.data;
  return (
    <PageScroll>
      <ConnectHeader subtitle="第 1 步，共 4 步 · 先在平台建一个应用，Shopilot 带你做" />
      <Stepper platform={null} current="platform" />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel>
          <PanelHeader title="选择要连接的平台" description="两个平台都要先由你在平台上建一个应用；已经有了就直接填" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {PLATFORMS.map((p) => (
              <PlatformCard key={p.key} p={p} />
            ))}
          </div>
        </Panel>
        <Panel>
          {!s ? (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="加载中">
              <Skeleton className="h-6 w-32 bg-muted motion-safe:animate-pulse" />
              <Skeleton className="h-10 w-full bg-muted motion-safe:animate-pulse" />
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold">{s.summary.total ? `已连接 ${s.summary.total} 家店` : "还没有接入店铺"}</h2>
              {s.apps.length > 0 && (
                <ul className="mt-3 flex flex-col">
                  {s.apps.map((a) => (
                    <li key={a.id} className="border-b border-border py-2.5 last:border-0">
                      <p className="text-sm">
                        {PLATFORM_LABEL[a.platform]} · {a.platform === "shopee" ? "Partner ID" : "App Key"} {a.appKey}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">{a.shopCount} 家店</p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">每个平台接一个应用；同一应用下的店（Shopee 主账号下的店、TikTok 各站点）都从这里授权进来。</p>
            </>
          )}
          <div className="mt-4 rounded-md bg-(--semantic-color-surface-warm) p-4">
            <p className="text-sm font-semibold">卡在平台后台某一步？</p>
            <p className="mt-1 text-xs text-muted-foreground">约 Shopilot 支持人员视频指导：由你本人操作，Shopilot 不要你的平台账号和密码。</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={assist.openIt}>
              <HeadsetIcon />
              预约远程协助
            </Button>
          </div>
        </Panel>
      </div>
      <AssistDialog me={me} />
    </PageScroll>
  );
}
