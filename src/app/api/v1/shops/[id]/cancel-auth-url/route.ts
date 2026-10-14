import { route } from "@/server/http/route";
import { cancelAuthUrl } from "@/server/shops/service";

// API-SHOP-013
export const POST = route({ auth: "member", perm: "shops.manage", handler: ({ ctx, params }) => cancelAuthUrl(ctx, String(params.id)) });
