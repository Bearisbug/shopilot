import { route } from "@/server/http/route";
import { unmappedListings } from "@/server/products/dictionary";

// API-KB-024
export const GET = route({ auth: "member", perm: "knowledge.manage", handler: ({ ctx }) => unmappedListings(ctx) });
