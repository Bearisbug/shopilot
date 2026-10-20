import { issueCategoryBody } from "@/contracts/issues";
import { json, route } from "@/server/http/route";
import { createIssueCategory, listIssueCategories } from "@/server/issues/categories";

// 看板问题类别：看板可见的人都能读，只有管理员（接待设置权限）能改
export const GET = route({ auth: "member", perm: "dashboard.view", handler: ({ ctx }) => listIssueCategories(ctx) });

export const POST = route({
  auth: "member",
  perm: "reception.manage",
  body: issueCategoryBody,
  idempotency: "optional",
  handler: async ({ ctx, body }) => json(await createIssueCategory(ctx, body.name), 201),
});
