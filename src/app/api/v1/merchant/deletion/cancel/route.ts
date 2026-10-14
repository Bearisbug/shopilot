import { route } from "@/server/http/route";
import { cancelDeletion } from "@/server/settings/ownership";

// API-SET-016（仅所有者）
export const POST = route({ auth: "member", perm: "settings.owner", handler: ({ ctx }) => cancelDeletion(ctx) });
