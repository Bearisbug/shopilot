import { deletionBody } from "@/contracts/settings";
import { route } from "@/server/http/route";
import { requestDeletion } from "@/server/settings/ownership";

// API-SET-015（仅所有者）
export const POST = route({ auth: "member", perm: "settings.owner", body: deletionBody, handler: ({ ctx, body }) => requestDeletion(ctx, body.confirmName) });
