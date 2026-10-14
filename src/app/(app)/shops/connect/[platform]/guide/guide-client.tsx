"use client";

import { AlertTriangleIcon, ArrowRightIcon, CheckIcon, ClockIcon, CopyIcon, HeadsetIcon, InfoIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Me } from "@/contracts/auth";
import type { ConnectDraft, PlatformKey } from "@/contracts/shops";
import { useDialogParam } from "@/components/shell/global-dialogs";
import { ErrorState, LoadingRows, PageScroll, Panel } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorText } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AssistDialog, ConnectHeader, CopyValue, SaveDraftAction, Stepper, useDraft, useSaveDraft } from "../../connect-ui";

type Key = "1" | "2" | "3" | "4" | "5";
type Item = { key: Key; title: string; sub: string; body: (d: ConnectDraft, openAssist: () => void) => React.ReactNode; wait?: string };

const TIKTOK_SCOPE_TEMPLATE =
  "We are the seller ourselves and build this in-house app only for our own shops. The app receives buyer messages and replies from our customer service team (with optional AI-drafted replies reviewed by our staff), shows order and after-sales status in the chat so agents can answer buyers accurately. No data is shared with third parties.";

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm marker:text-muted-foreground">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

function Warn({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "error" }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-sm", tone === "warn" ? "bg-(--semantic-color-surface-warm)" : "bg-muted text-destructive")}>
      <AlertTriangleIcon className={cn("mt-0.5 size-4 shrink-0", tone === "warn" && "text-(--semantic-color-feedback-warning)")} aria-hidden />
      <span>{children}</span>
    </p>
  );
}

const SHOPEE_ITEMS: Item[] = [
  {
    key: "1",
    title: "注册开发者账号",
    sub: "用公司身份在 Shopee 开放平台（open.shopee.cn）注册",
    body: () => <Bullets items={["账号类型选 Registered Business Seller", "上传中国营业执照；平台要求近 30 天至少 30 单", "填客户经理邮箱，申请前先告诉你的客户经理"]} />,
    wait: "平台审核：3 个工作日内",
  },
  {
    key: "2",
    title: "创建应用",
    sub: "建一个能接买家聊天的应用",
    body: () => (
      <>
        <Bullets items={["应用类型选 Seller In-house System"]} />
        <Warn>不要把开发者账号转成服务商：转了以后，名下应用会自动变成 ERP 类型，没有聊天接口，接不了客服。</Warn>
      </>
    ),
  },
  {
    key: "3",
    title: "申请上线（Go Live）",
    sub: "把下面的值填进控制台，提交上线审核",
    body: (d) => (
      <>
        <div>
          <CopyValue label="Live Redirect URL Domain" value={d.urls.redirectDomain} />
          <CopyValue label="Live Call Back URL" value={d.urls.webhook} />
        </div>
        <p className="text-sm text-muted-foreground">这两个地址是本商户专属的，现在就可以填；Live Call Back URL 不填也行，第 2 步「验证并保存」时 Shopilot 会自动写入。</p>
        <p className="text-sm text-muted-foreground">控制台还要填 IT 资产里的服务器出口 IP：向 Shopilot 支持索取。审核通过后，应用详情里能看到 Live Partner ID 和 Live Partner Key，下一步要用。</p>
      </>
    ),
    wait: "平台审核：24 小时内，不能加急",
  },
  {
    key: "4",
    title: "确认聊天权限",
    sub: "Shopee 的聊天接口只对白名单开放，按平台说明申请",
    body: (_d, openAssist) => (
      <>
        <Bullets items={["按 Shopee Chat 白名单说明提交申请", "授权店铺后，Shopilot 会自动检查聊天能不能用，第 4 步能看到结果"]} />
        <p className="text-sm text-muted-foreground">
          跨境卖家的申请路径和审批时长 Shopilot 还没核实；拿不准先问客户经理，或
          <button type="button" onClick={openAssist} className="focus-ring rounded-sm font-medium text-(--semantic-color-text-link)">
            预约远程协助
          </button>
          。
        </p>
      </>
    ),
    wait: "审批时长：平台未公布",
  },
  {
    key: "5",
    title: "可选：开 IP 白名单",
    sub: "解锁买家姓名和地址，开票时能从订单带出收件信息",
    body: () => <p className="text-sm text-muted-foreground">在控制台的 IP 白名单里填 Shopilot 服务器的出口 IP（向 Shopilot 支持索取）。不开也能接客服，只是订单里的姓名地址会打码。</p>,
  },
];

