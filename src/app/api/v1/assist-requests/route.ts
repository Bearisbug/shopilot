import { assistBody } from "@/contracts/shops";
import { route } from "@/server/http/route";
import { createAssistRequest } from "@/server/shops/service";

// API-SHOP-014
export const POST = route({ auth: "member", perm: "shops.manage", idempotency: "optional", body: assistBody, handler: ({ ctx, body }) => createAssistRequest(ctx, body) });
