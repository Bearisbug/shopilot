import { z } from "zod";

// 校验报错默认用中文（字段自己写了文案的以字段为准）
z.config(z.locales.zhCN());

export const TIMEZONES = ["Asia/Kuala_Lumpur", "Asia/Bangkok", "Asia/Ho_Chi_Minh", "Asia/Manila", "Asia/Singapore", "Asia/Shanghai", "Asia/Jakarta"] as const;
export const zTimezone = z.enum(TIMEZONES);
export const zEmail = z.string().trim().toLowerCase().email("邮箱格式不对");
export const zPassword = z.string().min(10, "密码至少 10 位").max(128, "密码最多 128 位");
export const zPlatform = z.enum(["shopee", "tiktok"]);
export const zRole = z.enum(["admin", "lead", "agent"]);
export const zUuid = z.string().uuid();
export const zCursorQuery = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) });

export type Problem = { type: string; title: string; status: number; detail?: string; instance: string; requestId: string; code?: string; extra?: Record<string, unknown> };
