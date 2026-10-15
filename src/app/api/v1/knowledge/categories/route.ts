import { categoryBody } from "@/contracts/knowledge";
import { json, route } from "@/server/http/route";
import { createCategory, listCategories } from "@/server/knowledge/categories";

// API-KB-008
export const GET = route({ auth: "member", perm: "knowledge.manage", handler: ({ ctx }) => listCategories(ctx) });

// API-KB-009
export const POST = route({
  auth: "member",
  perm: "knowledge.manage",
  body: categoryBody,
  idempotency: "optional",
  handler: async ({ ctx, body }) => json(await createCategory(ctx, body.name), 201),
});
