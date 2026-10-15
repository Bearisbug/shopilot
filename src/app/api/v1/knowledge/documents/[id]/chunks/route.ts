import { chunksQuery } from "@/contracts/knowledge";
import { route } from "@/server/http/route";
import { listDocumentChunks } from "@/server/knowledge/documents";

// API-KB-004：每页 50，资料不是 ready 时为空列表
export const GET = route({ auth: "member", perm: "knowledge.manage", query: chunksQuery, handler: ({ ctx, params, query }) => listDocumentChunks(ctx, String(params.id), query.cursor) });
