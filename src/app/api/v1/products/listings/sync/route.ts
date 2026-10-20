import { json, route } from "@/server/http/route";
import { queueListingSync } from "@/server/products/dictionary";

// API-KB-025：排队重新拉各店商品目录
export const POST = route({ auth: "member", perm: "products.manage", handler: async ({ ctx }) => json(await queueListingSync(ctx), 202) });
