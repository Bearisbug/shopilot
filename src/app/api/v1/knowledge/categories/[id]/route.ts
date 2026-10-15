import { categoryBody } from "@/contracts/knowledge";
import { route } from "@/server/http/route";
import { deleteCategory, renameCategory } from "@/server/knowledge/categories";

// API-KB-010：「未分类」不能改名
export const PATCH = route({ auth: "member", perm: "knowledge.manage", body: categoryBody, handler: ({ ctx, params, body }) => renameCategory(ctx, String(params.id), body.name) });

// API-KB-011：其中资料改归「未分类」，不重新解析
export const DELETE = route({ auth: "member", perm: "knowledge.manage", handler: ({ ctx, params }) => deleteCategory(ctx, String(params.id)) });
