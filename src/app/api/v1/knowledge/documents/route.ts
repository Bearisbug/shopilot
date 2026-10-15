import { documentsQuery } from "@/contracts/knowledge";
import { json, route } from "@/server/http/route";
import { listDocuments, uploadDocument } from "@/server/knowledge/documents";

// API-KB-001
export const GET = route({ auth: "member", perm: "knowledge.manage", query: documentsQuery, handler: ({ ctx, query }) => listDocuments(ctx, query) });

// API-KB-002：multipart，一次一个文件
export const POST = route({
  auth: "member",
  perm: "knowledge.manage",
  idempotency: "optional",
  handler: async ({ ctx, req }) => json({ document: await uploadDocument(ctx, req) }, 201),
});
