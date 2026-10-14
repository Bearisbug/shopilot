"use client";

import { Checkbox } from "@/components/ui/checkbox";

type Shop = { id: string; name: string; platform: "shopee" | "tiktok"; market: string };

/** 负责店铺多选：按平台分组 */
export function ShopPicker({ shops, value, onChange, idPrefix = "shop" }: { shops: Shop[]; value: string[]; onChange: (v: string[]) => void; idPrefix?: string }) {
  if (shops.length === 0) return <p className="text-sm text-muted-foreground">还没有接入店铺。先在「店铺与连接」接入后再分配。</p>;
  const groups = (["shopee", "tiktok"] as const).map((p) => ({ p, items: shops.filter((s) => s.platform === p) })).filter((g) => g.items.length);
  const toggle = (id: string, on: boolean) => onChange(on ? [...new Set([...value, id])] : value.filter((x) => x !== id));
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      {groups.map((g) => (
        <fieldset key={g.p}>
          <legend className="mb-1 text-xs text-muted-foreground">{g.p === "shopee" ? "Shopee" : "TikTok Shop"}</legend>
          <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {g.items.map((s) => (
              <label key={s.id} htmlFor={`${idPrefix}-${s.id}`} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox id={`${idPrefix}-${s.id}`} checked={value.includes(s.id)} onCheckedChange={(v) => toggle(s.id, v === true)} />
                <span className="truncate">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.market}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
