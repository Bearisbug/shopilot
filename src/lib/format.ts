// 展示格式：数字与金额 tabular-nums 在组件里加；这里只管文字。
import { formatDistanceToNowStrict } from "date-fns";
import { zhCN } from "date-fns/locale";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

export const TIMEZONE_LABEL: Record<string, string> = {
  "Asia/Kuala_Lumpur": "Asia/Kuala_Lumpur（UTC+8）",
  "Asia/Bangkok": "Asia/Bangkok（UTC+7）",
  "Asia/Ho_Chi_Minh": "Asia/Ho_Chi_Minh（UTC+7）",
  "Asia/Manila": "Asia/Manila（UTC+8）",
  "Asia/Singapore": "Asia/Singapore（UTC+8）",
  "Asia/Shanghai": "Asia/Shanghai（UTC+8）",
  "Asia/Jakarta": "Asia/Jakarta（UTC+7）",
};

export function relative(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: zhCN });
}

export function inTz(iso: string | Date | null | undefined, tz: string, pattern = "MM-dd HH:mm"): string {
  if (!iso) return "—";
  return format(new TZDate(new Date(iso), tz), pattern);
}

export function duration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "—";
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} 时${m % 60 ? ` ${m % 60} 分` : ""}`;
  return `${Math.floor(h / 24)} 天`;
}

export function money(amount: string | number, currency: string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  const digits = currency === "VND" || currency === "IDR" ? 0 : 2;
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export const PLATFORM_LABEL = { shopee: "Shopee", tiktok: "TikTok" } as const;
