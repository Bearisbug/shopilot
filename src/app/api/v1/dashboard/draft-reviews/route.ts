import { dashboardDraftReviewsQuery } from "@/contracts/dashboard";
import { draftReviewList } from "@/server/dashboard/service";
import { route } from "@/server/http/route";

// 看板「AI 草稿与人工回复」：某类型、某修改分类下的对比样例（范围同看板，kind = shadow | assist）
export const GET = route({
  auth: "member",
  perm: "dashboard.view",
  query: dashboardDraftReviewsQuery,
  handler: ({ ctx, query }) => draftReviewList(ctx, query.spec, query.kind, query.editClass),
});
