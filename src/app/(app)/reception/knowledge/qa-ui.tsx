"use client";

// 问答与产品页签共用的小块：查询键、产品清单查询、产品多选与产品筛选（PAGE-RECEPTION-KB）
import { useQuery } from "@tanstack/react-query";
import { CheckIcon, ChevronDownIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";
import { QA_STAGE_LABEL, type KnowledgeQa, type KnowledgeQaList, type QaStage } from "@/contracts/knowledge";
import type { Product, ProductList } from "@/contracts/products";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const qaKey = ["knowledge-qa"] as const;
export const qaItemKey = (id: string) => ["knowledge-qa-item", id] as const;
export const productsKey = ["products"] as const;
export const unmappedKey = ["products-unmapped"] as const;

export function useProducts() {
  return useQuery({ queryKey: productsKey, queryFn: () => api.get<ProductList>("/api/v1/products") });
}

/** 待审核数：页签标题用；counts 不受筛选影响，取一条就够 */
export function usePendingCount() {
  const q = useQuery({ queryKey: [...qaKey, "pending-count"], queryFn: () => api.get<KnowledgeQaList>("/api/v1/knowledge/qa?status=pending&limit=1") });
  return q.data?.counts.pending;
}

export const STAGE_OPTIONS: QaStage[] = ["any", "presale", "insale", "aftersale"];

export function productsText(products: KnowledgeQa["products"]): string {
  return products.length === 0 ? "通用" : products.map((p) => p.name).join("、");
}

export function productLabel(p: Pick<Product, "code" | "name">) {
  return `${p.name}（${p.code}）`;
}

export function stageText(s: QaStage) {
  return QA_STAGE_LABEL[s];
}

/**
 * 问答关联的产品：多选，一个不选 = 通用。产品多时可搜编码、名称、别名（Popover + Command，SHADCN combobox）
 */
export function ProductPicker({ value, onChange, products, id, invalid }: { value: string[]; onChange: (v: string[]) => void; products: Product[]; id?: string; invalid?: boolean }) {
  const [open, setOpen] = useState(false);
  const picked = products.filter((p) => value.includes(p.id));
  const toggle = (pid: string) => onChange(value.includes(pid) ? value.filter((x) => x !== pid) : [...value, pid]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-invalid={invalid || undefined} className="h-auto min-h-9 w-full justify-between py-1.5 font-normal">
          <span className={cn("min-w-0 text-left whitespace-normal [overflow-wrap:anywhere]", picked.length === 0 && "text-muted-foreground")}>
            {picked.length === 0 ? "通用（适用全部产品）" : picked.map((p) => p.name).join("、")}
          </span>
          <ChevronsUpDownIcon className="shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command>
          <CommandInput placeholder="搜编码、名称或别名" aria-label="搜索产品" />
          <CommandList label="产品">
            <CommandEmpty>{products.length === 0 ? "还没有产品清单，请管理员在「产品」页签导入。" : "没有匹配的产品。"}</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__general__ 通用" onSelect={() => onChange([])}>
                <CheckIcon className={cn("size-4", value.length === 0 ? "opacity-100" : "opacity-0")} aria-hidden />
                通用（适用全部产品）
              </CommandItem>
            </CommandGroup>
            {products.length > 0 && <CommandSeparator />}
            <CommandGroup>
              {products.map((p) => (
                <CommandItem key={p.id} value={`${p.id} ${p.code} ${p.name} ${p.aliases.join(" ")}`} onSelect={() => toggle(p.id)}>
                  <CheckIcon className={cn("size-4", value.includes(p.id) ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** 列表的产品筛选：全部 / 只看通用 / 某个产品（单选，可搜） */
export function ProductFilter({ value, onChange, products }: { value: string; onChange: (v: string) => void; products: Product[] }) {
  const [open, setOpen] = useState(false);
  const current = value === "all" ? "全部产品" : value === "none" ? "只看通用" : (products.find((p) => p.id === value)?.name ?? "全部产品");
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" role="combobox" aria-expanded={open} aria-label="按产品筛选" className="max-w-48 justify-between font-normal">
          <span className="truncate">{current}</span>
          <ChevronDownIcon className="shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="搜编码、名称或别名" aria-label="搜索产品" />
          <CommandList label="产品">
            <CommandEmpty>没有匹配的产品。</CommandEmpty>
            <CommandGroup>
              {[
                { v: "all", label: "全部产品" },
                { v: "none", label: "只看通用" },
              ].map((o) => (
                <CommandItem key={o.v} value={`__${o.v}__ ${o.label}`} onSelect={() => pick(o.v)}>
                  <CheckIcon className={cn("size-4", value === o.v ? "opacity-100" : "opacity-0")} aria-hidden />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {products.length > 0 && <CommandSeparator />}
            <CommandGroup>
              {products.map((p) => (
                <CommandItem key={p.id} value={`${p.id} ${p.code} ${p.name} ${p.aliases.join(" ")}`} onSelect={() => pick(p.id)}>
                  <CheckIcon className={cn("size-4", value === p.id ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