const TIKTOK_ITEMS: Item[] = [
  {
    key: "1",
    title: "注册卖家开发者",
    sub: "用店铺账号登录 TikTok Shop Partner Center，注册 TikTok Shop Seller 开发者",
    body: () => <Bullets items={["前提：店铺已通过平台资质审核（KYB），并已绑定客户经理"]} />,
    wait: "平台审核：数个工作日（平台给的估计值）",
  },
  {
    key: "2",
    title: "创建 Custom app",
    sub: "建一个自研应用",
    body: () => (
      <>
        <Bullets items={["类目选 TikTok Shop Seller", "Market 和 Seller type 选跨境，以及你开店的站点"]} />
        <Warn tone="error">类目、市场和卖家类型创建后不能改，选之前确认清楚。</Warn>
      </>
    ),
  },
  {
    key: "3",
    title: "打开 Enable API",
    sub: "填 Shopilot 给的回调地址",
    body: (d) => (
      <>
        <div>
          <CopyValue label="Redirect URL" value={d.urls.redirect} />
          <CopyValue label="Webhook URL" value={d.urls.webhook} />
        </div>
        <p className="text-sm text-muted-foreground">这两个地址是本商户专属的，现在就可以填；Webhook URL 不填也行，授权后 Shopilot 会按店自动设置。</p>
      </>
    ),
  },
  {
    key: "4",
    title: "勾选权限，申请客服接口",
    sub: "聊天要单独申请，其余权限勾上就能用",
    body: () => (
      <>
        <Bullets items={["勾选订单、履约、物流、售后、店铺信息权限", "到 Manage API 申请 Customer Service，用途说明可以用下面的模板", "授权后 Shopilot 会自动核对权限有没有批下来"]} />
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              navigator.clipboard
                .writeText(TIKTOK_SCOPE_TEMPLATE)
                .then(() => toast.success("已复制用途说明模板"))
                .catch(() => toast.error("复制没有成功，请手动选中复制"))
            }
          >
            <CopyIcon />
            复制用途说明模板
          </Button>
        </div>
      </>
    ),
    wait: "审批时长：平台未公布",
  },
  {
    key: "5",
    title: "填安全审核表并发布",
    sub: "审核表通过后点 Publish",
    body: () => (
      <>
        <Bullets items={["安全审核表用英文如实填写", "填完后点 Publish"]} />
        <Warn>连续 3 次被驳回可能被平台拉黑。平台原文写得含糊，按最严格的理解准备，拿不准先预约远程协助。</Warn>
      </>
    ),
  },
];

