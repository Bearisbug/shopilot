import { getBuyerPanel } from "@/server/conversations/queries";
import { route } from "@/server/http/route";

// API-CONV-003
export const GET = route({ auth: "member", perm: "wb.handle", handler: ({ ctx, params }) => getBuyerPanel(ctx, String(params.id)) });
