import { invoiceProfileBody } from "@/contracts/settings";
import { route } from "@/server/http/route";
import { getInvoiceProfiles, saveInvoiceProfile } from "@/server/invoices/profile";

// API-SET-017：开票资料（商户默认与各店覆盖）
export const GET = route({ auth: "member", perm: "settings.manage", handler: ({ ctx }) => getInvoiceProfiles(ctx) });

// API-SET-018：保存商户默认
export const PUT = route({ auth: "member", perm: "settings.manage", body: invoiceProfileBody, handler: ({ ctx, body }) => saveInvoiceProfile(ctx, null, body) });
