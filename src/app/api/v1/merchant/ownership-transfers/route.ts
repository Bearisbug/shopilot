import { ownershipTransferBody } from "@/contracts/settings";
import { json, route } from "@/server/http/route";
import { requestTransfer } from "@/server/settings/ownership";

// API-SET-013（仅所有者；幂等键）
export const POST = route({
  auth: "member",
  perm: "settings.owner",
  body: ownershipTransferBody,
  idempotency: "optional",
  handler: async ({ ctx, body }) => json(await requestTransfer(ctx, body.toMembershipId), 201),
});
