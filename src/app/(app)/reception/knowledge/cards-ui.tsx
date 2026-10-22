"use client";

// 经验卡页签、写卡弹窗与卡抽屉共用的小块：查询键、地址参数、效果比率、关联问答选择（PAGE-RECEPTION-KB）
import { useQuery } from "@tanstack/react-query";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";
import { BRANCH_ACTION_LABEL, CONDITION_MODE_LABEL, type AgentStatus, type CardBranch, type CardList, type CardStats } from "@/contracts/cards";
import type { KnowledgeQaList } from "@/contracts/knowledge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useUrlParams } from "./knowledge-ui";

export const cardsKey = ["knowledge-cards"] as const;
export const cardItemKey = (id: string) => ["knowledge-card", id] as const;
export const agentStatusKey = ["knowledge-agent-status"] as const;

/** API-KB-045：Agent 自动改卡是否暂停、今天直接改了几次、最近 12 周 AI 质量（经验卡页签与看板共用） */
export function useAgentStatus() {
  return useQuery({ queryKey: agentStatusKey, queryFn: () => api.get<AgentStatus>("/api/v1/knowledge/agent-status") });
}

/** ?card=<id> 卡抽屉；?dialog=card 新建，?dialog=card&card=<id> 编辑（编辑时抽屉先收起，关掉弹窗回到抽屉） */
export function useCardParams() {
  const { params, update } = useUrlParams();
  const cardId = params.get("card");
  const dialog = params.get("dialog") === "card";
  return {
    cardId,
    dialogOpen: dialog,
    drawerOpen: Boolean(cardId) && !dialog,
    openNew: () => update({ dialog: "card", card: null }, "push"),
    openEdit: (id: string) => update({ dialog: "card", card: id }, "push"),
    openDrawer: (id: string) => update({ tab: "cards", card: id, dialog: null }, "push"),
    closeDialog: () => update({ dialog: null }),
    closeDrawer: () => update({ card: null }),
  };
}

/** 未看数（页签标题用）：counts 与 unseenCount 不受筛选影响，取一条就够 */
export function useUnseenCount() {
  const q = useQuery({ queryKey: [...cardsKey, "unseen-count"], queryFn: () => api.get<CardList>("/api/v1/knowledge/cards?limit=1") });
  return q.data?.unseenCount;
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
/** 采纳率 = 原样或改后发送 / 处置过的辅助草稿；转人工率 = 按卡转人工或建工单 / 用到这张卡的草稿 */
export const adoptionRate = (s: CardStats) => pct(s.sent + s.edited, s.sent + s.edited + s.ignored);
export const editRate = (s: CardStats) => pct(s.edited, s.sent + s.edited);
export const handoffRate = (s: CardStats) => pct(s.handoffs, s.calls);
export const shadowSameRate = (s: CardStats) => pct(s.shadowSame, s.shadowSame + s.shadowPartial + s.shadowDifferent);

export const modeText = (m: keyof typeof CONDITION_MODE_LABEL) => CONDITION_MODE_LABEL[m];
export function branchText(b: CardBranch) {
  return `如果${b.when}：${b.action === "goto" ? `跳到第 ${b.goto} 步` : BRANCH_ACTION_LABEL[b.action]}`;
}

/** 已发布的问答（关联问答选择、版本对比里把问答 ID 换成问法用）；最多取 100 条，按问法在本地搜 */
export function usePublishedQa() {
  return useQuery({ queryKey: ["knowledge-qa", "published-options"], queryFn: () => api.get<KnowledgeQaList>("/api/v1/knowledge/qa?status=published&limit=100") });
}

/** 关联问答：多选（最多 10 条），搜问法；已选里如果有不在列表的（下架或很早的），保留并显示「已选」 */
export function QaPicker({ value, onChange, id, max }: { value: string[]; onChange: (v: string[]) => void; id?: string; max: number }) {
  const [open, setOpen] = useState(false);
  const qa = usePublishedQa();
  const items = qa.data?.items ?? [];
  const picked = items.filter((q) => value.includes(q.id));
  const unknown = value.length - picked.length;
  const toggle = (qid: string) => onChange(value.includes(qid) ? value.filter((x) => x !== qid) : value.length >= max ? value : [...value, qid]);
  const summary = value.length === 0 ? "不关联问答" : [...picked.map((q) => q.questions[0]), ...(unknown > 0 ? [`另 ${unknown} 条已下架或不在列表`] : [])].join("、");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="h-auto min-h-9 w-full justify-between py-1.5 font-normal">
          <span className={cn("min-w-0 text-left whitespace-normal [overflow-wrap:anywhere]", value.length === 0 && "text-muted-foreground")}>{summary}</span>
          <ChevronsUpDownIcon className="shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command>
          <CommandInput placeholder="搜问法" aria-label="搜索问答" />
          <CommandList label="已发布的问答">
            <CommandEmpty>{qa.isLoading ? "加载中…" : items.length === 0 ? "还没有已发布的问答。" : "没有匹配的问答。"}</CommandEmpty>
            <CommandGroup>
              {items.map((q) => {
                const on = value.includes(q.id);
                return (
                  <CommandItem key={q.id} value={`${q.id} ${q.questions.join(" ")}`} disabled={!on && value.length >= max} onSelect={() => toggle(q.id)}>
                    <CheckIcon className={cn("size-4", on ? "opacity-100" : "opacity-0")} aria-hidden />
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{q.questions[0]}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
