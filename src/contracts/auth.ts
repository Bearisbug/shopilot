import { z } from "zod";
import { zEmail, zPassword, zTimezone } from "./common";

export const signupBody = z.object({
  email: zEmail,
  password: zPassword,
  name: z.string().trim().min(1, "请填写姓名").max(60),
  merchantName: z.string().trim().min(1, "请填写商户名").max(80),
  timezone: zTimezone,
});
export type SignupBody = z.infer<typeof signupBody>;

export const activeMerchantBody = z.object({ merchantId: z.string().uuid() });
export const forgotBody = z.object({ email: zEmail });
export const resetBody = z.object({ token: z.string().min(8), newPassword: zPassword });
export const preferencesBody = z.object({ desktopNotify: z.boolean(), sound: z.boolean() });
export const revokeSessionBody = z.union([z.object({ sessionId: z.string().min(1) }), z.object({ others: z.literal(true) })]);

export type Me = {
  user: { id: string; name: string; email: string; twoFactorEnabled: boolean };
  memberships: Array<{ merchantId: string; merchantName: string; role: "admin" | "lead" | "agent"; shopCount: number; status: "active" | "disabled" }>;
  active: {
    merchantId: string;
    merchantName: string;
    timezone: string;
    membershipId: string;
    role: "admin" | "lead" | "agent";
    isOwner: boolean;
    shopIds: string[] | null;
    shops: Array<{ id: string; name: string; platform: "shopee" | "tiktok"; market: string; status: string }>;
    /** 已断开的店：只给会话、订单的店铺筛选用（保留了历史时还能按店筛） */
    disconnectedShops: Array<{ id: string; name: string; platform: "shopee" | "tiktok"; market: string }>;
    permissions: string[];
    merchantStatus: "active" | "pending_deletion" | "deleted";
  };
  preferences: { desktopNotify: boolean; sound: boolean };
  twoFactorRequired: boolean;
};
