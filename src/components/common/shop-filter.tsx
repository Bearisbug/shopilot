"use client";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ShopOption = { id: string; name: string };

/** 会话、订单列表的店铺筛选：在用的店在前，已断开的店单独一组（保留了历史时还能按店筛） */
export function ShopFilter({ shops, disconnected, value, onChange, className }: { shops: ShopOption[]; disconnected: ShopOption[]; value: string; onChange: (v: string) => void; className?: string }) {
  const known = value === "all" || shops.some((s) => s.id === value) || disconnected.some((s) => s.id === value);
  return (
    <Select value={known ? value : "all"} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label="按店铺筛选" className={cn("min-w-0", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">全部店铺</SelectItem>
        {shops.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
        {disconnected.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>已断开</SelectLabel>
              {disconnected.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
