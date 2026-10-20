// 「商品」页签的搜索：按空格分词，每个词都要出现在商品名、商品 ID 或某个卖家 SKU 里（不分大小写）
export function searchProducts<T extends { productId: string; name: string; skus: string[] }>(items: T[], query: string): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((p) => {
    const hay = [p.name, p.productId, ...p.skus].join("\n").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
