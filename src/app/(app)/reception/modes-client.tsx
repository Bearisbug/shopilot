"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, StoreIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { RECEPTION_MODES, type ModesResult, type ReceptionMode, type ReceptionSettings, type ReceptionShop } from "@/contracts/reception";
import { PlatformBadge } from "@/components/common/platform-badge";
import { PageActions } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingRows, Panel, PanelHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, errorText } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ReceptionFrame } from "./reception-frame";

const MODE_HELP: Record<ReceptionMode, string> = {
  off: "不接待，只收消息；会话直接进待认领",
  shadow: "AI 生成但不发；影子回复只给管理员和组长在会话里看",
  assist: "AI 出草稿，客服确认后发",
  auto: "AI 直接发送；转人工时先回一句安抚（只对 TikTok 店开放）",
};

type Stage = "off" | "shadow" | "assist" | "partial_auto" | "full_auto";
const LADDER: Array<{ key: Exclude<Stage, "off">; label: string; desc: string }> = [
  { key: "shadow", label: "影子", desc: "AI 只生成不发送" },
  { key: "assist", label: "辅助", desc: "AI 出草稿，人工确认" },
  { key: "partial_auto", label: "部分时段自动", desc: "工作时间内或外有一段 AI 直接发" },
  { key: "full_auto", label: "全店自动", desc: "工作时间内外都由 AI 直接发" },
];

function stageOf(inHours: ReceptionMode, offHours: ReceptionMode): Stage {
  if (inHours === "auto" && offHours === "auto") return "full_auto";
  if (inHours === "auto" || offHours === "auto") return "partial_auto";
  if (inHours === "assist" || offHours === "assist") return "assist";
  if (inHours === "shadow" || offHours === "shadow") return "shadow";
  return "off";
}

function namesText(names: string[]) {
  if (names.length === 0) return "暂无店铺";
  return names.length <= 3 ? names.join("、") : `${names.slice(0, 2).join("、")} 等 ${names.length} 家`;
}

export function ModesClient() {
  const data = useQuery({ queryKey: ["reception"], queryFn: () => api.get<ReceptionSettings>("/api/v1/reception") });
  if (data.isError)
    return (
      <ReceptionFrame>
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      </ReceptionFrame>
    );
  if (!data.data)
    return (
      <ReceptionFrame>
        <LoadingRows />
      </ReceptionFrame>
    );
  return <ModesEditor shops={data.data.shops} />;
}

type Draft = Record<string, { in: ReceptionMode; off: ReceptionMode }>;

