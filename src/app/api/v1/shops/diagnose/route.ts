import { diagnoseBody } from "@/contracts/shops";
import { route } from "@/server/http/route";
import { diagnose } from "@/server/shops/service";

// API-SHOP-010
export const POST = route({ auth: "member", perm: "shops.manage", body: diagnoseBody, handler: ({ ctx, body }) => diagnose(ctx, body.shopIds) });
