import { cardBody, cardListQuery } from "@/contracts/cards";
import { json, route } from "@/server/http/route";
import { createCard, listCards } from "@/server/knowledge/cards";

// API-KB-029
export const GET = route({ auth: "member", perm: "knowledge.manage", query: cardListQuery, handler: ({ ctx, query }) => listCards(ctx, query) });

// API-KB-030：手写经验卡保存即发布
export const POST = route({ auth: "member", perm: "knowledge.manage", body: cardBody, idempotency: "optional", handler: async ({ ctx, body }) => json(await createCard(ctx, body), 201) });
