// 模拟平台的占位图：买家头像与商品主图由 /mock/img/<类别>/<种子>.svg 现画，同一种子总是同一张图，不用外链图床。
import { mockBaseUrl } from "./env";
import { MOCK_PRODUCTS } from "./fixtures";

export const mockAvatarUrl = (seed: string) => `${mockBaseUrl()}/mock/img/avatar/${encodeURIComponent(seed)}.svg`;
export const mockProductImageUrl = (itemId: string) => `${mockBaseUrl()}/mock/img/product/${encodeURIComponent(itemId)}.svg`;

// 占位图是模拟平台返回的「平台图片」，不是 Shopilot 界面，所以颜色直接写在图里
const BG = ["#F6D6B8", "#D5E5C3", "#C8DCEC", "#EDCFDF", "#E4D8BF", "#D3CFEC"];
const FG = ["#9A5B2E", "#4F6B35", "#3D6585", "#8A4A6B", "#7A6334", "#56508F"];

function pick(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % BG.length;
}

function productName(itemId: string): string {
  for (const list of Object.values(MOCK_PRODUCTS)) {
    const hit = list.find((p) => p.itemId === itemId);
    if (hit) return hit.name;
  }
  return "";
}

export function mockImageSvg(kind: "avatar" | "product", seed: string): string {
  const i = pick(seed);
  if (kind === "avatar") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${BG[i]}"/><circle cx="48" cy="38" r="17" fill="${FG[i]}"/><path d="M16 92c4-20 17-30 32-30s28 10 32 30z" fill="${FG[i]}"/></svg>`;
  }
  const initials = Array.from(
    productName(seed)
      .split(/\s+/)
      .filter((w) => /^[\p{L}\p{N}]/u.test(w))
      .slice(0, 2)
      .map((w) => Array.from(w)[0]?.toUpperCase() ?? "")
      .join(""),
  ).join("") || "P";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="${BG[i]}"/><rect x="30" y="38" width="60" height="52" rx="8" fill="${FG[i]}" opacity="0.85"/><path d="M46 38v-6a14 14 0 0 1 28 0v6" fill="none" stroke="${FG[i]}" stroke-width="5"/><text x="60" y="73" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#FFFFFF" text-anchor="middle">${initials.replace(/[<&>"]/g, "")}</text></svg>`;
}
