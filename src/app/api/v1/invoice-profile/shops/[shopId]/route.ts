import { invoiceProfileBody } from "@/contracts/settings";
import { route } from "@/server/http/route";
import { clearShopOverride, saveInvoiceProfile } from "@/server/invoices/profile";

// API-SET-019：保存按店覆盖（空串沿用商户默认）
export const PUT = route({ auth: "member", perm: "settings.manage", body: invoiceProfileBody, handler: ({ ctx, body, params }) => saveInvoiceProfile(ctx, String(params.shopId), body) });

// API-SET-020：清除按店覆盖（连同这家店的 Logo）
export const DELETE = route({ auth: "member", perm: "settings.manage", handler: ({ ctx, params }) => clearShopOverride(ctx, String(params.shopId)) });