function ModesEditor({ shops }: { shops: ReceptionShop[] }) {
  const qc = useQueryClient();
  // 只记改动过的店；保存成功后清空，显示回落到服务端数据
  const [draft, setDraft] = useState<Draft>({});
  const mode = (s: ReceptionShop) => draft[s.shopId] ?? { in: s.modeInHours, off: s.modeOffHours };
  const dirtyShops = shops.filter((s) => {
    const d = draft[s.shopId];
    return d && (d.in !== s.modeInHours || d.off !== s.modeOffHours);
  });

  const save = useMutation({
    mutationFn: () => api.put<ModesResult>("/api/v1/reception/modes", { shops: dirtyShops.map((s) => ({ shopId: s.shopId, modeInHours: mode(s).in, modeOffHours: mode(s).off })) }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["reception"] });
      setDraft({});
      toast.success(`已保存 ${r.changed} 家店，下一条入站消息起生效`);
      for (const w of r.warnings) toast.warning(w, { duration: 10_000 });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const setMode = (s: ReceptionShop, slot: "in" | "off", value: string) => {
    if (!value) return; // 单选分段控件不允许取消选中
    if (value === "auto" && !s.autoAllowed) {
      toast.info(s.autoBlockedReason ?? "这家店不能设为 auto");
      return;
    }
    setDraft((d) => ({ ...d, [s.shopId]: { ...mode(s), [slot]: value as ReceptionMode } }));
  };

  const stages = new Map<Stage, string[]>();
  for (const s of shops) {
    const st = stageOf(s.modeInHours, s.modeOffHours);
    stages.set(st, [...(stages.get(st) ?? []), s.name]);
  }
  const offCount = stages.get("off")?.length ?? 0;
  const facts =
    shops.length === 0
      ? "还没有接入店铺"
      : [`${shops.length} 家店`, ...LADDER.filter((l) => stages.get(l.key)?.length).map((l) => `${l.label} ${stages.get(l.key)!.length}`), ...(offCount ? [`未接待 ${offCount}`] : [])].join(" · ");

  return (
    <ReceptionFrame facts={facts} dirty={dirtyShops.length > 0}>
      {shops.length > 0 && (
        <PageActions>
          <Button onClick={() => save.mutate()} disabled={dirtyShops.length === 0 || save.isPending}>
            {save.isPending ? <Spinner /> : <CheckIcon />}
            保存
          </Button>
        </PageActions>
      )}

      {shops.length > 0 && (
        <Panel>
          <PanelHeader title="放量阶梯" description={`${shops.length} 家店当前所处的阶段；按「影子 → 辅助 → 部分时段自动 → 全店自动」逐步放开，升档由管理员在下方手动保存`} />
          <ol className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {LADDER.map((l) => {
              const names = stages.get(l.key) ?? [];
              return (
                <li key={l.key} className={cn("rounded-md px-3 py-2", names.length ? "bg-accent" : "bg-muted")}>
                  <p className="text-sm font-medium">{l.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{names.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{l.desc}</p>
                  <p className="mt-2 border-t border-border pt-2 text-xs text-balance">{namesText(names)}</p>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            {offCount ? `另有 ${offCount} 家未接待（工作时间内外都是 off）。` : ""}Shopee 店最高到辅助：平台规则禁止 chatbot 回复，评审前不开放 auto。
          </p>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="店铺模式" description="每家店的工作时间内、外各选一种模式；工作时间在「工作时间与转人工」里设" />
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {RECEPTION_MODES.map((m) => (
            <div key={m} className="rounded-md bg-muted px-3 py-2">
              <dt className="text-sm font-medium">{m}</dt>
              <dd className="text-xs text-muted-foreground">{MODE_HELP[m]}</dd>
            </div>
          ))}
        </dl>
        {shops.length === 0 ? (
          <EmptyState
            icon={StoreIcon}
            title="还没有接入店铺"
            description="接入 Shopee 或 TikTok 店铺后，在这里给每家店分别设工作时间内、外的接待模式。新接入的店按接入时选的 AI 初始方式开始。"
            action={
              <Button asChild>
                <Link href="/shops/connect">去接入店铺</Link>
              </Button>
            }
          />
        ) : (
          <>
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>店铺</TableHead>
                  <TableHead>工作时间内</TableHead>
                  <TableHead>工作时间外</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shops.map((s) => {
                  const m = mode(s);
                  const dirty = dirtyShops.includes(s);
                  return (
                    <TableRow key={s.shopId} className="h-16">
                      <TableCell>
                        <p className="font-medium">{s.name}</p>
                        <p className="mt-1 flex items-center gap-2">
                          <PlatformBadge platform={s.platform} market={s.market} />
                          <span className={cn("text-xs text-(--semantic-color-text-link)", !dirty && "invisible")}>未保存</span>
                        </p>
                      </TableCell>
                      <TableCell>
                        <ModeSegments shop={s} value={m.in} label="工作时间内" onChange={(v) => setMode(s, "in", v)} />
                      </TableCell>
                      <TableCell>
                        <ModeSegments shop={s} value={m.off} label="工作时间外" onChange={(v) => setMode(s, "off", v)} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              保存后从下一条入站消息起生效。TikTok 店改为工作时间内外都是 off 时同步关闭坐席接单，从全 off 改为接待时同步开启。
            </p>
          </>
        )}
      </Panel>
    </ReceptionFrame>
  );
}

function ModeSegments({ shop, value, label, onChange }: { shop: ReceptionShop; value: ReceptionMode; label: string; onChange: (v: string) => void }) {
  const itemClass = "px-3 font-normal data-[state=on]:bg-accent data-[state=on]:font-semibold data-[state=on]:text-(--semantic-color-text-link)";
  return (
    <ToggleGroup type="single" variant="outline" size="sm" spacing={0} className="overflow-hidden rounded-md" value={value} onValueChange={onChange} aria-label={`${shop.name} ${label}的接待模式`}>
      {RECEPTION_MODES.map((m) =>
        m === "auto" && !shop.autoAllowed ? (
          <Tooltip key={m}>
            <TooltipTrigger asChild>
              <ToggleGroupItem value={m} aria-disabled="true" aria-label={`auto（不可用：${shop.autoBlockedReason}）`} className={itemClass}>
                {m}
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{shop.autoBlockedReason}</TooltipContent>
          </Tooltip>
        ) : (
          <ToggleGroupItem key={m} value={m} className={itemClass}>
            {m}
          </ToggleGroupItem>
        ),
      )}
    </ToggleGroup>
  );
}
