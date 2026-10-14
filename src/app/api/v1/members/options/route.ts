import { z } from "zod";
import { route } from "@/server/http/route";
import { inScope } from "@/server/auth/context";
import { Problem } from "@/server/http/problem";
import { memberOptions } from "@/server/team/service";

// API-TEAM-012：转交、建工单选人
export const GET = route({
  auth: "member",
  query: z.object({ shopId: z.string().uuid().optional() }),
  handler: async ({ ctx, query }) => {
    if (query.shopId && !inScope(ctx, query.shopId)) throw new Problem("not-found");
    return { items: await memberOptions(ctx, query.shopId) };
  },
});
