import { dashboardIssuesQuery } from "@/contracts/dashboard";
import { issueList } from "@/server/dashboard/service";
import { route } from "@/server/http/route";

// 看板问题提取：某类别下的会话段（范围同看板，view = all | handoff）
export const GET = route({
  auth: "member",
  perm: "dashboard.view",
  query: dashboardIssuesQuery,
  handler: ({ ctx, query }) => issueList(ctx, query.spec, query.view, query.categoryId),
});