export function GuideClient({ me, platform }: { me: Me; platform: PlatformKey }) {
  const router = useRouter();
  const draft = useDraft(platform);
  const save = useSaveDraft(platform);
  const assist = useDialogParam("assist");
  // 本页改过的勾选；未改的项取草稿里的值
  const [overrides, setOverrides] = useState<Partial<Record<Key, boolean>>>({});
  const items = platform === "shopee" ? SHOPEE_ITEMS : TIKTOK_ITEMS;
  const d = draft.data;
  const checked = (k: Key) => overrides[k] ?? Boolean(d?.checklist[k]);
  const checklist = () => Object.fromEntries(items.map((i) => [i.key, checked(i.key)])) as Record<Key, boolean>;
  const done = items.filter((i) => checked(i.key)).length;

  // 带 #item-N 进来（如店铺页「查看方法」）：清单渲染出来后在内部滚动容器里滚到该项并短暂高亮
  const loaded = Boolean(d);
  useEffect(() => {
    if (!loaded) return;
    const el = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
    if (!el) return;
    el.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    el.setAttribute("data-flash", "");
    const t = window.setTimeout(() => el.removeAttribute("data-flash"), 1600);
    return () => window.clearTimeout(t);
  }, [loaded]);

  const toggle = (k: Key, v: boolean) => {
    setOverrides((o) => ({ ...o, [k]: v }));
    save.mutate({ step: "guide", checklist: { [k]: v } }, { onError: (e) => toast.error(`勾选没有存进草稿：${errorText(e)}`) });
  };
  const next = () => {
    save.mutate({ step: "credentials", checklist: checklist() });
    router.push(`/shops/connect/${platform}`);
  };

  return (
    <PageScroll>
      <SaveDraftAction platform={platform} body={() => ({ step: "guide", checklist: checklist() })} />
      <ConnectHeader
        back="/shops/connect"
        subtitle={platform === "shopee" ? "Shopee · 准备应用，在平台上完成，不计入 4 步 · 开发者账号审核 3 个工作日内，上线审核 24 小时内" : "TikTok Shop · 准备应用，在平台上完成，不计入 4 步 · 注册审核要数个工作日"}
      />
      <Stepper platform={platform} current="guide" />
      {draft.isError ? (
        <ErrorState error={draft.error} onRetry={() => draft.refetch()} />
      ) : !d ? (
        <LoadingRows />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-4">
            {items.map((item) => {
              const on = checked(item.key);
              return (
                <Panel
                  key={item.key}
                  id={`item-${item.key}`}
                  aria-labelledby={`item-${item.key}-title`}
                  className="scroll-mt-4 transition-shadow duration-(--semantic-motion-duration-fast) data-flash:ring-2 data-flash:ring-ring"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full text-sm tabular-nums",
                        on ? "bg-(--semantic-color-surface-inverse) text-(--semantic-color-text-on-inverse)" : "border border-border text-muted-foreground",
                      )}
                      aria-hidden
                    >
                      {on ? <CheckIcon className="size-4" /> : item.key}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 id={`item-${item.key}-title`} className="text-lg font-semibold">
                        {item.title}
                      </h2>
                      <p className="text-xs text-muted-foreground">{item.sub}</p>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                      <Checkbox checked={on} onCheckedChange={(v) => toggle(item.key, v === true)} aria-label={`第 ${item.key} 项「${item.title}」我做完了`} />
                      我做完了
                    </label>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 pl-11">
                    {item.body(d, assist.openIt)}
                    {item.wait && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ClockIcon className="size-3.5" aria-hidden />
                        {item.wait}
                      </p>
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
          <Panel className="xl:sticky xl:top-0">
            <h2 className="text-lg font-semibold">进度</h2>
            <p className="text-xs text-muted-foreground">勾选状态存在接入草稿里</p>
            <p className="mt-3 text-[1.875rem] leading-tight font-semibold tabular-nums">
              {done} / {items.length}
            </p>
            <p className="text-xs text-muted-foreground">项已完成</p>
            <div className="mt-3 grid grid-cols-5 gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done} aria-label="准备清单进度">
              {items.map((i, idx) => (
                <span key={i.key} className={cn("h-1.5 rounded-full", idx < done ? "bg-primary" : "bg-muted")} />
              ))}
            </div>
            <p className="mt-5 flex items-start gap-2 text-sm">
              <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                可以中途离开
                <span className="block text-xs text-muted-foreground">平台审核要几天，回来后从这里接着做。</span>
              </span>
            </p>
            <p className="mt-5 text-sm">{platform === "shopee" ? "拿到 Live Partner ID 和 Key 了？" : "拿到 App Key 和 App Secret 了？"}</p>
            <div className="mt-2 flex flex-col gap-2">
              <Button onClick={next}>
                <ArrowRightIcon />
                下一步：填凭证
              </Button>
              <Button variant="outline" onClick={assist.openIt}>
                <HeadsetIcon />
                预约远程协助
              </Button>
            </div>
          </Panel>
        </div>
      )}
      <AssistDialog me={me} platform={platform} />
    </PageScroll>
  );
}
