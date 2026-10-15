import { z } from "zod";
import { getProductCards } from "@/server/conversations/queries";
import { route } from "@/server/http/route";

// API-CONV-016：?ids=商品ID,商品ID（最多 50 个）
export const GET = route({
  auth: "member",
  perm: "wb.handle",
  query: z.object({ ids: z.string().transform((s) => s.split(",").filter(Boolean)).pipe(z.array(z.string().max(64)).min(1).max(50)) }),
  handler: ({ ctx, params, query }) => getProductCards(ctx, String(params.id), query.ids),
});
