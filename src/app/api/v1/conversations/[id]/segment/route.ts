import { stageBody } from "@/contracts/conversations";
import { setStage } from "@/server/conversations/actions";
import { route } from "@/server/http/route";

// API-CONV-009
export const PATCH = route({ auth: "member", perm: "wb.handle", body: stageBody, handler: ({ ctx, params, body }) => setStage(ctx, String(params.id), body.stage) });
