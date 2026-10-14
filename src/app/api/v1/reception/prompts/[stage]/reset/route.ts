import { zPromptStage } from "@/contracts/reception";
import { notFound } from "@/server/http/problem";
import { route } from "@/server/http/route";
import { resetPrompt } from "@/server/reception/service";

// API-RCP-005
export const POST = route({
  auth: "member",
  perm: "reception.manage",
  handler: ({ ctx, params }) => {
    const stage = zPromptStage.safeParse(params.stage);
    if (!stage.success) throw notFound();
    return resetPrompt(ctx, stage.data);
  },
});
