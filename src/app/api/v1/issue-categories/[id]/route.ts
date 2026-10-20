import { issueCategoryBody } from "@/contracts/issues";
import { route } from "@/server/http/route";
import { deleteIssueCategory, renameIssueCategory } from "@/server/issues/categories";

// 「其他」不能改名、删除；删除时其中会话段归入「其他」，不重新提取
export const PATCH = route({ auth: "member", perm: "reception.manage", body: issueCategoryBody, handler: ({ ctx, params, body }) => renameIssueCategory(ctx, String(params.id), body.name) });

export const DELETE = route({ auth: "member", perm: "reception.manage", handler: ({ ctx, params }) => deleteIssueCategory(ctx, String(params.id)) });
