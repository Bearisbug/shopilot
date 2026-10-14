import { extractBody } from "@/contracts/orders";
import { route } from "@/server/http/route";
import { extractFields } from "@/server/invoices/service";

// API-INV-001：从对话提取开票字段（不计出稿）
export const POST = route({ auth: "member", perm: "orders.use", body: extractBody, handler: ({ ctx, body }) => extractFields(ctx, body) });
