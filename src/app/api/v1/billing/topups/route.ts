import { topupBody } from "@/contracts/billing";
import { buyTopup } from "@/server/billing/service";
import { json, route } from "@/server/http/route";

// API-BILL-004
export const POST = route({ auth: "member", perm: "billing.manage", body: topupBody, idempotency: "required", handler: async ({ ctx, body }) => json(await buyTopup(ctx, body), 201) });
