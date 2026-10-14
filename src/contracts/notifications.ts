import { z } from "zod";

export const notificationsQuery = z.object({ type: z.enum(["all", "conversation", "ticket", "shop", "usage"]).default("all"), cursor: z.string().optional() });
export const readBody = z.union([z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }), z.object({ all: z.literal(true) })]);

export type NotificationItem = { id: string; type: string; event: string; title: string; body: string | null; link: string | null; createdAt: string; readAt: string | null };
export type NotificationList = { items: NotificationItem[]; unread: number; nextCursor: string | null };
