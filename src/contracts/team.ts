import { z } from "zod";
import { zEmail, zPassword, zRole } from "./common";

export const membersQuery = z.object({
  role: z.enum(["all", "admin", "lead", "agent"]).default("all"),
  status: z.enum(["all", "active", "disabled", "invited"]).default("all"),
  period: z.enum(["week", "last_week", "30d"]).default("week"),
});

export const inviteBody = z.object({
  emails: z.array(zEmail).min(1, "至少填一个邮箱").max(20, "一次最多邀请 20 人"),
  role: zRole,
  shopIds: z.array(z.string().uuid()).default([]),
});
export type InviteBody = z.infer<typeof inviteBody>;

export const updateMemberBody = z.object({ role: zRole.optional(), shopIds: z.array(z.string().uuid()).optional() }).refine((b) => b.role || b.shopIds, "没有要修改的内容");
export const acceptInviteBody = z.object({ token: z.string().min(16), name: z.string().trim().min(1).max(60).optional(), password: zPassword.optional() });
export const loginEventsQuery = z.object({
  result: z.enum(["all", "success", "failure"]).default("all"),
  range: z.enum(["7d", "30d", "this_month", "last_month"]).default("7d"),
  format: z.enum(["json", "csv"]).default("json"),
});

export type MemberRow = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: "admin" | "lead" | "agent";
  isOwner: boolean;
  status: "active" | "disabled";
  shopIds: string[];
  twoFactorEnabled: boolean;
  lastSeenAt: string | null;
  online: boolean;
  handled: { segments: number; transferred: number; firstReplyMedianSec: number | null };
};
export type InvitationRow = { id: string; email: string; role: "admin" | "lead" | "agent"; shopIds: string[]; status: "pending" | "expired"; expiresAt: string; invitedByName: string | null; createdAt: string };
export type MembersResponse = {
  members: MemberRow[];
  invitations: InvitationRow[];
  stats: { onlineCount: number; activeCount: number; disabledCount: number; firstReplyMedianSec: number | null; longestWaitingSec: number | null; periodStart: string };
  seats: { used: number; limit: number };
  recent: Array<{ id: string; summary: string; actorName: string | null; createdAt: string; action: string }>;
};
export type InviteResult = { items: Array<{ id: string; email: string; link: string; expiresAt: string }> };
export type InvitationPreview = { merchantName: string; inviterName: string | null; email: string; role: "admin" | "lead" | "agent"; shopNames: string[]; accountExists: boolean; loggedInEmail: string | null };
export type MemberOption = { membershipId: string; name: string; role: "admin" | "lead" | "agent" };
export type LoginEventRow = { id: string; email: string; name: string | null; result: "success" | "failure"; reason: string | null; ip: string | null; userAgent: string | null; createdAt: string };
