import { dashboardQuery } from "@/contracts/dashboard";
import { dashboard, dashboardCsv } from "@/server/dashboard/service";
import { route } from "@/server/http/route";

// API-DASH-001（?format=csv 导出按日明细）
export const GET = route({
  auth: "member",
  perm: "dashboard.view",
  query: dashboardQuery,
  handler: ({ ctx, query }) => (query.format === "csv" ? dashboardCsv(ctx, query.spec) : dashboard(ctx, query.spec)),
});
